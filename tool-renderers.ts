/**
 * Claude-style compact tool renderers, generalized to all tools.
 *
 * Ported from Ga-hou/pi-claude-style-tui `extensions/claude-message-ui.ts`
 * (`registerClaudeToolRenderers`). The upstream version only handles Pi-owned
 * builtin tools (`sourceInfo.source === "builtin"`) by recreating each
 * definition via `createXToolDefinition(cwd)` and re-registering it with a
 * compact `● Label(detail)` / `└ summary` renderer.
 *
 * This port keeps that official-API path for the 8 known builtins
 * (read/bash/powershell/edit/write/grep/find/ls — upstream misses
 * powershell) and adds a global `ToolExecutionComponent` prototype patch so
 * every other tool (custom / extension / sdk tools such as
 * `ask_user_question`, `web_search`, pi-lens tools, ...) renders in the same
 * compact Claude style without needing its `execute` function.
 *
 * When an original custom renderer exists it is preserved for the expanded
 * view (`to expand`); the collapsed view always uses the compact summary.
 */
import {
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createPowerShellToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	type ExtensionAPI,
	type ToolDefinition,
	keyHint,
	type Theme,
	ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { ClaudeDiffComponent } from "./claude-diff.ts";

const MAX_SUMMARY_CHARS = 120;
const MAX_EXPANDED_LINES = 30;

type RenderContext = {
	executionStarted: boolean;
	isError: boolean;
	isPartial: boolean;
};

type TextResult = {
	content: Array<{ type: string; text?: string }>;
	details?: unknown;
};

function singleLine(text: string, maxLength = MAX_SUMMARY_CHARS): string {
	if (typeof text !== "string") return "";
	const compact = text.replace(/\s+/g, " ").trim();
	return compact.length > maxLength
		? `${compact.slice(0, maxLength - 1)}…`
		: compact;
}

function quote(value: string): string {
	if (typeof value !== "string") return "";
	return value.includes(" ") ? JSON.stringify(value) : value;
}

function resultText(result: TextResult): string {
	if (!result || !Array.isArray(result.content)) return "";
	return result.content
		.filter(
			(item) => item && item.type === "text" && typeof item.text === "string",
		)
		.map((item) => item.text as string)
		.join("\n")
		.trim();
}

function nonEmptyLineCount(text: string): number {
	if (typeof text !== "string" || !text) return 0;
	return text.split("\n").filter((line) => line.trim()).length;
}

function truncationSuffix(details: unknown): string {
	const value = details as { truncation?: { truncated?: boolean } } | undefined;
	return value?.truncation?.truncated ? " · truncated" : "";
}

function lineSummary(noun: string, output: string): string {
	const count = nonEmptyLineCount(output);
	return count > 0
		? `${noun} ${count} ${count === 1 ? "line" : "lines"}`
		: "Done";
}

export function addAssistantResponseMarker(
	markdown: string,
	marker = "●",
): string {
	if (
		typeof markdown !== "string" ||
		!markdown.trim() ||
		markdown.startsWith(`${marker} `)
	)
		return markdown;

	// Claude renders its dot in a separate layout column. Pi only exposes a
	// Markdown transformer, so avoid prefixing block constructs whose parsing
	// would change when text is inserted before them.
	const firstLine = markdown.trimStart().split("\n", 1)[0]!;
	if (/^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|```|~~~|\|)/.test(firstLine))
		return markdown;
	return `${marker} ${markdown}`;
}

function renderCall(
	label: string,
	detail: string,
	theme: Theme,
	context: RenderContext,
): Text {
	const safeLabel = typeof label === "string" && label ? label : "Tool";
	let dotColor: "accent" | "error" | "success" = "accent";
	if (context.isError) dotColor = "error";
	else if (context.executionStarted && !context.isPartial) dotColor = "success";
	const suffix = detail ? theme.fg("muted", `(${singleLine(detail)})`) : "";
	return new Text(
		`${theme.fg(dotColor, "●")} ${theme.fg("toolTitle", theme.bold(safeLabel))}${suffix}`,
		1,
		0,
	);
}

function renderResult(
	result: TextResult,
	options: { expanded: boolean; isPartial: boolean },
	theme: Theme,
	context: RenderContext,
	summary: (output: string) => string,
): Text {
	const output = resultText(result);
	if (options.isPartial) {
		const progress = singleLine(output) || "Working…";
		return new Text(theme.fg("dim", `  └ ${progress}`), 1, 0);
	}

	const isError = context.isError;
	const status = isError ? singleLine(output) || "Failed" : summary(output);
	const color = isError ? "error" : "dim";
	let text = theme.fg(color, `  └ ${status}${truncationSuffix(result.details)}`);

	if (output && !options.expanded) {
		text += theme.fg("dim", ` ${keyHint("app.tools.expand", "to expand")}`);
	} else if (output && options.expanded) {
		const lines = output.split("\n");
		for (const line of lines.slice(0, MAX_EXPANDED_LINES)) {
			text += `\n${theme.fg("toolOutput", `    ${line}`)}`;
		}
		if (lines.length > MAX_EXPANDED_LINES) {
			text += `\n${theme.fg("dim", `    … ${lines.length - MAX_EXPANDED_LINES} more lines`)}`;
		}
	}
	return new Text(text, 1, 0);
}

// ---------------------------------------------------------------------------
// Generic label / detail / summary for unknown (non-builtin) tools
// ---------------------------------------------------------------------------

const BUILTIN_LABELS: Readonly<Record<string, string>> = {
	read: "Read",
	bash: "Bash",
	powershell: "PowerShell",
	edit: "Edit",
	write: "Write",
	grep: "Grep",
	find: "Find",
	ls: "List",
};

const KNOWN_BUILTINS: readonly string[] = Object.keys(BUILTIN_LABELS);

// Builtins confirmed wrappable: seen as Pi-owned or previously wrapped by us.
// (Re-registration changes the registry source to our extension, so the
// "builtin" filter alone cannot find them again for re-enable/restore.)
// Never add third-party-overridden tools here — their execute must not be replaced.
const wrappableBuiltinNames = new Set<string>();

const BUILTIN_FACTORIES: Readonly<
	Record<string, (cwd: string) => ToolDefinition<any, any, any>>
> = {
	read: (cwd) => createReadToolDefinition(cwd),
	bash: (cwd) => createBashToolDefinition(cwd),
	powershell: (cwd) => createPowerShellToolDefinition(cwd),
	edit: (cwd) => createEditToolDefinition(cwd),
	write: (cwd) => createWriteToolDefinition(cwd),
	grep: (cwd) => createGrepToolDefinition(cwd),
	find: (cwd) => createFindToolDefinition(cwd),
	ls: (cwd) => createLsToolDefinition(cwd),
};

// Master switch for the Claude compact rendering (toggled via /cc-tools).
let claudeToolsEnabled = true;
let lastCwd: string | null = null;

export function isClaudeToolsEnabled(): boolean {
	return claudeToolsEnabled;
}

/** Builtins safe to wrap: Pi-owned, or previously wrapped by us. */
function getWrappableBuiltins(pi: ExtensionAPI): string[] {
	let entries: Array<{ name: string; source: string }>;
	try {
		entries = pi
			.getAllTools()
			.map((tool) => ({ name: tool.name, source: tool.sourceInfo.source }));
	} catch {
		return [];
	}
	return KNOWN_BUILTINS.filter((name) =>
		entries.some(
			(entry) =>
				entry.name === name &&
				(entry.source === "builtin" || wrappableBuiltinNames.has(name)),
		),
	);
}

/** Human-readable Claude-style label. `ask_user_question` -> `Ask User Question`. */
export function prettyToolLabel(name: string): string {
	if (typeof name !== "string" || !name) return "Tool";
	const known = (BUILTIN_LABELS as Record<string, string>)[name];
	if (known) return known;
	const words = name
		.split(/[_-]+/)
		.map((w) => w.trim())
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1));
	if (words.length === 0) return "Tool";
	return words.join(" ");
}

const DETAIL_KEYS = [
	"command",
	"pattern",
	"question",
	"query",
	"url",
	"prompt",
	"text",
	"input",
	"path",
	"file_path",
	"file",
	"dir",
	"directory",
] as const;

/** Heuristic primary arg for generic tools: first known string key, else first string value. */
export function genericDetail(args: unknown): string {
	if (!args || typeof args !== "object") return "";
	const record = args as Record<string, unknown>;
	for (const key of DETAIL_KEYS) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value;
	}
	for (const value of Object.values(record)) {
		if (typeof value === "string" && value.trim()) return value;
	}
	return "";
}

/** Generic collapsed summary: `Completed N lines` or `Done`. */
export function genericSummary(output: string): string {
	return lineSummary("Completed", output);
}

function genericRenderCall(
	args: unknown,
	theme: Theme,
	context: RenderContext,
	toolName: string,
): Text {
	const label = prettyToolLabel(toolName);
	const detail = genericDetail(args);
	return renderCall(label, detail, theme, context);
}

function genericRenderResult(
	result: TextResult,
	options: { expanded: boolean; isPartial: boolean },
	theme: Theme,
	context: RenderContext,
): Text {
	return renderResult(result, options, theme, context, genericSummary);
}

// ---------------------------------------------------------------------------
// Official-API path: builtin overrides via re-registration (upstream parity)
// ---------------------------------------------------------------------------

/**
 * Register compact render-only overrides for Pi-owned local built-in tools.
 * Wrapped names are remembered for re-enable/restore cycles (/cc-tools).
 * Returns the list of wrapped tool names (useful for tests).
 */
export function registerClaudeToolRenderers(
	pi: ExtensionAPI,
	cwd: string,
): string[] {
	const wrapped: string[] = [];
	const piOwnedTools = new Set(getWrappableBuiltins(pi));

	const safeCwd = typeof cwd === "string" && cwd ? cwd : process.cwd();

	if (piOwnedTools.has("read")) {
		try {
			const tool = createReadToolDefinition(safeCwd);
			pi.registerTool({
				...tool,
				renderShell: "self",
				renderCall: (args, theme, context) =>
					renderCall("Read", (args as { path?: string }).path ?? "", theme, context),
				renderResult(result, options, theme, context) {
					if (
						(options.expanded || result.content[0]?.type === "image") &&
						tool.renderResult
					) {
						return tool.renderResult(result, options, theme, context);
					}
					return renderResult(result, options, theme, context, (output) =>
						lineSummary("Read", output),
					);
				},
			});
			wrapped.push("read");
		} catch {
			/* best-effort: keep original renderer */
		}
	}

	if (piOwnedTools.has("bash")) {
		try {
			const tool = createBashToolDefinition(safeCwd);
			pi.registerTool({
				...tool,
				renderShell: "self",
				renderCall: (args, theme, context) =>
					renderCall(
						"Bash",
						(args as { command?: string }).command ?? "",
						theme,
						context,
					),
				renderResult(result, options, theme, context) {
					if (options.expanded && tool.renderResult)
						return tool.renderResult(result, options, theme, context);
					return renderResult(result, options, theme, context, (output) =>
						lineSummary("Returned", output),
					);
				},
			});
			wrapped.push("bash");
		} catch {
			/* best-effort */
		}
	}

	if (piOwnedTools.has("powershell")) {
		try {
			const tool = createPowerShellToolDefinition(safeCwd);
			pi.registerTool({
				...tool,
				renderShell: "self",
				renderCall: (args, theme, context) =>
					renderCall(
						"PowerShell",
						(args as { command?: string }).command ?? "",
						theme,
						context,
					),
				renderResult(result, options, theme, context) {
					if (options.expanded && tool.renderResult)
						return tool.renderResult(result, options, theme, context);
					return renderResult(result, options, theme, context, (output) =>
						lineSummary("Returned", output),
					);
				},
			});
			wrapped.push("powershell");
		} catch {
			/* best-effort */
		}
	}

	if (piOwnedTools.has("edit")) {
		try {
			const tool = createEditToolDefinition(safeCwd);
			pi.registerTool({
				...tool,
				renderShell: "self",
				renderCall: (args, theme, context) =>
					renderCall("Edit", (args as { path?: string }).path ?? "", theme, context),
				renderResult(result, options, theme, context) {
					if (context.isError) {
						return renderResult(result, options, theme, context, () => "Failed");
					}
					const diff = (result.details as { diff?: unknown } | undefined)?.diff;
					if (typeof diff === "string" && diff.trim().length > 0) {
						const editArgs = context.args as
							| { path?: string; file_path?: string }
							| undefined;
						const path = editArgs?.path ?? editArgs?.file_path ?? "";
						return new ClaudeDiffComponent(diff, path, theme);
					}
					if (options.expanded && tool.renderResult) {
						return tool.renderResult(result, options, theme, context);
					}
					return renderResult(result, options, theme, context, () => "Updated");
				},
			});
			wrapped.push("edit");
		} catch {
			/* best-effort */
		}
	}

	if (piOwnedTools.has("write")) {
		try {
			const tool = createWriteToolDefinition(safeCwd);
			pi.registerTool({
				...tool,
				renderShell: "self",
				renderCall: (args, theme, context) =>
					renderCall(
						"Write",
						(args as { path?: string }).path ?? "",
						theme,
						context,
					),
				renderResult(result, options, theme, context) {
					if (options.expanded && tool.renderResult)
						return tool.renderResult(result, options, theme, context);
					return renderResult(result, options, theme, context, () => "Written");
				},
			});
			wrapped.push("write");
		} catch {
			/* best-effort */
		}
	}

	if (piOwnedTools.has("grep")) {
		try {
			const tool = createGrepToolDefinition(safeCwd);
			pi.registerTool({
				...tool,
				renderShell: "self",
				renderCall: (args, theme, context) => {
					const a = args as { pattern?: string; path?: string };
					const location = a.path ? ` in ${a.path}` : "";
					return renderCall(
						"Grep",
						`${quote(a.pattern ?? "")}${location}`,
						theme,
						context,
					);
				},
				renderResult(result, options, theme, context) {
					if (options.expanded && tool.renderResult)
						return tool.renderResult(result, options, theme, context);
					return renderResult(result, options, theme, context, (output) =>
						lineSummary("Found", output),
					);
				},
			});
			wrapped.push("grep");
		} catch {
			/* best-effort */
		}
	}

	if (piOwnedTools.has("find")) {
		try {
			const tool = createFindToolDefinition(safeCwd);
			pi.registerTool({
				...tool,
				renderShell: "self",
				renderCall: (args, theme, context) => {
					const a = args as { pattern?: string; path?: string };
					const location = a.path ? ` in ${a.path}` : "";
					return renderCall(
						"Find",
						`${quote(a.pattern ?? "")}${location}`,
						theme,
						context,
					);
				},
				renderResult(result, options, theme, context) {
					if (options.expanded && tool.renderResult)
						return tool.renderResult(result, options, theme, context);
					return renderResult(result, options, theme, context, (output) =>
						lineSummary("Found", output),
					);
				},
			});
			wrapped.push("find");
		} catch {
			/* best-effort */
		}
	}

	if (piOwnedTools.has("ls")) {
		try {
			const tool = createLsToolDefinition(safeCwd);
			pi.registerTool({
				...tool,
				renderShell: "self",
				renderCall: (args, theme, context) =>
					renderCall(
						"List",
						(args as { path?: string }).path ?? ".",
						theme,
						context,
					),
				renderResult(result, options, theme, context) {
					if (options.expanded && tool.renderResult)
						return tool.renderResult(result, options, theme, context);
					return renderResult(result, options, theme, context, (output) =>
						lineSummary("Listed", output),
					);
				},
			});
			wrapped.push("ls");
		} catch {
			/* best-effort */
		}
	}

	for (const name of wrapped) wrappableBuiltinNames.add(name);
	return wrapped;
}

/**
 * Restore the original Pi renderers for builtins wrapped by us.
 * Re-registers the plain factory definitions (execute + renderers untouched).
 * Names stay in the wrappable set so a later enable works again.
 * Returns the list of restored tool names.
 */
export function restoreBuiltinToolRenderers(
	pi: ExtensionAPI,
	cwd: string,
): string[] {
	const restored: string[] = [];
	const safeCwd =
		typeof cwd === "string" && cwd ? cwd : (lastCwd ?? process.cwd());
	let present: Set<string>;
	try {
		present = new Set(pi.getAllTools().map((tool) => tool.name));
	} catch {
		return restored;
	}
	for (const name of wrappableBuiltinNames) {
		if (!present.has(name)) continue;
		const factory = BUILTIN_FACTORIES[name];
		if (!factory) continue;
		try {
			pi.registerTool(factory(safeCwd));
			restored.push(name);
		} catch {
			/* best-effort: keep current renderer */
		}
	}
	return restored;
}

/**
 * Flip the master switch. Enable re-applies compact renderers + global patch,
 * disable restores Pi default renderers + removes the global patch.
 * Returns the list of (re-)registered tool names.
 */
export function setClaudeToolsEnabled(
	pi: ExtensionAPI,
	enabled: boolean,
	cwd?: string,
): string[] {
	claudeToolsEnabled = enabled;
	const targetCwd =
		typeof cwd === "string" && cwd ? cwd : (lastCwd ?? process.cwd());
	lastCwd = targetCwd;
	if (claudeToolsEnabled) {
		try {
			installGlobalClaudeToolPatch();
		} catch {
			/* best-effort */
		}
		try {
			return registerClaudeToolRenderers(pi, targetCwd);
		} catch {
			return [];
		}
	}
	try {
		uninstallGlobalClaudeToolPatch();
	} catch {
		/* best-effort */
	}
	try {
		return restoreBuiltinToolRenderers(pi, targetCwd);
	} catch {
		return [];
	}
}

// ---------------------------------------------------------------------------
// Global fallback: prototype patch so *every* tool renders Claude-style
// ---------------------------------------------------------------------------

type PatchedProto = {
	__ccUiToolPatchInstalled?: boolean;
	__ccUiOrigGetCallRenderer?: (...args: unknown[]) => unknown;
	__ccUiOrigGetResultRenderer?: (...args: unknown[]) => unknown;
	__ccUiOrigGetRenderShell?: (...args: unknown[]) => unknown;
	__ccUiOrigHasRendererDefinition?: (...args: unknown[]) => unknown;
};

function getPatchTarget(): PatchedProto | null {
	try {
		// SAFETY: ToolExecutionComponent is an exported Pi class whose prototype shape
		// is not in its public d.ts (private render methods); we only read the
		// prototype object to install a best-effort UI fallback, never to change types.
		const proto = (
			ToolExecutionComponent as unknown as { prototype?: PatchedProto }
		).prototype;
		if (!proto || typeof proto !== "object") return null;
		return proto;
	} catch {
		return null;
	}
}

export function isGlobalClaudeToolPatchInstalled(): boolean {
	const proto = getPatchTarget();
	return Boolean(proto?.__ccUiToolPatchInstalled);
}

function isClaudeWrapped(fn: unknown): boolean {
	if (typeof fn !== "function") return false;
	// SAFETY: flag check on a function object; the cast only reads an optional
	// boolean marker we set ourselves in markClaudeWrapped, no type change.
	return (fn as { __ccUiClaudeWrapped?: boolean }).__ccUiClaudeWrapped === true;
}

function markClaudeWrapped<T extends (...args: any[]) => any>(fn: T): T {
	try {
		(fn as { __ccUiClaudeWrapped?: boolean }).__ccUiClaudeWrapped = true;
	} catch {
		/* ignore */
	}
	return fn;
}

export type ClaudeCallContext = RenderContext & { expanded?: boolean };

/** Named renderer types returned by the global patch (avoids `unknown` returns). */
export type ClaudeCallRenderer = (
	args: unknown,
	theme: Theme,
	context: ClaudeCallContext,
) => Text;
export type ClaudeResultRenderer = (
	result: TextResult,
	options: { expanded: boolean; isPartial: boolean },
	theme: Theme,
	context: RenderContext,
) => Text;

/**
 * Install the global Claude-style fallback for all non-builtin tools.
 * Idempotent: returns true when the patch is active, false when the Pi
 * internals are unavailable (patch skipped, builtin path still works).
 */
export function installGlobalClaudeToolPatch(): boolean {
	const proto = getPatchTarget();
	if (!proto) return false;
	if (proto.__ccUiToolPatchInstalled) return true;

	try {
		const anyProto = proto as Record<string, unknown>;
		const origGetCall = anyProto["getCallRenderer"];
		const origGetResult = anyProto["getResultRenderer"];
		const origGetShell = anyProto["getRenderShell"];
		const origHasRenderer = anyProto["hasRendererDefinition"];
		if (
			typeof origGetCall !== "function" ||
			typeof origGetResult !== "function" ||
			typeof origGetShell !== "function"
		) {
			return false;
		}

		proto.__ccUiOrigGetCallRenderer = origGetCall as (
			...args: unknown[]
		) => unknown;
		proto.__ccUiOrigGetResultRenderer = origGetResult as (
			...args: unknown[]
		) => unknown;
		proto.__ccUiOrigGetRenderShell = origGetShell as (
			...args: unknown[]
		) => unknown;
		if (typeof origHasRenderer === "function") {
			proto.__ccUiOrigHasRendererDefinition = origHasRenderer as (
				...args: unknown[]
			) => unknown;
		}

		// Tools without any definition (unknown sdk tools) fall back to a raw
		// JSON dump. Force the renderer path so they also get Claude styling.
		if (typeof origHasRenderer === "function") {
			const origHas = origHasRenderer as (this: unknown) => boolean;
			// SAFETY: Pi declares these renderer accessors private; at runtime they are
			// plain prototype methods, so assigning a same-signature function is safe
			// and fully reversible via uninstallGlobalClaudeToolPatch.
			(anyProto["hasRendererDefinition"] as unknown as (
				this: unknown,
			) => boolean) = function (this: unknown): boolean {
				try {
					if (origHas.call(this)) return true;
				} catch {
					/* fall through to generic renderer */
				}
				return true;
			};
		}

		// Always use the compact self-rendered frame.
		// SAFETY: same as above — replaces a private prototype accessor with a
		// same-shape function returning the constant Claude frame style.
		(anyProto["getRenderShell"] as unknown as (this: unknown) => string) =
			function (this: unknown): string {
				return "self";
			};

		// SAFETY: same prototype-patch invariant as above; returns a named
		// ClaudeCallRenderer (or undefined via the original) instead of unknown.
		(anyProto["getCallRenderer"] as unknown as (
			this: unknown,
		) => ClaudeCallRenderer | undefined) = function (
			this: unknown,
		): ClaudeCallRenderer | undefined {
			const self = this as { toolName?: unknown };
			const toolName = typeof self.toolName === "string" ? self.toolName : "tool";
			// Known builtins already have an official override via
			// registerClaudeToolRenderers — leave them untouched so the two
			// paths never fight each other.
			if ((KNOWN_BUILTINS as readonly string[]).includes(toolName)) {
				try {
					// SAFETY: original accessor returns a call renderer or undefined;
					// the cast only narrows the unknown boundary to our named type.
					const orig = proto.__ccUiOrigGetCallRenderer as unknown as
						| ((this: unknown) => ClaudeCallRenderer | undefined)
						| undefined;
					return orig?.call(this);
				} catch {
					return undefined;
				}
			}
			let original: unknown;
			try {
				// SAFETY: same narrowing as above; original may be any renderer shape.
				const orig = proto.__ccUiOrigGetCallRenderer as unknown as
					| ((this: unknown) => unknown)
					| undefined;
				original = orig?.call(this);
			} catch {
				original = undefined;
			}
			if (isClaudeWrapped(original)) {
				// SAFETY: already our wrapper, verified by marker flag above.
				return original as ClaudeCallRenderer;
			}
			const wrapped = (
				args: unknown,
				theme: Theme,
				context: ClaudeCallContext,
			): Text => {
				// Preserve rich custom call views when the user expands the row.
				if (context?.expanded && typeof original === "function") {
					try {
						return (original as (a: unknown, t: Theme, c: ClaudeCallContext) => Text)(
							args,
							theme,
							context,
						);
					} catch {
						/* fall through to compact view */
					}
				}
				return genericRenderCall(args, theme, context, toolName);
			};
			return markClaudeWrapped(wrapped);
		};

		// SAFETY: same prototype-patch invariant as above; returns a named
		// ClaudeResultRenderer (or undefined via the original) instead of unknown.
		(anyProto["getResultRenderer"] as unknown as (
			this: unknown,
		) => ClaudeResultRenderer | undefined) = function (
			this: unknown,
		): ClaudeResultRenderer | undefined {
			const self = this as { toolName?: unknown };
			const toolName = typeof self.toolName === "string" ? self.toolName : "tool";
			if ((KNOWN_BUILTINS as readonly string[]).includes(toolName)) {
				try {
					// SAFETY: original accessor returns a result renderer or undefined;
					// the cast only narrows the unknown boundary to our named type.
					const orig = proto.__ccUiOrigGetResultRenderer as unknown as
						| ((this: unknown) => ClaudeResultRenderer | undefined)
						| undefined;
					return orig?.call(this);
				} catch {
					return undefined;
				}
			}
			let original: unknown;
			try {
				// SAFETY: same narrowing as above; original may be any renderer shape.
				const orig = proto.__ccUiOrigGetResultRenderer as unknown as
					| ((this: unknown) => unknown)
					| undefined;
				original = orig?.call(this);
			} catch {
				original = undefined;
			}
			if (isClaudeWrapped(original)) {
				// SAFETY: already our wrapper, verified by marker flag above.
				return original as ClaudeResultRenderer;
			}
			const wrapped = (
				result: TextResult,
				options: { expanded: boolean; isPartial: boolean },
				theme: Theme,
				context: RenderContext,
			): Text => {
				// Expanded view keeps the tool's own rich renderer (images,
				// diffs, ...). Collapsed view is always the compact summary.
				if (options?.expanded && typeof original === "function") {
					try {
						return (original as typeof wrapped)(result, options, theme, context);
					} catch {
						/* fall through to compact view */
					}
				}
				// Image results without an expanded custom renderer: avoid
				// dumping binary as text, show a short placeholder instead.
				try {
					const hasImage =
						Array.isArray((result as TextResult)?.content) &&
						(result as TextResult).content.some((item) => item?.type === "image");
					if (hasImage && !options?.expanded) {
						return new Text(
							theme.fg("dim", "  └ Image result (expand to view)"),
							1,
							0,
						);
					}
				} catch {
					/* ignore */
				}
				return genericRenderResult(result, options, theme, context);
			};
			return markClaudeWrapped(wrapped);
		};

		proto.__ccUiToolPatchInstalled = true;
		return true;
	} catch {
		return false;
	}
}

/** Restore the original ToolExecutionComponent renderers (mainly for tests). */
export function uninstallGlobalClaudeToolPatch(): boolean {
	const proto = getPatchTarget();
	if (!proto || !proto.__ccUiToolPatchInstalled) return false;
	try {
		const anyProto = proto as Record<string, unknown>;
		if (typeof proto.__ccUiOrigGetCallRenderer === "function") {
			anyProto["getCallRenderer"] = proto.__ccUiOrigGetCallRenderer;
		}
		if (typeof proto.__ccUiOrigGetResultRenderer === "function") {
			anyProto["getResultRenderer"] = proto.__ccUiOrigGetResultRenderer;
		}
		if (typeof proto.__ccUiOrigGetRenderShell === "function") {
			anyProto["getRenderShell"] = proto.__ccUiOrigGetRenderShell;
		}
		if (typeof proto.__ccUiOrigHasRendererDefinition === "function") {
			anyProto["hasRendererDefinition"] = proto.__ccUiOrigHasRendererDefinition;
		}
		delete proto.__ccUiOrigGetCallRenderer;
		delete proto.__ccUiOrigGetResultRenderer;
		delete proto.__ccUiOrigGetRenderShell;
		delete proto.__ccUiOrigHasRendererDefinition;
		delete proto.__ccUiToolPatchInstalled;
		return true;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// cc-ui wiring: patch once + builtin overrides per TUI session
// ---------------------------------------------------------------------------

/**
 * Wire Claude-style tool rendering into cc-ui.
 * Installs the global fallback and registers the official builtin overrides on
 * every TUI `session_start` (upstream parity: original registers inside
 * `session_start` with the live `ctx.cwd`). Nothing starts in the factory body
 * (skill lifecycle rule); install happens on session_start. Also adds the
 * `/cc-tools` command (on/off/toggle) for dynamic control.
 */
export function registerToolRenderers(pi: ExtensionAPI): void {
	pi.registerCommand("cc-tools", {
		description:
			"Claude tarzı kompakt tool görünümünü aç/kapat (cc-tools, cc-tools on/off/toggle)",
		handler: async (args, ctx) => {
			const clean = (typeof args === "string" ? args : "").trim().toLowerCase();
			if (clean === "on" || clean === "ac" || clean === "aç") {
				setClaudeToolsEnabled(pi, true, ctx.cwd);
				ctx.ui.notify("Claude tool görünümü: açık", "info");
				return;
			}
			if (
				clean === "off" ||
				clean === "kapat" ||
				clean === "kapali" ||
				clean === "kapalı"
			) {
				setClaudeToolsEnabled(pi, false, ctx.cwd);
				ctx.ui.notify("Claude tool görünümü: kapalı", "info");
				return;
			}
			if (clean === "toggle") {
				const next = !isClaudeToolsEnabled();
				setClaudeToolsEnabled(pi, next, ctx.cwd);
				ctx.ui.notify(`Claude tool görünümü: ${next ? "açık" : "kapalı"}`, "info");
				return;
			}
			ctx.ui.notify(
				`Claude tool görünümü: ${isClaudeToolsEnabled() ? "açık" : "kapalı"} ` +
					`(${wrappableBuiltinNames.size} builtin + tüm özel araçlar). ` +
					`Kullanım: cc-tools on/off/toggle.`,
				"info",
			);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		try {
			if (ctx.mode !== "tui") return;
		} catch {
			return;
		}
		try {
			lastCwd = ctx.cwd;
		} catch {
			/* ignore */
		}
		if (!claudeToolsEnabled) {
			try {
				uninstallGlobalClaudeToolPatch();
			} catch {
				/* best-effort */
			}
			try {
				restoreBuiltinToolRenderers(pi, ctx.cwd);
			} catch {
				/* best-effort */
			}
			return;
		}
		try {
			installGlobalClaudeToolPatch();
		} catch {
			/* best-effort */
		}
		try {
			registerClaudeToolRenderers(pi, ctx.cwd);
		} catch {
			/* best-effort: keep Pi default rendering */
		}
	});
}
