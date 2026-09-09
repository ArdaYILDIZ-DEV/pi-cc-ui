import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	addAssistantResponseMarker,
	genericDetail,
	genericSummary,
	installGlobalClaudeToolPatch,
	isClaudeToolsEnabled,
	isGlobalClaudeToolPatchInstalled,
	prettyToolLabel,
	registerClaudeToolRenderers,
	registerToolRenderers,
	restoreBuiltinToolRenderers,
	setClaudeToolsEnabled,
	uninstallGlobalClaudeToolPatch,
} from "../tool-renderers.ts";
import {
	ToolExecutionComponent,
	initTheme,
} from "@earendil-works/pi-coding-agent";

try {
	initTheme();
} catch {
	/* best-effort: keyHint fallback rendering needs global theme */
}

function createMockTheme(): Theme {
	return {
		name: "test",
		fg: (_color: unknown, text: string) => text,
		bg: (_color: unknown, text: string) => text,
		bold: (text: string) => text,
	} as unknown as Theme;
}

function createMockPi(builtinNames: string[] = []) {
	const registered: Array<{ name: string; def: unknown }> = [];
	const handlers: Record<string, Function[]> = {};
	const commands: Record<string, { handler: Function }> = {};
	const notifications: Array<{ message: string; type?: string }> = [];
	const pi = {
		handlers,
		commands,
		notifications,
		on(event: string, handler: Function) {
			if (!handlers[event]) handlers[event] = [];
			handlers[event].push(handler);
		},
		async emit(event: string, data: unknown, ctx: unknown) {
			for (const fn of handlers[event] ?? []) await fn(data, ctx);
		},
		registerCommand(name: string, options: { handler: Function }) {
			commands[name] = { handler: options.handler };
		},
		getAllTools() {
			return builtinNames.map((name) => ({
				name,
				description: `${name} tool`,
				parameters: {},
				sourceInfo: {
					path: `<builtin:${name}>`,
					source: "builtin",
					scope: "user",
					origin: "package",
				},
			}));
		},
		registerTool(def: { name: string }) {
			registered.push({ name: def.name, def });
		},
	} as unknown as ExtensionAPI & {
		handlers: Record<string, Function[]>;
		commands: Record<string, { handler: Function }>;
		notifications: Array<{ message: string; type?: string }>;
		emit: (e: string, d: unknown, c: unknown) => Promise<void>;
	};
	return { pi, registered, commands, notifications };
}

