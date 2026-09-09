import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerSpinner, SpinnerController } from "../spinner.ts";
import type {
	ExtensionAPI,
	ExtensionContext,
	MessageEndEvent,
	MessageUpdateEvent,
	SessionStartEvent,
	Theme,
} from "@earendil-works/pi-coding-agent";

interface MockUiContext {
	ctx: ExtensionContext;
	workingMessages: (string | undefined)[];
	workingIndicators: any[];
	titles: string[];
}

function createMockContext(options: { hasUI?: boolean; throwOnSetWorkingMessage?: boolean; thinkingLevel?: string } = {}): MockUiContext {
	const workingMessages: (string | undefined)[] = [];
	const workingIndicators: any[] = [];
	const titles: string[] = [];
	const hasUI = options.hasUI ?? true;

	const mockTheme = {
		name: "claude-code-dark",
		fg: (_color: any, text: string) => text ?? "",
		bg: (_color: any, text: string) => text ?? "",
		bold: (text: string) => text,
		italic: (text: string) => text,
		underline: (text: string) => text,
		strikethrough: (text: string) => text,
		inverse: (text: string) => text,
	} as unknown as Theme;

	const ctx = {
		hasUI,
		cwd: "/test/project",
		thinkingLevel: options.thinkingLevel ?? "high",
		ui: {
			theme: mockTheme,
			setWorkingIndicator(indicator: any) {
				workingIndicators.push(indicator);
			},
			setTitle(title: string) {
				titles.push(title);
			},
			setWorkingMessage(message?: string) {
				if (options.throwOnSetWorkingMessage) {
					throw new Error("Simulated UI write error / pipe closed");
				}
				workingMessages.push(message);
			},
		},
	} as unknown as ExtensionContext;

	return { ctx, workingMessages, workingIndicators, titles };
}

function createMockPi() {
	const handlers: Record<string, Function[]> = {};
	const pi = {
		on(event: string, handler: Function) {
			if (!handlers[event]) handlers[event] = [];
			handlers[event].push(handler);
		},
		async emit(event: string, eventData: any, ctx: ExtensionContext) {
			const list = handlers[event] || [];
			for (const fn of list) {
				await fn(eventData, ctx);
			}
		},
	} as unknown as ExtensionAPI & { emit: (event: string, data: any, ctx: ExtensionContext) => Promise<void> };

	return { pi, handlers };
}

