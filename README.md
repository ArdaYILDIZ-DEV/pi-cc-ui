<p align="center">
  <strong>Claude Code spinner with live token rate, 5-minute prompt cache TTL counter with git status, and compact tool renderers for Pi.</strong><br>
  <img src="https://img.shields.io/badge/node-%3E%3D22-blue?style=flat-square" alt="Node.js 22+">
  <img src="https://img.shields.io/badge/typescript-7.0%2B-blue?style=flat-square" alt="TypeScript 7.0+">
  <img src="https://img.shields.io/badge/tests-187%20passed-green?style=flat-square" alt="187 tests passed">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License">
</p>

`cc-ui` is a terminal UI extension for Pi that replaces the default working indicator with a compact animated spinner and live streaming generation speed (`tok/s`), adds git status and a prompt cache TTL counter beneath the editor, and renders tool calls in compact Claude style (`● Label(detail)` / `└ summary`).

## Installation

Pi automatically discovers extensions inside `~/.pi/agent/extensions/`. The extension adds no runtime package dependencies; it uses Pi's host APIs:

```sh
git clone https://github.com/ArdaYILDIZ-DEV/pi-cc-ui.git ~/.pi/agent/extensions/cc-ui
```

Alternatively, as a pi package (requires the `pi-package` keyword, included):

```sh
pi install git:github.com/ArdaYILDIZ-DEV/pi-cc-ui
```

Pi will load and activate the extension on its next start or reload.

## Features

- **Compact spinner row:** Animated glyph (`· ✢ ✳ ✶ ✻ ✽`), Turkish action verbs, token counters, live streaming generation speed (`tok/s`), elapsed turn time, and a simple thinking status.
- **Git status & prompt cache TTL bar:** Displays git branch, modified file count, and open pull request on the left (`main* · 3 dosya`), alongside the right-aligned `36sn / 5dk` cache TTL counter immediately below the editor (`placement: "belowEditor"`).
- **Proximity color shifting:** The counter smoothly interpolates from fresh green (`#4EBA65`) through yellow and orange, darkening into deep crimson red (`RGB 140, 18, 18`) as 5 minutes approaches, with the `/ 5dk` deadline highlighted in red.
- **Audio warning alerts:** Plays non-blocking audio notifications as cache TTL milestones pass:
  - 3. dakika: `3.mp3` (1 kez)
  - 1. dakika: `4.mp3` (1 kez)
  - 4.30. dakika: `4.mp3` (2 kez)
- **Slash command:** `/cache` displays exact elapsed/remaining time; `/cache toggle` shows or hides the counter; `/cache sound` toggles sound alerts; `/cache sound test` plays a test sound.
- **Git commands:** `/git` shows repository status, branch, and open PR; `/git refresh` forces an immediate background update.
- **Compact tool renderers & Claude diff:** Every tool renders as `● Label(detail)` with a one-line `└ summary`. The `edit` tool adds Claude Code diff styling with green/red backgrounds, word-level diffs, `<lineNum> <sign> <code>` gutters, and syntax highlighting. Toggle with `/cc-tools`.

## Commands

| Command | Action |
| --- | --- |
| `/cache` | Shows prompt cache TTL elapsed time, remaining seconds, and status notification |
| `/cache toggle` | Toggles the sub-editor counter widget on or off |
| `/cache sound` | Toggles audio warning alerts on or off (`sound on` / `sound off`) |
| `/cache sound test` | Plays the 3-minute warning sound immediately to test audio output |
| `/git` | Shows current git repository branch, modified file count, and open pull request |
| `/git refresh` | Forces an immediate background refresh of git and pull request state |
| `/cc-tools` | Shows compact tool renderer status |
| `/cc-tools on` / `/cc-tools off` / `/cc-tools toggle` | Enables or disables compact tool renderers dynamically |

## Project structure

```text
.
├── cache-timer.ts          # 5-minute prompt cache TTL widget with git status integration (below editor)
├── claude-diff.ts          # Claude Code diff parser, syntax highlighter, and TUI component
├── git-info.ts             # zero-dependency git repository & pull request tracker
├── index.ts                # extension entry point registering spinner, git info, cache timer, and tool renderers
├── package.json            # package configuration and test script
├── palette.ts              # Claude Code palette colors, truecolor ANSI, and sanitization
├── pi-compat.ts            # Guarded Pi UI notification compatibility helper
├── README.md               # project documentation
├── sounds                  # prompt cache warning audio files (3.mp3, 4.mp3)
├── spinner.ts              # Lightweight spinner, Turkish action verbs, and live tok/s
├── word-diff.ts            # Bounded dependency-free word-level diff
├── tests                   # 187 unit, lifecycle, performance, and security tests
├── tool-renderers.ts       # Claude-style compact renderers for builtin + custom tools (`/cc-tools`)
└── tsconfig.json           # TypeScript configuration
```

## Testing

Run typecheck and the test suite:

```sh
npm run typecheck
npm test
```

## License

MIT
