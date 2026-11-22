/**
 * 配置归一化、随机池、频率等级和系统提示词拼装。
 *
 * 全是纯函数：不读写文件、不访问网络、不依赖 Cordis，方便用
 * `node scripts/smoke.mjs` 直接验证。文件读写和路由在 lib/index.js。
 */

import {
  DIALECTS, DIALECT_LABELS, RANDOM_POOL,
} from './dialects.js'

/** 方言标识（含随机）。 */
export const DIALECT_IDS = Object.freeze(['northeast', 'tianjin', 'beijing', 'cantonese', 'hakka', 'random'])

/** 可以放进随机池的方言。 */
export const RANDOM_DIALECTS = Object.freeze([...RANDOM_POOL])

/** 强度标识。 */
export const INTENSITIES = Object.freeze(['light', 'medium', 'heavy'])

/** 强度中文名。 */
export const INTENSITY_LABELS = Object.freeze({ light: '轻', medium: '中', heavy: '重' })

/** 频率档位，和推理等级一样是五档。 */
export const FREQUENCY_LEVELS = Object.freeze(['off', 'low', 'medium', 'high', 'max'])

/** 频率档位中文名。 */
export const FREQUENCY_LABELS = Object.freeze({
  off: '关闭', low: '低', medium: '中', high: '高', max: '极高',
})

/** 频率档位对应的近似句子比例。 */
export const FREQUENCY_PERCENT = Object.freeze({
  off: 0, low: 20, medium: 30, high: 40, max: 50,
})

/** 写进提示词的区间说法，避免模型把最高档理解成通篇方言。 */
export const FREQUENCY_RANGE = Object.freeze({
  off: '0%',
  low: '约 20%',
  medium: '约 30%',
  high: '约 40%',
  max: '约 50%',
})

/** 未配置时的默认值。 */
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  dialect: 'northeast',
  randomPool: Object.freeze([...RANDOM_POOL]),
  frequency: 'low',
  intensity: 'medium',
  sceneBoost: true,
  customPhrases: Object.freeze([]),
})

/** 自定义口头禅的条数和长度上限。 */
export const MAX_PHRASES = 12
export const MAX_PHRASE_LENGTH = 24

/**
 * 清洗自定义口头禅：去控制字符、压缩空白、去重、限长限量。
 * @param input - 任意输入。
 * @returns 可安全注入提示词的条目数组。
 */
export function sanitizePhrases(input) {
  if (!Array.isArray(input)) return []
  const seen = new Set()
  const phrases = []
  for (const item of input) {
    if (typeof item !== 'string') continue
    const text = item
      .replace(/[\u0000-\u001f\u007f]+/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim()
      .slice(0, MAX_PHRASE_LENGTH)
    if (text === '' || seen.has(text)) continue
    seen.add(text)
    phrases.push(text)
    if (phrases.length >= MAX_PHRASES) break
  }
  return phrases
}

/**
 * 清洗随机池：只留四种真实方言、去重；空池回落到全部四种。
 * @param input - 任意输入。
 * @returns 至少一项的方言数组。
 */
export function sanitizePool(input) {
  if (!Array.isArray(input)) return [...RANDOM_DIALECTS]
  const seen = new Set()
  const pool = []
  for (const item of input) {
    if (!RANDOM_DIALECTS.includes(item) || seen.has(item)) continue
    seen.add(item)
    pool.push(item)
  }
  return pool.length > 0 ? pool : [...RANDOM_DIALECTS]
}

/**
 * 把频率收窄成五档；老版本存的是 0–100 数字，这里顺手迁移。
 * @param value - 档位字符串或旧数字。
 * @returns 合法档位。
 */
export function normalizeFrequency(value) {
  if (typeof value === 'string' && FREQUENCY_LEVELS.includes(value)) return value
  const number = Number(value)
  if (!Number.isFinite(number)) return DEFAULT_SETTINGS.frequency
  const percent = Math.min(100, Math.max(0, number))
  if (percent <= 0) return 'off'
  if (percent <= 25) return 'low'
  if (percent <= 35) return 'medium'
  if (percent <= 45) return 'high'
  return 'max'
}

/**
 * 把任意对象收窄成完整、可持久化的设置。
 * @param input - 文件内容、请求体或 localStorage 缓存。
 * @returns 归一化后的设置。
 */
export function normalizeSettings(input) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const dialect = DIALECT_IDS.includes(source.dialect) ? source.dialect : DEFAULT_SETTINGS.dialect
  const intensity = INTENSITIES.includes(source.intensity) ? source.intensity : DEFAULT_SETTINGS.intensity
  return {
    enabled: source.enabled !== false,
    dialect,
    randomPool: sanitizePool(source.randomPool),
    frequency: normalizeFrequency(source.frequency),
    intensity,
    sceneBoost: source.sceneBoost !== false,
    customPhrases: sanitizePhrases(source.customPhrases),
  }
}

