# Dialect spice (dsh-dialect)

Keep answers in plain Mandarin and occasionally season them with a little dialect flavor — Northeast, Tianjin, Beijing, or Cantonese. Full configuration lives in **Settings → Dialect spice**; a compact control beside the composer adjusts the current session only.

## Install

Requires DSH `>= 0.2.2-rc.1` and Node `>= 24.9.0`.

From npm, open **Plugins → Add plugin**, enter `dsh-dialect`, install, then **Enable now**. Or from a terminal:

```
dsh plugin --profile web add dsh-dialect
```

From GitHub:

```
dsh plugin --profile web add "github:Luoqiaocong/dsh-dialect"
```

## Where to configure

**Settings → Dialect spice** is the full page:

- master switch
- dialect: Northeast, Tianjin, Beijing, Cantonese, or random
- random pool: which dialects participate in the per-session draw
- frequency: a five-step slider
- intensity: light, medium, heavy
- scene weighting: raise the frequency for casual chat, lower it for formal analysis and tool results
- custom phrases, up to 12 entries

Changes save automatically to `~/.dsh/dsh-dialect.json`; `localStorage` only caches the last value for a fast first paint.

The small button beside the composer adjusts only the switch, dialect, and frequency for the current session. It does not write the global file; **Restore global settings** clears the override.

## Frequency levels

| Level | Approx. share | Note |
| --- | --- | --- |
| Off | 0% | no dialect |
| Low | 20% | default; about one sentence in five |
| Medium | 30% | about three sentences in ten |
| High | 40% | best for casual chat |
| Max | 50% | best for casual chat |

Low is gray, medium green, high orange, and max red on the slider. High and max carry a "best for casual chat" hint. Even at max the answer is not entirely dialect: code blocks, tool output, and file contents always stay plain.

## Development

```
npm run check
```

Runs syntax checks plus two dependency-free test suites for the prompt logic and the browser half. It does not start DSH, use the network, or consume model quota.

## License

MIT
