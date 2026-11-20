/**
 * dsh-dialect — Host 半部。
 *
 * 每次模型请求前注入一段说明「当前方言 / 频率 / 强度 / 安全边界」的文字。
 * 模型仍然正常回答普通话，只是偶尔自然地夹带一点方言色彩；代码块、工具
 * 结果、文件内容不受影响。
 *
 * 配置页在 Plugins 页的 bundle 详情里（和 dsh-emoji 一样），由浏览器半部
 * 通过 plugins.bundle.config 槽位注册。Config 整体声明为 volatile，页面
 * 保存后原地生效，不重启 DSH。
 */

import Schema from '@deepseek-ai/schemastery'
import { DIALECTS, DIALECT_LABELS, RANDOM_POOL } from './dialects.js'
import { buildDialectPrompt, pickDialect, readConfig } from './prompt.js'

/** Cordis 插件名。 */
export const name = 'dsh-dialect'

/** 只需要系统提示词注册表；settings 在 apply 里按需注入。 */
export const inject = ['systemPrompt']

/** 会话 → 随机方言 的缓存上限。 */
const PICK_LIMIT = 200

/**
 * 插件配置。
 *
 * 整个 schema 声明为 volatile：页面保存时原地更新配置对象，不重跑 apply，
 * 因此提示词 provider 每次组装都能读到最新值，随机池也不用重新加载。
 */
export const Config = Schema.object({
  enabled: Schema.boolean().default(true).description('是否启用方言彩蛋'),
  dialect: Schema.union([
    Schema.const('northeast').description('东北话'),
    Schema.const('tianjin').description('天津话'),
    Schema.const('beijing').description('北京话'),
    Schema.const('cantonese').description('粤语'),
    Schema.const('random').description('随机：每个会话从随机池里抽一种'),
  ]).default('northeast').description('默认方言'),
  randomPool: Schema.array(Schema.union([
    Schema.const('northeast'),
    Schema.const('tianjin'),
    Schema.const('beijing'),
    Schema.const('cantonese'),
  ])).default([...RANDOM_POOL]).description('随机池：随机模式下参与抽取的方言'),
  frequency: Schema.number().min(0).max(100).step(5).default(20)
    .description('方言出现概率（%）：约多少比例的句子可以带一点方言色彩'),
  intensity: Schema.union([
    Schema.const('light').description('轻：少量口头禅'),
    Schema.const('medium').description('中：适度融入'),
    Schema.const('heavy').description('重：明显方言感'),
  ]).default('medium').description('方言强度'),
  sceneBoost: Schema.boolean().default(true)
    .description('按场景自动调整频率：闲聊提高，正式分析和代码降低'),
  customPhrases: Schema.array(Schema.string()).default([])
    .description('自定义口头禅，一行一条，最多 12 条、每条 24 字'),
}).volatile()

/**
 * 限制会话抽签缓存规模，丢掉最早的一条。
 * @param picks - 会话 → 方言 的 Map。
 */
function prunePicks(picks) {
  while (picks.size > PICK_LIMIT) {
    const oldest = picks.keys().next().value
    if (oldest === undefined) return
    picks.delete(oldest)
  }
}

/**
 * 挂载提示词注入、settings 展示和（不注册命令的）实时配置读取。
 * @param ctx - Host 插件上下文。
 * @param config - 整体 volatile 的插件配置。
 */
export function apply(ctx, config) {
  /** 会话 id → 随机模式抽中的方言。 */
  const picks = new Map()

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'dsh-dialect',
    // 0 是人格前缀，1000 起是工具说明：放在二者之间，正好是「人格之后、工具之前」。
    order: 100,
    interpolate: false,
    text: (context) => {
      const settings = readConfig(config)
      if (!settings.enabled || settings.frequency <= 0) return ''
      const sessionKey = context.agent?.session?.id
      const resolved = pickDialect(
        settings, sessionKey, picks, settings.randomPool[0] ?? 'northeast',
      )
      if (settings.dialect === 'random') prunePicks(picks)
      return buildDialectPrompt(settings, resolved)
    },
  }), 'dsh-dialect: prompt section')

  // 把本行的 Config 作为 settings 命名空间暴露给页面；auto:false 表示
  // 不出现在通用的自动设置列表里，页面由浏览器半部自己画。
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(
      () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      'dsh-dialect: settings presentation',
    )
  })
}

export { DIALECTS, DIALECT_LABELS }
