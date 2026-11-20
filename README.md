# 方言彩蛋（dsh-dialect）

模型平时正常说普通话，偶尔自然夹带一点方言口头禅——东北话、天津话、北京话、粤语都行。配置页就在插件详情里：四种方言直接摆出来，选一个默认的，调频率和强度；也可以勾选几种放进随机池，让每个会话从中抽一种。

远程仓库：<https://github.com/Luoqiaocong/dsh-dialect>

## 1. 装上之后在哪配置

装好并启用后，打开左侧栏的 **Plugins**，在 **Installed plugins** 里点 **方言彩蛋**，详情页里会直接出现配置卡片，不用再去 Settings，也不用记命令。

配置卡片里有：

- **启用方言彩蛋**：总开关，关掉后完全不注入。
- **方言**：东北话、天津话、北京话、粤语、随机。四种方言一直可见，点一下就切换。
- **随机池**（选「随机」时出现）：从四种方言里勾选参与抽取的，至少保留一种。每个会话固定抽一种，同一会话不会一句话换一种口音。
- **出现频率**：0–100%，默认 20%。20% 大约是每五六句里冒一句带方言色彩的。
- **强度**：轻 / 中 / 重，控制口头禅密度和句式改变程度。
- **场景加权**：闲聊、吐槽、解释报错时自动提高；正式分析、代码讲解、工具结果汇报时降到普通话。
- **自定义口头禅**：一行一条，最多 12 条、每条 24 字；留空就用内置的。

卡片底部是 **保存 / 放弃修改 / 恢复默认**。保存会写回当前 profile 的插件行，同时立刻更新提示词，不需要重启 DSH。

## 2. 安装

推荐用 Plugins 页：**Add plugin** 里填这个目录的绝对路径，例如 `D:\temp\dsh-dialect`，装完点 **Enable now**。

如果 `dsh` 在 PATH 里，也可以：

```
dsh plugin --profile web add "D:\temp\dsh-dialect"
```

从 GitHub 安装则用仓库地址：

```
dsh plugin --profile web add "https://github.com/Luoqiaocong/dsh-dialect"
```

## 3. 它是怎么工作的

Host 半部在 `lib/index.js` 里注册一个系统提示词 section，`order: 100`。DSH 的人格前缀是 `0`，工具说明从 `1000` 开始，所以这段正好落在「人格之后、工具之前」。提示词里写清当前方言、频率、强度、随机池抽中的结果，以及硬约束：代码块、命令行、路径、JSON、工具结果必须保持原样。

配置整体声明为 Schemastery 的 `.volatile()`，页面保存时原地更新配置对象，提示词 provider 每次组装都重读，所以改完下一条消息就生效。随机池的抽签结果按会话 id 缓存在内存里，同一会话保持稳定。

浏览器半部在 `lib/client.js`，通过 `ctx.configForms` 读写 `dsh-dialect` 这个 settings 命名空间，并注册到 `plugins.bundle.config` 槽位——这和 dsh-emoji 的配置页是同一套位置和做法。

## 4. 自测

```
npm run check
```

它会检查两个入口的语法，然后跑两套零依赖测试：

- `scripts/smoke.mjs`：配置归一化、四种方言模板、随机池抽取与回退、自定义口头禅清洗。
- `scripts/client-smoke.mjs`：用假的 window / document / React 跑一遍浏览器半部，确认注册到 `plugins.bundle.config`、四种方言和随机池能渲染出来。

都不启动 DSH、不联网、不消耗模型额度。

## 5. 目录

```
dsh-dialect/
├── package.json
├── cordis.patch.yml
├── icon.svg
├── locale/{zh,en}.json
├── lib/
│   ├── index.js      Host 入口：提示词注入 + settings 展示
│   ├── client.js     浏览器入口：bundle 配置卡片
│   ├── prompt.js     配置归一化、随机池、提示词拼装
│   └── dialects.js   四种方言模板
└── scripts/
    ├── smoke.mjs
    └── client-smoke.mjs
```

## 6. 兼容性与边界

- 需要 DSH `>= 0.2.2-rc.1`，已在 Web GUI 验证。
- 只依赖 `@deepseek-ai/schemastery` 和浏览器内置的 React，不需要构建步骤。
- 提示词层面是软约束，不是后处理；频率和强度是描述性目标，不是精确计数。
- 不改写代码块、工具输出、文件内容和已有会话记录，只影响之后新生成的回答。
- 子会话（subagent）也会读到这段提示词；如果希望子代理完全普通话，给它们单独关掉这个插件。
- 配置保存在当前 profile 的插件行里；本地目录安装是 `link:`，目录别挪。

## 7. License

MIT，见 [LICENSE](LICENSE)。