describe("tool-renderers pure helpers", () => {
	describe("prettyToolLabel", () => {
		it("maps known builtins to Claude labels", () => {
			assert.equal(prettyToolLabel("read"), "Read");
			assert.equal(prettyToolLabel("bash"), "Bash");
			assert.equal(prettyToolLabel("powershell"), "PowerShell");
			assert.equal(prettyToolLabel("edit"), "Edit");
			assert.equal(prettyToolLabel("write"), "Write");
			assert.equal(prettyToolLabel("grep"), "Grep");
			assert.equal(prettyToolLabel("find"), "Find");
			assert.equal(prettyToolLabel("ls"), "List");
		});

		it("prettifies custom tool names", () => {
			assert.equal(prettyToolLabel("ask_user_question"), "Ask User Question");
			assert.equal(prettyToolLabel("web-search"), "Web Search");
			assert.equal(prettyToolLabel("myTool"), "MyTool");
		});

		it("falls back to Tool for empty/invalid names", () => {
			assert.equal(prettyToolLabel(""), "Tool");
			assert.equal(prettyToolLabel(null as unknown as string), "Tool");
			assert.equal(prettyToolLabel(undefined as unknown as string), "Tool");
		});
	});

	describe("genericDetail", () => {
		it("prefers known keys over first string value", () => {
			assert.equal(genericDetail({ command: "ls -la", other: "x" }), "ls -la");
			assert.equal(
				genericDetail({ path: "/tmp/foo", command: "echo hi" }),
				"echo hi",
			);
			assert.equal(
				genericDetail({ question: "Devam edelim mi?" }),
				"Devam edelim mi?",
			);
			assert.equal(genericDetail({ pattern: "foo.*", path: "/tmp" }), "foo.*");
		});

		it("falls back to first string value", () => {
			assert.equal(genericDetail({ customArg: "hello" }), "hello");
		});

		it("returns empty string for non-objects", () => {
			assert.equal(genericDetail(null), "");
			assert.equal(genericDetail(undefined), "");
			assert.equal(genericDetail("cmd"), "");
			assert.equal(genericDetail({}), "");
			assert.equal(genericDetail({ n: 42 }), "");
		});
	});

	describe("genericSummary", () => {
		it("summarizes line counts", () => {
			assert.equal(genericSummary(""), "Done");
			assert.equal(genericSummary("one"), "Completed 1 line");
			assert.equal(genericSummary("a\nb\nc"), "Completed 3 lines");
		});
	});

	describe("addAssistantResponseMarker", () => {
		it("prefixes plain assistant text with dot", () => {
			assert.equal(addAssistantResponseMarker("hello"), "● hello");
		});

		it("leaves already-marked, empty, and block constructs untouched", () => {
			assert.equal(addAssistantResponseMarker("● hello"), "● hello");
			assert.equal(addAssistantResponseMarker("   "), "   ");
			assert.equal(addAssistantResponseMarker("# Title"), "# Title");
			assert.equal(addAssistantResponseMarker("- item"), "- item");
			assert.equal(addAssistantResponseMarker("```\ncode\n```"), "```\ncode\n```");
			assert.equal(addAssistantResponseMarker("> quote"), "> quote");
		});
	});
});

describe("registerClaudeToolRenderers (builtin official path)", () => {
	it("wraps all 8 builtins including powershell", () => {
		const { pi, registered } = createMockPi([
			"read",
			"bash",
			"powershell",
			"edit",
			"write",
			"grep",
			"find",
			"ls",
		]);
		const wrapped = registerClaudeToolRenderers(pi, "/tmp");
		assert.deepEqual(wrapped.sort(), [
			"bash",
			"edit",
			"find",
			"grep",
			"ls",
			"powershell",
			"read",
			"write",
		]);
		assert.equal(registered.length, 8);
		for (const { def } of registered) {
			const d = def as {
				renderShell?: string;
				renderCall?: unknown;
				renderResult?: unknown;
			};
			assert.equal(d.renderShell, "self");
			assert.equal(typeof d.renderCall, "function");
			assert.equal(typeof d.renderResult, "function");
		}
	});

	it("skips non-builtin tools", () => {
		const { pi, registered } = createMockPi([]);
		// getAllTools returns only builtins; custom tools are not in the list
		// so nothing should be registered.
		const wrapped = registerClaudeToolRenderers(pi, "/tmp");
		assert.deepEqual(wrapped, []);
		assert.equal(registered.length, 0);
	});

	it("builtin renderers produce compact Claude output", () => {
		const { pi, registered } = createMockPi(["bash", "read"]);
		registerClaudeToolRenderers(pi, "/tmp");
		const theme = createMockTheme();
		const bash = registered.find((r) => r.name === "bash");
		assert.ok(bash);
		const bashDef = bash!.def as {
			renderCall: (args: unknown, theme: Theme, ctx: unknown) => Text;
			renderResult: (r: unknown, o: unknown, t: Theme, c: unknown) => Text;
		};
		const callComp = bashDef.renderCall({ command: "ls -la" }, theme, {
			executionStarted: true,
			isError: false,
			isPartial: false,
		});
		const callLines = callComp.render(80).join("\n");
		assert.ok(callLines.includes("Bash"));
		assert.ok(callLines.includes("ls -la"));

		const resultComp = bashDef.renderResult(
			{ content: [{ type: "text", text: "a\nb\n" }] },
			{ expanded: false, isPartial: false },
			theme,
			{ executionStarted: true, isError: false, isPartial: false },
		);
		const resultLines = resultComp.render(80).join("\n");
		assert.ok(resultLines.includes("Returned 2 lines"));
	});
});

