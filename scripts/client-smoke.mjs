/**
 * 浏览器半部的无依赖冒烟测试：用假的 window / document / React / configForms
 * 跑一遍 `lib/client.js`，确认它注册到 dsh-emoji 同款的 bundle 配置槽位，
 * 并且默认就渲染出四种方言、频率、强度和随机池。
 *
 * 这不是浏览器渲染测试，但能挡住「槽位写错」「key 写错」「组件一渲染就抛错」
 * 这类发布事故，而且不联网、不花额度。
 */

import assert from 'node:assert/strict'

/** 捕获到的模块注册。 */
const specs = []

globalThis.window = {
	__ModuleLoader__: {
		load(spec) {
			specs.push(spec)
		},
	},
}

globalThis.document = {
	getElementById: () => null,
	createElement: () => ({ set textContent(value) {}, set id(value) {} }),
	head: { append() {} },
}

/**
 * 造一个 React 的假实现：createElement 递归渲染函数组件，hook 返回稳定值。
 * @returns 供 factory 使用的 React。
 */
function fakeReact() {
	return {
		createElement(type, props, ...children) {
			const flat = children.flat(Infinity)
			if (typeof type === 'function') return type({ ...(props ?? {}), children: flat })
			return { type, props: props ?? {}, children: flat }
		},
		useState(initial) {
			return [typeof initial === 'function' ? initial() : initial, () => {}]
		},
		useMemo(fn) {
			return fn()
		},
		useEffect() {},
	}
}

await import('../lib/client.js')
assert.equal(specs.length, 1, 'client bundle 应只注册一个模块')
assert.equal(specs[0].id, 'dsh-dialect')

const bundle = specs[0].factory(name => {
	if (name === 'react') return fakeReact()
	throw new Error(`unexpected require: ${name}`)
})

/**
 * 造一个 Host settings 表单的假对象。
 * @param value - 命名空间的当前值。
 * @param status - 同步状态。
 * @returns 供 configForms.get 返回的表单。
 */
function fakeForm(value, status = 'ready') {
	const snapshot = { status, value, user: {}, revision: 1, writable: true, base: undefined }
	const form = {
		ops: [],
		getSnapshot: () => snapshot,
		subscribe: () => () => {},
		mutate: async (ops) => {
			form.ops.push(ops)
			return true
		},
	}
	return form
}

const registrations = []
const injections = []
const form = fakeForm({
	enabled: true,
	dialect: 'northeast',
	randomPool: ['northeast', 'tianjin', 'beijing', 'cantonese'],
	frequency: 20,
	intensity: 'medium',
	sceneBoost: true,
	customPhrases: [],
})

const ctx = {
	effect(fn) {
		fn()
		return () => {}
	},
	configForms: {
		get(id) {
			assert.equal(id, 'dsh-dialect')
			return form
		},
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
assert.deepEqual(injections, ['plugins.bundle.config'])
assert.equal(registrations.length, 1)
assert.equal(registrations[0].options.name, 'plugins.bundle.config')
assert.equal(registrations[0].options.key, 'dsh-dialect')
assert.equal(typeof registrations[0].component, 'function')

const { component } = registrations[0]
const face = registrations[0].options.inject()
assert.ok(face.controller.form === form, '注入面应带上 configForms 表单')

const page = component({ view: 'page', ...face })
const tree = JSON.stringify(page)

for (const needle of [
	'方言彩蛋', '东北话', '天津话', '北京话', '粤语', '随机',
	'出现频率', '强度', '场景加权', '自定义口头禅', '保存', '放弃修改', '恢复默认',
]) {
	assert.ok(tree.includes(needle), `配置页缺少 ${needle}`)
}
assert.ok(tree.includes('东北话 · 20% · 中'), '摘要应显示当前方言、频率和强度')
assert.ok(!tree.includes('"aria-label":"随机池"'), '非随机模式不显示随机池')

/** 找出文本为 label 的按钮。 */
function buttonByText(node, label) {
	if (node === null || typeof node !== 'object') return undefined
	if (node.type === 'button' && Array.isArray(node.children) && node.children.includes(label)) return node
	for (const child of node.children ?? []) {
		const found = buttonByText(child, label)
		if (found !== undefined) return found
	}
	return undefined
}

const save = buttonByText(page, '保存')
assert.ok(save, '应有保存按钮')
assert.equal(save.props.disabled, true, '没有改动时保存按钮应禁用')

const randomForm = fakeForm({
	enabled: true,
	dialect: 'random',
	randomPool: ['cantonese', 'beijing'],
	frequency: 35,
	intensity: 'heavy',
	sceneBoost: false,
	customPhrases: ['搞掂'],
})
const randomFace = { controller: { form: randomForm } }
const randomPage = component({ view: 'page', ...randomFace })
const randomTree = JSON.stringify(randomPage)
for (const needle of ['随机池', '✓ 粤语', '✓ 北京话', '随机 2 种 · 35% · 重', '搞掂']) {
	assert.ok(randomTree.includes(needle), `随机模式缺少 ${needle}`)
}
assert.ok(!randomTree.includes('✓ 东北话'), '未勾选的方言不应显示勾选标记')

const summary = component({ view: 'summary', ...face })
assert.ok(JSON.stringify(summary).includes('东北话 · 20% · 中'))

const unavailable = fakeForm(undefined, 'unavailable')
const unavailableTree = JSON.stringify(component({ view: 'page', controller: { form: unavailable } }))
assert.ok(unavailableTree.includes('设置暂不可用'))

console.log('ALL OK (bundle config registers and renders dialects, frequency, and random pool)')
