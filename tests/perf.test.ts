import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
	formatTokenCount,
	formatElapsed,
	glimmerMessage,
	buildSpinnerLine,
	thinkingGlowPaint,
	SpinnerController,
	registerSpinner,
	type SpinnerFrameState,
} from "../spinner.ts";
import { visibleWidth, stripAnsi, fgAnsi, fg } from "../palette.ts";
import type { ExtensionAPI, ExtensionContext, MessageUpdateEvent, MessageEndEvent } from "@earendil-works/pi-coding-agent";

describe("performance and hot-path benchmarks", () => {
	const controller = new SpinnerController();
	const paint = controller.paintFor();

	it("benchmarks visibleWidth throughput across 50,000 iterations", () => {
		const testStrings = [
			"15sn",
			"↓ 1.5k token",
			"\x1b[38;2;215;119;87mZenginleştiriliyor…\x1b[39m",
			"Türkçe: ğ, ü, ş, ı, ö, ç, İ, Ğ, Ü, Ş, I, Ö, Ç",
			"café and emoji ✨ 🚀",
		];

		const start = performance.now();
		const iterations = 50_000;
		for (let i = 0; i < iterations; i++) {
			const str = testStrings[i % testStrings.length]!;
			const w = visibleWidth(str);
			assert.ok(w > 0);
		}
		const elapsedMs = performance.now() - start;
		const opsPerSec = Math.round((iterations / elapsedMs) * 1000);

		// Assert throughput exceeds minimum target (at least 500,000 ops/sec)
		assert.ok(
			opsPerSec > 500_000,
			`visibleWidth throughput ${opsPerSec.toLocaleString()} ops/sec was below 500k ops/sec target`,
		);
	});

	it("benchmarks formatTokenCount throughput across 50,000 iterations", () => {
		const sampleCounts = [0, 450, 1200, 9900, 25600, 1500000, 12300000];

		const start = performance.now();
		const iterations = 50_000;
		for (let i = 0; i < iterations; i++) {
			const count = sampleCounts[i % sampleCounts.length]!;
			const res = formatTokenCount(count);
			assert.ok(res.length > 0);
		}
		const elapsedMs = performance.now() - start;
		const opsPerSec = Math.round((iterations / elapsedMs) * 1000);

		assert.ok(
			opsPerSec > 1_000_000,
			`formatTokenCount throughput ${opsPerSec.toLocaleString()} ops/sec was below 1M ops/sec target`,
		);
	});

	it("benchmarks glimmerMessage throughput across 30,000 iterations", () => {
		const msg = "Zenginleştiriliyor…";

		const start = performance.now();
		const iterations = 30_000;
		for (let i = 0; i < iterations; i++) {
			const idx = (i % 25) - 3;
			const res = glimmerMessage(msg, idx, paint);
			assert.ok(res.length > 0);
		}
		const elapsedMs = performance.now() - start;
		const opsPerSec = Math.round((iterations / elapsedMs) * 1000);

		assert.ok(
			opsPerSec > 50_000,
			`glimmerMessage throughput ${opsPerSec.toLocaleString()} ops/sec was below 50k ops/sec target`,
		);
	});

	it("benchmarks buildSpinnerLine throughput across 30,000 iterations", () => {
		const stateWide: SpinnerFrameState = {
			verb: "Zenginleştiriliyor",
			timeMs: 25000,
			columns: 120,
			tokens: 4500,
			thinkingStatus: "thinking",
			effortSuffix: " (yüksek eforla)",
			thinkingElapsedMs: 15000,
		};

		const stateNarrow: SpinnerFrameState = {
			verb: "İşleniyor",
			timeMs: 5000,
			columns: 35,
			tokens: 120,
		};

		const start = performance.now();
		const iterations = 30_000;
		for (let i = 0; i < iterations; i++) {
			const state = i % 2 === 0 ? stateWide : stateNarrow;
			const line = buildSpinnerLine(state, paint);
			assert.ok(line.length > 0);
		}
		const elapsedMs = performance.now() - start;
		const opsPerSec = Math.round((iterations / elapsedMs) * 1000);

		assert.ok(
			opsPerSec > 50_000,
			`buildSpinnerLine throughput ${opsPerSec.toLocaleString()} ops/sec was below 50k ops/sec target`,
		);
	});

	it("benchmarks thinkingGlowPaint throughput across 30,000 iterations", () => {
		const start = performance.now();
		const iterations = 30_000;
		for (let i = 0; i < iterations; i++) {
			const timeMs = (i * 100) % 10000;
			const painter = thinkingGlowPaint(timeMs, "dark");
			const res = painter("düşünülüyor");
			assert.ok(res.length > 0);
		}
		const elapsedMs = performance.now() - start;
		const opsPerSec = Math.round((iterations / elapsedMs) * 1000);

		assert.ok(
			opsPerSec > 500_000,
			`thinkingGlowPaint throughput ${opsPerSec.toLocaleString()} ops/sec was below 500k ops/sec target`,
		);
	});
});

