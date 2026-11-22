/**
 * dsh-dialect — Host 半部。
 *
 * 设置保存在 `$DSH_HOME/dsh-dialect.json`（默认 `~/.dsh/dsh-dialect.json`），
 * 和 dsh-answer-style 一样是本地文件，跨浏览器、跨 Desktop 共用；浏览器半部
 * 通过 `/dsh-dialect/config` 读写，另有一份 localStorage 缓存用于首屏。
 *
 * 另外提供会话级临时覆盖（`/dsh-dialect/session/<id>`）：设置页改的是全局
 * 默认，对话页的小控件只改当前会话，两者不抢同一份状态。
 *
 * 每次模型请求前，按「全局设置 + 本会话覆盖」拼一段系统提示词注入；代码块、
 * 工具结果、文件内容保持原样。
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DIALECTS } from './dialects.js'
import {
  buildDialectPrompt, DEFAULT_SETTINGS, mergeSettings, normalizeSessionOverride,
  normalizeSettings, pickDialect,
} from './prompt.js'
import { densityLine, sceneDecision, targetHits } from './scene.js'

/** Cordis 插件名。 */
export const name = 'dsh-dialect'

/** 只需要系统提示词注册表和 connection（路由的信任围栏）。 */
export const inject = ['systemPrompt', 'connection']

/** 路由根。 */
const ROUTE = '/dsh-dialect'

/** 请求体上限。 */
const MAX_BODY_BYTES = 16384

/** 会话覆盖最多保留多少条。 */
const OVERRIDE_LIMIT = 200

/**
 * 设置文件路径。
 * @returns `$DSH_HOME/dsh-dialect.json`。
 */
function settingsPath() {
  const configured = process.env.DSH_HOME
  const home = configured !== undefined && configured.trim() !== '' ? configured : join(homedir(), '.dsh')
  return join(home, 'dsh-dialect.json')
}

/**
 * 读取设置文件；缺失或损坏时回落到默认值。
 * @returns 归一化后的设置。
 */
function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(readFileSync(settingsPath(), 'utf8')))
  } catch {
    return normalizeSettings(DEFAULT_SETTINGS)
  }
}

/**
 * 原子写入设置文件。
 * @param value - 归一化后的设置。
 */
function saveSettings(value) {
  const file = settingsPath()
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
}

/**
 * 回答一段 JSON。
 * @param response - response writer。
 * @param status - HTTP 状态码。
 * @param value - JSON 可序列化内容。
 */
