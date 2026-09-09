/**
 * Custom Claude Code Dark Palette & SGR ANSI formatting.
 * Hardcoded directly from /home/arda/.pi/agent/themes/claude-code-dark.json
 */

export interface Rgb {
	readonly r: number;
	readonly g: number;
	readonly b: number;
}

export function rgb(r: number, g: number, b: number): Rgb {
	return { r, g, b };
}

/**
 * Validates if a string is a valid 3-digit or 6-digit hex color (with optional leading #).
 */
export function isValidHex(hex: string): boolean {
	if (typeof hex !== "string" || hex.length === 0) return false;
	const start = hex.charCodeAt(0) === 35 ? 1 : 0; // 35 is '#'
	const len = hex.length - start;
	if (len !== 3 && len !== 6) return false;
	for (let i = start; i < hex.length; i++) {
		const code = hex.charCodeAt(i);
		const isHex =
			(code >= 48 && code <= 57) || // 0-9
			(code >= 65 && code <= 70) || // A-F
			(code >= 97 && code <= 102); // a-f
		if (!isHex) return false;
	}
	return true;
}

export function hexToRgb(hex: string): Rgb {
	if (typeof hex !== "string" || hex.length === 0) return { r: 0, g: 0, b: 0 };
	const start = hex.charCodeAt(0) === 35 ? 1 : 0; // 35 is '#'
	const cleanHex = start === 1 ? hex.slice(1) : hex;
	if (cleanHex.length !== 3 && cleanHex.length !== 6) return { r: 0, g: 0, b: 0 };

	// Validate hex characters strictly [0-9a-fA-F]
	for (let i = 0; i < cleanHex.length; i++) {
		const code = cleanHex.charCodeAt(i);
		const isHex =
			(code >= 48 && code <= 57) || // 0-9
			(code >= 65 && code <= 70) || // A-F
			(code >= 97 && code <= 102); // a-f
		if (!isHex) return { r: 0, g: 0, b: 0 };
	}

	if (cleanHex.length === 3) {
		const r = parseInt(cleanHex[0]! + cleanHex[0]!, 16);
		const g = parseInt(cleanHex[1]! + cleanHex[1]!, 16);
		const b = parseInt(cleanHex[2]! + cleanHex[2]!, 16);
		return {
			r: Number.isNaN(r) ? 0 : r,
			g: Number.isNaN(g) ? 0 : g,
			b: Number.isNaN(b) ? 0 : b,
		};
	}

	const r = parseInt(cleanHex.slice(0, 2), 16);
	const g = parseInt(cleanHex.slice(2, 4), 16);
	const b = parseInt(cleanHex.slice(4, 6), 16);
	return {
		r: Number.isNaN(r) ? 0 : r,
		g: Number.isNaN(g) ? 0 : g,
		b: Number.isNaN(b) ? 0 : b,
	};
}

/**
 * Maps 24-bit RGB values to the nearest xterm 256-color index.
 */
export function rgbTo256(r: number, g: number, b: number): number {
	const cr = typeof r === "number" && Number.isFinite(r) ? Math.max(0, Math.min(255, Math.floor(r))) : 0;
	const cg = typeof g === "number" && Number.isFinite(g) ? Math.max(0, Math.min(255, Math.floor(g))) : 0;
	const cb = typeof b === "number" && Number.isFinite(b) ? Math.max(0, Math.min(255, Math.floor(b))) : 0;

	// Grayscale ramp check (232-255)
	if (cr === cg && cg === cb) {
		if (cr < 8) return 16;
		if (cr > 248) return 231;
		return Math.round(((cr - 8) / 240) * 23) + 232;
	}

	// 6x6x6 color cube: 16 + 36*r6 + 6*g6 + b6
	const toCube = (v: number): number => {
		if (v < 48) return 0;
		if (v < 115) return 1;
		return Math.min(5, Math.floor((v - 35) / 40));
	};

	return 16 + 36 * toCube(cr) + 6 * toCube(cg) + toCube(cb);
}

export type ColorValue = string | number;
export type ColorMode = "truecolor" | "256color";

