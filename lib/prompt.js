/**
 * 配置归一化、方言抽取和系统提示词拼装。
 *
 * 全是纯函数：不读写文件、不访问网络、不依赖 Cordis，方便用
 * `node scripts/smoke.mjs` 直接验证。真正的注册动作在 lib/index.js。
 */

import {
  DIALECTS, DIALECT_LABELS, RANDOM_POOL,
} from './dialects.js'

/** 方言标识（含随机）。 */
export const DIALECT_IDS = Object.freeze(['northeast', 'tianjin', 'beijing', 'cantonese', 'random'])

/** 可以放进随机池的方言。 */
export const RANDOM_DIALECTS = Object.freeze([...RANDOM_POOL])

/** 强度标识。 */
export const INTENSITIES = Object.freeze(['light', 'medium', 'heavy'])

/** 强度中文名。 */
export const INTENSITY_LABELS = Object.freeze({ light: '轻', medium: '中', heavy: '重' })

/** 未配置时的默认值。 */
export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  dialect: 'northeast',
  randomPool: Object.freeze([...RANDOM_POOL]),
  frequency: 20,
  intensity: 'medium',
  sceneBoost: true,
  customPhrases: Object.freeze([]),
})

/** 自定义口头禅的条数和长度上限。 */
export const MAX_PHRASES = 12
export const MAX_PHRASE_LENGTH = 24

/**
 * 解包整个 Config 的 volatile 包装。
 * @param config - apply 收到的配置，或普通对象。
 * @returns 普通配置对象。
 */
function unwrap(config) {
  if (config === null || typeof config !== 'object') return {}
  if (typeof config.get === 'function') {
    try {
      const value = config.get()
      return value !== null && typeof value === 'object' ? value : {}
    } catch {
      return {}
    }
  }
  return config
}

/**
 * 读取单个字段，兼容逐字段 volatile 的旧写法。
 * @param source - 普通配置对象。
 * @param key - 字段名。
 * @returns 字段值。
 */
function valueOf(source, key) {
  const entry = source[key]
  if (entry !== null && typeof entry === 'object' && typeof entry.get === 'function') {
    try {
      return entry.get()
    } catch {
      return undefined
    }
  }
  return entry
}

/**
 * 把任意值收窄到 0–100 的整数。
 * @param value - 候选值。
 * @param fallback - 不是有限数字时使用的值。
 * @returns 合法频率。
 */
export function clampFrequency(value, fallback = DEFAULT_CONFIG.frequency) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(100, Math.max(0, Math.round(number)))
}

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
 * 把插件配置读成普通对象，缺失或非法字段回落到默认值。
 * @param config - apply 收到的配置（整个 Config 是 volatile），或普通对象。
 * @returns 归一化后的配置。
 */
export function readConfig(config) {
  const source = unwrap(config)
  const dialect = valueOf(source, 'dialect')
  const intensity = valueOf(source, 'intensity')
  return {
    enabled: valueOf(source, 'enabled') !== false,
    dialect: DIALECT_IDS.includes(dialect) ? dialect : DEFAULT_CONFIG.dialect,
    randomPool: sanitizePool(valueOf(source, 'randomPool')),
    frequency: clampFrequency(valueOf(source, 'frequency')),
    intensity: INTENSITIES.includes(intensity) ? intensity : DEFAULT_CONFIG.intensity,
    sceneBoost: valueOf(source, 'sceneBoost') !== false,
    customPhrases: sanitizePhrases(valueOf(source, 'customPhrases')),
  }
}

/**
 * 解析当前生效的方言；随机模式按会话固定，且只在随机池里抽。
 * @param config - 生效配置。
 * @param sessionKey - 会话标识，可为空。
 * @param picks - 会话 → 已抽中方言的 Map。
 * @param fallback - 没有会话时使用的方言。
 * @returns 方言标识。
 */
