# Changelog

## 0.3.0-beta.1

- Scene weighting is now enforced in the Host: a previous turn with code fences, file writes, or dense tool output suppresses the dialect section entirely. An explicit request for dialect in the current message still wins.
- Added a local density feedback line: recent assistant replies are scanned for dialect phrases, and the prompt gets a callback when the density is above or below the configured target.
- A clear regional topic can now override the configured dialect and frequency: the model may answer with that region's local phrasing even when it is not in the settings.
- The Settings page notes that the frequency level does not apply to regional topics.
- Folds in the unreleased 0.2.5 work; published as a beta.

## 0.2.3

- Frequency is now a five-step slider with a smooth ladder: off / 20% / 30% / 40% / 50%.
- Each level has its own color — low gray, medium green, high orange, max red — and the composer popover opens above the input instead of off-screen.
- Settings page auto-saves to `~/.dsh/dsh-dialect.json`; `localStorage` is only a first-paint cache.
- A shortcut beside the composer controls the switch, dialect, and frequency for the current session only.
- The plugin page no longer carries a config card; configuration moved to Settings.

## 0.2.0

- Added the Settings page, the composer shortcut, the five-step frequency control, and local file storage.
- Removed the `/dialect` slash command.

## 0.1.0

- First working version: prompt injection for Northeast, Tianjin, Beijing, and Cantonese, with frequency, intensity, scene weighting, a random pool, and custom phrases.