/** Direct colors from /home/arda/.pi/agent/themes/claude-code-dark.json */
export interface CcPalette {
	readonly claude: ColorValue;
	readonly claudeShimmer: ColorValue;
	readonly autoAccept: ColorValue;
	readonly bashBorder: ColorValue;
	readonly permission: ColorValue;
	readonly planMode: ColorValue;
	readonly promptBorder: ColorValue;
	readonly inactive: ColorValue;
	readonly subtle: ColorValue;
	readonly success: ColorValue;
	readonly error: ColorValue;
	readonly warning: ColorValue;
	readonly diffAddedBg: ColorValue;
	readonly diffRemovedBg: ColorValue;
	readonly diffAddedWord: ColorValue;
	readonly diffRemovedWord: ColorValue;
	readonly userMsgBg: ColorValue;
	readonly selectionBg: ColorValue;
	readonly bashMsgBg: ColorValue;
}

export const CLAUDE_CODE_DARK_PALETTE: CcPalette = {
	claude: "#D77757",
	claudeShimmer: "#EB9F7F",
	autoAccept: "#AF87FF",
	bashBorder: "#FD5DB1",
	permission: "#B1B9F9",
	planMode: "#48968C",
	promptBorder: "#888888",
	inactive: "#999999",
	subtle: "#505050",
	success: "#4EBA65",
	error: "#FF6B80",
	warning: "#FFC107",
	diffAddedBg: "#225C2B",
	diffRemovedBg: "#7A2936",
	diffAddedWord: "#38A660",
	diffRemovedWord: "#B3596B",
	userMsgBg: "#373737",
	selectionBg: "#264F78",
	bashMsgBg: "#413C41",
};

/** High-contrast palette for light terminal backgrounds */
export const CLAUDE_CODE_LIGHT_PALETTE: CcPalette = {
	claude: "#B84E2D",
	claudeShimmer: "#D97757",
	autoAccept: "#7C4DFF",
	bashBorder: "#C2185B",
	permission: "#5C6BC0",
	planMode: "#00796B",
	promptBorder: "#666666",
	inactive: "#767676",
	subtle: "#9E9E9E",
	success: "#2E7D32",
	error: "#C62828",
	warning: "#E65100",
	diffAddedBg: "#D7EAD9",
	diffRemovedBg: "#F7D8DC",
	diffAddedWord: "#1B5E20",
	diffRemovedWord: "#B71C1C",
	userMsgBg: "#E0E0E0",
	selectionBg: "#BBD6FB",
	bashMsgBg: "#E8E4E8",
};

export const RESET = "\x1b[0m";
export const FG_DEFAULT = "\x1b[39m";
export const BG_DEFAULT = "\x1b[49m";

