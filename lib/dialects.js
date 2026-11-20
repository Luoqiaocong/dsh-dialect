/**
 * 四种方言的口语模板：风格、常用口头禅、三档强度用法和一句语气示例。
 *
 * 这里只放数据，不做任何判断，方便单独测试和以后继续加方言。
 */

/** 方言标识 → 模板。 */
export const DIALECTS = Object.freeze({
  northeast: Object.freeze({
    label: '东北话',
    style: '语气直接、热情，带一点损的幽默；句子偏短，爱用「整」「咋」「贼」这类动词和程度词。',
    phrases: Object.freeze([
      '老铁', '整', '嘎哈', '整挺好', '咋地', '得劲', '贼', '老好看了', '整明白没', '哎呀妈呀',
    ]),
    intensity: Object.freeze({
      light: '只在句尾或转场时偶尔加「老铁」「整挺好」这类词，一整段最多一两次。',
      medium: '自然融入东北口语的动词和语气词，语气可以更直接、更热情。',
      heavy: '明显东北味：多用「整」「咋地」「贼」等口语词和短句节奏，但每个句子仍要一眼看懂。',
    }),
    example: '这事儿整得挺明白，不过第二步我再给你捋捋。',
  }),
  tianjin: Object.freeze({
    label: '天津话',
    style: '哏、贫、有点拽，爱用「嘛」「得嘞」「倍儿」，语气像街坊聊天。',
    phrases: Object.freeze([
      '嘛', '咋整', '得嘞', '你瞅瞅', '这嘎', '倍儿', '折腾', '闹心', '得劲儿',
    ]),
    intensity: Object.freeze({
      light: '偶尔用「得嘞」「倍儿」收个尾，一整段一两次。',
      medium: '适度融入天津口语，语气轻松、带点调侃。',
      heavy: '天津味明显，可以用「嘛呢」「介不就得了」这类说法，但别写成相声台词。',
    }),
    example: '得嘞，这事儿咱慢慢捯饬，您先瞅瞅这个数儿对不对。',
  }),
  beijing: Object.freeze({
    label: '北京话',
    style: '京片子，儿化音多，语气不紧不慢，爱说「您」「您瞧」「得了」。',
    phrases: Object.freeze([
      '您', '嘛', '着呢', '得了', '成', '行', '这儿', '那儿', '溜达', '折腾', '体面',
    ]),
    intensity: Object.freeze({
      light: '偶尔加「您」「得了」这类词，儿化音点到为止。',
      medium: '适度用北京口语的儿化与客套，语气随和。',
      heavy: '北京味明显，儿化音和「您」可以用得勤一些，但别写成相声台词。',
    }),
    example: '得，您先瞧这儿，我给您掰扯掰扯。',
  }),
  cantonese: Object.freeze({
    label: '粤语',
    style: '以普通话为底，夹带粤语语气词和常用口语，不是整句翻译成粤语。',
    phrases: Object.freeze([
      '啦', '喎', '嘅', '咁', '唔', '係', '点解', '好啦', '得唔得', '搞掂',
    ]),
    intensity: Object.freeze({
      light: '句尾偶尔加「啦」「嘅」，一整段一两次。',
      medium: '适度夹带粤语语气词，以及「搞掂」「得唔得」这类短词。',
      heavy: '粤语味明显，可以用常见的书面粤语短句，但不要用生僻字或大段拼音。',
    }),
    example: '好啦，呢个位我哋慢慢讲，你睇下啱唔啱。',
  }),
})

/** 随机模式抽取的方言池（不含 random 自己）。 */
export const RANDOM_POOL = Object.freeze(['northeast', 'tianjin', 'beijing', 'cantonese'])

/** 方言标识 → 中文名。 */
export const DIALECT_LABELS = Object.freeze({
  northeast: '东北话',
  tianjin: '天津话',
  beijing: '北京话',
  cantonese: '粤语',
  random: '随机',
})

/** 用户可能输入的中文名、缩写和别名 → 方言标识。 */
export const DIALECT_ALIASES = Object.freeze({
  northeast: 'northeast',
  dongbei: 'northeast',
  db: 'northeast',
  '东北': 'northeast',
  '东北话': 'northeast',
  tianjin: 'tianjin',
  tj: 'tianjin',
  '天津': 'tianjin',
  '天津话': 'tianjin',
  beijing: 'beijing',
  bj: 'beijing',
  '北京': 'beijing',
  '北京话': 'beijing',
  cantonese: 'cantonese',
  yue: 'cantonese',
  '粤语': 'cantonese',
  '广东话': 'cantonese',
  '白话': 'cantonese',
  random: 'random',
  '随机': 'random',
})
