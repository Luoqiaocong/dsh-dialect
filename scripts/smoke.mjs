/**
 * 无依赖冒烟测试：直接跑纯函数，不启动 DSH、不联网、不花额度。
 *
 *   npm run check
 *
 * 覆盖：配置归一化、四种方言提示词、随机池抽取与回退、随机方言的会话稳定性、
 * 自定义口头禅清洗。
 */

import assert from 'node:assert/strict'
import { DIALECTS, RANDOM_POOL } from '../lib/dialects.js'
import {
  buildDialectPrompt, frequencyDescriptor, pickDialect, readConfig, sanitizePhrases, sanitizePool,
} from '../lib/prompt.js'

let passed = 0
/**
 * 跑一个断言块并计数。
 * @param label - 测试名。
 * @param fn - 断言内容。
 */
function test(label, fn) {
  fn()
  passed += 1
  console.log(`ok ${passed} - ${label}`)
}

const defaults = readConfig(undefined)

test('缺省配置回落到默认值，随机池默认全部四种', () => {
  assert.deepEqual(defaults, {
    enabled: true,
    dialect: 'northeast',
    randomPool: [...RANDOM_POOL],
    frequency: 20,
    intensity: 'medium',
    sceneBoost: true,
    customPhrases: [],
  })
})

test('整个 Config 的 volatile 包装通过 get() 解包', () => {
  const config = readConfig({
    get: () => ({
      enabled: false,
      dialect: 'cantonese',
      randomPool: ['cantonese', 'beijing', 'cantonese'],
      frequency: 45,
      intensity: 'heavy',
      sceneBoost: false,
      customPhrases: ['搞掂', ' 搞掂 ', ''],
    }),
  })
  assert.equal(config.enabled, false)
  assert.equal(config.dialect, 'cantonese')
  assert.deepEqual(config.randomPool, ['cantonese', 'beijing'])
  assert.equal(config.frequency, 45)
  assert.equal(config.intensity, 'heavy')
  assert.equal(config.sceneBoost, false)
  assert.deepEqual(config.customPhrases, ['搞掂'])
})

test('逐字段 volatile 的旧写法也能读', () => {
  const get = value => ({ get: () => value })
  const config = readConfig({
    dialect: get('tianjin'),
    frequency: get(60),
  })
  assert.equal(config.dialect, 'tianjin')
  assert.equal(config.frequency, 60)
})

test('非法字段被收窄而不是抛错', () => {
  const config = readConfig({
    dialect: 'martian',
    randomPool: ['martian', 'beijing'],
    frequency: 999,
    intensity: 'extreme',
    customPhrases: 'nope',
  })
  assert.equal(config.dialect, 'northeast')
  assert.deepEqual(config.randomPool, ['beijing'])
  assert.equal(config.frequency, 100)
  assert.equal(config.intensity, 'medium')
  assert.deepEqual(config.customPhrases, [])
})

test('关闭或 0% 时不注入任何提示词', () => {
  assert.equal(buildDialectPrompt({ ...defaults, enabled: false }, 'northeast'), '')
  assert.equal(buildDialectPrompt({ ...defaults, frequency: 0 }, 'northeast'), '')
})

test('四种方言都有风格、强度和示例', () => {
  assert.deepEqual(Object.keys(DIALECTS).sort(), [...RANDOM_POOL].sort())
  for (const [id, dialect] of Object.entries(DIALECTS)) {
    assert.ok(dialect.label.length > 0, id)
    assert.ok(dialect.style.length > 10, id)
    assert.ok(dialect.phrases.length >= 6, id)
    assert.ok(dialect.example.length > 5, id)
    for (const level of ['light', 'medium', 'heavy']) {
      assert.ok(dialect.intensity[level].length > 5, `${id}.${level}`)
    }
  }
})

test('东北话提示词包含频率、规则和口头禅', () => {
  const prompt = buildDialectPrompt({ ...defaults }, 'northeast')
  for (const needle of ['方言彩蛋', '当前方言：东北话', '约 20%', '规则（必须遵守）', '老铁', '代码块', '示例语气']) {
    assert.ok(prompt.includes(needle), `缺少 ${needle}`)
  }
})