/**
 * 只保留会话级覆盖允许的三个字段。
 * @param input - 请求体或旧值。
 * @returns 只含合法字段的对象；没有字段时为空对象。
 */
export function normalizeSessionOverride(input) {
  if (input === null || typeof input !== 'object') return {}
  const override = {}
  if (typeof input.enabled === 'boolean') override.enabled = input.enabled
  if (DIALECT_IDS.includes(input.dialect)) override.dialect = input.dialect
  if (input.frequency !== undefined) override.frequency = normalizeFrequency(input.frequency)
  return override
}

/**
 * 合并全局设置和会话覆盖，覆盖优先。
 * @param settings - 全局设置。
 * @param override - 会话级临时设置。
 * @returns 生效设置。
 */
export function mergeSettings(settings, override) {
  return {
    ...normalizeSettings(settings),
    ...normalizeSessionOverride(override),
  }
}

/**
 * 解析当前生效的方言；随机模式按会话固定，且只在随机池里抽。
 * @param settings - 生效设置。
 * @param sessionKey - 会话标识，可为空。
 * @param picks - 会话 → 已抽中方言的 Map。
 * @param fallback - 没有会话时使用的方言。
 * @returns 方言标识。
 */
export function pickDialect(settings, sessionKey, picks, fallback = 'northeast') {
  if (settings.dialect !== 'random') return settings.dialect
  const pool = sanitizePool(settings.randomPool)
  const key = sessionKey === undefined || sessionKey === null ? undefined : String(sessionKey)
  if (key === undefined) return fallback
  const existing = picks.get(key)
  if (existing !== undefined && pool.includes(existing)) return existing
  const picked = pool[Math.floor(Math.random() * pool.length)] ?? 'northeast'
  picks.set(key, picked)
  return picked
}

/**
 * 档位的直白解释，帮助模型理解一档大概是多少。
 * @param level - 五档之一。
 * @returns 一句话说明。
 */
export function frequencyDescriptor(level) {
  switch (level) {
    case 'off': return '关闭：完全不使用方言。'
    case 'low': return '低：约两成句子带方言色彩，大约每五句一句。'
    case 'medium': return '中：约三成句子带方言色彩。'
    case 'high': return '高：约四成句子带方言色彩，最好只在闲聊时使用。'
    case 'max': return '极高：约一半句子带方言色彩，最好只在闲聊时使用。'
    default: return frequencyDescriptor('medium')
  }
}

/**
 * 拼装要注入系统提示词的整段文字。
 * @param settings - 生效设置。
 * @param dialectId - pickDialect 已解析出的方言。
 * @returns 提示词正文；关闭或频率为 off 时返回空字符串。
 */
