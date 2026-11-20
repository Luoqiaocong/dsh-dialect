# Changelog

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
