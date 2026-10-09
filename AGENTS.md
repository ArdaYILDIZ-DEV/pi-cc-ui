# Repository instructions

Applies to this repository. Installation and user-facing features belong in `README.md`.

## Rendering boundaries

- This extension changes presentation, not tool execution. Prefer Pi's public `registerToolRenderer` API; keep the existing re-registration/prototype path as a compatibility fallback, not the default.
- Exports in `index.ts` and individual modules support standalone callers. Lack of an internal caller alone is not proof that an export or compatibility helper is dead code.
- File contents, tool arguments/results, paths and extension status strings are untrusted terminal data. Strip terminal escapes and unsafe controls before applying theme styles. For formatted fallback output, preserve only safe SGR styling with `sanitizeSafeAnsi`; preserve line boundaries separately.
- Reuse sanitizers and width helpers in `palette.ts`. Complex Unicode widths must follow Pi's grapheme-aware measurement, not code-point counts. Keep hot-path caches bounded.
- Resolve appearance and color encoding from the active host theme. Do not depend on personal theme files or infer appearance from the name when the host provides it. Use `themeText` for guarded semantic painting.

## State and lifecycle contracts

- Clear intervals and pending timeouts on shutdown/disposal and when stopping the spinner. Tests must dispose controllers even when assertions fail.
- The cache timer's shared loop also drives audio milestones and footer refreshes; handing presentation to the footer is not a reason to stop it.
- TTL is a local activity reminder, not a provider cache-expiration guarantee. The default five-minute footer ramp is yellow at 3:00, transitions smoothly toward red until 5:00, and remains red afterward. Processing displays a fresh timer.
- Context and session cost take priority over optional footer segments at narrow widths. Preserve unknown usage/prices as unknown rather than inventing zero values; retain costs from auxiliary usage entries.
- Expanded tool views must keep available diagnostics accessible. Rendering cannot recover output already truncated by a tool.

## Editing and checks

Run commands from the repository root with a Node version satisfying `package.json`'s `engines` field. Tests execute TypeScript directly; there is no emitted build step.

```sh
npm run typecheck
npm test
# Targeted example:
node --test tests/footer.test.ts
```

- Use ESM imports with explicit `.ts` extensions and `import type` for type-only dependencies. Follow nearby tab indentation in TypeScript and the existing JSON style.
- `typecheck` includes unused-local and unused-parameter checks. Remove genuinely unused declarations rather than hiding them with dummy reads.
- Add a failing regression test before changing behavior, then rerun that test and the full checks. Do not weaken existing assertions or performance thresholds to obtain a pass.
- Mock UI, command runners and sound players for tests. Do not invoke live GitHub operations or real audio playback just to validate rendering.
- Timing assertions in `tests/perf.test.ts` and `tests/security.test.ts` can depend on machine load. Report failures and any pass/fail variation; a successful rerun does not erase the earlier failure.
- Review `git diff --check` and working-tree state after checks. Do not hand-edit installed dependencies or include unrelated generated changes.

## Completion evidence

Report changed files, verification commands and exit codes, remaining failures and untested behavior. Unit tests and the Pi loader test do not establish live terminal appearance or audio playback; state when those were not exercised.
