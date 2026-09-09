import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
	stripAnsi,
	sanitizeControlChars,
	sanitizeTitle,
	sanitizeSafeAnsi,
	visibleWidth,
	hexToRgb,
	rgbTo256,
	fgAnsi,
	fg,
	resolvePalette,
} from "../palette.ts";
import {
	formatTokenCount,
	formatElapsed,
	thinkingWording,
	thinkingGlowPaint,
	glimmerMessage,
	buildSpinnerLine,
	effortSuffixFor,
	SpinnerController,
	registerSpinner,
	type SpinnerFrameState,
	type SpinnerPaint,
} from "../spinner.ts";
import type {
	ExtensionAPI,
	ExtensionContext,
	MessageEndEvent,
	MessageUpdateEvent,
	SessionStartEvent,
	Theme,
} from "@earendil-works/pi-coding-agent";

const mockPaint: SpinnerPaint = {
	accent: (s) => `\x1b[38;2;215;119;87m${s}\x1b[39m`,
	shimmer: (s) => `\x1b[38;2;235;159;127m${s}\x1b[39m`,
	dim: (s) => `\x1b[2m${s}\x1b[22m`,
};

describe("security & safety audit", () => {
	describe("terminal control character smuggling & ANSI escape injection", () => {
		it("neutralizes OSC 52 clipboard hijacking payloads in all formats (BEL, ST, 8-bit, unterminated)", () => {
			const oscBel = "Prefix\x1b]52;c;Y2F0IC9ldGMvcGFzc3dkCg==\x07Suffix";
			const oscSt = "Prefix\x1b]52;c;Y2F0IC9ldGMvcGFzc3dkCg==\x1b\\Suffix";
			const osc8bit = "Prefix\x9d52;c;Y2F0IC9ldGMvcGFzc3dkCg==\x9cSuffix";
			const oscUnterminated = "Prefix\x1b]52;c;Y2F0IC9ldGMvcGFzc3dkCg==";

			assert.equal(stripAnsi(oscBel), "PrefixSuffix");
			assert.equal(stripAnsi(oscSt), "PrefixSuffix");
			assert.equal(stripAnsi(osc8bit), "PrefixSuffix");
			assert.equal(stripAnsi(oscUnterminated), "Prefix");

			// Verify safe ANSI sanitizer strips OSC while preserving valid text
			assert.equal(sanitizeSafeAnsi(oscBel), "PrefixSuffix");
			assert.equal(sanitizeSafeAnsi(oscSt), "PrefixSuffix");
			assert.equal(sanitizeSafeAnsi(osc8bit), "PrefixSuffix");
			assert.equal(sanitizeSafeAnsi(oscUnterminated), "Prefix");
		});

		it("neutralizes OSC 8 hyperlink injection", () => {
			const hyperlink = "\x1b]8;;https://malicious-site.com\x07Click Me\x1b]8;;\x07";
			assert.equal(stripAnsi(hyperlink), "Click Me");
			assert.equal(sanitizeSafeAnsi(hyperlink), "Click Me");
			assert.equal(visibleWidth(hyperlink), 8); // 'Click Me' is 8 columns
		});

		it("neutralizes terminal screen clearing and cursor positioning sequences", () => {
			const clearScreen = "\x1b[2J\x1b[H\x1b[?25lDanger";
			const cursorMove = "\x1b[10;20H\x1b[3J\x1b[KText";
			const c1Clear = "\x9b2J\x9bHAttack";

			assert.equal(stripAnsi(clearScreen), "Danger");
			assert.equal(stripAnsi(cursorMove), "Text");
			assert.equal(stripAnsi(c1Clear), "Attack");

			assert.equal(sanitizeSafeAnsi(clearScreen), "Danger");
			assert.equal(sanitizeSafeAnsi(cursorMove), "Text");
			assert.equal(sanitizeSafeAnsi(c1Clear), "Attack");
		});

		it("neutralizes DCS, APC, PM, and SOS control strings", () => {
			const dcs = "Start\x1bP$q\"p\x1b\\End";
			const apc = "Start\x1b_Gpayload\x1b\\End";
			const pm = "Start\x1b^pm_data\x07End";
			const sos = "Start\x1bXsecret\x1b\\End";
			const c1Dcs = "Start\x90$q\"p\x9cEnd";

			assert.equal(stripAnsi(dcs), "StartEnd");
			assert.equal(stripAnsi(apc), "StartEnd");
			assert.equal(stripAnsi(pm), "StartEnd");
			assert.equal(stripAnsi(sos), "StartEnd");
			assert.equal(stripAnsi(c1Dcs), "StartEnd");

			assert.equal(sanitizeSafeAnsi(dcs), "StartEnd");
			assert.equal(sanitizeSafeAnsi(apc), "StartEnd");
			assert.equal(sanitizeSafeAnsi(pm), "StartEnd");
			assert.equal(sanitizeSafeAnsi(sos), "StartEnd");
			assert.equal(sanitizeSafeAnsi(c1Dcs), "StartEnd");
		});

		it("strips C0/C1 control characters (NUL, BEL, BS, CR, LF, DEL)", () => {
			const rawControls = "Line1\nLine2\r\x00\x07\x08\x1f\x7fLine3";
			const clean = sanitizeControlChars(rawControls);
			assert.equal(clean, "Line1Line2Line3");
			assert.equal(stripAnsi(rawControls), "Line1\nLine2\r\x00\x07\x08\x1f\x7fLine3");
			assert.equal(visibleWidth(rawControls), 15); // 'Line1Line2Line3' is 15 columns
		});

		it("sanitizes malicious verb input in buildSpinnerLine without breaking formatting", () => {
			const maliciousVerbState: SpinnerFrameState = {
				verb: "Kodlanıyor\x1b]52;c;Y2F0IC9ldGMvcGFzc3dkCg==\x07\x1b[2J\r\n",
				timeMs: 1000,
				columns: 80,
			};

			const line = buildSpinnerLine(maliciousVerbState, mockPaint);
			const stripped = stripAnsi(line);
			assert.ok(!stripped.includes("52;c;"));
			assert.ok(!stripped.includes("\r"));
			assert.ok(!stripped.includes("\n"));
			assert.ok(stripped.includes("Kodlanıyor…"));
			assert.ok(visibleWidth(line) <= 80);
		});

		it("sanitizes malicious effort suffixes in effortSuffixFor and buildSpinnerLine", () => {
			const maliciousEffort = "high\x1b]52;c;exploit\x07\r\n";
			const suffix = effortSuffixFor(maliciousEffort);
			assert.equal(suffix, " (yüksek eforla)");

			const state: SpinnerFrameState = {
				verb: "İşleniyor",
				timeMs: 5000,
				columns: 120,
				thinkingStatus: "thinking",
				effortSuffix: " (\x1b[2J\x1b]52;c;exploit\x07tehlikeli eforla\r\n)",
			};

			const line = buildSpinnerLine(state, mockPaint);
			const stripped = stripAnsi(line);
			assert.ok(!stripped.includes("52;c;"));
			assert.ok(!stripped.includes("\r"));
			assert.ok(!stripped.includes("\n"));
			assert.ok(stripped.includes("tehlikeli eforla"));
		});
	});

	describe("title sanitization & injection mitigation", () => {
		it("sanitizes cwd path with escape sequences, bells, newlines, and multiple spaces", () => {
			const maliciousCwd = "/home/user/repo\x1b]0;hacked\x07\r\n\t/subproject   dir";
			const clean = sanitizeTitle(maliciousCwd);
			assert.equal(clean, "/home/user/repo /subproject dir");
			assert.ok(!clean.includes("\x1b"));
			assert.ok(!clean.includes("\x07"));
			assert.ok(!clean.includes("\r"));
			assert.ok(!clean.includes("\n"));
		});

		it("safely handles empty or non-string titles", () => {
			assert.equal(sanitizeTitle(""), "");
			assert.equal(sanitizeTitle(null as any), "");
			assert.equal(sanitizeTitle(undefined as any), "");
			assert.equal(sanitizeTitle(123 as any), "");
		});

		it("verifies handleSessionStart sets sanitized title on ctx.ui", () => {
			let setTitleCalledWith = "";
			const mockCtx = {
				hasUI: true,
				cwd: "/projects/\x1b]52;c;evil\x07\nrepo",
				ui: {
					setWorkingIndicator() {},
					setTitle(title: string) {
						setTitleCalledWith = title;
					},
					setWorkingMessage() {},
				},
			} as unknown as ExtensionContext;

			const controller = new SpinnerController();
			controller.handleSessionStart(mockCtx);

			assert.equal(setTitleCalledWith, "✻ /projects/ repo");
			assert.ok(!setTitleCalledWith.includes("evil"));
			assert.ok(!setTitleCalledWith.includes("\x1b"));
			assert.ok(!setTitleCalledWith.includes("\n"));

			controller.dispose();
		});
	});

	describe("ReDoS (Regular Expression Denial of Service) protection", () => {
		it("evaluates deep repeated ANSI CSI sequences in linear time (< 15ms for 50,000 chars)", () => {
			const adversarialCsi = "\x1b[" + "1;".repeat(25000) + "m";
			const start = performance.now();
			const stripped = stripAnsi(adversarialCsi);
			const elapsed = performance.now() - start;

			assert.equal(stripped, "");
			assert.ok(elapsed < 15, `stripAnsi took ${elapsed.toFixed(2)}ms (target < 15ms)`);
		});

		it("evaluates deep repeated unterminated OSC sequences in linear time (< 15ms for 50,000 chars)", () => {
			const adversarialOsc = "\x1b]" + "A".repeat(50000);
			const start = performance.now();
			const stripped = stripAnsi(adversarialOsc);
			const elapsed = performance.now() - start;

			assert.equal(stripped, "");
			assert.ok(elapsed < 15, `stripAnsi took ${elapsed.toFixed(2)}ms (target < 15ms)`);
		});

		it("evaluates deep repeated DCS / APC sequences in linear time (< 15ms for 50,000 chars)", () => {
			const adversarialDcs = "\x1bP" + "X".repeat(50000) + "\x1b\\";
			const start = performance.now();
			const stripped = stripAnsi(adversarialDcs);
			const elapsed = performance.now() - start;

			assert.equal(stripped, "");
			assert.ok(elapsed < 15, `stripAnsi took ${elapsed.toFixed(2)}ms (target < 15ms)`);
		});

		it("evaluates alternating escape delimiters without catastrophic backtracking (< 15ms)", () => {
			const adversarialNested = ("\x1b[31m\x1b]8;;\x07\x1b[0m".repeat(1000) + "text").repeat(5);
			const start = performance.now();
			const stripped = stripAnsi(adversarialNested);
			const elapsed = performance.now() - start;

			assert.equal(stripped, "text".repeat(5));
			assert.ok(elapsed < 15, `stripAnsi took ${elapsed.toFixed(2)}ms (target < 15ms)`);
		});

		it("evaluates sanitizeControlChars on 100,000 chars of control bytes in linear time (< 10ms)", () => {
			const adversarialControls = "\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0e\x0f".repeat(10000) + "SafeContent";
			const start = performance.now();
			const cleaned = sanitizeControlChars(adversarialControls);
			const elapsed = performance.now() - start;

			assert.equal(cleaned, "SafeContent");
			assert.ok(elapsed < 10, `sanitizeControlChars took ${elapsed.toFixed(2)}ms (target < 10ms)`);
		});

		it("evaluates visibleWidth on adversarial strings in linear time (< 15ms)", () => {
			const adversarialWidthStr = "\x1b[38;2;255;0;0m" + "e\u0301".repeat(10000) + "\x1b[0m";
			const start = performance.now();
			const width = visibleWidth(adversarialWidthStr);
			const elapsed = performance.now() - start;

			assert.equal(width, 10000);
			assert.ok(elapsed < 15, `visibleWidth took ${elapsed.toFixed(2)}ms (target < 15ms)`);
		});
	});

	describe("prototype pollution & object poisoning", () => {
		it("safely handles __proto__, constructor, and toString in color lookups", () => {
			assert.equal(fgAnsi("__proto__"), "\x1b[39m");
			assert.equal(fgAnsi("constructor"), "\x1b[39m");
			assert.equal(fgAnsi("toString"), "\x1b[39m");
			assert.equal(fgAnsi("valueOf"), "\x1b[39m");

			assert.equal(fg("__proto__", "test"), "\x1b[39mtest\x1b[39m");
			assert.equal(fg("constructor", "test"), "\x1b[39mtest\x1b[39m");
		});

		it("safely handles poisoned theme objects without throwing or state leakage", () => {
			const poisonedTheme = Object.create(null);
			poisonedTheme.name = "__proto__";
			poisonedTheme.fg = Object.prototype.toString; // Not a typical fg function

			const controller = new SpinnerController();
			const paint = controller.paintFor(poisonedTheme as any);

			assert.equal(typeof paint.accent, "function");
			assert.equal(typeof paint.shimmer, "function");
			assert.equal(typeof paint.dim, "function");

			// Dim should fallback to default dim sequence without throwing
			const dimResult = paint.dim("hello");
			assert.ok(dimResult.includes("hello"));

			controller.dispose();
		});

		it("safely handles poisoned event payloads with prototype pollution attempts", () => {
			const controller = new SpinnerController();
			const mockCtx = {
				hasUI: true,
				ui: {
					theme: { name: "claude-code-dark" },
					setWorkingIndicator() {},
					setTitle() {},
					setWorkingMessage() {},
				},
			} as unknown as ExtensionContext;

			const poisonedUpdateEvent = JSON.parse(
				'{"type":"message_update","__proto__":{"polluted":true},"assistantMessageEvent":{"type":"text_delta","partial":{"usage":{"output":500}}}}',
			);

			assert.doesNotThrow(() => {
				controller.handleMessageUpdate(poisonedUpdateEvent as MessageUpdateEvent, mockCtx);
			});

			assert.equal(controller.getState().streamTokens, 500);
			// Verify Object prototype was not polluted
			assert.equal((Object.prototype as any).polluted, undefined);

			const poisonedEndEvent = JSON.parse(
				'{"type":"message_end","__proto__":{"admin":true},"message":{"role":"assistant","usage":{"output":500}}}',
			);

			assert.doesNotThrow(() => {
				controller.handleMessageEnd(poisonedEndEvent as MessageEndEvent, mockCtx);
			});

			assert.equal((Object.prototype as any).admin, undefined);

			controller.dispose();
		});

		it("safely handles circular references and throwing getters in events", () => {
			const controller = new SpinnerController();
			const mockCtx = {
				hasUI: true,
				ui: {
					theme: { name: "claude-code-dark" },
					setWorkingIndicator() {},
					setTitle() {},
					setWorkingMessage() {},
				},
			} as unknown as ExtensionContext;

			const evilEvent: any = {
				type: "message_update",
				assistantMessageEvent: {},
			};
			evilEvent.assistantMessageEvent.self = evilEvent;
			Object.defineProperty(evilEvent.assistantMessageEvent, "type", {
				get() {
					return "thinking_start";
				},
			});

			assert.doesNotThrow(() => {
				controller.handleMessageUpdate(evilEvent as MessageUpdateEvent, mockCtx);
			});
			assert.equal(controller.getState().thinkingStatus, "thinking");

			controller.dispose();
		});
	});

	describe("type coercion & defensive boundary fuzzing", () => {
		it("safely handles non-primitive types passed to formatTokenCount", () => {
			assert.equal(formatTokenCount(null as any), "0");
			assert.equal(formatTokenCount(undefined as any), "0");
			assert.equal(formatTokenCount(true as any), "0");
			assert.equal(formatTokenCount(false as any), "0");
			assert.equal(formatTokenCount("1000" as any), "0");
			assert.equal(formatTokenCount({} as any), "0");
			assert.equal(formatTokenCount([] as any), "0");
			assert.equal(formatTokenCount(Symbol("test") as any), "0");
			assert.equal(formatTokenCount(Number.POSITIVE_INFINITY), "0");
			assert.equal(formatTokenCount(Number.NEGATIVE_INFINITY), "0");
			assert.equal(formatTokenCount(Number.MAX_SAFE_INTEGER), "9007199254.7M");
		});

		it("safely handles non-primitive types passed to formatElapsed", () => {
			assert.equal(formatElapsed(null as any), "0sn");
			assert.equal(formatElapsed(undefined as any), "0sn");
			assert.equal(formatElapsed(true as any), "0sn");
			assert.equal(formatElapsed("5000" as any), "0sn");
			assert.equal(formatElapsed({} as any), "0sn");
			assert.equal(formatElapsed([] as any), "0sn");
			assert.equal(formatElapsed(Symbol("test") as any), "0sn");
			assert.equal(formatElapsed(Number.POSITIVE_INFINITY), "0sn");
			assert.equal(formatElapsed(Number.NEGATIVE_INFINITY), "0sn");
		});

		it("safely handles non-primitive types passed to hexToRgb and rgbTo256", () => {
			assert.deepEqual(hexToRgb(null as any), { r: 0, g: 0, b: 0 });
			assert.deepEqual(hexToRgb(undefined as any), { r: 0, g: 0, b: 0 });
			assert.deepEqual(hexToRgb(123456 as any), { r: 0, g: 0, b: 0 });
			assert.deepEqual(hexToRgb({} as any), { r: 0, g: 0, b: 0 });
			assert.deepEqual(hexToRgb(Symbol("test") as any), { r: 0, g: 0, b: 0 });

			assert.equal(rgbTo256(null as any, null as any, null as any), 16);
			assert.equal(rgbTo256(undefined as any, undefined as any, undefined as any), 16);
			assert.equal(rgbTo256(Number.NaN, Number.POSITIVE_INFINITY, -100), 16);
		});

		it("safely handles non-primitive types passed to visibleWidth and stripAnsi", () => {
			assert.equal(visibleWidth(null as any), 0);
			assert.equal(visibleWidth(undefined as any), 0);
			assert.equal(visibleWidth(123 as any), 0);
			assert.equal(visibleWidth({} as any), 0);
			assert.equal(visibleWidth([] as any), 0);
			assert.equal(visibleWidth(Symbol("test") as any), 0);

			assert.equal(stripAnsi(null as any), "");
			assert.equal(stripAnsi(undefined as any), "");
			assert.equal(stripAnsi(123 as any), "");
			assert.equal(stripAnsi({} as any), "");
		});

		it("safely handles extreme column values in buildSpinnerLine (negative, zero, NaN, huge)", () => {
			const state: SpinnerFrameState = {
				verb: "İşleniyor",
				timeMs: 1000,
				columns: -50,
			};
			const lineNegative = buildSpinnerLine(state, mockPaint);
			assert.ok(lineNegative.length > 0);

			const lineZero = buildSpinnerLine({ ...state, columns: 0 }, mockPaint);
			assert.ok(lineZero.length > 0);

			const lineNaN = buildSpinnerLine({ ...state, columns: Number.NaN }, mockPaint);
			assert.ok(lineNaN.length > 0);

			const lineHuge = buildSpinnerLine({ ...state, columns: 100_000 }, mockPaint);
			assert.ok(lineHuge.length > 0);
		});
	});

	describe("safe ANSI preservation & control character stripping", () => {
		it("preserves legitimate SGR styling (truecolor, 256color, reset, dim) while stripping all injection vectors", () => {
			const safeStyled = `\x1b[38;2;215;119;87m✻\x1b[39m \x1b[38;2;215;119;87mİşleniyor…\x1b[39m \x1b[2m(12sn · ↓ 1.2k token)\x1b[22m`;
			const injectedStyled = `${safeStyled}\x1b]52;c;evil\x07\x1b[2J\r\n`;

			assert.equal(sanitizeSafeAnsi(safeStyled), safeStyled);
			assert.equal(sanitizeSafeAnsi(injectedStyled), safeStyled);
		});

		it("verifies setVerb strips injection payloads and retains clean Turkish verb", () => {
			const controller = new SpinnerController();
			controller.setVerb("  \x1b[31mÖzelleştirilmiş\x1b[0m\x1b]52;c;payload\x07\r\n  ");
			assert.equal(controller.getVerb(), "Özelleştirilmiş");

			controller.setVerb("\x1b[2J\r\n");
			assert.equal(controller.getVerb(), "İşleniyor"); // Falls back to default when stripped to empty

			controller.dispose();
		});
	});
});