describe("global patch (generic tools)", () => {
	afterEach(() => {
		try {
			uninstallGlobalClaudeToolPatch();
		} catch {
			/* ignore */
		}
	});

	it("installs idempotently and reports status", () => {
		assert.equal(installGlobalClaudeToolPatch(), true);
		assert.equal(isGlobalClaudeToolPatchInstalled(), true);
		assert.equal(installGlobalClaudeToolPatch(), true);
		assert.equal(uninstallGlobalClaudeToolPatch(), true);
		assert.equal(isGlobalClaudeToolPatchInstalled(), false);
	});

	it("forces self shell and generic renderers for custom tools", () => {
		installGlobalClaudeToolPatch();
		const comp = new ToolExecutionComponent(
			"ask_user_question",
			"test-id-1",
			{ question: "Devam edelim mi?", options: [] },
			{},
			undefined,
			{ requestRender: () => {} } as never,
			"/tmp",
		);
		const anyComp = comp as unknown as {
			getRenderShell: () => string;
			getCallRenderer: () =>
				| ((a: unknown, t: Theme, c: unknown) => Text)
				| undefined;
			getResultRenderer: () =>
				| ((r: unknown, o: unknown, t: Theme, c: unknown) => Text)
				| undefined;
		};
		assert.equal(anyComp.getRenderShell(), "self");

		const theme = createMockTheme();
		const callRenderer = anyComp.getCallRenderer();
		assert.equal(typeof callRenderer, "function");
		const callText = callRenderer!({ question: "Devam edelim mi?" }, theme, {
			executionStarted: true,
			isError: false,
			isPartial: false,
			expanded: false,
		});
		const callLines = callText.render(100).join("\n");
		assert.ok(callLines.includes("Ask User Question"));
		assert.ok(callLines.includes("Devam edelim mi?"));

		const resultRenderer = anyComp.getResultRenderer();
		assert.equal(typeof resultRenderer, "function");
		const resultText = resultRenderer!(
			{ content: [{ type: "text", text: "line1\nline2\n" }] },
			{ expanded: false, isPartial: false },
			theme,
			{
				executionStarted: true,
				isError: false,
				isPartial: false,
				expanded: false,
			},
		);
		const resultLines = resultText.render(100).join("\n");
		assert.ok(resultLines.includes("Completed 2 lines"));
	});

	it("leaves known builtins to the official path", () => {
		installGlobalClaudeToolPatch();
		const comp = new ToolExecutionComponent(
			"bash",
			"test-id-2",
			{ command: "echo hi" },
			{},
			undefined,
			{ requestRender: () => {} } as never,
			"/tmp",
		);
		const anyComp = comp as unknown as {
			getCallRenderer: () => unknown;
		};
		// Should delegate to the original builtin renderer, not our wrapper.
		const renderer = anyComp.getCallRenderer() as
			| { __ccUiClaudeWrapped?: boolean }
			| undefined;
		assert.equal(renderer?.__ccUiClaudeWrapped, undefined);
	});

	it("registerToolRenderers wires session_start without throwing in non-tui mode", async () => {
		const { pi } = createMockPi(["bash"]);
		registerToolRenderers(pi);
		assert.ok(Array.isArray(pi.handlers["session_start"]));
		// Non-TUI sessions must be ignored.
		await pi.emit(
			"session_start",
			{ type: "session_start" },
			{
				mode: "print",
				cwd: "/tmp",
				hasUI: false,
				ui: { theme: createMockTheme() },
			},
		);
		// TUI session registers builtin overrides (best-effort, must not throw).
		await pi.emit(
			"session_start",
			{ type: "session_start" },
			{
				mode: "tui",
				cwd: "/tmp",
				hasUI: true,
				ui: { theme: createMockTheme() },
			},
		);
		assert.equal(isGlobalClaudeToolPatchInstalled(), true);
	});
});

