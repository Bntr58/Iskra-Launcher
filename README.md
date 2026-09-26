# IskraLauncher

**English** · [Русский](README.ru.md)

IskraLauncher is a small, portable game launcher for Windows. A game list on the left, a large preview on the right, and one big **PLAY** button — that's the whole idea. Games launch through shortcut URLs (`steam://rungameid/...`, `roblox://placeID=.../`, `com.epicgames.launcher://...`) or through plain command lines copied straight from a shortcut's *Target* field.

![license](https://img.shields.io/badge/license-MIT-blue) ![platform](https://img.shields.io/badge/platform-Windows-lightgrey)

## Features
- **Covers, not just names**. Selected game in full colour with its own accent, everything else desaturated. Hover to zoom.
- **Steam-style folders**. Drop a separator, group your games under it, collapse when you don't need to see them.
- **Big preview, one big Play button**. No menus to dig through.
- **Launches anything** — Steam, Roblox, Epic shortcut URLs, or a raw command line.
- **Drag, drop, done**. Reorder games and separators right from Settings.
- **Make it yours**. Custom colours per game, your own language file.
- **Keyboard-first**. ↑/↓, Enter, Esc.
- **Fully portable**. Copy the folder, take it with you.
- **Resizes cleanly**. Frameless window, fluid layout, no fixed sizes to fight.

## Installation

- **Installer** — run `IskraLauncherSetup.exe`, pick a folder (an `IskraLauncher` subfolder is created inside it), and finish the wizard. Start Menu and desktop shortcuts are created automatically.
- **Portable** — unpack the `IskraLauncher` folder anywhere and run `IskraLauncher.exe`.

On first launch the list contains only *Portal 2*. Open Settings (gear icon, top left) to add your own games and separators.

## Adding a game

In **Settings → Add game**, enter a name, a shortcut URL (e.g. `steam://rungameid/620`), and pick a cover image. Any command line copied from a shortcut's *Target* field works too — for example:

```
"C:\Games\Foo\foo.exe" --launch
```

## Localization

All UI text lives in `localization/<code>.json` (currently `rus.json` and `eng.json`). The language dropdown in Settings is built from whatever files are present in that folder — no rebuild required.

To add a new language:

1. Copy `localization/eng.json` to `localization/<code>.json` and translate the values, keeping the keys intact. Set `common.languageName` — this is what shows up in the dropdown.
2. Optionally, add `<code> = <Name>` to `localization/languages.txt` as a fallback name.
3. Restart the launcher — the new language will appear in Settings.

## Data storage

Everything is stored next to `IskraLauncher.exe`:

| Path              | Contents                                  |
|-------------------|--------------------------------------------|
| `config.json`     | Games, selected game, colours, language    |
| `images/`         | Game covers                                |
| `localization/`   | UI translations                            |

If that folder is read-only (e.g. under `Program Files`), data is stored in `%APPDATA%\IskraLauncher\` instead.

Uninstalling removes only the program's own files — your `config.json`, `images/`, and `localization/` are left untouched.

## License

[MIT](LICENSE) © 2026 BnTr58