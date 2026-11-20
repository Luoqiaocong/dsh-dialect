/**
 * dsh-dialect — 浏览器半部。
 *
 * 学着 dsh-emoji 的做法，把配置页注册到 Plugins 页的 `plugins.bundle.config`
 * 槽位：打开本插件的详情页，就能直接看到四种方言、频率、强度和随机池，
 * 改完点保存。页面不自己写文件，通过 `ctx.configForms`（Host settings 的
 * 客户端镜像）读取和提交，写回当前 profile 的插件行。
 */

window.__ModuleLoader__.load({
	id: 'dsh-dialect',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
		const React = require('react');
		const h = React.createElement;

		/** 样式只插入一次，插件卸载时由 ctx.effect 清掉。 */
		const STYLE_ID = 'dsh-dialect-style';

		/** 本插件在 settings 里的命名空间，和 Loader 行 id 一致。 */
		const NAMESPACE = 'dsh-dialect';

		/** 配置页的字段顺序。 */
		const FIELDS = ['enabled', 'dialect', 'randomPool', 'frequency', 'intensity', 'sceneBoost', 'customPhrases'];

		/** 与 Host 侧保持一致的默认值。 */
		const DEFAULTS = {
			enabled: true,
			dialect: 'northeast',
			randomPool: ['northeast', 'tianjin', 'beijing', 'cantonese'],
			frequency: 20,
			intensity: 'medium',
			sceneBoost: true,
			customPhrases: [],
		};

		/** 方言选项。 */
		const DIALECT_OPTIONS = [
			['northeast', '东北话'],
			['tianjin', '天津话'],
			['beijing', '北京话'],
			['cantonese', '粤语'],
			['random', '随机'],
		];

		/** 参与随机池的四种方言。 */
		const POOL_OPTIONS = DIALECT_OPTIONS.filter(([id]) => id !== 'random');

		/** 强度选项及说明。 */
		const INTENSITY_OPTIONS = [
			['light', '轻'],
			['medium', '中'],
			['heavy', '重'],
		];
		const INTENSITY_HINTS = {
			light: '少量口头禅，尽量不打断阅读。',
			medium: '适度融入，语气自然。',
			heavy: '明显方言感，但每句仍然好懂。',
		};

		/** 每种方言的一句语气示例。 */
		const PREVIEWS = {
			northeast: '这事儿整得挺明白，不过第二步我再给你捋捋。',
			tianjin: '得嘞，这事儿咱慢慢捯饬，您先瞅瞅这个数儿对不对。',
			beijing: '得，您先瞧这儿，我给您掰扯掰扯。',
			cantonese: '好啦，呢个位我哋慢慢讲，你睇下啱唔啱。',
		};

		const CSS = `
.dd-card { overflow: hidden; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 12px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1f2329); }
.dd-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 14px 16px 12px; }
.dd-title { font-size: 15px; font-weight: 600; line-height: 22px; }
.dd-desc { margin-top: 2px; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; line-height: 18px; }
.dd-badges { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.dd-badge { padding: 2px 9px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #f3f4f6); color: var(--dsw-alias-label-secondary, #6b7280); font-size: 11px; line-height: 18px; white-space: nowrap; }
.dd-badge-warn { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #f79009) 14%, transparent); color: var(--dsw-alias-state-warn-primary, #b54708); }
.dd-body { display: flex; flex-direction: column; gap: 18px; padding: 4px 16px 16px; }
.dd-section { display: flex; flex-direction: column; gap: 8px; }
.dd-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dd-label { font-size: 13px; font-weight: 600; line-height: 20px; }
.dd-hint { color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; line-height: 18px; }
.dd-value { color: var(--dsw-alias-brand-primary, #4d6bfe); font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.dd-switch { position: relative; flex: none; width: 40px; height: 22px; padding: 0; border: none; border-radius: 999px; background: var(--dsw-alias-border-l2, #d1d5db); cursor: pointer; transition: background .15s ease; }
.dd-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary, #4d6bfe); }
.dd-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform .15s ease; }
.dd-switch[aria-checked="true"]::after { transform: translateX(18px); }
.dd-switch:disabled { opacity: .5; cursor: not-allowed; }
.dd-pills { display: flex; flex-wrap: wrap; gap: 8px; }
.dd-pill { padding: 5px 14px; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 999px; background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; font-size: 13px; line-height: 20px; cursor: pointer; transition: border-color .15s ease, color .15s ease, background .15s ease; }
.dd-pill:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2, #d1d5db); }
.dd-pill[aria-pressed="true"] { border-color: var(--dsw-alias-brand-primary, #4d6bfe); color: var(--dsw-alias-brand-primary, #4d6bfe); background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 10%, transparent); font-weight: 600; }
.dd-pill:disabled { opacity: .45; cursor: not-allowed; }
.dd-range { width: 100%; accent-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.dd-scale { display: flex; justify-content: space-between; margin-top: -4px; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 11px; }
.dd-check { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
.dd-check input { margin-top: 4px; accent-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.dd-textarea { box-sizing: border-box; width: 100%; min-height: 84px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; font: inherit; font-size: 13px; line-height: 20px; resize: vertical; }
.dd-textarea:focus { outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 45%, transparent); outline-offset: 1px; }
.dd-preview { padding: 10px 12px; border: 1px dashed var(--dsw-alias-border-l2, #d1d5db); border-radius: 10px; background: var(--dsw-alias-bg-base, #fafafa); }
.dd-preview-label { margin-bottom: 4px; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 11px; }
.dd-foot { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 12px 16px; border-top: 1px solid var(--dsw-alias-border-l1, #e5e7eb); background: var(--dsw-alias-bg-base, #fafafa); }
.dd-btn { padding: 6px 16px; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.dd-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2, #d1d5db); }
.dd-btn:disabled { opacity: .5; cursor: not-allowed; }
.dd-btn-primary { border-color: transparent; background: var(--dsw-alias-brand-primary, #4d6bfe); color: #fff; }
.dd-btn-primary:hover:not(:disabled) { border-color: transparent; filter: brightness(1.05); }
.dd-status { margin-left: auto; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; }
.dd-status[data-kind="error"] { color: var(--dsw-alias-state-error-primary, #d92d20); }
.dd-status[data-kind="success"] { color: var(--dsw-alias-state-success-primary, #067647); }
.dd-empty { padding: 16px; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 13px; }
`;

		/**
		 * 把 Host 值收窄成页面状态。
		 * @param input - settings 命名空间的 value。
		 * @returns 完整且合法的草稿。
		 */
		function normalize(input) {
			const source = input !== null && typeof input === 'object' ? input : {};
			const dialect = DIALECT_OPTIONS.some(([id]) => id === source.dialect) ? source.dialect : DEFAULTS.dialect;
			const intensity = INTENSITY_OPTIONS.some(([id]) => id === source.intensity) ? source.intensity : DEFAULTS.intensity;
			const frequency = Number.isFinite(Number(source.frequency))
				? Math.min(100, Math.max(0, Math.round(Number(source.frequency))))
				: DEFAULTS.frequency;
			const pool = Array.isArray(source.randomPool)
				? POOL_OPTIONS.map(([id]) => id).filter(id => source.randomPool.includes(id))
				: [...DEFAULTS.randomPool];
			const phrases = Array.isArray(source.customPhrases)
				? source.customPhrases.filter(item => typeof item === 'string').slice(0, 12)
				: [];
			return {
				enabled: source.enabled !== false,
				dialect,
				randomPool: pool.length > 0 ? pool : [...DEFAULTS.randomPool],
				frequency,
				intensity,
				sceneBoost: source.sceneBoost !== false,
				customPhrases: phrases,
			};
		}

		/**
		 * 规范化待写入的自定义口头禅。
		 * @param lines - textarea 里的原始行。
		 * @returns 去空、去重、限长限量后的数组。
		 */
		function cleanPhrases(lines) {
			const seen = new Set();
			const result = [];
			for (const line of lines) {
				if (typeof line !== 'string') continue;
				const text = line.replace(/\s+/gu, ' ').trim().slice(0, 24);
				if (text === '' || seen.has(text)) continue;
				seen.add(text);
				result.push(text);
				if (result.length >= 12) break;
			}
			return result;
		}

		/**
		 * 收窄随机池。
		 * @param pool - 勾选的方言。
		 * @returns 去重后的四种内方言。
		 */
		function cleanPool(pool) {
			return POOL_OPTIONS.map(([id]) => id).filter(id => pool.includes(id));
		}

		/**
		 * 判断两个草稿之间有哪些字段不同。
		 * @param left - 草稿。
		 * @param right - Host 值。
		 * @returns 不同的字段名。
		 */
		function changedFields(left, right) {
			return FIELDS.filter(field => JSON.stringify(left[field]) !== JSON.stringify(right[field]));
		}

		/**
		 * 生成右上角摘要。
		 * @param value - 草稿。
		 * @returns 一行中文摘要。
		 */
		function summaryOf(value) {
			if (!value.enabled) return '已关闭';
			const name = value.dialect === 'random'
				? `随机 ${value.randomPool.length} 种`
				: (DIALECT_OPTIONS.find(([id]) => id === value.dialect) ?? ['', value.dialect])[1];
			const level = (INTENSITY_OPTIONS.find(([id]) => id === value.intensity) ?? ['', value.intensity])[1];
			return `${name} · ${value.frequency}% · ${level}`;
		}

		/**
		 * 找一个文本为 label 的按钮，测试和交互都方便。
		 * @param tree - 已渲染的元素树。
		 * @param label - 按钮文字。
		 * @returns 按钮元素。
		 */
		function buttonByText(tree, label) {
			if (tree === null || typeof tree !== 'object') return undefined;
			if (tree.type === 'button' && Array.isArray(tree.children) && tree.children.includes(label)) return tree;
			for (const child of tree.children ?? []) {
				const found = buttonByText(child, label);
				if (found !== undefined) return found;
			}
			return undefined;
		}

		/**
		 * 摘要视图（bundle 页当前只渲染 page，这里保留以免将来变化）。
		 * @param props - 页面属性。
		 * @returns 一行摘要。
		 */
		function Summary(props) {
			const form = props.controller.form;
			return h('span', null, summaryOf(normalize(form.getSnapshot().value)));
		}

		/**
		 * 配置卡片本体。
		 * @param props - 含 controller 的页面属性。
		 * @returns 完整表单。
		 */
		function SettingsBody({ controller }) {
			const form = controller.form;
			const [snapshot, setSnapshot] = React.useState(() => form.getSnapshot());
			React.useEffect(() => {
				let active = true;
				const unsubscribe = form.subscribe(() => {
					if (active) setSnapshot(form.getSnapshot());
				});
				setSnapshot(form.getSnapshot());
				return () => {
					active = false;
					unsubscribe();
				};
			}, [form]);

			const hostValue = React.useMemo(
				() => normalize(snapshot ? snapshot.value : undefined),
				[snapshot ? snapshot.value : undefined],
			);
			const [draft, setDraft] = React.useState(hostValue);
			const [status, setStatus] = React.useState({ kind: 'idle', text: '' });

			React.useEffect(() => {
				setDraft(hostValue);
			}, [hostValue]);

			const patch = (value) => {
				setDraft(current => ({ ...current, ...value }));
				setStatus({ kind: 'idle', text: '' });
			};

			const ready = snapshot !== undefined && snapshot.status === 'ready';
			const writable = snapshot !== undefined && snapshot.writable === true;
			const dirty = changedFields(draft, hostValue);
			const busy = status.kind === 'saving';
			const poolValid = draft.dialect !== 'random' || draft.randomPool.length > 0;
			const canSave = ready && writable && poolValid && dirty.length > 0 && !busy;

			const save = async () => {
				if (!canSave) return;
				const ops = dirty.map(field => ({
					op: 'set',
					path: [field],
					value: field === 'customPhrases'
						? cleanPhrases(draft.customPhrases)
						: field === 'randomPool' ? cleanPool(draft.randomPool) : draft[field],
				}));
				setStatus({ kind: 'saving', text: '保存中…' });
				try {
					const accepted = await form.mutate(ops, snapshot ? snapshot.revision : undefined);
					setStatus(accepted
						? { kind: 'success', text: '已保存，下一次模型请求生效。' }
						: { kind: 'error', text: '保存被拒绝，请重试。' });
				} catch (error) {
					setStatus({ kind: 'error', text: `保存失败：${error && error.message ? error.message : '未知错误'}` });
				}
			};

			const discard = () => {
				setDraft(hostValue);
				setStatus({ kind: 'idle', text: '' });
			};

			const reset = async () => {
				if (!ready || !writable || busy) return;
				const user = snapshot.user !== null && typeof snapshot.user === 'object' ? snapshot.user : {};
				const keys = Object.keys(user);
				if (keys.length === 0) {
					setDraft(normalize(undefined));
					setStatus({ kind: 'success', text: '当前已经是默认配置。' });
					return;
				}
				const ops = FIELDS
					.filter(field => Object.prototype.hasOwnProperty.call(user, field))
					.map(field => ({ op: 'unset', path: [field] }));
				setStatus({ kind: 'saving', text: '恢复中…' });
				try {
					const accepted = await form.mutate(ops, snapshot ? snapshot.revision : undefined);
					if (accepted) setDraft(normalize(undefined));
					setStatus(accepted
						? { kind: 'success', text: '已恢复默认配置。' }
						: { kind: 'error', text: '恢复被拒绝，请重试。' });
				} catch (error) {
					setStatus({ kind: 'error', text: `恢复失败：${error && error.message ? error.message : '未知错误'}` });
				}
			};

			const togglePool = (id) => {
				const checked = draft.randomPool.includes(id);
				const next = checked
					? draft.randomPool.filter(item => item !== id)
					: [...draft.randomPool, id];
				if (next.length === 0) return;
				patch({ randomPool: next });
			};

			const previewDialect = draft.dialect === 'random'
				? (draft.randomPool[0] ?? 'northeast')
				: draft.dialect;
			const previewText = draft.dialect === 'random'
				? `每个会话从随机池抽一种：${draft.randomPool.map(id => (DIALECT_OPTIONS.find(([key]) => key === id) ?? ['', id])[1]).join('、')}。`
				: PREVIEWS[previewDialect];

			return h('section', { className: 'dd-card' },
				h('header', { className: 'dd-head' },
					h('div', null,
						h('div', { className: 'dd-title' }, '方言彩蛋'),
						h('div', { className: 'dd-desc' }, '模型正常说话，偶尔自然夹带一点方言；代码、工具结果和正式分析保持普通话。'),
					),
					h('div', { className: 'dd-badges' },
						dirty.length > 0 ? h('span', { className: 'dd-badge dd-badge-warn' }, '未保存') : null,
						h('span', { className: 'dd-badge' }, summaryOf(draft)),
					),
				),
				!ready
					? h('div', { className: 'dd-empty' },
						snapshot !== undefined && snapshot.status === 'unavailable'
							? '设置暂不可用：请确认 Host 里的 settings 服务已加载。'
							: '正在读取配置…')
					: h('div', { className: 'dd-body' },
						h('div', { className: 'dd-section' },
							h('div', { className: 'dd-row' },
								h('div', null,
									h('div', { className: 'dd-label' }, '启用方言彩蛋'),
									h('div', { className: 'dd-hint' }, '关掉后完全不注入方言说明。'),
								),
								h('button', {
									type: 'button',
									role: 'switch',
									className: 'dd-switch',
									'aria-checked': draft.enabled,
									'aria-label': '启用方言彩蛋',
									disabled: busy,
									onClick: () => patch({ enabled: !draft.enabled }),
								}),
							),
						),

						h('section', { className: 'dd-section' },
							h('div', { className: 'dd-label' }, '方言'),
							h('div', { className: 'dd-pills', role: 'group', 'aria-label': '默认方言' },
								DIALECT_OPTIONS.map(([id, label]) => h('button', {
									key: id,
									type: 'button',
									className: 'dd-pill',
									'aria-pressed': draft.dialect === id,
									disabled: busy,
									onClick: () => patch({ dialect: id }),
								}, label)),
							),
							h('div', { className: 'dd-hint' }, '选默认方言；选「随机」时，每个会话从下面的随机池抽一种，同一会话保持不变。'),
						),

						draft.dialect === 'random'
							? h('section', { className: 'dd-section' },
								h('div', { className: 'dd-row' },
									h('div', { className: 'dd-label' }, '随机池'),
									h('span', { className: 'dd-value' }, `${draft.randomPool.length} 种`),
								),
								h('div', { className: 'dd-pills', role: 'group', 'aria-label': '随机池' },
									POOL_OPTIONS.map(([id, label]) => {
										const checked = draft.randomPool.includes(id);
										return h('button', {
											key: id,
											type: 'button',
											className: 'dd-pill',
											'aria-pressed': checked,
											disabled: busy || (checked && draft.randomPool.length === 1),
											title: checked && draft.randomPool.length === 1 ? '随机池至少要保留一种方言' : undefined,
											onClick: () => togglePool(id),
										}, checked ? `✓ ${label}` : label);
									}),
								),
								h('div', { className: 'dd-hint' }, '只从勾选的方言里抽；至少保留一种。'),
							)
							: null,

						h('section', { className: 'dd-section' },
							h('div', { className: 'dd-row' },
								h('span', { className: 'dd-label' }, '出现频率'),
								h('span', { className: 'dd-value' }, `${draft.frequency}%`),
							),
							h('input', {
								type: 'range',
								className: 'dd-range',
								min: 0,
								max: 100,
								step: 5,
								value: draft.frequency,
								'aria-label': '出现频率',
								disabled: busy,
								onChange: event => patch({ frequency: Number(event.target.value) }),
							}),
							h('div', { className: 'dd-scale' }, h('span', null, '0%'), h('span', null, '100%')),
							h('div', { className: 'dd-hint' }, '约多少比例的句子可以带一点方言色彩；20% 大约是每五六句冒一句。'),
						),

						h('section', { className: 'dd-section' },
							h('div', { className: 'dd-label' }, '强度'),
							h('div', { className: 'dd-pills', role: 'group', 'aria-label': '强度' },
								INTENSITY_OPTIONS.map(([id, label]) => h('button', {
									key: id,
									type: 'button',
									className: 'dd-pill',
									'aria-pressed': draft.intensity === id,
									disabled: busy,
									onClick: () => patch({ intensity: id }),
								}, label)),
							),
							h('div', { className: 'dd-hint' }, INTENSITY_HINTS[draft.intensity]),
						),

						h('label', { className: 'dd-check' },
							h('input', {
								type: 'checkbox',
								checked: draft.sceneBoost,
								disabled: busy,
								onChange: event => patch({ sceneBoost: event.target.checked }),
							}),
							h('span', null,
								h('span', { className: 'dd-label' }, '场景加权'),
								h('div', { className: 'dd-hint' }, '闲聊、吐槽、解释报错时提高频率；正式分析、代码讲解和工具结果汇报时降到普通话。'),
							),
						),

						h('section', { className: 'dd-section' },
							h('div', { className: 'dd-label' }, '自定义口头禅'),
							h('textarea', {
								className: 'dd-textarea',
								rows: 4,
								value: draft.customPhrases.join('\n'),
								placeholder: '一行一个，例如：\n整挺好\n得嘞',
								disabled: busy,
								onChange: event => patch({ customPhrases: event.target.value.split('\n') }),
							}),
							h('div', { className: 'dd-hint' }, '最多 12 条、每条 24 字；留空就使用内置口头禅。'),
						),

						h('section', { className: 'dd-preview' },
							h('div', { className: 'dd-preview-label' }, '语气预览'),
							h('div', null, previewText),
						),

						writable ? null : h('div', { className: 'dd-hint' }, '当前 profile 不可写，修改无法保存。'),
					),
				ready
					? h('footer', { className: 'dd-foot' },
						h('button', {
							type: 'button',
							className: 'dd-btn dd-btn-primary',
							disabled: !canSave,
							onClick: save,
						}, busy ? '保存中…' : '保存'),
						h('button', {
							type: 'button',
							className: 'dd-btn',
							disabled: !writable || busy || dirty.length === 0,
							onClick: discard,
						}, '放弃修改'),
						h('button', {
							type: 'button',
							className: 'dd-btn',
							disabled: !writable || busy,
							onClick: reset,
						}, '恢复默认'),
						h('span', { className: 'dd-status', 'data-kind': status.kind, role: 'status' }, status.text),
					)
					: null,
			);
		}

		/**
		 * 页面入口：摘要和表单分成两个组件，保证 hook 顺序稳定。
		 * @param props - view 与 controller。
		 * @returns 对应视图。
		 */
		function DialectSettingsCard(props) {
			if (props.view === 'summary') return h(Summary, props);
			return h(SettingsBody, props);
		}

		/** 只依赖槽位服务和配置表单服务。 */
		const inject = ['slots', 'configForms'];
		const name = 'dsh-dialect';

		/**
		 * 注入样式、取得本命名空间的表单、注册 bundle 配置页。
		 * @param ctx - 浏览器插件上下文。
		 */
		function apply(ctx) {
			if (!document.getElementById(STYLE_ID)) {
				const style = document.createElement('style');
				style.id = STYLE_ID;
				style.textContent = CSS;
				document.head.append(style);
			}
			ctx.effect(() => () => {
				document.getElementById(STYLE_ID)?.remove();
			}, 'dsh-dialect: stylesheet');
			const form = ctx.configForms.get(NAMESPACE);
			ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
				name: 'plugins.bundle.config',
				key: NAMESPACE,
				inject: () => ({ controller: { form } }),
			}, DialectSettingsCard));
		}

		exports.name = name;
		exports.inject = inject;
		exports.apply = apply;
		exports.DialectSettingsCard = DialectSettingsCard;
		exports.buttonByText = buttonByText;
		return module.exports;
	},
});