describe("dynamic toggle (/cc-tools)", () => {
	afterEach(() => {
		try {
			uninstallGlobalClaudeToolPatch();
		} catch {
			/* ignore */
		}
	});

	it("is enabled by default", () => {
		assert.equal(isClaudeToolsEnabled(), true);
	});

	it("disable restores plain builtin definitions and removes the patch", () => {
		const { pi, registered } = createMockPi(["read", "bash"]);
		const restored = setClaudeToolsEnabled(pi, false, "/tmp");
		assert.equal(isClaudeToolsEnabled(), false);
		assert.deepEqual(restored.sort(), ["bash", "read"]);
		assert.equal(isGlobalClaudeToolPatchInstalled(), false);
		// Restored definitions are the plain factories (no Claude self frame).
		for (const { def } of registered) {
			const d = def as { renderShell?: string };
			assert.notEqual(d.renderShell, "self");
		}
		// Direct restore is idempotent.
		const again = restoreBuiltinToolRenderers(pi, "/tmp");
		assert.deepEqual(again.sort(), ["bash", "read"]);
		// Re-enable brings the compact renderers back: registry source is our
		// own extension by now, still wrappable via remembered names.
		const wrapped = setClaudeToolsEnabled(pi, true, "/tmp");
		assert.equal(isClaudeToolsEnabled(), true);
		assert.deepEqual(wrapped.sort(), ["bash", "read"]);
		assert.equal(isGlobalClaudeToolPatchInstalled(), true);
	});

	it("cc-tools command toggles state and notifies", async () => {
		const { pi, commands, notifications } = createMockPi(["bash"]);
		setClaudeToolsEnabled(pi, true, "/tmp");
		registerToolRenderers(pi);
		const cmd = commands["cc-tools"];
		assert.ok(cmd);
		const ctx = {
			cwd: "/tmp",
			ui: {
				theme: createMockTheme(),
				notify: (message: string, type?: string) => {
					notifications.push({ message, type });
				},
			},
		};
		await cmd.handler("off", ctx);
		assert.equal(isClaudeToolsEnabled(), false);
		assert.ok(
			notifications[notifications.length - 1]?.message.includes("kapalı"),
		);
		await cmd.handler("", ctx);
		assert.ok(
			notifications[notifications.length - 1]?.message.includes("kapalı"),
		);
		await cmd.handler("toggle", ctx);
		assert.equal(isClaudeToolsEnabled(), true);
		assert.ok(notifications[notifications.length - 1]?.message.includes("açık"));
		await cmd.handler("on", ctx);
		assert.equal(isClaudeToolsEnabled(), true);
		setClaudeToolsEnabled(pi, true, "/tmp");
	});

	it("session_start respects the disabled switch", async () => {
		const { pi, registered } = createMockPi(["bash"]);
		registerToolRenderers(pi);
		setClaudeToolsEnabled(pi, false, "/tmp");
		const before = registered.length;
		await pi.emit(
			"session_start",
			{ type: "session_start" },
			{
				mode: "tui",
				cwd: "/tmp",
				hasUI: true,
				ui: { theme: createMockTheme() },
			},
		);
		assert.equal(isClaudeToolsEnabled(), false);
		assert.equal(isGlobalClaudeToolPatchInstalled(), false);
		// Disabled session re-registers plain definitions, never compact ones.
		for (const { def } of registered.slice(before)) {
			const d = def as { renderShell?: string };
			assert.notEqual(d.renderShell, "self");
		}
		setClaudeToolsEnabled(pi, true, "/tmp");
	});
});
