<p align="center">
  <strong>Claude Code spinner animation, 5-minute prompt cache TTL counter, and compact tool renderers for Pi.</strong><br>
  <img src="https://img.shields.io/badge/node-%3E%3D22-blue?style=flat-square" alt="Node.js 22+">
  <img src="https://img.shields.io/badge/typescript-7.0%2B-blue?style=flat-square" alt="TypeScript 7.0+">
  <img src="https://img.shields.io/badge/tests-153%20passed-green?style=flat-square" alt="153 tests passed">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License">
</p>

`cc-ui` is a terminal UI extension for Pi that replaces the default working indicator with Claude Code's 20fps spinner, adds a minimal, right-aligned prompt cache TTL counter beneath the editor, and renders every tool call in compact Claude style (`● Label(detail)` / `└ summary`).

## Installation

Pi automatically discovers extensions inside `~/.pi/agent/extensions/`. There are zero runtime dependencies:

```sh
git clone https://github.com/ArdaYILDIZ-DEV/pi-cc-ui.git ~/.pi/agent/extensions/cc-ui
```

Alternatively, as a pi package (requires the `pi-package` keyword, included):

```sh
pi install git:github.com/ArdaYILDIZ-DEV/pi-cc-ui
```

Pi will load and activate the extension on its next start or reload.

## Features

- **Claude Code spinner row:** 20fps ping-pong glyph loop (`· ✢ ✳ ✶ ✻ ✽`) with right-to-left glimmer sweeps across dynamic Turkish action verbs, token counters, elapsed turn time, and sine-wave thinking glow.
- **Prompt cache TTL counter:** Tracks seconds elapsed since the last LLM context interaction. Positions a minimal `36sn / 5dk` counter flush against the right margin below the editor (`placement: "belowEditor"`).
- **Proximity color shifting:** The counter smoothly interpolates from fresh green (`#4EBA65`) through yellow and orange, darkening into deep crimson red (`RGB 140, 18, 18`) as 5 minutes approaches, with the `/ 5dk` deadline highlighted in red.
- **Audio warning alerts:** Plays non-blocking audio notifications as cache TTL milestones pass:
  - 3. dakika: `3.mp3` (1 kez)
  - 1. dakika: `4.mp3` (1 kez)
  - 4.30. dakika: `4.mp3` (2 kez)
- **Slash command:** `/cache` displays exact elapsed/remaining time; `/cache toggle` shows or hides the counter; `/cache sound` toggles sound alerts; `/cache sound test` plays a test sound.
- **Compact tool renderers:** Every tool (builtin and custom) renders as `● Label(detail)` with a one-line `└ summary`; the full output stays available via expand. Toggle dynamically without restart.

## Commands

| Command | Action |
| --- | --- |
| `/cache` | Shows prompt cache TTL elapsed time, remaining seconds, and status notification |
| `/cache toggle` | Toggles the sub-editor counter widget on or off |
| `/cache sound` | Toggles audio warning alerts on or off (`sound on` / `sound off`) |
| `/cache sound test` | Plays the 3-minute warning sound immediately to test audio output |
| `/cc-tools` | Shows compact tool renderer status |
| `/cc-tools on` / `/cc-tools off` / `/cc-tools toggle` | Enables or disables compact tool renderers dynamically |

## Project structure

```text
.
├── cache-timer.ts          # 5-minute prompt cache TTL widget (right-aligned below editor)
├── index.ts                # extension entry point registering spinner, cache timer, and tool renderers
├── package.json            # package configuration and test script
├── palette.ts              # Claude Code palette colors, truecolor ANSI, and sanitization
├── README.md               # project documentation
├── sounds                  # prompt cache warning audio files (3.mp3, 4.mp3)
├── spinner.ts              # 20fps CC spinner loop, glimmer sweep, and Turkish action verbs
├── tests                   # 153 unit, lifecycle, performance, and security tests
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
