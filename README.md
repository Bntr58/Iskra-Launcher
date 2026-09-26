# IskraLauncher

**English** · [Русский](README.ru.md)

A small, portable game launcher for Windows: a game list on the left, a big preview on the right, and one large **PLAY** button. Games start through shortcut URLs (`steam://rungameid/...`, `roblox://placeID=.../`, `com.epicgames.launcher://...`) or plain command lines copied from a shortcut's *Target* field.

![license](https://img.shields.io/badge/license-MIT-blue) ![platform](https://img.shields.io/badge/platform-Windows-lightgrey)

## Features

- **Game list** with covers. Unselected games are desaturated, the selected one is in full colour with a white bar and a coloured title. Covers zoom on hover.
- **Separators** work like Steam folders: every game below a separator belongs to its group until the next separator. Click a separator to collapse its games. Each separator has its own name and colour.
- **Preview** of the selected game in a white frame.
- **Play button** launches the game's shortcut URL via the system handler, or runs a local command line.
- **Drag-and-drop reordering** of games and separators in Settings.
- **Custom colours** for the selected game's title and the Play button.
- **Multilingual UI** — switch the language in Settings, or add your own (see below).
- **Keyboard control**: `↑`/`↓` select, `Enter` launches, `Esc` closes Settings.
- **Portable**: config, covers and translations live next to the executable, so the whole folder can be copied to another PC.
- Frameless, freely resizable window with a fully fluid layout.

## Installation

- **Installer:** run `IskraLauncherSetup.exe`, choose a folder (an `IskraLauncher` subfolder is created inside it) and finish the wizard. Start Menu and desktop shortcuts are added.
- **Portable:** unpack the `IskraLauncher` folder anywhere and run `IskraLauncher.exe`.

On first run the list contains only PORTAL 2. Open Settings (gear icon, top left) to add your own games and separators.

## Adding a game

In Settings → **Add game**, enter a name, a shortcut URL (e.g. `steam://rungameid/620`) and pick a cover image. Any command line copied from a shortcut's *Target* field works too, for example `"C:\Games\Foo\foo.exe" --launch`.

## Localization

All UI text lives in `localization/<code>.json` (currently `rus.json` and `eng.json`). The language dropdown in Settings is built from the files present in that folder, so no rebuild is needed.

To add a language:

1. Copy `localization/eng.json` to `localization/<code>.json` and translate the values (keep the keys). Set `common.languageName` — this is the name shown in the dropdown.
2. Optionally add `<code> = <Name>` to `localization/languages.txt` as a fallback name.
3. Restart the launcher: the language shows up in Settings.

## Your data

Everything is stored next to `IskraLauncher.exe`:

- `config.json` — games, selected game, colours, language
- `images/` — game covers
- `localization/` — UI translations

If that folder is read-only (e.g. under `Program Files`), data goes to `%APPDATA%\IskraLauncher\` instead.

Uninstalling removes only the program's own files; your `config.json`, `images/` and `localization/` are left in place.

## License

[MIT](LICENSE) © 2026 BnTr58!
