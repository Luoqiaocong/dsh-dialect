/**
 * 浏览器半部的无依赖冒烟测试：用假的 window / document / React / fetch
 * 跑一遍 `lib/client.js`，确认三个入口都注册到位、设置页和快捷控件能渲染。
 *
 * 不联网、不启动 DSH、不花额度。
 */

import assert from 'node:assert/strict'

/** 捕获到的模块注册。 */
const specs = []

const DEFAULTS = {
	enabled: true,
	dialect: 'northeast',
	randomPool: ['northeast', 'tianjin', 'beijing', 'cantonese'],
	frequency: 'low',
	intensity: 'medium',
	sceneBoost: true,
	customPhrases: [],
}

const cache = new Map()

globalThis.window = {
	__ModuleLoader__: {
		load(spec) {
			specs.push(spec)
		},
	},
	localStorage: {
		getItem: key => (cache.has(key) ? cache.get(key) : null),
		setItem: (key, value) => cache.set(key, value),
	},
	addEventListener() {},
	removeEventListener() {},
	innerWidth: 1280,
	innerHeight: 800,
}

globalThis.document = {
	getElementById: () => null,
	createElement: () => ({ set textContent(value) {}, set id(value) {} }),
	head: { append() {} },
	body: {},
	addEventListener() {},
	removeEventListener() {},
}

globalThis.fetch = async () => ({ ok: true, json: async () => DEFAULTS })

/**
 * 造一个 React 的假实现：createElement 递归渲染函数组件，hook 返回稳定值。
 * @returns 供 factory 使用的 React 与 ReactDOM。
 */
function fakeReact() {
	const Fragment = Symbol('fragment')
	const React = {
		Fragment,
		createElement(type, props, ...children) {
			const flat = children.flat(Infinity)
			if (type === Fragment) return { type: 'fragment', props: {}, children: flat }
			if (typeof type === 'function') return type({ ...(props ?? {}), children: flat })
			return { type, props: props ?? {}, children: flat }
		},
		useState(initial) {
			return [typeof initial === 'function' ? initial() : initial, () => {}]
		},
		useEffect() {},
		useMemo(fn) {
			return fn()
		},
		useRef(initial) {
			return { current: initial }
		},
		useCallback(fn) {
			return fn
		},
	}
	return React
}

await import('../lib/client.js')
assert.equal(specs.length, 1, 'client bundle 应只注册一个模块')
assert.equal(specs[0].id, 'dsh-dialect')

const ReactDOM = { createPortal: node => node }
const bundle = specs[0].factory(name => {
	if (name === 'react') return fakeReact()
	if (name === 'react-dom') return ReactDOM
	throw new Error(`unexpected require: ${name}`)
})

/**
 * 造一个假 store。
 * @param value - 当前设置。
 * @param status - 保存状态。
 * @returns store 接口。
 */
function fakeStore(value, status = { kind: 'saved', text: '已自动保存到本地文件' }) {
	return {
		get: () => value,
		getStatus: () => status,
		subscribe: () => () => {},
		patch() {},
		reset() {},
	}
}

const registrations = []
const injections = []
const ctx = {
	effect(fn) {
		fn()
		return () => {}
	},
	slots: {
		inject(slot, callback) {
			injections.push(slot)
			callback()
		},
		register(options, component) {
			registrations.push({ options, component })
			return () => {}
		},
	},
}

bundle.apply(ctx)
assert.deepEqual(injections, ['settings.section', 'settings.section.icon', 'conversation.input.left'])
assert.equal(registrations.length, 3)
assert.deepEqual(
	registrations.map(entry => `${entry.options.name}:${entry.options.id}`),
	['settings.section:dsh-dialect', 'settings.section.icon:dsh-dialect', 'conversation.input.left:dsh-dialect'],
)

const settingsRegistration = registrations[0]
const composerRegistration = registrations[2]
assert.equal(settingsRegistration.options.label(), '方言彩蛋')
assert.equal(typeof settingsRegistration.component, 'function')
assert.equal(typeof composerRegistration.component, 'function')

const store = fakeStore(DEFAULTS)
const face = settingsRegistration.options.inject()
assert.ok(face.store, '设置页应拿到 store')

const settingsPage = settingsRegistration.component(face)
const settingsTree = JSON.stringify(settingsPage)
for (const needle of [
	'方言彩蛋', '东北话', '天津话', '北京话', '粤语', '随机',
	'出现频率', '关闭', '低', '中', '高', '极高',
	'强度', '场景加权', '自定义口头禅', '恢复默认',
	'改动会自动保存到 ~/.dsh/dsh-dialect.json',
	'话题明确指向某个地域时',
]) {
	assert.ok(settingsTree.includes(needle), `设置页缺少 ${needle}`)
}
assert.ok(settingsTree.includes('20%'), '默认应显示低档 20%')
assert.ok(!settingsTree.includes('低 · 20%'), '百分比不应再带档位前缀')
assert.ok(!settingsTree.includes('不建议日常使用'), '默认中档不应出现高/极高警告')

const maxStore = fakeStore({
	...DEFAULTS,
	frequency: 'max',
	dialect: 'random',
	randomPool: ['cantonese', 'beijing'],
	customPhrases: ['搞掂'],
})
const maxTree = JSON.stringify(settingsRegistration.component({ store: maxStore }))
assert.ok(maxTree.includes('50%'), '极高档应显示 50%')
assert.ok(!maxTree.includes('极高 · 50%'), '百分比不应再带档位前缀')
assert.ok(maxTree.includes('约一半句子'))
assert.ok(maxTree.includes('最好只在闲聊时使用'))
assert.ok(maxTree.includes('✓ 粤语') && maxTree.includes('✓ 北京话'), '随机池应显示勾选状态')
assert.ok(maxTree.includes('搞掂'))

const composer = composerRegistration.component({ store, sessionId: 'session-1' })
const composerTree = JSON.stringify(composer)
assert.ok(composerTree.includes('语'), '快捷控件应有图标字')
assert.ok(composerTree.includes('东北话'), '快捷控件应显示当前方言')
assert.ok(!composerTree.includes('"dx-pop"'), '默认不展开弹层')

const offStore = fakeStore({ ...DEFAULTS, enabled: false })
const offTree = JSON.stringify(composerRegistration.component({ store: offStore, sessionId: 'session-1' }))
assert.ok(offTree.includes('方言关'), '关闭时应显示方言关')

const frequency = bundle.FrequencyControl({ value: 'high', onChange: () => {} })
const frequencyTree = JSON.stringify(frequency)
assert.ok(frequencyTree.includes('40%'))
assert.ok(frequencyTree.includes('最好只在闲聊时使用'))
assert.ok(frequencyTree.includes('约四成句子'))

console.log('ALL OK (settings page, settings icon, and composer shortcut register and render)')
