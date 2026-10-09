import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Theme } from "@earendil-works/pi-coding-agent";
import { colorToHex, mixColors, visibleWidth } from "@earendil-works/pi-tui";
import { SpinnerController } from "../spinner.ts";
import { CacheTimerController, buildCacheTimerLine } from "../cache-timer.ts";
import { getDiffThemeColors, renderToolDiffLines, ToolDiffComponent } from "../tool-diff.ts";
import { stripAnsi } from "../palette.ts";

function makeTheme(appearance: "dark" | "light", mode: "truecolor" | "256color" = "truecolor", accent = "#3377CC") {
	const text = appearance === "light" ? "#202020" : "#EEEEEE";
	const surface = appearance === "light" ? "#F4F4F4" : "#181818";
	const foreground: ConstructorParameters<typeof Theme>[0] = {
		accent, border: text, borderAccent: accent, borderMuted: text,
		success: "#4477BB", error: "#BB4477", warning: "#997744", muted: text, dim: text,
		text, thinkingText: "#7755AA", userMessageText: text, customMessageText: text, customMessageLabel: accent,
		toolTitle: text, toolOutput: text, mdHeading: accent, mdLink: accent, mdLinkUrl: text,
		mdCode: text, mdCodeBlock: text, mdCodeBlockBorder: text, mdQuote: text, mdQuoteBorder: text,
		mdHr: text, mdListBullet: accent, toolDiffAdded: "#2277AA", toolDiffRemoved: "#AA3377", toolDiffContext: "#777777",
		syntaxComment: text, syntaxKeyword: text, syntaxFunction: text, syntaxVariable: text,
		syntaxString: text, syntaxNumber: text, syntaxType: text, syntaxOperator: text, syntaxPunctuation: text,
		thinkingOff: text, thinkingMinimal: text, thinkingLow: text, thinkingMedium: text,
		thinkingHigh: text, thinkingXhigh: text, bashMode: accent,
	};
	const background: ConstructorParameters<typeof Theme>[1] = {
		selectedBg: surface, searchMatchBg: surface, userMessageBg: surface, customMessageBg: surface,
		toolPendingBg: surface, toolSuccessBg: surface, toolErrorBg: surface,
	};
	// The same deliberately misleading name tests that appearance and reloads
	// come from the host's theme object, not name heuristics.
	return new Theme(foreground, background, mode, { name: "white-custom", appearance });
}

describe("host theme integration", () => {
	it("uses semantic spinner colors and refreshes when a same-named theme is replaced", () => {
		const controller = new SpinnerController();
		try {
			for (const theme of [makeTheme("dark"), makeTheme("light", "256color", "#AA5599")]) {
				const paint = controller.paintFor(theme);
				assert.equal(paint.accent("work"), theme.fg("accent", "work"));
				assert.equal(paint.shimmer("work"), theme.fg("accent", "work"));
				assert.equal(paint.dim("time"), theme.fg("dim", "time"));
				assert.equal(paint.thinking!("thinking", 9000), theme.fg("thinkingText", "thinking"));
			}
		} finally {
			controller.dispose();
		}
	});

	it("uses host appearance, mode and semantic cache colors across same-named reloads", () => {
		const controller = new CacheTimerController({ soundEnabled: false });
		try {
			for (const theme of [makeTheme("dark"), makeTheme("light", "256color", "#AA5599")]) {
				const paint = controller.paintFor(theme);
				assert.equal(paint.scheme, theme.appearance);
				assert.equal(paint.colorMode, theme.getColorMode());
				assert.equal(paint.accent("cache"), theme.fg("accent", "cache"));
				for (const [elapsedMs, role, label] of [[0, "success", "0sn"], [180000, "warning", "3dk 0sn"], [300000, "error", "5dk 0sn"]] as const) {
					const row = buildCacheTimerLine({ elapsedMs, columns: 80, hasContext: true, isProcessing: false }, paint);
					assert.ok(row.includes(theme.fg(role, label)));
					assert.ok(visibleWidth(row) <= 80);
				}
			}
		} finally {
			controller.dispose();
		}
	});

	it("derives diff colors from the theme's diff roles and surfaces", () => {
		for (const appearance of ["dark", "light"] as const) {
			const theme = makeTheme(appearance);
			const colors = getDiffThemeColors(theme);
			assert.equal(colors.diffAddedGutter, colorToHex(theme.colors.toolDiffAdded));
			assert.equal(colors.diffRemovedGutter, colorToHex(theme.colors.toolDiffRemoved));
			assert.equal(colors.diffContextGutter, colorToHex(theme.colors.toolDiffContext));
			assert.equal(colors.diffAddedBg, colorToHex(mixColors(theme.colors.toolSuccessBg, theme.colors.toolDiffAdded, 0.12, "srgb")));
			assert.equal(colors.diffRemovedBg, colorToHex(mixColors(theme.colors.toolErrorBg, theme.colors.toolDiffRemoved, 0.12, "srgb")));
			assert.notEqual(colors.diffAddedBg, colors.diffAddedWord);
			assert.notEqual(colors.diffRemovedBg, colors.diffRemovedWord);
		}
	});

	it("honors 256-color rendering and retains diff text and signs at narrow widths", () => {
		const theme = makeTheme("light", "256color");
		for (const width of [20, 40, 80]) {
			const rows = renderToolDiffLines("-1 old value\n+1 new value\n 2 context", "", theme, width);
			assert.ok(rows.every((row) => visibleWidth(row) <= width));
			assert.ok(!rows.join("\n").match(/\x1b\[(?:38|48);2;/));
			assert.ok(rows.map(stripAnsi).join("\n").includes("1 + new value"));
			assert.ok(rows.map(stripAnsi).join("\n").includes("1 - old value"));
		}
	});

	it("re-resolves themed diff styles after invalidation without changing content", () => {
		const theme = makeTheme("dark");
		const component = new ToolDiffComponent("-1 old\n+1 new", "", theme);
		const first = component.render(40);
		component.invalidate();
		assert.deepEqual(component.render(40), first);
		assert.ok(first.join("\n").includes(theme.getFgAnsi("toolDiffAdded")));
	});

	it("retains usable fallback output when no host theme is available", () => {
		const spinner = new SpinnerController();
		const cache = new CacheTimerController({ soundEnabled: false });
		try {
			assert.equal(stripAnsi(spinner.paintFor().accent("work")), "work");
			assert.equal(stripAnsi(cache.paintFor().accent("cache")), "cache");
			assert.ok(renderToolDiffLines("+1 new", "", undefined, 40).map(stripAnsi).join("\n").includes("new"));
		} finally {
			spinner.dispose();
			cache.dispose();
		}
	});
});
