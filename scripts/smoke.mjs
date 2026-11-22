/**
 * 无依赖冒烟测试：直接跑纯函数，不启动 DSH、不联网、不花额度。
 *
 *   npm run check
 *
 * 覆盖：设置归一化、旧版频率数字迁移、会话覆盖合并、随机池、提示词拼装。
 */

import assert from 'node:assert/strict'
import { DIALECTS, RANDOM_POOL } from '../lib/dialects.js'
import { apply } from '../lib/index.js'
import {
  buildDialectPrompt, DEFAULT_SETTINGS, frequencyDescriptor, mergeSettings,
  normalizeFrequency, normalizeSessionOverride, normalizeSettings, pickDialect,
  sanitizePhrases, sanitizePool,
} from '../lib/prompt.js'
import {
  analyzeEvents, densityLine, explicitDialectRequest, messageText, phraseHits,
  previousTurnEvents, sceneDecision, targetHits,
} from '../lib/scene.js'

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
    frequency: 'low',
    intensity: 'medium',
    sceneBoost: true,
    customPhrases: [],
  })
  assert.equal(DEFAULT_SETTINGS.frequency, 'low')
})

test('旧版 0–100 数字频率迁移到五档', () => {
  assert.equal(normalizeFrequency(0), 'off')
  assert.equal(normalizeFrequency(8), 'low')
  assert.equal(normalizeFrequency(20), 'low')
  assert.equal(normalizeFrequency(30), 'medium')
  assert.equal(normalizeFrequency(40), 'high')
  assert.equal(normalizeFrequency(50), 'max')
  assert.equal(normalizeFrequency(90), 'max')
  assert.equal(normalizeFrequency('max'), 'max')
  assert.equal(normalizeFrequency('nope'), 'low')
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
  assert.equal(settings.frequency, 'low')
  assert.equal(settings.intensity, 'medium')
  assert.deepEqual(settings.customPhrases, [])
})

test('会话覆盖只保留开关、方言和频率', () => {
  assert.deepEqual(normalizeSessionOverride({
    enabled: false,
    dialect: 'tianjin',
    frequency: 40,
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
  assert.ok(low.includes('约 20%'))
  assert.ok(medium.includes('约 30%'))
  assert.ok(high.includes('约 40%'))
  assert.ok(max.includes('约 50%'))
  assert.ok(high.includes('高：约四成'))
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

test('话题地域适配覆盖设置方言和频率', () => {
  const prompt = buildDialectPrompt({ ...defaults, dialect: 'cantonese', frequency: 'low' }, 'cantonese')
  for (const needle of [
    '话题地域适配',
    '不用受上面的方言和频率约束',
    '优先级：用户在消息里明确指定的说法 > 话题地域',
    '话题地域和设置方言冲突时',
    '地域话题下，上面的方言风格和强度说明只作参考',
  ]) {
    assert.ok(prompt.includes(needle), `缺少 ${needle}`)
  }
  assert.ok(prompt.includes('普通话题里'))
  assert.ok(prompt.indexOf('【话题地域适配】') > prompt.indexOf('【粤语 · 风格】'), '地域适配应排在方言风格之后')
  assert.ok(prompt.indexOf('【话题地域适配】') > prompt.indexOf('【场景权重】'), '地域适配应排在场景权重之后')
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
  assert.ok(frequencyDescriptor('low').includes('两成'))
  assert.ok(frequencyDescriptor('medium').includes('三成'))
  assert.ok(frequencyDescriptor('high').includes('四成'))
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


/**
 * 造一个只实现读取接口的假会话。
 * @param events - 事件数组。
 * @returns 供 scene 函数使用的会话。
 */
function fakeSession(events) {
  return {
    seq: events.length,
    eventAt: seq => events[seq],
    snapshotEvents: (from, to) => events.slice(from, to),
  }
}

/** 造一条助手文本消息事件。 */
function assistantEvent(turn, text) {
  return { type: 'assistant/message', data: { turn, step: 1, message: { role: 'assistant', content: [{ type: 'text', text }] } } }
}

test('上一轮事件窗口能正确截取', () => {
  const events = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '北京有什么好吃的' }] } },
    assistantEvent(1, '推荐烤鸭、涮肉和炸酱面，都是北京本地味道。'),
    { type: 'turn/end', data: { turn: 1, reason: 'success' } },
    { type: 'turn/start', data: { turn: 2 } },
    { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '还有吗' }] } },
  ]
  const previous = previousTurnEvents(fakeSession(events))
  assert.equal(previous.turn, 1)
  assert.equal(previous.events.length, 3)
  assert.equal(analyzeEvents(previous.events).formal, false)
})

test('代码块、写文件和工具结果密集都判为正式任务', () => {
  const code = analyzeEvents([assistantEvent(1, '示例：\n```js\nconsole.log(1)\n```')])
  assert.equal(code.formal, true)
  assert.equal(code.code, true)

  const write = analyzeEvents([{ type: 'tool/call', data: { turn: 1, step: 1, name: 'write', arguments: '{}' } }])
  assert.equal(write.formal, true)
  assert.equal(write.writes, true)

  const shell = analyzeEvents([{ type: 'tool/call', data: { turn: 1, step: 1, name: 'win_bash', arguments: '{"command":"Set-Content a.txt 1"}' } }])
  assert.equal(shell.formal, true)

  const results = analyzeEvents([
    { type: 'tool/result', data: { message: { content: [{ type: 'text', text: 'x'.repeat(700) }] } } },
    { type: 'tool/result', data: { message: { content: [{ type: 'text', text: 'y'.repeat(600) }] } } },
  ])
  assert.equal(results.formal, true)
  assert.equal(results.toolResults, 2)
})