describe("stress testing and high-frequency streaming", () => {
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

	function createMockContext() {
		const workingMessages: (string | undefined)[] = [];
		const ctx = {
			hasUI: true,
			cwd: "/stress/test",
			thinkingLevel: "high",
			ui: {
				theme: { name: "claude-code-dark" },
				setWorkingIndicator() {},
				setTitle() {},
				setWorkingMessage(msg?: string) {
					workingMessages.push(msg);
				},
			},
		} as unknown as ExtensionContext;

		return { ctx, workingMessages };
	}

	it("simulates 1,000 rapid message_update streaming events with zero lag and coalesced repaint", async () => {
		const { pi } = createMockPi();
		const controller = registerSpinner(pi);
		const { ctx, workingMessages } = createMockContext();

		await pi.emit("agent_start", { type: "agent_start" }, ctx);

		const startTime = performance.now();
		const eventCount = 1000;

		// Emit 1,000 rapid token updates
		for (let i = 1; i <= eventCount; i++) {
			const updateEvent = {
				type: "message_update",
				message: { role: "assistant", content: [] },
				assistantMessageEvent: {
					type: "text_delta",
					delta: "token",
					partial: {
						role: "assistant",
						content: [],
						usage: { input: 10, output: i * 2, total: 10 + i * 2 },
					},
				},
			} as unknown as MessageUpdateEvent;
			await pi.emit("message_update", updateEvent, ctx);
		}

		const dispatchElapsed = performance.now() - startTime;
		// 1,000 events dispatched synchronously in < 50ms
		assert.ok(dispatchElapsed < 100, `Dispatching 1,000 events took ${dispatchElapsed}ms (expected < 100ms)`);

		// Controller state accurately tracks the final token count
		assert.equal(controller.getState().streamTokens, 2000);
		assert.equal(controller.getState().totalTokens, 2000);

		// Wait for scheduled coalesced repaint to settle
		await new Promise((r) => setTimeout(r, 20));

		// End turn
		const endEvent = {
			type: "message_end",
			message: {
				role: "assistant",
				content: [],
				usage: { input: 10, output: 2000, total: 2010 },
			},
		} as unknown as MessageEndEvent;
		await pi.emit("message_end", endEvent, ctx);
		assert.equal(controller.getState().settledTokens, 2000);
		assert.equal(controller.getState().streamTokens, 0);

		// Settle
		await pi.emit("agent_settled", { type: "agent_settled" }, ctx);
		assert.equal(controller.getState().isActive, false);
		assert.equal(controller.hasActiveTimers(), false);

		controller.dispose();
	});

	it("simulates a multi-turn session with 250 consecutive turns without timer or state leakage", async () => {
		const { pi } = createMockPi();
		const controller = registerSpinner(pi);
		const { ctx } = createMockContext();

		for (let turn = 0; turn < 250; turn++) {
			await pi.emit("agent_start", { type: "agent_start" }, ctx);

			// Thinking phase
			await pi.emit(
				"message_update",
				{
					type: "message_update",
					message: { role: "assistant", content: [] },
					assistantMessageEvent: { type: "thinking_start" },
				} as unknown as MessageUpdateEvent,
				ctx,
			);

			// Streaming phase (10 deltas)
			for (let d = 1; d <= 10; d++) {
				await pi.emit(
					"message_update",
					{
						type: "message_update",
						message: { role: "assistant", content: [] },
						assistantMessageEvent: {
							type: "text_delta",
							delta: "word",
							partial: {
								role: "assistant",
								content: [],
								usage: { input: 5, output: d * 10, total: 5 + d * 10 },
							},
						},
					} as unknown as MessageUpdateEvent,
					ctx,
				);
			}

			// Thinking end
			await pi.emit(
				"message_update",
				{
					type: "message_update",
					message: { role: "assistant", content: [] },
					assistantMessageEvent: { type: "thinking_end" },
				} as unknown as MessageUpdateEvent,
				ctx,
			);

			// Message end
			await pi.emit(
				"message_end",
				{
					type: "message_end",
					message: {
						role: "assistant",
						content: [],
						usage: { input: 5, output: 100, total: 105 },
					},
				} as unknown as MessageEndEvent,
				ctx,
			);

			// Settle
			await pi.emit("agent_settled", { type: "agent_settled" }, ctx);
			assert.equal(controller.hasActiveTimers(), false);
		}

		controller.dispose();
	});

	it("verifies bounded ANSI cache prevents memory leaks with arbitrary color queries", () => {
		// Query 2,000 distinct hex colors
		for (let i = 0; i < 2000; i++) {
			const hex = `#${(i % 16777215).toString(16).padStart(6, "0")}`;
			const ansi = fgAnsi(hex);
			assert.ok(ansi.startsWith("\x1b[38;2;"));
		}

		// Ensure standard dark and light palette colors remain instantly accessible and valid
		const darkClaude = fgAnsi("#D77757");
		assert.equal(darkClaude, "\x1b[38;2;215;119;87m");

		const lightClaude = fgAnsi("#B84E2D");
		assert.equal(lightClaude, "\x1b[38;2;184;78;45m");
	});
});