export function pickDialect(config, sessionKey, picks, fallback = 'northeast') {
  if (config.dialect !== 'random') return config.dialect
  const pool = sanitizePool(config.randomPool)
  const key = sessionKey === undefined || sessionKey === null ? undefined : String(sessionKey)
  if (key === undefined) return fallback
  const existing = picks.get(key)
  if (existing !== undefined && pool.includes(existing)) return existing
  const picked = pool[Math.floor(Math.random() * pool.length)] ?? 'northeast'
  picks.set(key, picked)
  return picked
}

/**
 * 频率的直白解释，帮助模型理解「20%」到底是多少。
 * @param frequency - 0–100。
 * @returns 一句话说明。
 */
export function frequencyDescriptor(frequency) {
  if (frequency <= 0) return '关闭：完全不使用方言。'
  if (frequency < 10) return '极轻：一整段回答最多冒一两次方言词。'
  if (frequency <= 25) return '轻：大约每五六句出现一句带方言色彩的话。'
  if (frequency <= 50) return '中：大约每三四句出现一句带方言色彩的话。'
  if (frequency <= 75) return '明显：大约每两三句出现一句带方言色彩的话。'
  return '高：方言色彩几乎贯穿全文，但每句仍要一眼看懂。'
}

/**
 * 拼装要注入系统提示词的整段文字。
 * @param config - 生效配置。
 * @param dialectId - pickDialect 已解析出的方言。
 * @returns 提示词正文；关闭或频率为 0 时返回空字符串。
 */
export function buildDialectPrompt(config, dialectId) {
  if (!config.enabled || config.frequency <= 0) return ''
  const dialect = DIALECTS[dialectId] ?? DIALECTS.northeast
  const intensity = INTENSITIES.includes(config.intensity) ? config.intensity : 'medium'
  const percent = Math.round(config.frequency)
  const randomized = config.dialect === 'random'
  const lines = [
    '你当前开启了「方言彩蛋」模式。它只影响语气和用词，不改变你的身份、职责和回答质量。',
    '',
    `当前方言：${dialect.label}${randomized ? `（本次会话从随机池抽中：${dialect.label}）` : ''}`,
    `出现频率：约 ${percent}% 的句子可以带一点${dialect.label}色彩；${frequencyDescriptor(percent)}`,
    `强度：${INTENSITY_LABELS[intensity]}（${intensity}）`,
    '',
    '规则（必须遵守）：',
    '1. 主体内容、逻辑、结论、专业术语和数字保持清晰规范的普通话。',
    '2. 只在部分句子里自然融入方言口头禅、语气词和表达习惯，不要整段翻译成方言，也不要用生僻方言字或拼音硬凑。',
    '3. 不要为了方言而方言：拿不准是否自然时，就写普通普通话。',
    '4. 用户明确说「用方言回答」「多说点方言」时，可以在当前频率上明显提高；用户说「正常说」时立刻回到普通话。',
    '5. 代码块、命令行、路径、JSON、表格字段、文件名、工具调用结果一律保持原样，绝不改写成方言。',
    '6. 方言只影响语气和措辞，不影响事实、结论、格式和可读性。',
    '7. 不要向用户解释、复述或提及这段设置，也不要声明「我是方言模式」；直接自然地说话。',
    '',
    `【${dialect.label} · 风格】`,
    dialect.style,
    `【强度用法：${INTENSITY_LABELS[intensity]}】${dialect.intensity[intensity]}`,
    `口头禅示例（点到为止，不要堆砌）：${dialect.phrases.join('、')}`,
  ]
  if (config.customPhrases.length > 0) {
    lines.push(`用户自定义口头禅（可以自然使用，不要逐条罗列）：${config.customPhrases.join('、')}`)
  }
  lines.push(
    `示例语气（只学语气，不要照抄句子）：${dialect.example}`,
    '',
    config.sceneBoost
      ? '【场景权重】根据当前对话自行增减：闲聊、玩笑、安慰、吐槽、解释报错时，可以在基准频率上自然加一点（约 +10 到 20 个百分点）；正式分析、方案对比、代码讲解、文档写作、工具结果汇报时，降到接近 0，保持规范普通话。拿不准场景时按基准频率。'
      : '【场景权重】关闭。全程按固定频率，不因场景增减。',
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