describe("lifecycle and state management", () => {
	it("executes full lifecycle: session_start -> agent_start -> message_update -> message_end -> agent_end -> agent_settled", async () => {
		const { pi } = createMockPi();
		const controller = registerSpinner(pi);
		const { ctx, workingMessages, workingIndicators, titles } = createMockContext({ thinkingLevel: "high" });

		// 1. Session start
		await pi.emit("session_start", { type: "session_start" } as SessionStartEvent, ctx);
		assert.equal(workingIndicators.length, 1);
		assert.deepEqual(workingIndicators[0], { frames: [] });
		assert.equal(titles.length, 1);
		assert.equal(titles[0], "✻ /test/project");

		// 2. Agent start
		await pi.emit("agent_start", { type: "agent_start" }, ctx);
		assert.ok(controller.getState().isActive);
		assert.equal(controller.getState().totalTokens, 0);
		assert.equal(controller.getState().settledTokens, 0);
		assert.equal(controller.getState().streamTokens, 0);
		assert.ok(workingMessages.length >= 1);
		const initialMessage = workingMessages[workingMessages.length - 1];
		assert.ok(initialMessage?.includes("…"));

		// 3. Message update with streaming output tokens and thinking block
		const updateEvent1 = {
			type: "message_update",
			message: { role: "assistant", content: [] },
			assistantMessageEvent: {
				type: "thinking_start",
			},
		} as unknown as MessageUpdateEvent;
		await pi.emit("message_update", updateEvent1, ctx);
		assert.equal(controller.getState().thinkingStatus, "thinking");
		assert.equal(controller.getState().effortSuffix, " (yüksek eforla)");

		const updateEvent2 = {
			type: "message_update",
			message: { role: "assistant", content: [] },
			assistantMessageEvent: {
				type: "text_delta",
				delta: "Hello",
				partial: {
					role: "assistant",
					content: [],
					usage: { input: 10, output: 450, total: 460 },
				},
			},
		} as unknown as MessageUpdateEvent;
		await pi.emit("message_update", updateEvent2, ctx);
		assert.equal(controller.getState().streamTokens, 450);
		assert.equal(controller.getState().totalTokens, 450);

		// Thinking end
		const updateEvent3 = {
			type: "message_update",
			message: { role: "assistant", content: [] },
			assistantMessageEvent: {
				type: "thinking_end",
			},
		} as unknown as MessageUpdateEvent;
		await pi.emit("message_update", updateEvent3, ctx);

		// 4. Message end (turn 1 finishes)
		const endEvent1 = {
			type: "message_end",
			message: {
				role: "assistant",
				content: [],
				usage: { input: 10, output: 450, total: 460 },
			},
		} as unknown as MessageEndEvent;
		await pi.emit("message_end", endEvent1, ctx);
		assert.equal(controller.getState().settledTokens, 450);
		assert.equal(controller.getState().streamTokens, 0);

		// Multi-turn: Turn 2 (assistant produces additional 300 tokens)
		const updateEvent4 = {
			type: "message_update",
			message: { role: "assistant", content: [] },
			assistantMessageEvent: {
				type: "text_delta",
				delta: "world",
				partial: {
					role: "assistant",
					content: [],
					usage: { input: 10, output: 300, total: 310 },
				},
			},
		} as unknown as MessageUpdateEvent;
		await pi.emit("message_update", updateEvent4, ctx);
		assert.equal(controller.getState().streamTokens, 300);
		assert.equal(controller.getState().totalTokens, 750);

		const endEvent2 = {
			type: "message_end",
			message: {
				role: "assistant",
				content: [],
				usage: { input: 10, output: 300, total: 310 },
			},
		} as unknown as MessageEndEvent;
		await pi.emit("message_end", endEvent2, ctx);
		assert.equal(controller.getState().settledTokens, 750);
		assert.equal(controller.getState().streamTokens, 0);

		// 5. Agent end
		await pi.emit("agent_end", { type: "agent_end", messages: [] }, ctx);

		// 6. Agent settled
		await pi.emit("agent_settled", { type: "agent_settled" }, ctx);
		assert.equal(controller.getState().isActive, false);
		assert.equal(controller.hasActiveTimers(), false);
		// Verified that setWorkingMessage was called with undefined to clear the line
		assert.equal(workingMessages[workingMessages.length - 1], undefined);

		controller.dispose();
	});

	it("gracefully handles UI exceptions without throwing or leaving active timers", async () => {
		const { pi } = createMockPi();
		const controller = registerSpinner(pi);
		const { ctx } = createMockContext({ throwOnSetWorkingMessage: true });

		// Should not throw even when setWorkingMessage throws
		assert.doesNotThrow(async () => {
			await pi.emit("agent_start", { type: "agent_start" }, ctx);
		});

		// Loop should be stopped immediately on UI exception
		assert.equal(controller.getState().isActive, false);
		assert.equal(controller.hasActiveTimers(), false);

		controller.dispose();
	});

	it("handles session_shutdown abruptly during active run", async () => {
		const { pi } = createMockPi();
		const controller = registerSpinner(pi);
		const { ctx } = createMockContext();

		await pi.emit("agent_start", { type: "agent_start" }, ctx);
		assert.ok(controller.getState().isActive);
		assert.ok(controller.hasActiveTimers());

		await pi.emit("session_shutdown", { type: "session_shutdown", reason: "quit" }, ctx);
		assert.equal(controller.getState().isActive, false);
		assert.equal(controller.hasActiveTimers(), false);

		controller.dispose();
	});

	it("resets state completely across consecutive agent runs without state leakage", async () => {
		const { pi } = createMockPi();
		const controller = registerSpinner(pi);
		const { ctx } = createMockContext();

		// Run 1
		await pi.emit("agent_start", { type: "agent_start" }, ctx);
		const start1 = controller.getState().animStartMs;

		const endEvent = {
			type: "message_end",
			message: {
				role: "assistant",
				content: [],
				usage: { input: 50, output: 8500, total: 8550 },
			},
		} as unknown as MessageEndEvent;
		await pi.emit("message_end", endEvent, ctx);
		assert.equal(controller.getState().settledTokens, 8500);

		await pi.emit("agent_settled", { type: "agent_settled" }, ctx);
		assert.equal(controller.hasActiveTimers(), false);

		// Small delay to ensure timestamp differs
		await new Promise((r) => setTimeout(r, 10));

		// Run 2
		await pi.emit("agent_start", { type: "agent_start" }, ctx);
		const start2 = controller.getState().animStartMs;
		assert.ok(start2 >= start1);
		assert.equal(controller.getState().settledTokens, 0);
		assert.equal(controller.getState().streamTokens, 0);
		assert.equal(controller.getState().totalTokens, 0);
		assert.equal(controller.getState().thinkingStatus, null);
		assert.equal(controller.getState().effortSuffix, "");
		assert.ok(controller.getState().isActive);

		await pi.emit("agent_settled", { type: "agent_settled" }, ctx);
		assert.equal(controller.hasActiveTimers(), false);

		controller.dispose();
	});

	it("operates safely when ctx.hasUI is false (headless/RPC mode)", async () => {
		const { pi } = createMockPi();
		const controller = registerSpinner(pi);
		const { ctx, workingMessages, workingIndicators } = createMockContext({ hasUI: false });

		await pi.emit("session_start", { type: "session_start" } as SessionStartEvent, ctx);
		assert.equal(workingIndicators.length, 0);

		await pi.emit("agent_start", { type: "agent_start" }, ctx);
		// No timers should be created in headless mode
		assert.equal(controller.getState().isActive, false);
		assert.equal(controller.hasActiveTimers(), false);
		assert.equal(workingMessages.length, 0);

		const updateEvent = {
			type: "message_update",
			message: { role: "assistant", content: [] },
			assistantMessageEvent: {
				type: "text_delta",
				delta: "abc",
				partial: {
					role: "assistant",
					content: [],
					usage: { input: 1, output: 25, total: 26 },
				},
			},
		} as unknown as MessageUpdateEvent;
		await pi.emit("message_update", updateEvent, ctx);
		assert.equal(controller.getState().streamTokens, 25);
		assert.equal(workingMessages.length, 0);

		await pi.emit("agent_settled", { type: "agent_settled" }, ctx);
		assert.equal(workingMessages.length, 0);
		assert.equal(controller.hasActiveTimers(), false);

		controller.dispose();
	});

	it("handles multiple consecutive agent_settled and agent_start calls idempotently", async () => {
		const { pi } = createMockPi();
		const controller = registerSpinner(pi);
		const { ctx } = createMockContext();

		// Multiple settles when idle
		await pi.emit("agent_settled", { type: "agent_settled" }, ctx);
		await pi.emit("agent_settled", { type: "agent_settled" }, ctx);
		assert.equal(controller.hasActiveTimers(), false);

		// Multiple starts back-to-back
		await pi.emit("agent_start", { type: "agent_start" }, ctx);
		await pi.emit("agent_start", { type: "agent_start" }, ctx);
		assert.ok(controller.getState().isActive);

		// Clean settle
		await pi.emit("agent_settled", { type: "agent_settled" }, ctx);
		assert.equal(controller.hasActiveTimers(), false);

		controller.dispose();
	});

	it("settles open thinking blocks when message_end occurs without thinking_end", async () => {
		const { pi } = createMockPi();
		const controller = registerSpinner(pi);
		const { ctx } = createMockContext();

		await pi.emit("agent_start", { type: "agent_start" }, ctx);

		// Thinking starts but is never ended by thinking_end
		await pi.emit(
			"message_update",
			{
				type: "message_update",
				message: { role: "assistant", content: [] },
				assistantMessageEvent: { type: "thinking_start" },
			} as unknown as MessageUpdateEvent,
			ctx,
		);
		assert.equal(controller.getState().thinkingStatus, "thinking");

		// message_end should safely settle the open thinking block
		await pi.emit(
			"message_end",
			{
				type: "message_end",
				message: { role: "assistant", content: [] },
			} as unknown as MessageEndEvent,
			ctx,
		);

		await pi.emit("agent_settled", { type: "agent_settled" }, ctx);
		assert.equal(controller.hasActiveTimers(), false);

		controller.dispose();
	});
});
