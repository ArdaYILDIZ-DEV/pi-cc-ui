# arda-pi-ui

Compact terminal UI for Pi: theme-aware tool views, edit diffs, live progress and a two-row status footer. Tool execution is unchanged.

## Installation

Requires Node.js 22.19+ and Pi 1.1.x (tested with Pi 1.1.0).

```sh
git clone https://github.com/ArdaYILDIZ-DEV/arda-pi-ui.git ~/.pi/agent/extensions/arda-pi-ui
```

Pi discovers the extension in this directory. Restart Pi or run `/reload` to load changes.

## Features

- **Tools:** target/scope, text-based status, execution duration when available, and incomplete-output warnings. Expanded calls retain their tool name and full command.
- **Edits:** added/removed line counts, small inline previews and full syntax-highlighted diffs on expansion.
- **Themes:** uses the active Pi theme's semantic colors and appearance, including 256-color mode. No personal theme files are required.
- **Progress:** animated spinner, Turkish action/thinking text, elapsed time and live `tok/s`. Rates are estimates when the provider does not report live usage.
- **Footer:** model, folder, Git, context usage, cache share and session cost estimate. Other extensions' status entries appear below and wrap on narrow terminals. Context and cost take priority when space is limited.
- **Cache reminder:** five-minute local activity timer with audio reminders at 3:00, 4:00 and twice at 4:30. Playback requires an existing `mpv`, `ffplay` or macOS `afplay`.

The TTL is a local reminder, not proof of provider cache expiry. Costs are provider-recorded estimates, not invoices or subscription charges; unknown prices show `$? est`. Output line counts are not match counts, and expansion cannot recover content already truncated by a tool.

## Commands

| Command | Action |
| --- | --- |
| `/arda-tools` | Show compact tool-view status |
| `/arda-tools on`, `off`, `toggle` | Enable, disable or toggle compact tool views |
| `/cache` | Show timer and audio status |
| `/cache toggle` | Show or hide the TTL segment |
| `/cache sound` | Toggle reminders; also accepts `on`, `off` or `test` |
| `/git` | Show Git status and cached open-PR information |
| `/git refresh` | Refresh Git and open-PR information |

Only Pi's extension status entries are combined; custom widgets remain separate. Another extension that installs a footer later takes precedence.

## Development

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
```

## License

MIT, as declared in `package.json`. A standalone license file is not included.
