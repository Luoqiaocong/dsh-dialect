/**
 * 本地场景判断与方言密度反馈。
 *
 * 不调用模型、不联网：只读当前会话的事件日志，用纯字符串启发式判断
 * 「上一轮是不是正式任务」，并统计最近几轮助手回复里的方言词命中数。
 * 结果只用来决定这一轮是否注入提示词、以及要不要追加一句密度回调。
 */

/** 文件名/内容写入类工具名。 */
const WRITE_TOOL = /^(?:write|edit|apply_patch|notebook_edit|create|delete|move|mkdir|write_file|edit_file|str_replace|patch)$/iu

/** 可能写文件的 shell 工具名。 */
const SHELL_TOOL = /^(?:win_bash|bash|pwsh|powershell|shell)$/iu

/** shell 参数里常见的写文件动作。 */
const SHELL_WRITE = /(?:Set-Content|Out-File|Add-Content|New-Item|Remove-Item|Move-Item|Copy-Item|sed\s+-i\b|tee\s+\S+|mkdir\s+\S+|rm\s+-|mv\s+\S+|cp\s+\S+)/iu

/** 代码围栏。 */
const CODE_FENCE = /```|~~~/u

/** 用户明确要求用方言的说法。 */
const EXPLICIT_DIALECT = /(?:用|讲|说|来点|带点|整点).{0,8}(?:方言|粤语|东北话|天津话|北京话|四川话|上海话|广东话|客家话|梅州话|兴宁话)|(?:方言|粤语|东北话|天津话|北京话|四川话|上海话|客家话).{0,6}(?:回答|说|讲|来几句)/u

/** 每轮助手回复的目标方言词命中数，按频率档位给一个粗略目标。 */
const TARGET_HITS = Object.freeze({
  off: 0, low: 0.8, medium: 1.2, high: 1.6, max: 2.0,
})

/**
 * 拼接消息内容里的文本块。
 * @param content - 字符串或 LLM 内容块数组。
 * @returns 纯文本。
 */
function contentText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
}

/**
 * 读取一条消息的文本内容。
 * @param message - LLM 消息。
 * @returns 纯文本。
 */
export function messageText(message) {
  if (message === null || typeof message !== 'object') return ''
  return contentText(message.content)
}

/**
 * 读取一条会话事件的文本内容。
 * @param event - 会话事件。
 * @returns 纯文本；非消息事件返回空串。
 */
export function eventText(event) {
  if (event === null || typeof event !== 'object') return ''
  if (event.type === 'user/message') return contentText(event.data?.content)
  if (event.type === 'assistant/message' || event.type === 'tool/result') {
    return messageText(event.data?.message)
  }
  return ''
}

/**
 * 去掉代码围栏和行内代码，避免统计方言词时把代码也算进去。
 * @param text - 原文。
 * @returns 去掉代码后的文本。
 */
export function stripCode(text) {
  return text.replace(/```[\s\S]*?```/gu, ' ').replace(/`[^`\n]*`/gu, ' ')
}

/**
 * 判断一次工具调用是不是写文件类操作。
 * @param name - 工具名。
 * @param args - 原始参数 JSON。
 * @returns 是否视为写操作。
 */
export function isWriteCall(name, args) {
  if (typeof name !== 'string') return false
  if (WRITE_TOOL.test(name)) return true
  return SHELL_TOOL.test(name) && typeof args === 'string' && SHELL_WRITE.test(args)
}

/**
 * 判断一段文本是否显式要求使用方言。
 * @param text - 最新用户消息。
 * @returns 是否显式要求。
 */
export function explicitDialectRequest(text) {
  return typeof text === 'string' && EXPLICIT_DIALECT.test(text)
}

/**
 * 统计一组事件里是否出现正式任务特征。
 * @param events - 上一轮的事件。
 * @returns 正式任务判断和依据。
 */
export function analyzeEvents(events) {
  let toolResults = 0
  let toolResultChars = 0
  let code = false
  let writes = false
  for (const event of events) {
    if (event === null || typeof event !== 'object') continue
    if (event.type === 'tool/result') {
      toolResults += 1
      toolResultChars += messageText(event.data?.message).length
    } else if (event.type === 'tool/call' && isWriteCall(event.data?.name, event.data?.arguments)) {
      writes = true
    } else if (event.type === 'assistant/message' || event.type === 'user/message') {
      if (CODE_FENCE.test(eventText(event))) code = true
    }
  }
  const dense = toolResults >= 3 || (toolResults >= 2 && toolResultChars >= 1200)
  return { formal: writes || code || dense, writes, code, toolResults, toolResultChars }
}