// Hoisted compiled regex for comprehensive ANSI and terminal control escape sequences:
// - CSI (7-bit \x1b[ and 8-bit \x9b)
// - OSC (7-bit \x1b] and 8-bit \x9d terminated by \x07, \x1b\, \x9c, or end of string)
// - DCS / APC / PM / SOS (7-bit \x1bP/X/^_ and 8-bit \x90/\x98/\x9e/\x9f)
// - 2-byte escape sequences (\x1b followed by character in 0x20-0x7e)
// - Standalone / dangling ESC (\x1b)
export const ANSI_REGEX =
	/(?:\x1b\[|\x9b)[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|(?:\x1b\]|\x9d)[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c|$)|(?:\x1b[PX^_]|[\x90\x98\x9e\x9f])[^\x1b\x9c\x07]*(?:\x1b\\|\x9c|\x07|$)|(?:\x1b[()#%*+\-./][^\x1b\x07]?|\x1b[A-Za-z0-9=@<>])|\x1b/g;

// Matches all C0 and C1 control characters (0x00-0x1f, 0x7f, 0x80-0x9f)
export const CONTROL_CHARS_REGEX = /[\x00-\x1f\x7f-\x9f]/g;

// Regex for stripping unsafe control characters and non-SGR escapes while preserving safe SGR sequences (\x1b[...m)
const NON_SGR_ANSI_OR_UNSAFE_CONTROLS =
	/(?:\x1b\[|\x9b)[\x30-\x3f]*[\x20-\x2f]*[@-ln-~]|(?:\x1b\]|\x9d)[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c|$)|(?:\x1b[PX^_]|[\x90\x98\x9e\x9f])[^\x1b\x9c\x07]*(?:\x1b\\|\x9c|\x07|$)|(?:\x1b[()#%*+\-./][^\x1b\x07]?|\x1b[A-Za-z0-9=@<>])|[\x00-\x1a\x1c-\x1f\x7f-\x9f]|\x1b(?![\[0-9;]*m)/g;

// Precomputed 256-color number ANSI escape sequences (0-255)
const ANSI_256_NUMBERS: readonly string[] = Array.from({ length: 256 }, (_, i) =>
	i < 8 ? `\x1b[${30 + i}m` : i < 16 ? `\x1b[${82 + i}m` : `\x1b[38;5;${i}m`,
);

// Bounded fast ANSI cache for hot-path colors
const MAX_ANSI_CACHE_SIZE = 512;
const ANSI_CACHE = new Map<string, string>();

// Pre-seed cache with standard dark and light palette tokens
function preseedPalette(palette: CcPalette): void {
	for (const key of Object.keys(palette) as (keyof CcPalette)[]) {
		const val = palette[key];
		if (typeof val === "string") {
			const { r, g, b } = hexToRgb(val);
			ANSI_CACHE.set(`truecolor:${val}`, `\x1b[38;2;${r};${g};${b}m`);
			ANSI_CACHE.set(`256color:${val}`, `\x1b[38;5;${rgbTo256(r, g, b)}m`);
		}
	}
}
preseedPalette(CLAUDE_CODE_DARK_PALETTE);
preseedPalette(CLAUDE_CODE_LIGHT_PALETTE);

/** Strip ANSI and terminal control escape sequences from a string */
export function stripAnsi(text: string): string {
	if (!text || typeof text !== "string") return "";
	if (
		!text.includes("\x1b") &&
		!text.includes("\x9b") &&
		!text.includes("\x9d") &&
		!text.includes("\x90") &&
		!text.includes("\x98") &&
		!text.includes("\x9e") &&
		!text.includes("\x9f")
	) {
		return text;
	}
	return text.replace(ANSI_REGEX, "");
}

/**
 * Strips all C0 and C1 control characters (e.g. \x00-\x1f, \x7f-\x9f, \r, \n, \t, \x07, \x08).
 */
export function sanitizeControlChars(text: string): string {
	if (!text || typeof text !== "string") return "";
	let hasControl = false;
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (code < 32 || (code >= 127 && code <= 159)) {
			hasControl = true;
			break;
		}
	}
	if (!hasControl) return text;
	return text.replace(CONTROL_CHARS_REGEX, "");
}

/**
 * Sanitizes terminal window/tab titles against terminal injection attacks.
 * Strips all ANSI sequences, control characters, newlines, and collapses spaces.
 */
export function sanitizeTitle(title: string): string {
	if (!title || typeof title !== "string") return "";
	const clean = stripAnsi(title)
		.replace(/[\x00-\x1f\x7f-\x9f\s]+/g, " ")
		.trim();
	return clean.normalize("NFC");
}

/**
 * Sanitizes a formatted terminal string by stripping all unsafe escape sequences
 * (OSC, DCS, APC, PM, cursor movement, clears) and raw control characters (newlines, bells),
 * while preserving safe SGR styling escape sequences (\x1b[...m).
 */
export function sanitizeSafeAnsi(text: string): string {
	if (!text || typeof text !== "string") return "";
	if (
		!text.includes("\x1b") &&
		!text.includes("\x9b") &&
		!text.includes("\x9d") &&
		!text.includes("\x90") &&
		!text.includes("\x98") &&
		!text.includes("\x9e") &&
		!text.includes("\x9f")
	) {
		let hasControl = false;
		for (let i = 0; i < text.length; i++) {
			const code = text.charCodeAt(i);
			if (code < 32 || (code >= 127 && code <= 159)) {
				hasControl = true;
				break;
			}
		}
		if (!hasControl) return text;
	}
	return text.replace(NON_SGR_ANSI_OR_UNSAFE_CONTROLS, "");
}

/**
 * Calculate the visible width of a string in terminal columns.
 * Fast-paths printable ASCII strings without ANSI. Properly ignores ANSI escape
 * sequences, normalizes Unicode, accounts for zero-width combining marks, and
 * measures fullwidth / East Asian characters as 2 columns.
 */
export function visibleWidth(str: string): number {
	if (!str || typeof str !== "string") return 0;

	let width = 0;
	const len = str.length;

	for (let i = 0; i < len; i++) {
		const code = str.charCodeAt(i);

		// 1. Fast path for printable ASCII (0x20..0x7e)
		if (code >= 0x20 && code <= 0x7e) {
			width += 1;
			continue;
		}

		// 2. Fast path for Latin-1 / European / Turkish extended (0xa0..0x2ff)
		if (code >= 0xa0 && code < 0x0300) {
			if (code !== 0x00ad) {
				width += 1;
			}
			continue;
		}

		// 3. Fast path for common Unicode symbols, punctuation, arrows (0x2000..0x2e7f)
		if (code >= 0x2000 && code < 0x2e80) {
			if ((code >= 0x200b && code <= 0x200f) || (code >= 0x20d0 && code <= 0x20ff)) {
				continue;
			}
			if (code === 0x2329 || code === 0x232a) {
				width += 2;
			} else {
				width += 1;
			}
			continue;
		}

		// 4. ESC (7-bit) control sequence
		if (code === 0x1b) {
			if (i + 1 < len) {
				const next = str.charCodeAt(i + 1);
				if (next === 0x5b) {
					// CSI: \x1b[ ... [@-~]
					i += 2;
					while (i < len) {
						const c = str.charCodeAt(i);
						if (c >= 0x40 && c <= 0x7e) break;
						i++;
					}
					continue;
				}
				if (next === 0x5d) {
					// OSC: \x1b] ... (\x07 | \x1b\ | \x9c)
					i += 2;
					while (i < len) {
						const c = str.charCodeAt(i);
						if (c === 0x07 || c === 0x9c) break;
						if (c === 0x1b && i + 1 < len && str.charCodeAt(i + 1) === 0x5c) {
							i++;
							break;
						}
						i++;
					}
					continue;
				}
				if (next === 0x50 || next === 0x58 || next === 0x5e || next === 0x5f) {
					// DCS / APC / PM / SOS
					i += 2;
					while (i < len) {
						const c = str.charCodeAt(i);
						if (c === 0x07 || c === 0x9c) break;
						if (c === 0x1b && i + 1 < len && str.charCodeAt(i + 1) === 0x5c) {
							i++;
							break;
						}
						i++;
					}
					continue;
				}
				if (
					(next >= 0x28 && next <= 0x2f) || // ()*+,-./
					next === 0x23 || // #
					next === 0x25 // %
				) {
					i += 2;
					continue;
				}
				if (
					(next >= 0x41 && next <= 0x5a) || // A-Z
					(next >= 0x61 && next <= 0x7a) || // a-z
					(next >= 0x30 && next <= 0x39) || // 0-9
					next === 0x3d ||
					next === 0x40 ||
					next === 0x3c ||
					next === 0x3e
				) {
					i += 1;
					continue;
				}
			}
			continue;
		}

		// 8-bit CSI (\x9b)
		if (code === 0x9b) {
			i += 1;
			while (i < len) {
				const c = str.charCodeAt(i);
				if (c >= 0x40 && c <= 0x7e) break;
				i++;
			}
			continue;
		}

		// 8-bit OSC (\x9d) / DCS (\x90) / APC (\x9f) / PM (\x9e) / SOS (\x98)
		if (code === 0x9d || code === 0x90 || code === 0x98 || code === 0x9e || code === 0x9f) {
			i += 1;
			while (i < len) {
				const c = str.charCodeAt(i);
				if (c === 0x07 || c === 0x9c) break;
				if (c === 0x1b && i + 1 < len && str.charCodeAt(i + 1) === 0x5c) {
					i++;
					break;
				}
				i++;
			}
			continue;
		}

		// Astral code point / surrogate pair
		if (code >= 0xd800 && code <= 0xdbff) {
			const cp = str.codePointAt(i);
			if (cp !== undefined && cp > 0xffff) {
				i++; // Skip low surrogate
				if (cp >= 0x1f000 && cp <= 0x1faff) {
					width += 2;
				} else {
					width += 1;
				}
				continue;
			}
		}

		// Zero width: Control characters, combining diacritical marks, zero-width spaces, soft hyphen, variation selectors
		if (
			code <= 0x001f ||
			(code >= 0x007f && code <= 0x009f) ||
			(code >= 0x0300 && code <= 0x036f) ||
			(code >= 0x1ab0 && code <= 0x1aff) ||
			(code >= 0x1dc0 && code <= 0x1dff) ||
			(code >= 0xfe00 && code <= 0xfe0f) ||
			(code >= 0xfe20 && code <= 0xfe2f) ||
			code === 0x00ad
		) {
			continue;
		}

		// Fullwidth / East Asian Wide: CJK ideographs, fullwidth forms, wide emojis
		if (
			(code >= 0x1100 && code <= 0x115f) ||
			(code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
			(code >= 0xac00 && code <= 0xd7a3) ||
			(code >= 0xf900 && code <= 0xfaff) ||
			(code >= 0xfe10 && code <= 0xfe19) ||
			(code >= 0xfe30 && code <= 0xfe6f) ||
			(code >= 0xff01 && code <= 0xff60) ||
			(code >= 0xffe0 && code <= 0xffe6)
		) {
			width += 2;
		} else {
			width += 1;
		}
	}
	return width;
}

export function fgAnsi(color: ColorValue, mode: ColorMode = "truecolor"): string {
	if (typeof color !== "string" && typeof color !== "number") return FG_DEFAULT;

	if (typeof color === "number") {
		if (!Number.isFinite(color) || Number.isNaN(color) || color < 0 || color > 255) {
			return FG_DEFAULT;
		}
		return ANSI_256_NUMBERS[Math.floor(color)] ?? FG_DEFAULT;
	}

	if (!isValidHex(color)) {
		return FG_DEFAULT;
	}

	const safeMode = mode === "256color" ? "256color" : "truecolor";
	const cacheKey = `${safeMode}:${color}`;
	const hit = ANSI_CACHE.get(cacheKey);
	if (hit !== undefined) return hit;

	const { r, g, b } = hexToRgb(color);
	let ansi: string;
	if (safeMode === "256color") {
		const c256 = rgbTo256(r, g, b);
		ansi = `\x1b[38;5;${c256}m`;
	} else {
		ansi = `\x1b[38;2;${r};${g};${b}m`;
	}

	if (ANSI_CACHE.size >= MAX_ANSI_CACHE_SIZE) {
		// Prune cache if bounded size is reached while retaining preseeded entries
		ANSI_CACHE.clear();
		preseedPalette(CLAUDE_CODE_DARK_PALETTE);
		preseedPalette(CLAUDE_CODE_LIGHT_PALETTE);
	}
	ANSI_CACHE.set(cacheKey, ansi);
	return ansi;
}

export function fg(color: ColorValue, text: string, mode: ColorMode = "truecolor"): string {
	if (typeof text !== "string" || text === "") return "";
	return `${fgAnsi(color, mode)}${text}${FG_DEFAULT}`;
}

export interface ResolvedPalette {
	readonly cc: CcPalette;
	readonly scheme: "dark" | "light";
	readonly isCcTheme: true;
	readonly colorMode: ColorMode;
}

/**
 * Resolves the palette based on theme name (dark vs light).
 */
export function resolvePalette(
	themeName?: string,
	_tokenFg?: (token: string) => string | undefined,
): ResolvedPalette {
	const isLight = typeof themeName === "string" && /light|latte|day|dawn|white/i.test(themeName);
	return {
		cc: isLight ? CLAUDE_CODE_LIGHT_PALETTE : CLAUDE_CODE_DARK_PALETTE,
		scheme: isLight ? "light" : "dark",
		isCcTheme: true,
		colorMode: "truecolor",
	};
}