test('强度越高，用法说明越放开', () => {
  const light = buildDialectPrompt({ ...defaults, intensity: 'light' }, 'northeast')
  const heavy = buildDialectPrompt({ ...defaults, intensity: 'heavy' }, 'northeast')
  assert.ok(light.includes('最多一两次'))
  assert.ok(heavy.includes('明显东北味'))
  assert.notEqual(light, heavy)
})

test('粤语模板强调普通话打底，不整段翻译', () => {
  const prompt = buildDialectPrompt({ ...defaults, dialect: 'cantonese', intensity: 'medium' }, 'cantonese')
  assert.ok(prompt.includes('粤语'))
  assert.ok(prompt.includes('不是整句翻译'))
  assert.ok(prompt.includes('搞掂'))
})

test('自定义口头禅进入提示词', () => {
  const prompt = buildDialectPrompt({ ...defaults, customPhrases: ['整挺好', '得嘞'] }, 'northeast')
  assert.ok(prompt.includes('用户自定义口头禅'))
  assert.ok(prompt.includes('整挺好、得嘞'))
})

test('场景加权关闭时不再给场景策略', () => {
  const prompt = buildDialectPrompt({ ...defaults, sceneBoost: false }, 'northeast')
  assert.ok(prompt.includes('场景权重】关闭'))
  assert.ok(!prompt.includes('闲聊、玩笑、安慰'))
})

test('口头禅清洗：去空白、去重、限长、限量', () => {
  assert.deepEqual(sanitizePhrases(['  整挺好  ', '整挺好', 'a\nb', '', 'x'.repeat(30)]), ['整挺好', 'a b', 'x'.repeat(24)])
  const many = Array.from({ length: 20 }, (_, index) => `口头禅${index}`)
  assert.equal(sanitizePhrases(many).length, 12)
})

test('随机池清洗：过滤未知、去重、空池回退全部', () => {
  assert.deepEqual(sanitizePool(['yue', 'cantonese', 'cantonese', 'beijing']), ['cantonese', 'beijing'])
  assert.deepEqual(sanitizePool([]), [...RANDOM_POOL])
  assert.deepEqual(sanitizePool('nope'), [...RANDOM_POOL])
  assert.deepEqual(sanitizePool(['cantonese', 'tianjin']), ['cantonese', 'tianjin'])
})

test('频率说明随数值变化', () => {
  assert.ok(frequencyDescriptor(0).startsWith('关闭'))
  assert.ok(frequencyDescriptor(20).includes('五六句'))
  assert.ok(frequencyDescriptor(90).includes('几乎贯穿全文'))
})

test('随机方言在同一会话内保持稳定', () => {
  const picks = new Map()
  const config = { ...defaults, dialect: 'random', randomPool: ['cantonese', 'beijing'] }
  const first = pickDialect(config, 'session-1', picks, 'northeast')
  const second = pickDialect(config, 'session-1', picks, 'northeast')
  assert.equal(first, second)
  assert.ok(['cantonese', 'beijing'].includes(first))
})

test('随机池只有一个选项时只会抽到它', () => {
  const picks = new Map()
  const config = { ...defaults, dialect: 'random', randomPool: ['cantonese'] }
  for (const session of ['a', 'b', 'c']) {
    assert.equal(pickDialect(config, session, picks, 'northeast'), 'cantonese')
  }
})

test('随机池改动后，旧会话的抽签结果会被重新校验', () => {
  const picks = new Map([['session-1', 'northeast']])
  const config = { ...defaults, dialect: 'random', randomPool: ['cantonese'] }
  assert.equal(pickDialect(config, 'session-1', picks, 'northeast'), 'cantonese')
  assert.equal(picks.get('session-1'), 'cantonese')
})

test('非随机模式直接返回配置的方言', () => {
  const picks = new Map()
  assert.equal(pickDialect({ ...defaults, dialect: 'tianjin' }, 's', picks, 'northeast'), 'tianjin')
  assert.equal(picks.size, 0)
})

console.log(`\nALL OK (${passed} checks)`)