test('正式任务在开启场景加权时直接不注入', () => {
  const events = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'tool/call', data: { turn: 1, step: 1, name: 'edit', arguments: '{}' } },
    { type: 'turn/end', data: { turn: 1, reason: 'success' } },
    { type: 'turn/start', data: { turn: 2 } },
    { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '继续' }] } },
  ]
  const session = fakeSession(events)
  assert.equal(sceneDecision(session, true).suppress, true)
  assert.equal(sceneDecision(session, false).suppress, false)
})

test('用户明确要求方言时，不被场景硬化拦掉', () => {
  const events = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'tool/call', data: { turn: 1, step: 1, name: 'write', arguments: '{}' } },
    { type: 'turn/end', data: { turn: 1, reason: 'success' } },
    { type: 'turn/start', data: { turn: 2 } },
    { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '用粤语讲一下' }] } },
  ]
  const decision = sceneDecision(fakeSession(events), true)
  assert.equal(decision.suppress, false)
  assert.equal(decision.reason, 'explicit')
  assert.equal(explicitDialectRequest('用粤语讲一下'), true)
  assert.equal(explicitDialectRequest('正常说'), false)
})

test('方言词命中统计会跳过代码块', () => {
  assert.equal(phraseHits('今日好开心啦，唔该晒', ['啦', '唔']), 2)
  assert.equal(phraseHits('```\n啦 唔 嘅\n```\n普通话', ['啦', '唔', '嘅']), 0)
  assert.equal(messageText({ content: [{ type: 'text', text: 'abc' }] }), 'abc')
})

test('密度反馈按最近几轮给高/低信号', () => {
  const high = fakeSession([
    assistantEvent(1, '今日真系好开心啦，唔该晒，得闲饮茶啦。'.repeat(4)),
    assistantEvent(1, '呢个真系好正嘅，搞掂啦。'.repeat(4)),
    assistantEvent(1, '唔使急，慢慢嚟啦。'.repeat(4)),
  ])
  const highLine = densityLine(high, ['啦', '唔', '嘅'], targetHits('medium'))
  assert.ok(highLine.includes('偏高'), highLine)

  const low = fakeSession([
    assistantEvent(1, '这是一段完全用普通话写的普通回答，用来测试密度偏低的情况，没有方言词。'.repeat(2)),
    assistantEvent(1, '第二段也全部是标准普通话，没有任何地方口音和语气词。'.repeat(2)),
    assistantEvent(1, '第三段继续用普通话说明，内容保持清楚规范。'.repeat(2)),
  ])
  const lowLine = densityLine(low, ['啦', '唔', '嘅'], targetHits('medium'))
  assert.ok(lowLine.includes('偏低'), highLine)

  assert.equal(targetHits('medium'), 1.2)
})

// 北京话不能只靠「您」撑方言感：模板里得有儿化和语气词，提示词要压制单个词重复。
{
  const beijing = DIALECTS.beijing
  assert.ok(beijing.phrases.includes('甭') || beijing.phrases.includes('儿化'), '口头禅应包含真正的北京口语词')
  assert.ok(!beijing.phrases.includes('您'), '「您」不该出现在口头禅清单里')
  assert.equal(beijing.example.includes('您'), false, '示例语气不该通篇客套')
  const prompt = buildDialectPrompt(normalizeSettings({ ...DEFAULT_SETTINGS, dialect: 'beijing' }), 'beijing')
  assert.ok(prompt.includes('儿化'), '提示词应点出儿化')
  assert.ok(prompt.includes('整段最多一次'), '提示词应限制单个词重复')
  assert.ok(prompt.includes('特征'), '提示词应给出该方言的具体特征')
  passed += 1
  console.log(`ok ${passed} - 北京话不只靠「您」：儿化、语气词和反重复规则都在提示词里`)
}

// 路由鉴权：connection 判回绝时，请求到此为止，不读也不改设置。
{
  let handler
  const ctx = {
    systemPrompt: { section: () => ({}) },
    effect: (fn) => fn(),
    inject: (deps, fn) => fn({
      effect: (f) => f(),
      webServer: { register: (def) => { handler = def.handler } },
    }),
    connection: { requestRejection: (request) => (request.headers.origin === undefined ? undefined : 403) },
  }
  apply(ctx)
  const response = {
    statusCode: 0,
    headers: undefined,
    body: undefined,
    writeHead(status, headers) { this.statusCode = status; this.headers = headers },
    end(body) { this.body = body },
  }
  await handler({ url: '/dsh-dialect/config', method: 'GET', headers: { origin: 'https://evil.example' } }, response)
  assert.equal(response.statusCode, 403)
  assert.equal(response.body, undefined)
  passed += 1
  console.log(`ok ${passed} - 路由先问 connection：被回绝的请求不再读设置`)
}

console.log(`\nALL OK (${passed} checks)`)
