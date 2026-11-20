/**
 * dsh-dialect — 浏览器半部。
 *
 * 两个入口共用一份全局设置（Host 的 `~/.dsh/dsh-dialect.json`，localStorage
 * 只做首屏缓存）：
 * - Settings → 方言彩蛋：完整设置，改动自动保存；
 * - 对话输入框左侧：当前会话的临时快捷控制，只调开关、方言、频率，
 *   不写全局文件，和模型/推理等级一样按会话生效。
 *
 * 频率用五档滑杆：off / low / medium / high / max，高和极高带警示配色。
 */

window.__ModuleLoader__.load({
	id: 'dsh-dialect',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
		const React = require('react');
		const ReactDOM = require('react-dom');
		const h = React.createElement;

		/** 样式只插入一次，插件卸载时由 ctx.effect 清掉。 */
		const STYLE_ID = 'dsh-dialect-style';
		/** Host 路由。 */
		const ENDPOINT = '/dsh-dialect';
		/** 首屏缓存键。 */
		const CACHE_KEY = 'dsh-dialect/v1';
		/** 全局设置文件的位置，只用于提示文案。 */
		const FILE_HINT = '~/.dsh/dsh-dialect.json';

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

		/** 方言中文名。 */
		const DIALECT_LABELS = Object.fromEntries(DIALECT_OPTIONS.map(([id, label]) => [id, label]));

		/** 强度选项。 */
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

		/** 频率五档：档位、名称、百分比、说明、是否不建议。 */
		const FREQUENCY_OPTIONS = [
			['off', '关闭', 0, '不夹带任何方言。', false],
			['low', '低', 10, '大约每十句一句。', false],
			['medium', '中', 20, '大约每五六句一句，默认档。', false],
			['high', '高', 35, '约三成半句子带方言，明显但不通篇；不建议日常使用。', true],
			['max', '极高', 50, '约一半句子带方言，仍保留一半普通话；不建议日常使用。', true],
		];
		const FREQUENCY_LEVELS = FREQUENCY_OPTIONS.map(([id]) => id);
		const FREQUENCY_BY_ID = Object.fromEntries(FREQUENCY_OPTIONS.map(option => [option[0], option]));

		/** 每种方言的一句语气示例。 */
		const PREVIEWS = {
			northeast: '这事儿整得挺明白，不过第二步我再给你捋捋。',
			tianjin: '得嘞，这事儿咱慢慢捯饬，您先瞅瞅这个数儿对不对。',
			beijing: '得，您先瞧这儿，我给您掰扯掰扯。',
			cantonese: '好啦，呢个位我哋慢慢讲，你睇下啱唔啱。',
		};

		/** 默认设置，和 Host 侧保持一致。 */
		const DEFAULTS = {
			enabled: true,
			dialect: 'northeast',
			randomPool: ['northeast', 'tianjin', 'beijing', 'cantonese'],
			frequency: 'medium',
			intensity: 'medium',
			sceneBoost: true,
			customPhrases: [],
		};

		const CSS = `
.dx-page { max-width: 760px; padding: 4px 2px 36px; color: var(--dsw-alias-label-primary, #1f2329); font-size: 14px; line-height: 22px; }
.dx-page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 14px; }
.dx-title { font-size: 18px; font-weight: 600; line-height: 26px; }
.dx-desc { margin-top: 4px; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; line-height: 18px; }
.dx-section { display: flex; flex-direction: column; gap: 10px; padding: 18px 0; border-top: 1px solid var(--dsw-alias-border-l1, #e5e7eb); }
.dx-section:first-of-type { border-top: none; }
.dx-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dx-label { font-size: 14px; font-weight: 600; line-height: 20px; }
.dx-hint { color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; line-height: 18px; }
.dx-warn-text { color: var(--dsw-alias-state-warn-primary, #b54708); font-size: 12px; line-height: 18px; }
.dx-warn-text[data-level="high"] { color: #b45309; }
.dx-warn-text[data-level="max"] { color: #b91c1c; }
.dx-switch { position: relative; flex: none; width: 44px; height: 24px; padding: 0; border: none; border-radius: 999px; background: var(--dsw-alias-border-l2, #d1d5db); cursor: pointer; transition: background .15s ease; }
.dx-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary, #d45a3a); }
.dx-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform .15s ease; }
.dx-switch[aria-checked="true"]::after { transform: translateX(20px); }
.dx-switch:disabled { opacity: .5; cursor: not-allowed; }
.dx-pills { display: flex; flex-wrap: wrap; gap: 8px; }
.dx-pill { padding: 5px 14px; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 999px; background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; font-size: 13px; line-height: 20px; cursor: pointer; transition: border-color .15s ease, color .15s ease, background .15s ease; }
.dx-pill:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2, #d1d5db); }
.dx-pill[aria-pressed="true"] { border-color: var(--dsw-alias-brand-primary, #d45a3a); color: var(--dsw-alias-brand-primary, #d45a3a); background: color-mix(in srgb, var(--dsw-alias-brand-primary, #d45a3a) 10%, transparent); font-weight: 600; }
.dx-pill:disabled { opacity: .45; cursor: not-allowed; }
.dx-pill-sm { padding: 3px 11px; font-size: 12px; line-height: 18px; }
.dx-textarea { box-sizing: border-box; width: 100%; min-height: 88px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; font: inherit; font-size: 13px; line-height: 20px; resize: vertical; }
.dx-textarea:focus { outline: 2px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #d45a3a) 45%, transparent); outline-offset: 1px; }
.dx-preview { padding: 10px 12px; border: 1px dashed var(--dsw-alias-border-l2, #d1d5db); border-radius: 10px; background: var(--dsw-alias-bg-base, #fafafa); }
.dx-preview-label { margin-bottom: 4px; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 11px; }
.dx-save { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 12px; }
.dx-save[data-kind="error"] { color: var(--dsw-alias-state-error-primary, #d92d20); }
.dx-save[data-kind="saved"] { color: var(--dsw-alias-state-success-primary, #067647); }
.dx-btn { padding: 6px 14px; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #fff); color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.dx-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2, #d1d5db); }
.dx-btn:disabled { opacity: .5; cursor: not-allowed; }
.dx-btn-text { padding: 4px 8px; border: none; background: none; color: var(--dsw-alias-brand-primary, #d45a3a); font: inherit; font-size: 12px; cursor: pointer; }
.dx-btn-text:disabled { color: var(--dsw-alias-label-secondary, #6b7280); cursor: default; }
.dx-foot { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding-top: 4px; }

/* 五档频率滑杆 */
.dx-freq { display: flex; flex-direction: column; gap: 6px; }
.dx-freq-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.dx-freq-label { font-size: 13px; font-weight: 600; }
.dx-freq-value { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-secondary, #6b7280); font-variant-numeric: tabular-nums; transition: color .2s ease; }
.dx-freq-value[data-level="medium"] { color: #15803d; }
.dx-freq-value[data-level="high"] { color: #b45309; }
.dx-freq-value[data-level="max"] { color: #b91c1c; }
.dx-freq-scale { display: flex; justify-content: space-between; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 11px; }
.dx-track { position: relative; height: 16px; margin: 6px 0 2px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, #ececec); cursor: pointer; outline: none; }
.dx-track:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary, #d45a3a) 45%, transparent); }
.dx-fill { position: absolute; top: 0; bottom: 0; left: 0; border-radius: inherit; background: #8b93a1; opacity: .85; transition: width .16s ease, background-color .2s ease, opacity .2s ease; }
.dx-fill[data-level="off"] { opacity: 0; }
.dx-fill[data-level="low"] { background: #8b93a1; }
.dx-fill[data-level="medium"] { background: #16a34a; }
.dx-fill[data-level="high"] { background: #f59e0b; }
.dx-fill[data-level="max"] { background: #dc2626; }
.dx-handle { position: absolute; top: 50%; width: 12px; height: 24px; margin-left: -6px; border-radius: 6px; background: #fff; border: 1px solid var(--dsw-alias-border-l2, #d1d5db); box-shadow: 0 1px 3px rgba(0,0,0,.18); transform: translateY(-50%); transition: left .16s ease, border-color .2s ease, box-shadow .2s ease; }
.dx-track[data-level="low"] .dx-handle { border-color: #8b93a1; }
.dx-track[data-level="medium"] .dx-handle { border-color: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,.14); }
.dx-track[data-level="high"] .dx-handle { border: 2px solid #f59e0b; box-shadow: 0 0 0 4px rgba(245,158,11,.18); }
.dx-track[data-level="max"] .dx-handle { border: 2px solid #dc2626; box-shadow: 0 0 0 4px rgba(220,38,38,.18); }
.dx-ticks { display: flex; justify-content: space-between; padding: 0 1px; color: var(--dsw-alias-label-secondary, #6b7280); font-size: 11px; }
.dx-ticks span[data-active="true"] { color: var(--dsw-alias-label-primary, #1f2329); font-weight: 600; }
.dx-ticks span[data-active="true"][data-level="medium"] { color: #15803d; }
.dx-ticks span[data-active="true"][data-level="high"] { color: #b45309; }
.dx-ticks span[data-active="true"][data-level="max"] { color: #b91c1c; }
.dx-freq-compact .dx-track { height: 14px; }
.dx-freq-compact .dx-handle { height: 20px; width: 10px; margin-left: -5px; }

/* 对话输入框左侧的小控件和弹层 */
.dx-trigger { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 14px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary, #1f2329); font: inherit; font-size: 12px; line-height: 1; cursor: pointer; white-space: nowrap; }
.dx-trigger:hover { border-color: var(--dsw-alias-border-l2, #d1d5db); }
.dx-trigger[data-open="true"] { border-color: var(--dsw-alias-brand-primary, #d45a3a); color: var(--dsw-alias-brand-primary, #d45a3a); }
.dx-trigger[data-off="true"] { color: var(--dsw-alias-label-secondary, #6b7280); }
.dx-trigger-glyph { font-size: 13px; line-height: 1; opacity: .85; }
.dx-trigger-dot { width: 4px; height: 4px; border-radius: 50%; background: currentColor; opacity: .5; }
.dx-pop { position: fixed; z-index: 2400; box-sizing: border-box; width: 320px; max-height: calc(100vh - 24px); overflow-y: auto; padding: 14px; border: 1px solid var(--dsw-alias-border-l1, #e5e7eb); border-radius: 12px; background: var(--dsw-alias-bg-overlay, #fff); box-shadow: 0 12px 32px rgba(0,0,0,.18); }
.dx-pop-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.dx-pop-title { font-size: 14px; font-weight: 600; }
.dx-pop-badge { padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-brand-primary, #d45a3a) 12%, transparent); color: var(--dsw-alias-brand-primary, #d45a3a); font-size: 11px; line-height: 17px; }
.dx-pop-body { display: flex; flex-direction: column; gap: 14px; }
.dx-pop-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1, #e5e7eb); }
.dx-pop-status { color: var(--dsw-alias-label-secondary, #6b7280); font-size: 11px; }
.dx-pop-status[data-kind="error"] { color: var(--dsw-alias-state-error-primary, #d92d20); }
`;

		/**
		 * 把任意值收窄成本地设置对象。
		 * @param input - 文件、缓存或请求返回值。
		 * @returns 完整设置。
		 */
		function normalize(input) {
			const source = input !== null && typeof input === 'object' ? input : {};
			const dialect = DIALECT_OPTIONS.some(([id]) => id === source.dialect) ? source.dialect : DEFAULTS.dialect;
			const intensity = INTENSITY_OPTIONS.some(([id]) => id === source.intensity) ? source.intensity : DEFAULTS.intensity;
			const frequency = normalizeFrequency(source.frequency);
			const pool = Array.isArray(source.randomPool)
				? POOL_OPTIONS.map(([id]) => id).filter(id => source.randomPool.includes(id))
				: [...DEFAULTS.randomPool];
			return {
				enabled: source.enabled !== false,
				dialect,
				randomPool: pool.length > 0 ? pool : [...DEFAULTS.randomPool],
				frequency,
				intensity,
				sceneBoost: source.sceneBoost !== false,
				customPhrases: Array.isArray(source.customPhrases)
					? source.customPhrases.filter(item => typeof item === 'string').slice(0, 12)
					: [],
			};
		}

		/**
		 * 把频率收窄成五档，并迁移旧版数字。
		 * @param value - 档位或数字。
		 * @returns 合法档位。
		 */
		function normalizeFrequency(value) {
			if (typeof value === 'string' && FREQUENCY_LEVELS.includes(value)) return value;
			const number = Number(value);
			if (!Number.isFinite(number)) return DEFAULTS.frequency;
			const percent = Math.min(100, Math.max(0, number));
			if (percent <= 0) return 'off';
			if (percent <= 15) return 'low';
			if (percent <= 35) return 'medium';
			if (percent <= 60) return 'high';
			return 'max';
		}

		/**
		 * 只保留会话覆盖允许的字段。
		 * @param input - 任意对象。
		 * @returns 只含合法字段的覆盖。
		 */
		function normalizeOverride(input) {
			if (input === null || typeof input !== 'object') return {};
			const override = {};
			if (typeof input.enabled === 'boolean') override.enabled = input.enabled;
			if (DIALECT_OPTIONS.some(([id]) => id === input.dialect)) override.dialect = input.dialect;
			if (input.frequency !== undefined) override.frequency = normalizeFrequency(input.frequency);
			return override;
		}

		/**
		 * 合并全局设置和会话覆盖。
		 * @param settings - 全局设置。
		 * @param override - 会话覆盖。
		 * @returns 生效设置。
		 */
		function mergeSettings(settings, override) {
			return { ...normalize(settings), ...normalizeOverride(override) };
		}

		/**
		 * 读 localStorage 缓存。
		 * @returns 缓存的设置或 undefined。
		 */
		function readCache() {
			try {
				const text = window.localStorage.getItem(CACHE_KEY);
				return text === null ? undefined : JSON.parse(text);
			} catch {
				return undefined;
			}
		}

		/**
		 * 创建全局设置存储：localStorage 首屏，Host 文件为准，改动自动保存。
		 * @returns 供两个入口共用的存储。
		 */
		function createStore() {
			let state = normalize(readCache());
			let status = { kind: 'idle', text: '' };
			let timer;
			let touched = false;
			const listeners = new Set();

			const emit = () => {
				for (const listener of listeners) listener();
			};
			const writeCache = () => {
				try {
					window.localStorage.setItem(CACHE_KEY, JSON.stringify(state));
				} catch {
					// 隐私模式或配额满时忽略缓存，Host 文件仍是事实来源。
				}
			};
			const setStatus = (kind, text) => {
				status = { kind, text };
				emit();
			};
			const persist = async () => {
				try {
					const response = await fetch(`${ENDPOINT}/config`, {
						method: 'PUT',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(state),
					});
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					state = normalize(await response.json());
					writeCache();
					setStatus('saved', '已自动保存到本地文件');
				} catch (error) {
					setStatus('error', `保存失败：${error && error.message ? error.message : '未知错误'}`);
				}
			};
			const schedule = () => {
				clearTimeout(timer);
				timer = setTimeout(() => {
					void persist();
				}, 350);
			};

			return {
				get: () => state,
				getStatus: () => status,
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				patch(partial) {
					touched = true;
					state = normalize({ ...state, ...partial });
					writeCache();
					setStatus('saving', '保存中…');
					schedule();
				},
				reset() {
					touched = true;
					state = normalize(DEFAULTS);
					writeCache();
					setStatus('saving', '恢复中…');
					schedule();
				},
				async load() {
					try {
						const response = await fetch(`${ENDPOINT}/config`);
						if (!response.ok) throw new Error(`HTTP ${response.status}`);
						const remote = normalize(await response.json());
						if (touched) return;
						state = remote;
						writeCache();
						setStatus('saved', '已读取本地文件');
					} catch {
						// Host 不可达时保留缓存，页面仍可用。
					}
				},
			};
		}

		const store = createStore();

		/**
		 * 读取当前会话的临时覆盖。
		 * @param sessionId - 会话 id。
		 * @returns 覆盖对象。
		 */
		async function fetchOverride(sessionId) {
			try {
				const response = await fetch(`${ENDPOINT}/session/${encodeURIComponent(sessionId)}`);
				if (!response.ok) return {};
				const body = await response.json();
				return normalizeOverride(body.override);
			} catch {
				return {};
			}
		}

		/**
		 * 写入当前会话的临时覆盖。
		 * @param sessionId - 会话 id。
		 * @param override - 覆盖对象。
		 */
		async function saveOverride(sessionId, override) {
			try {
				await fetch(`${ENDPOINT}/session/${encodeURIComponent(sessionId)}`, {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(override),
				});
			} catch {
				// 网络失败时保留本地 UI 状态。
			}
		}

		/**
		 * 清除当前会话的临时覆盖。
		 * @param sessionId - 会话 id。
		 */
		async function clearOverride(sessionId) {
			try {
				await fetch(`${ENDPOINT}/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
			} catch {
				// 同上。
			}
		}

		/**
		 * 五档频率滑杆。
		 * @param props.value - 当前档位。
		 * @param props.onChange - 档位变化回调。
		 * @param props.compact - 弹层里的紧凑版本。
		 * @returns 滑杆。
		 */
		function FrequencyControl({ value, onChange, compact }) {
			const index = Math.max(0, FREQUENCY_LEVELS.indexOf(value));
			const [id, label, percent, description, warn] = FREQUENCY_BY_ID[FREQUENCY_LEVELS[index]];
			const ratio = index / (FREQUENCY_LEVELS.length - 1);

			const select = (nextIndex) => {
				const clamped = Math.min(FREQUENCY_LEVELS.length - 1, Math.max(0, nextIndex));
				onChange(FREQUENCY_LEVELS[clamped]);
			};
			const onTrackPointer = (event) => {
				const rect = event.currentTarget.getBoundingClientRect();
				if (rect.width <= 0) return;
				const ratioFromClick = (event.clientX - rect.left) / rect.width;
				select(Math.round(ratioFromClick * (FREQUENCY_LEVELS.length - 1)));
			};
			const onKey = (event) => {
				if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
					event.preventDefault();
					select(index - 1);
				} else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
					event.preventDefault();
					select(index + 1);
				} else if (event.key === 'Home') {
					event.preventDefault();
					select(0);
				} else if (event.key === 'End') {
					event.preventDefault();
					select(FREQUENCY_LEVELS.length - 1);
				}
			};

			return h('div', { className: compact ? 'dx-freq dx-freq-compact' : 'dx-freq' },
				h('div', { className: 'dx-freq-head' },
					h('span', { className: 'dx-freq-label' }, '出现频率'),
					h('span', { className: 'dx-freq-value', 'data-level': id }, `${label} · ${percent}%`),
				),
				h('div', { className: 'dx-freq-scale' }, h('span', null, '更少'), h('span', null, '更多')),
				h('div', {
					role: 'slider',
					tabIndex: 0,
					className: 'dx-track',
					'aria-label': '出现频率',
					'aria-valuemin': 0,
					'aria-valuemax': FREQUENCY_LEVELS.length - 1,
					'aria-valuenow': index,
					'aria-valuetext': label,
					'data-level': id,
					onClick: onTrackPointer,
					onKeyDown: onKey,
				},
				h('div', { className: 'dx-fill', 'data-level': id, style: { width: `${ratio * 100}%` } }),
				h('div', { className: 'dx-handle', style: { left: `${ratio * 100}%` } }),
				),
				h('div', { className: 'dx-ticks' },
					FREQUENCY_OPTIONS.map(([tickId, tickLabel, , , ,], tickIndex) => h('span', {
						key: tickId,
						'data-active': tickIndex === index,
						'data-level': tickId,
					}, tickLabel)),
				),
				warn
					? h('div', { className: 'dx-warn-text', 'data-level': id }, description)
					: h('div', { className: 'dx-hint' }, description),
			);
		}

		/**
		 * 设置页图标：一个带三横线的对话气泡。
		 * @returns 16px SVG。
		 */
		function SettingsIcon() {
			return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true' },
				h('path', {
					d: 'M2.5 3.5h11v7h-6l-2.5 2.5V10.5h-2.5z',
					fill: 'none',
					stroke: 'currentColor',
					'stroke-width': 1.3,
					'stroke-linejoin': 'round',
				}),
				h('path', { d: 'M5 6h6M5 8h4', stroke: 'currentColor', 'stroke-width': 1.1, 'stroke-linecap': 'round' }),
			);
		}

		/**
		 * Settings → 方言彩蛋：完整设置，改动自动保存。
		 * @param props.store - 全局设置存储。
		 * @returns 设置页。
		 */
		function SettingsPage({ store }) {
			const [settings, setSettings] = React.useState(store.get());
			const [status, setStatus] = React.useState(store.getStatus());
			const [phraseDraft, setPhraseDraft] = React.useState(settings.customPhrases.join('\n'));

			React.useEffect(() => store.subscribe(() => {
				const next = store.get();
				setSettings(next);
				setStatus(store.getStatus());
				setPhraseDraft(next.customPhrases.join('\n'));
			}), [store]);

			const patch = (partial) => store.patch(partial);
			const togglePool = (id) => {
				const checked = settings.randomPool.includes(id);
				const pool = checked
					? settings.randomPool.filter(item => item !== id)
					: [...settings.randomPool, id];
				if (pool.length === 0) return;
				patch({ randomPool: pool });
			};
			const previewDialect = settings.dialect === 'random'
				? (settings.randomPool[0] ?? 'northeast')
				: settings.dialect;
			const previewText = settings.dialect === 'random'
				? `每个会话从随机池抽一种：${settings.randomPool.map(id => DIALECT_LABELS[id]).join('、')}。`
				: PREVIEWS[previewDialect];

			return h('div', { className: 'dx-page' },
				h('div', { className: 'dx-page-head' },
					h('div', null,
						h('div', { className: 'dx-title' }, '方言彩蛋'),
						h('div', { className: 'dx-desc' }, '模型正常说话，偶尔自然夹带一点方言；代码、工具结果和正式分析保持普通话。'),
					),
					h('div', { className: 'dx-row', style: { gap: 8 } },
						h('span', { className: 'dx-hint' }, '启用'),
						h('button', {
							type: 'button',
							role: 'switch',
							className: 'dx-switch',
							'aria-checked': settings.enabled,
							'aria-label': '启用方言彩蛋',
							onClick: () => patch({ enabled: !settings.enabled }),
						}),
					),
				),

				h('section', { className: 'dx-section' },
					h('div', { className: 'dx-row' },
						h('span', { className: 'dx-label' }, '方言'),
						h('span', { className: 'dx-hint' }, '随机时从下面的池里抽'),
					),
					h('div', { className: 'dx-pills', role: 'group', 'aria-label': '默认方言' },
						DIALECT_OPTIONS.map(([id, label]) => h('button', {
							key: id,
							type: 'button',
							className: 'dx-pill',
							'aria-pressed': settings.dialect === id,
							onClick: () => patch({ dialect: id }),
						}, label)),
					),
					settings.dialect === 'random'
						? h('div', { className: 'dx-pills', role: 'group', 'aria-label': '随机池' },
							POOL_OPTIONS.map(([id, label]) => {
								const checked = settings.randomPool.includes(id);
								return h('button', {
									key: id,
									type: 'button',
									className: 'dx-pill dx-pill-sm',
									'aria-pressed': checked,
									disabled: checked && settings.randomPool.length === 1,
									onClick: () => togglePool(id),
								}, checked ? `✓ ${label}` : label);
							}),
						)
						: null,
				),

				h('section', { className: 'dx-section' },
					h(FrequencyControl, {
						value: settings.frequency,
						onChange: (value) => patch({ frequency: value }),
					}),
				),

				h('section', { className: 'dx-section' },
					h('div', { className: 'dx-label' }, '强度'),
					h('div', { className: 'dx-pills', role: 'group', 'aria-label': '强度' },
						INTENSITY_OPTIONS.map(([id, label]) => h('button', {
							key: id,
							type: 'button',
							className: 'dx-pill',
							'aria-pressed': settings.intensity === id,
							onClick: () => patch({ intensity: id }),
						}, label)),
					),
					h('div', { className: 'dx-hint' }, INTENSITY_HINTS[settings.intensity]),
				),

				h('section', { className: 'dx-section' },
					h('label', { className: 'dx-row', style: { justifyContent: 'flex-start', cursor: 'pointer' } },
						h('input', {
							type: 'checkbox',
							checked: settings.sceneBoost,
							style: { accentColor: 'var(--dsw-alias-brand-primary, #d45a3a)' },
							onChange: event => patch({ sceneBoost: event.target.checked }),
						}),
						h('span', null,
							h('div', { className: 'dx-label' }, '场景加权'),
							h('div', { className: 'dx-hint' }, '闲聊、吐槽、解释报错时提高频率；正式分析、代码讲解和工具结果汇报时降到普通话。'),
						),
					),
				),

				h('section', { className: 'dx-section' },
					h('div', { className: 'dx-label' }, '自定义口头禅'),
					h('textarea', {
						className: 'dx-textarea',
						rows: 4,
						value: phraseDraft,
						placeholder: '一行一个，例如：\n整挺好\n得嘞',
						onChange: event => setPhraseDraft(event.target.value),
						onBlur: () => store.patch({ customPhrases: phraseDraft.split('\n') }),
					}),
					h('div', { className: 'dx-hint' }, '最多 12 条、每条 24 字；留空就使用内置口头禅。'),
				),

				h('section', { className: 'dx-section' },
					h('div', { className: 'dx-preview' },
						h('div', { className: 'dx-preview-label' }, '语气预览'),
						h('div', null, previewText),
					),
				),

				h('div', { className: 'dx-foot' },
					h('div', { className: 'dx-save', 'data-kind': status.kind, role: 'status' },
						h('span', null, status.kind === 'idle' ? `改动会自动保存到 ${FILE_HINT}` : status.text),
					),
					h('button', {
						type: 'button',
						className: 'dx-btn',
						onClick: () => store.reset(),
					}, '恢复默认'),
				),
			);
		}

		/**
		 * 计算弹层位置：优先在按钮上方，空间不够就放下方。
		 * @param button - 触发按钮。
		 * @returns 固定定位坐标。
		 */
		function positionFor(button) {
			const rect = button.getBoundingClientRect();
			const width = 320;
			const estimatedHeight = 380;
			const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
			if (rect.top >= estimatedHeight - 8) {
				return { left, bottom: window.innerHeight - rect.top + 8 };
			}
			const top = Math.min(rect.bottom + 8, window.innerHeight - estimatedHeight - 8);
			return { left, top: Math.max(8, top) };
		}

		/**
		 * 对话输入框左侧的快捷控制；只改当前会话。
		 * @param props.store - 全局设置存储。
		 * @param props.sessionId - 当前会话 id。
		 * @returns 小按钮和弹层。
		 */
		function ComposerControl({ store, sessionId }) {
			const [settings, setSettings] = React.useState(store.get());
			const [override, setOverride] = React.useState({});
			const [open, setOpen] = React.useState(false);
			const [anchor, setAnchor] = React.useState(null);
			const [status, setStatus] = React.useState({ kind: 'idle', text: '' });
			const buttonRef = React.useRef(null);
			const popoverRef = React.useRef(null);

			React.useEffect(() => store.subscribe(() => setSettings(store.get())), [store]);

			React.useEffect(() => {
				let active = true;
				if (sessionId === undefined) {
					setOverride({});
					return;
				}
				setOverride({});
				void fetchOverride(sessionId).then((value) => {
					if (active) setOverride(value);
				});
				return () => {
					active = false;
				};
			}, [sessionId]);

			React.useEffect(() => {
				if (!open) return;
				const onPointer = (event) => {
					if (popoverRef.current !== null && popoverRef.current.contains(event.target)) return;
					if (buttonRef.current !== null && buttonRef.current.contains(event.target)) return;
					setOpen(false);
				};
				const onKey = (event) => {
					if (event.key === 'Escape') setOpen(false);
				};
				const reposition = () => {
					if (buttonRef.current !== null) setAnchor(positionFor(buttonRef.current));
				};
				document.addEventListener('mousedown', onPointer);
				document.addEventListener('keydown', onKey);
				window.addEventListener('resize', reposition);
				window.addEventListener('scroll', reposition, true);
				return () => {
					document.removeEventListener('mousedown', onPointer);
					document.removeEventListener('keydown', onKey);
					window.removeEventListener('resize', reposition);
					window.removeEventListener('scroll', reposition, true);
				};
			}, [open]);

			const effective = mergeSettings(settings, override);
			const hasOverride = Object.keys(override).length > 0;
			const off = !effective.enabled || effective.frequency === 'off';
			const label = off
				? '方言关'
				: (effective.dialect === 'random' ? '随机方言' : DIALECT_LABELS[effective.dialect]);

			const openPopover = () => {
				if (buttonRef.current !== null) setAnchor(positionFor(buttonRef.current));
				setOpen(true);
			};

			const patchOverride = (partial) => {
				if (sessionId === undefined) return;
				const next = normalizeOverride({ ...override, ...partial });
				setOverride(next);
				setStatus({ kind: 'saving', text: '保存中…' });
				void saveOverride(sessionId, next).then(() => {
					setStatus({ kind: 'saved', text: '已保存到本会话' });
				});
			};
			const clear = () => {
				if (sessionId === undefined) return;
				setOverride({});
				setStatus({ kind: 'saving', text: '恢复中…' });
				void clearOverride(sessionId).then(() => {
					setStatus({ kind: 'saved', text: '已恢复全局设置' });
				});
			};

			const popover = open && anchor !== null ? ReactDOM.createPortal(
				h('div', {
					className: 'dx-pop',
					style: { left: anchor.left, top: anchor.top, bottom: anchor.bottom },
					ref: popoverRef,
					role: 'dialog',
					'aria-label': '方言彩蛋快捷设置',
				},
				h('div', { className: 'dx-pop-head' },
					h('span', { className: 'dx-pop-title' }, '方言彩蛋'),
					hasOverride ? h('span', { className: 'dx-pop-badge' }, '本会话') : null,
				),
				h('div', { className: 'dx-pop-body' },
					h('div', { className: 'dx-row' },
						h('span', { className: 'dx-label' }, '启用'),
						h('button', {
							type: 'button',
							role: 'switch',
							className: 'dx-switch',
							'aria-checked': effective.enabled,
							'aria-label': '启用方言彩蛋',
							onClick: () => patchOverride({ enabled: !effective.enabled }),
						}),
					),
					h('div', { className: 'dx-pills', role: 'group', 'aria-label': '本会话方言' },
						DIALECT_OPTIONS.map(([id, text]) => h('button', {
							key: id,
							type: 'button',
							className: 'dx-pill dx-pill-sm',
							'aria-pressed': effective.dialect === id,
							onClick: () => patchOverride({ dialect: id }),
						}, text)),
					),
					h(FrequencyControl, {
						compact: true,
						value: effective.frequency,
						onChange: (value) => patchOverride({ frequency: value }),
					}),
					h('div', { className: 'dx-hint' }, '只影响当前会话，不写入全局设置；强度、随机池和自定义口头禅在 设置 → 方言彩蛋。'),
				),
				h('div', { className: 'dx-pop-foot' },
					h('button', {
						type: 'button',
						className: 'dx-btn-text',
						disabled: !hasOverride,
						onClick: clear,
					}, '恢复全局设置'),
					h('span', { className: 'dx-pop-status', 'data-kind': status.kind }, status.text),
				),
				),
				document.body,
			) : null;

			return h(React.Fragment, null,
				h('button', {
					type: 'button',
					ref: buttonRef,
					className: 'dx-trigger',
					'data-open': open,
					'data-off': off,
					'aria-haspopup': 'dialog',
					'aria-expanded': open,
					onClick: () => (open ? setOpen(false) : openPopover()),
				},
				h('span', { className: 'dx-trigger-glyph' }, '语'),
				h('span', null, label),
				),
				popover,
			);
		}

		/** 需要槽位、Locale 与远程通道。 */
		const inject = ['slots'];
		const name = 'dsh-dialect';

		/**
		 * 注入样式，注册设置页、设置图标和对话页快捷控件。
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
			void store.load();
			ctx.slots.inject('settings.section', () => ctx.slots.register({
				name: 'settings.section',
				id: 'dsh-dialect',
				order: 45,
				label: () => '方言彩蛋',
				inject: () => ({ store }),
			}, SettingsPage));
			ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
				name: 'settings.section.icon',
				id: 'dsh-dialect',
				order: 45,
			}, SettingsIcon));
			ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
				name: 'conversation.input.left',
				id: 'dsh-dialect',
				order: 35,
				inject: () => ({ store }),
			}, ComposerControl));
		}

		exports.name = name;
		exports.inject = inject;
		exports.apply = apply;
		exports.SettingsPage = SettingsPage;
		exports.SettingsIcon = SettingsIcon;
		exports.ComposerControl = ComposerControl;
		exports.FrequencyControl = FrequencyControl;
		exports.createStore = createStore;
		exports.normalize = normalize;
		return module.exports;
	},
});
