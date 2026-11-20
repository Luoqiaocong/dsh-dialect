/**
 * 无依赖冒烟测试：直接跑纯函数，不启动 DSH、不联网、不花额度。
 *
 *   npm run check
 *
 * 覆盖：设置归一化、旧版频率数字迁移、会话覆盖合并、随机池、提示词拼装。
 */

import assert from 'node:assert/strict'
import { DIALECTS, RANDOM_POOL } from '../lib/dialects.js'
import {
  buildDialectPrompt, DEFAULT_SETTINGS, frequencyDescriptor, mergeSettings,
  normalizeFrequency, normalizeSessionOverride, normalizeSettings, pickDialect,
  sanitizePhrases, sanitizePool,
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

const defaults = normalizeSettings(undefined)

test('缺省设置回落到默认值，频率默认中档', () => {
  assert.deepEqual(defaults, {
    enabled: true,
    dialect: 'northeast',
    randomPool: [...RANDOM_POOL],
    frequency: 'medium',
    intensity: 'medium',
    sceneBoost: true,
    customPhrases: [],
  })
  assert.equal(DEFAULT_SETTINGS.frequency, 'medium')
})

test('旧版 0–100 数字频率迁移到五档', () => {
  assert.equal(normalizeFrequency(0), 'off')
  assert.equal(normalizeFrequency(8), 'low')
  assert.equal(normalizeFrequency(20), 'medium')
  assert.equal(normalizeFrequency(50), 'high')
  assert.equal(normalizeFrequency(90), 'max')
  assert.equal(normalizeFrequency('max'), 'max')
  assert.equal(normalizeFrequency('nope'), 'medium')
})

test('设置归一化会清洗随机池、强度和口头禅', () => {
  const settings = normalizeSettings({
    enabled: false,
    dialect: 'cantonese',
    randomPool: ['cantonese', 'beijing', 'cantonese'],
    frequency: 'high',
    intensity: 'heavy',
    sceneBoost: false,
    customPhrases: ['搞掂', ' 搞掂 ', ''],
  })
  assert.equal(settings.enabled, false)
  assert.deepEqual(settings.randomPool, ['cantonese', 'beijing'])
  assert.equal(settings.frequency, 'high')
  assert.equal(settings.intensity, 'heavy')
  assert.equal(settings.sceneBoost, false)
  assert.deepEqual(settings.customPhrases, ['搞掂'])
})

test('非法字段被收窄而不是抛错', () => {
  const settings = normalizeSettings({
    dialect: 'martian',
    randomPool: ['martian', 'beijing'],
    frequency: 'extreme',
    intensity: 'extreme',
    customPhrases: 'nope',
  })
  assert.equal(settings.dialect, 'northeast')
  assert.deepEqual(settings.randomPool, ['beijing'])
  assert.equal(settings.frequency, 'medium')
  assert.equal(settings.intensity, 'medium')
  assert.deepEqual(settings.customPhrases, [])
})

test('会话覆盖只保留开关、方言和频率', () => {
  assert.deepEqual(normalizeSessionOverride({
    enabled: false,
    dialect: 'tianjin',
    frequency: 50,
    intensity: 'heavy',
    randomPool: ['cantonese'],
  }), { enabled: false, dialect: 'tianjin', frequency: 'high' })
  assert.deepEqual(normalizeSessionOverride(null), {})
})

test('会话覆盖优先于全局设置', () => {
  const merged = mergeSettings(
    { ...defaults, dialect: 'northeast', frequency: 'medium', intensity: 'medium' },
    { dialect: 'cantonese', frequency: 'max' },
  )
  assert.equal(merged.dialect, 'cantonese')
  assert.equal(merged.frequency, 'max')
  assert.equal(merged.intensity, 'medium')
  assert.equal(merged.enabled, true)
})

test('关闭或 off 档时不注入任何提示词', () => {
  assert.equal(buildDialectPrompt({ ...defaults, enabled: false }, 'northeast'), '')
  assert.equal(buildDialectPrompt({ ...defaults, frequency: 'off' }, 'northeast'), '')
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

test('频率档位进入提示词，百分比随档位变化', () => {
  const low = buildDialectPrompt({ ...defaults, frequency: 'low' }, 'northeast')
  const medium = buildDialectPrompt({ ...defaults, frequency: 'medium' }, 'northeast')
  const high = buildDialectPrompt({ ...defaults, frequency: 'high' }, 'northeast')
  const max = buildDialectPrompt({ ...defaults, frequency: 'max' }, 'northeast')
  assert.ok(low.includes('约 10%'))
  assert.ok(medium.includes('约 20%'))
  assert.ok(high.includes('约 35%'))
  assert.ok(max.includes('约 50%'))
  assert.ok(high.includes('高：约三成半'))
  assert.ok(max.includes('极高：约一半'))
  assert.ok(high.includes('最好只在闲聊时使用'))
  assert.ok(max.includes('最好只在闲聊时使用'))
  assert.ok(max.includes('也不是通篇方言'))
})

test('东北话提示词包含规则、口头禅和示例', () => {
  const prompt = buildDialectPrompt({ ...defaults }, 'northeast')
  for (const needle of ['方言彩蛋', '当前方言：东北话', '规则（必须遵守）', '老铁', '代码块', '示例语气']) {
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
  const prompt = buildDialectPrompt({ ...defaults, dialect: 'cantonese' }, 'cantonese')
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
  assert.deepEqual(sanitizePool(['cantonese', 'cantonese', 'beijing']), ['cantonese', 'beijing'])
  assert.deepEqual(sanitizePool([]), [...RANDOM_POOL])
  assert.deepEqual(sanitizePool('nope'), [...RANDOM_POOL])
})

test('频率说明覆盖五档', () => {
  assert.ok(frequencyDescriptor('off').startsWith('关闭'))
  assert.ok(frequencyDescriptor('low').includes('十句'))
  assert.ok(frequencyDescriptor('medium').includes('五六句'))
  assert.ok(frequencyDescriptor('high').includes('三成半'))
  assert.ok(frequencyDescriptor('max').includes('一半'))
})

test('随机方言在同一会话内保持稳定', () => {
  const picks = new Map()
  const settings = { ...defaults, dialect: 'random', randomPool: ['cantonese', 'beijing'] }
  const first = pickDialect(settings, 'session-1', picks, 'northeast')
  const second = pickDialect(settings, 'session-1', picks, 'northeast')
  assert.equal(first, second)
  assert.ok(['cantonese', 'beijing'].includes(first))
})

test('随机池只有一个选项时只会抽到它', () => {
  const picks = new Map()
  const settings = { ...defaults, dialect: 'random', randomPool: ['cantonese'] }
  for (const session of ['a', 'b', 'c']) {
    assert.equal(pickDialect(settings, session, picks, 'northeast'), 'cantonese')
  }
})

test('随机池改动后，旧会话的抽签结果会被重新校验', () => {
  const picks = new Map([['session-1', 'northeast']])
  const settings = { ...defaults, dialect: 'random', randomPool: ['cantonese'] }
  assert.equal(pickDialect(settings, 'session-1', picks, 'northeast'), 'cantonese')
  assert.equal(picks.get('session-1'), 'cantonese')
})

test('非随机模式直接返回配置的方言', () => {
  const picks = new Map()
  assert.equal(pickDialect({ ...defaults, dialect: 'tianjin' }, 's', picks, 'northeast'), 'tianjin')
  assert.equal(picks.size, 0)
})

console.log(`\nALL OK (${passed} checks)`)