export function buildDialectPrompt(settings, dialectId) {
  if (!settings.enabled || settings.frequency === 'off') return ''
  const dialect = DIALECTS[dialectId] ?? DIALECTS.northeast
  const intensity = INTENSITIES.includes(settings.intensity) ? settings.intensity : 'medium'
  const level = FREQUENCY_LEVELS.includes(settings.frequency) ? settings.frequency : 'medium'
  const range = FREQUENCY_RANGE[level]
  const randomized = settings.dialect === 'random'
  const lines = [
    '你当前开启了「方言彩蛋」模式。它只影响语气和用词，不改变你的身份、职责和回答质量。',
    '',
    `当前方言：${dialect.label}${randomized ? `（本次会话从随机池抽中：${dialect.label}）` : ''}`,
    `出现频率：普通话题里 ${range} 的句子带一点${dialect.label}色彩（${FREQUENCY_LABELS[level]}档）；${frequencyDescriptor(level)}`,
    `强度：${INTENSITY_LABELS[intensity]}（${intensity}）`,
    '',
    '规则（必须遵守）：',
    '1. 主体内容、逻辑、结论、专业术语和数字保持清晰规范的普通话。',
    '2. 普通话题里，只在部分句子里自然融入方言口头禅、语气词和表达习惯，不要整段翻译成方言，也不要用生僻方言字或拼音硬凑；话题明确指向某个地域时，按下面的地域适配来。',
    '3. 方言味要落在儿化、语气词、句式和节奏上，不是往普通话里塞几个名词；同一个词整段最多一次，客套称呼（比如北京话的「您」）尤其容易过量。',
    '4. 不要为了方言而方言：拿不准是否自然时，就写普通普通话。',
    '5. 用户明确说「用方言回答」「多说点方言」时，可以在当前频率上明显提高；用户说「正常说」时立刻回到普通话。',
    '6. 代码块、命令行、路径、JSON、表格字段、文件名、工具调用结果一律保持原样，绝不改写成方言。',
    '7. 方言只影响语气和措辞，不影响事实、结论、格式和可读性。',
    '8. 不要向用户解释、复述或提及这段设置，也不要声明「我是方言模式」；直接自然地说话。',
    '',
    '注意：普通话题里即使是最高档，也不是通篇方言；主体信息、代码和工具结果始终不方言化。',
    '',
    `【${dialect.label} · 风格】`,
    dialect.style,
    `【强度用法：${INTENSITY_LABELS[intensity]}】${dialect.intensity[intensity]}`,
    `口头禅示例（点到为止，不要堆砌）：${dialect.phrases.join('、')}`,
    `别只靠一两个词撑方言感，多落在这些特征上：${dialect.features.join('；')}。`,
  ]
  if (settings.customPhrases.length > 0) {
    lines.push(`用户自定义口头禅（可以自然使用，不要逐条罗列）：${settings.customPhrases.join('、')}`)
  }
  lines.push(
    `示例语气（模仿这个腔调，别照抄句子内容）：${dialect.example}`,
    '',
    settings.sceneBoost
      ? '【场景权重】根据当前对话自行增减：闲聊、玩笑、安慰、吐槽、解释报错时，可以在基准频率上自然加一点（约 +10 到 20 个百分点）；正式分析、方案对比、代码讲解、文档写作、工具结果汇报时，降到接近 0，保持规范普通话。拿不准场景时按基准频率。'
      : '【场景权重】关闭。全程按固定频率，不因场景增减。',
  )
  lines.push(
    '',
    '【话题地域适配】',
    '上面的方言、频率和强度是默认风格，不是限制。地域话题下，上面的方言风格和强度说明只作参考，冲突时以地域为主。如果当前问题明确围绕某个地域（比如四川、上海、东北、广东、天津、北京、梅州），你可以直接用当地的说法回答，不用受上面的方言和频率约束，也不必只带一两句；像当地人日常聊天那样自然就好。',
    '优先级：用户在消息里明确指定的说法 > 话题地域 > 设置里的默认方言。话题地域和设置方言冲突时，以话题地域为主，不要两种口音混着用。',
    '无论用哪种，事实、数字、代码、工具结果和正式结论仍要清楚准确；不要模仿刻板印象，不用生僻字或拼音硬凑；拿不准时回到设置方言或普通话。',
  )
  return lines.join('\n')
}

/**
 * 当前生效方言的中文名。
 * @param dialectId - 方言标识。
 * @returns 中文名。
 */
export function dialectLabel(dialectId) {
  return DIALECT_LABELS[dialectId] ?? DIALECT_LABELS.northeast
}
