# arda-pi-ui

Arda's compact terminal UI for Pi. Keeps the animated working row, replaces the default footer with a muted-orange status line, and draws compact tool calls and edit diffs.

```text
Model (effort) | folder | main +5 | 75.5k / 500k | cache 78% | ttl 1dk 47sn / 5dk       $0.123 est
codex … | Σtokens · $cost est
```

This is an illustrative layout, not measured usage. The second row reads **all extension statuses** from Pi's footer provider, without provider-specific parsing or key matching. Codex quota and usage-ledger extensions keep producing their own data; this extension changes only its presentation. Long status rows wrap rather than dropping quota or cost text. The path is reduced to the current folder name.

The session's recorded cost estimate is right-aligned on the main row, with space reserved even on narrow terminals. It includes assistant, tool, standalone-usage and summary costs across the session. Missing price data is shown as `$? est`; very small positive costs as `<$0.001 est`. These are provider-recorded estimates, **not invoices or additional subscription charges**. A usage-ledger total below covers a different scope.

On narrower terminals, complete TTL, cache, Git and folder segments are dropped in that order. Context and price take priority over a shortened model name; numeric telemetry is not cut mid-value. Extremely small widths cannot display all fields.

## Installation

Requires Node.js 22.19+ and Pi 1.1.x or newer within the 1.x series. Typecheck and tests are verified against Pi 1.1.0; later releases are not a compatibility guarantee.

Pi discovers this directory under `~/.pi/agent/extensions/arda-pi-ui/`. The Git repository URL retains its original name:

```sh
git clone https://github.com/ArdaYILDIZ-DEV/pi-cc-ui.git ~/.pi/agent/extensions/arda-pi-ui
```

Restart Pi or use `/reload` after changing the extension. Do not keep both `cc-ui` and `arda-pi-ui` loaded. If your Pi configuration explicitly points to the old directory, update that reference yourself.

## Working row and cache timer

- The existing spinner, Turkish action verbs, elapsed time and thinking indicator are preserved.
- `tok/s` prefers provider-reported output increments. It excludes the first chunk's unknown generation time, final delivery delay and gaps between requests. Providers without live usage use a character-based estimate until final output tokens calibrate it; those rates remain estimates.
- `cache %` is the latest assistant response's cache-read share of input + cache-read + cache-write tokens on the active session branch. Unknown cache statistics are omitted.
- The five-minute `ttl` counter is a **local activity-based reminder**, not proof of provider cache expiry. Provider retention policies vary.
- Audio reminders remain at 3 minutes (once), 4 minutes (once), and 4 minutes 30 seconds (twice). Playback uses an available `mpv`, `ffplay`, or macOS `afplay`; no player is installed automatically.
- High context usage and an expired timer retain a warning color. Other footer information uses muted text with a restrained orange accent.

## Commands

| Command | Action |
| --- | --- |
| `/arda-tools` | Show compact tool-view status |
| `/arda-tools on`, `off`, `toggle` | Enable, disable or toggle compact tool views |
| `/cc-tools` | Compatibility alias for `/arda-tools` |
| `/cache` | Show elapsed/remaining timer time and audio status |
| `/cache toggle` | Show or hide the TTL segment |
| `/cache sound` | Toggle audio reminders; also accepts `on` and `off` |
| `/cache sound test` | Test reminder playback |
| `/git` | Show branch, changed-file count and cached open-PR information |
| `/git refresh` | Refresh Git and open-PR information explicitly |

Git refresh skips known read-only builtins. PR lookup is reused until the branch or repository changes, or `/git refresh` is requested.

## Pi compatibility

The current path uses the public `setFooter` and `registerToolRenderer` APIs. It does not re-register tools, replace their execution functions, or install a renderer-prototype patch. A reload removes this extension's own legacy patch if one remains from the previous version. Expanded custom views and image renderers are retained. Compact views honor Pi 1.1's `outputPad` setting.

UI finalization stays on `agent_settled`: `agent_end` can precede retries, compaction or continuations. The `before_provider_request` handler is an observer and does not replace provider payloads.

Older render helpers and prototype-patch exports remain as compatibility utilities, but older hosts are not part of the verified support range. Existing exported Claude-named tool helpers remain available; new callers can use `setToolsEnabled` and `isToolsEnabled`. Diff symbols are now in `tool-diff.ts`, with old symbol names exported as aliases; the old file path is no longer present.

Only `setStatus` entries can be consolidated automatically. Other extensions' editor widgets and custom footers are separate APIs and are not intercepted. If another extension installs its own footer later, that footer takes precedence.

## Development

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
```

Main modules: `footer.ts`, `spinner.ts`, `cache-timer.ts`, `git-info.ts`, `tool-renderers.ts`, `tool-diff.ts`, `palette.ts`, and `word-diff.ts`. The entry point is `index.ts`; regression tests live in `tests/`.

## License

The package manifest declares MIT. A standalone license file is not included.