/**
 * 找到上一轮的事件窗口和轮次号。
 * @param session - 当前会话。
 * @returns 上一轮事件；找不到时为空。
 */
export function previousTurnEvents(session) {
  const end = session.seq
  let currentStart
  let previousStart
  let currentTurn
  for (let seq = end - 1; seq >= 0 && end - seq <= 600; seq -= 1) {
    const event = session.eventAt(seq)
    if (event?.type !== 'turn/start') continue
    if (currentStart === undefined) {
      currentStart = seq
      currentTurn = event.data?.turn
    } else {
      previousStart = seq
      break
    }
  }
  if (currentStart === undefined || previousStart === undefined) {
    return { events: [], turn: (currentTurn ?? 1) - 1 }
  }
  return {
    events: session.snapshotEvents(previousStart + 1, currentStart),
    turn: (currentTurn ?? 1) - 1,
  }
}

/**
 * 读取最近一条真人用户消息。
 * @param session - 当前会话。
 * @returns 文本；没有时为空串。
 */
export function latestUserText(session) {
  const end = session.seq
  for (let seq = end - 1; seq >= 0 && end - seq <= 200; seq -= 1) {
    const event = session.eventAt(seq)
    if (event?.type !== 'user/message') continue
    const kind = event.data?.source?.kind
    if (kind !== undefined && kind !== 'user') continue
    const text = eventText(event)
    if (text.trim() !== '') return text
  }
  return ''
}

/**
 * 场景判断：正式任务且没有明确方言要求时，这一轮不注入。
 * @param session - 当前会话。
 * @param sceneBoost - 是否开启场景加权。
 * @returns suppress 为 true 时返回空提示词。
 */
export function sceneDecision(session, sceneBoost) {
  if (!sceneBoost) return { suppress: false, reason: 'disabled', formal: false }
  const previous = previousTurnEvents(session)
  const analysis = analyzeEvents(previous.events)
  if (!analysis.formal) return { suppress: false, reason: 'casual', ...analysis }
  if (explicitDialectRequest(latestUserText(session))) {
    return { suppress: false, reason: 'explicit', ...analysis }
  }
  return { suppress: true, reason: 'formal', ...analysis }
}

/**
 * 统计一段文本里方言词的出现次数。
 * @param text - 文本。
 * @param phrases - 方言词表。
 * @returns 命中次数。
 */
export function phraseHits(text, phrases) {
  const clean = stripCode(typeof text === 'string' ? text : '')
  let hits = 0
  for (const phrase of phrases) {
    if (typeof phrase !== 'string' || phrase === '') continue
    let from = 0
    while (true) {
      const at = clean.indexOf(phrase, from)
      if (at === -1) break
      hits += 1
      from = at + phrase.length
    }
  }
  return hits
}

/**
 * 读取最近几条非空助手回复。
 * @param session - 当前会话。
 * @param limit - 最多几条。
 * @returns 最近的助手文本，新的在前。
 */
export function recentAssistantTexts(session, limit = 3) {
  const texts = []
  const end = session.seq
  for (let seq = end - 1; seq >= 0 && end - seq <= 300 && texts.length < limit; seq -= 1) {
    const event = session.eventAt(seq)
    if (event?.type !== 'assistant/message') continue
    const text = messageText(event.data?.message)
    if (text.trim().length < 40) continue
    texts.push(text)
  }
  return texts
}

/**
 * 频率档位对应的每轮目标方言词数。
 * @param level - 频率档位。
 * @returns 目标命中数。
 */
export function targetHits(level) {
  return TARGET_HITS[level] ?? TARGET_HITS.medium
}

/**
 * 生成追加在提示词尾部的密度回调信号。
 * @param session - 当前会话。
 * @param phrases - 当前方言的全部词表。
 * @param target - 每轮目标命中数。
 * @returns 一行信号；没有历史或目标为 0 时为空串。
 */
export function densityLine(session, phrases, target) {
  const texts = recentAssistantTexts(session)
  if (texts.length === 0 || target <= 0) return ''
  const total = texts.reduce((sum, text) => sum + phraseHits(text, phrases), 0)
  const average = total / texts.length
  const fmt = value => value.toFixed(1)
  if (average > target * 1.5 + 0.2) {
    return `近几轮方言密度偏高（约 ${fmt(average)} 处/轮，目标约 ${fmt(target)}），本轮回落到基准，少用一点。`
  }
  if (average < target * 0.5) {
    return `近几轮方言密度偏低（约 ${fmt(average)} 处/轮，目标约 ${fmt(target)}），本轮可以自然多带一点，但别堆。`
  }
  return `近几轮方言密度接近设定（约 ${fmt(average)} 处/轮，目标约 ${fmt(target)}），保持即可。`
}