function sendJson(response, status, value) {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

/**
 * 组合里的 connection 服务：Host/Origin 围栏与浏览器登录令牌都在它这里。
 * @param ctx - 插件上下文。
 * @returns 提供 requestRejection 的服务，没有则为 undefined。
 */
function connectionOf(ctx) {
  try {
    return Reflect.get(ctx, 'connection')
  } catch {
    return undefined
  }
}

/**
 * 不可信、未登录的请求直接回 401/403。
 * 服务缺席（例如没有浏览器的合成环境）时放行，保持路由可用；
 * 服务在、但检查本身出错时按拒绝处理，别把路由敞开。
 * @param ctx - 插件上下文。
 * @param request - 请求。
 * @param response - 响应。
 * @returns 已经回绝则为 true。
 */
function rejected(ctx, request, response) {
  const connection = connectionOf(ctx)
  if (typeof connection?.requestRejection !== 'function') return false
  let rejection
  try {
    rejection = connection.requestRejection(request)
  } catch {
    rejection = 403
  }
  if (rejection === undefined) return false
  response.writeHead(rejection, { 'content-length': 0 })
  response.end()
  return true
}

/**
 * 读取有上限的请求体。
 * @param request - 请求。
 * @returns 解码后的文本。
 */
async function readBody(request) {
  return await new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

/**
 * 解析一个 JSON 请求体。
 * @param request - 请求。
 * @returns 解析后的值；空体视为空对象。
 */
async function readJson(request) {
  const text = (await readBody(request)).trim()
  if (text === '') return {}
  const value = JSON.parse(text)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('body must be an object')
  }
  return value
}

/**
 * 限制会话覆盖的规模。
 * @param overrides - 会话 → 覆盖 的 Map。
 */
function pruneOverrides(overrides) {
  while (overrides.size > OVERRIDE_LIMIT) {
    const oldest = overrides.keys().next().value
    if (oldest === undefined) return
    overrides.delete(oldest)
  }
}

/**
 * 挂载提示词注入、设置文件路由和会话级覆盖路由。
 * @param ctx - Host 插件上下文。
 */
export function apply(ctx) {
  /** 全局设置；页面保存后原地替换。 */
  let settings = loadSettings()
  /** 会话 id → 临时覆盖。 */
  const overrides = new Map()
  /** 会话 id → 随机模式抽中的方言。 */
  const picks = new Map()

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'dsh-dialect',
    // 0 是人格前缀，1000 起是工具说明：放在二者之间。
    order: 100,
    interpolate: false,
    text: (context) => {
      const session = context.agent?.session
      const sessionKey = session?.id
      const override = sessionKey === undefined ? undefined : overrides.get(String(sessionKey))
      const effective = mergeSettings(settings, override)
      if (!effective.enabled || effective.frequency === 'off') return ''
      // 场景硬化：上一轮有代码块、写文件或工具结果密集时，这一轮完全不注入。
      // 用户在本轮明确要求方言时例外，保留手动控制。
      if (session !== undefined && sceneDecision(session, effective.sceneBoost).suppress) return ''
      const resolved = pickDialect(
        effective, sessionKey, picks, effective.randomPool[0] ?? 'northeast',
      )
      while (picks.size > OVERRIDE_LIMIT) {
        const oldest = picks.keys().next().value
        if (oldest === undefined) break
        picks.delete(oldest)
      }
      const prompt = buildDialectPrompt(effective, resolved)
      if (session === undefined) return prompt
      const phrases = [...(DIALECTS[resolved]?.phrases ?? []), ...effective.customPhrases]
      const feedback = densityLine(session, phrases, targetHits(effective.frequency))
      return feedback === '' ? prompt : `${prompt}\n\n${feedback}`
    },
  }), 'dsh-dialect: prompt section')

  ctx.inject(['webServer'], (scope) => {
    scope.effect(() => scope.webServer.register({
      kind: 'prefix',
      path: ROUTE,
      handler: async (request, response) => {
        // 先问 connection：Host/Origin 不对、或浏览器没带登录令牌的请求到此为止，
        // 免得任意网页跨站改设置、读会话覆盖。
        if (rejected(ctx, request, response)) return
        const url = new URL(request.url ?? '/', 'http://localhost')
        const path = url.pathname
        try {
          if (path === `${ROUTE}/config`) {
            if (request.method === 'GET') {
              sendJson(response, 200, settings)
              return
            }
            if (request.method === 'PUT' || request.method === 'POST') {
              settings = normalizeSettings(await readJson(request))
              saveSettings(settings)
              sendJson(response, 200, settings)
              return
            }
            sendJson(response, 405, { error: 'method not allowed' })
            return
          }

          if (path.startsWith(`${ROUTE}/session/`)) {
            const sessionId = decodeURIComponent(path.slice(`${ROUTE}/session/`.length))
            if (sessionId === '' || sessionId.length > 200) {
              sendJson(response, 400, { error: 'invalid session' })
              return
            }
            if (request.method === 'GET') {
              sendJson(response, 200, { session: sessionId, override: overrides.get(sessionId) ?? null })
              return
            }
            if (request.method === 'PUT' || request.method === 'POST') {
              const next = normalizeSessionOverride(await readJson(request))
              if (Object.keys(next).length === 0) overrides.delete(sessionId)
              else {
                overrides.set(sessionId, next)
                pruneOverrides(overrides)
              }
              sendJson(response, 200, { session: sessionId, override: overrides.get(sessionId) ?? null })
              return
            }
            if (request.method === 'DELETE') {
              overrides.delete(sessionId)
              sendJson(response, 200, { session: sessionId, override: null })
              return
            }
            sendJson(response, 405, { error: 'method not allowed' })
            return
          }

          sendJson(response, 404, { error: 'not found' })
        } catch {
          sendJson(response, 400, { error: 'invalid request' })
        }
      },
    }), 'dsh-dialect: settings and session routes')
  })
}
