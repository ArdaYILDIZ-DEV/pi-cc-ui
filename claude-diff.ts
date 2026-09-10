/**
 * Claude Code style diff renderer for the edit tool.
 *
 * Renders diffs with:
 * - Line numbers and signs: `<lineNum> <sign> <code>` (e.g. `60 + `, `54 - `, `61   `)
 * - Full-width solid backgrounds (dark green `#0d3516` for added, dark red `#420c10` for removed)
 * - Intra-line token diffing via `Diff.diffWords` with highlighted word backgrounds
 * - Syntax highlighting via Pi theme & highlightCode
 * - Responsive terminal width padding and line wrapping with continuation gutter
 */

import {
	getLanguageFromPath,
	highlightCode,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import * as Diff from "diff";
import {
	bgAnsi,
	fgAnsi,
	FG_DEFAULT,
	RESET,
	resolvePalette,
} from "./palette.ts";

export interface DiffLine {
	readonly type: "added" | "removed" | "context" | "ellipsis";
	readonly lineNum?: number;
	readonly content: string;
	readonly cleanContent: string;
	highlighted: string;
	wordParts?: Diff.Change[];
}

export interface DiffThemeColors {
	readonly diffAddedBg: string;
	readonly diffAddedWord: string;
	readonly diffAddedGutter: string;
	readonly diffRemovedBg: string;
	readonly diffRemovedWord: string;
	readonly diffRemovedGutter: string;
	readonly diffContextGutter: string;
}

export function getDiffThemeColors(
	theme?: Theme | { name?: string },
): DiffThemeColors {
	const palette = resolvePalette(theme?.name);
	if (palette.scheme === "light") {
		return {
			diffAddedBg: "#D7EAD9",
			diffAddedWord: "#B2D8B6",
			diffAddedGutter: "#2E7D32",
			diffRemovedBg: "#F7D8DC",
			diffRemovedWord: "#EEB5BD",
			diffRemovedGutter: "#C62828",
			diffContextGutter: "#767676",
		};
	}
	return {
		diffAddedBg: "#0d3516",
		diffAddedWord: "#1f5926",
		diffAddedGutter: "#4EBA65",
		diffRemovedBg: "#420c10",
		diffRemovedWord: "#7a2936",
		diffRemovedGutter: "#FF6B80",
		diffContextGutter: "#6B7280",
	};
}

/**
 * Parses Pi diff output string (from generateDiffString) into structured lines.
 * Format of input lines:
 * "+ 60 content" or "+60 content"
 * "- 54 content" or "-54 content"
 * "  61 content"
 * "     ..."
 */
export function parseDiffText(diffText: string): {
	lines: DiffLine[];
	maxLineNum: number;
} {
	if (!diffText || typeof diffText !== "string") {
		return { lines: [], maxLineNum: 1 };
	}

	const rawLines = diffText.split(/\r?\n/);
	// Drop trailing blank line produced by split on trailing newline
	if (
		rawLines.length > 0 &&
		rawLines[rawLines.length - 1] === "" &&
		diffText.endsWith("\n")
	) {
		rawLines.pop();
	}

	const lines: DiffLine[] = [];
	let maxLineNum = 1;

	for (const rawLine of rawLines) {
		const match = rawLine.match(/^([+-\s])(\s*\d*)\s(.*)$/);
		if (!match) {
			const trimmed = rawLine.trim();
			if (trimmed.length > 0) {
				lines.push({
					type: "ellipsis",
					content: trimmed,
					cleanContent: trimmed,
					highlighted: trimmed,
				});
			}
			continue;
		}

		const prefix = match[1]!;
		const numStr = match[2]!.trim();
		const content = match[3] ?? "";
		const cleanContent = content.replace(/\t/g, "   ");
		const lineNum = numStr.length > 0 ? parseInt(numStr, 10) : undefined;

		if (lineNum !== undefined && !Number.isNaN(lineNum) && lineNum > maxLineNum) {
			maxLineNum = lineNum;
		}

		let type: DiffLine["type"] = "context";
		if (prefix === "+") {
			type = "added";
		} else if (prefix === "-") {
			type = "removed";
		} else if (!numStr && cleanContent.startsWith("...")) {
			type = "ellipsis";
		}

		lines.push({
			type,
			lineNum,
			content,
			cleanContent,
			highlighted: cleanContent,
		});
	}

	return { lines, maxLineNum };
}

interface WordRange {
	start: number;
	end: number;
}

export function getWordRanges(
	parts: Diff.Change[],
	isAdded: boolean,
): WordRange[] {
	const ranges: WordRange[] = [];
	let pos = 0;
	for (const part of parts) {
		if (isAdded) {
			if (part.removed) continue;
			if (part.added) {
				ranges.push({ start: pos, end: pos + part.value.length });
			}
			pos += part.value.length;
		} else {
			if (part.added) continue;
			if (part.removed) {
				ranges.push({ start: pos, end: pos + part.value.length });
			}
			pos += part.value.length;
		}
	}
	return ranges;
}

/**
 * Injects token-level word background escape codes into a syntax-highlighted line
 * without corrupting active foreground styling.
 */
export function applyIntraLineBg(
	highlightedLine: string,
	parts: Diff.Change[],
	isAdded: boolean,
	baseBg: string,
	wordBg: string,
): string {
	const ranges = getWordRanges(parts, isAdded);
	if (ranges.length === 0) return highlightedLine;

	let result = "";
	let visiblePos = 0;
	let inHighlight = false;
	let rangeIdx = 0;
	let j = 0;

	while (j < highlightedLine.length) {
		if (highlightedLine[j] === "\x1b") {
			const match = highlightedLine.slice(j).match(/^\x1b\[[0-9;]*m/);
			if (match) {
				result += match[0];
				j += match[0].length;
				continue;
			}
		}

		const inRange =
			rangeIdx < ranges.length &&
			visiblePos >= ranges[rangeIdx]!.start &&
			visiblePos < ranges[rangeIdx]!.end;

		if (inRange && !inHighlight) {
			result += wordBg;
			inHighlight = true;
		} else if (!inRange && inHighlight) {
			result += baseBg;
			inHighlight = false;
			if (rangeIdx < ranges.length && visiblePos >= ranges[rangeIdx]!.end) {
				rangeIdx++;
			}
		}

		result += highlightedLine[j];
		visiblePos++;
		j++;
	}

	if (inHighlight) {
		result += baseBg;
	}

	return result;
}

/**
 * Pair single removed line with single added line to perform intra-line word diffing.
 */
export function pairIntraLineDiffs(lines: DiffLine[]): void {
	let i = 0;
	while (i < lines.length) {
		if (lines[i]!.type === "removed") {
			const removedList: DiffLine[] = [];
			while (i < lines.length && lines[i]!.type === "removed") {
				removedList.push(lines[i]!);
				i++;
			}
			const addedList: DiffLine[] = [];
			while (i < lines.length && lines[i]!.type === "added") {
				addedList.push(lines[i]!);
				i++;
			}
			if (removedList.length === 1 && addedList.length === 1) {
				const parts = Diff.diffWords(
					removedList[0]!.cleanContent,
					addedList[0]!.cleanContent,
				);
				removedList[0]!.wordParts = parts;
				addedList[0]!.wordParts = parts;
			}
		} else {
			i++;
		}
	}
}

/**
 * Applies syntax highlighting to parsed diff lines using Pi's syntax highlighter.
 */
export function applySyntaxHighlighting(
	lines: DiffLine[],
	filePath?: string,
): void {
	const lang = filePath ? getLanguageFromPath(filePath) : undefined;
	for (const line of lines) {
		if (line.type === "ellipsis") continue;
		if (line.cleanContent.length === 0) {
			line.highlighted = "";
			continue;
		}
		if (lang) {
			try {
				const [hl] = highlightCode(line.cleanContent, lang);
				line.highlighted = hl ?? line.cleanContent;
			} catch {
				line.highlighted = line.cleanContent;
			}
		} else {
			line.highlighted = line.cleanContent;
		}
	}
}

/**
 * Renders Claude Code style diff lines from raw diff text.
 */
export function renderClaudeDiffLines(
	diffText: string,
	filePath: string,
	theme?: Theme | { name?: string },
	width?: number,
): string[] {
	const { lines, maxLineNum } = parseDiffText(diffText);
	if (lines.length === 0) return [];

	applySyntaxHighlighting(lines, filePath);
	pairIntraLineDiffs(lines);

	const colors = getDiffThemeColors(theme);
	const targetWidth = Math.max(
		20,
		width ??
			(typeof process !== "undefined" && process.stdout?.columns
				? process.stdout.columns
				: 80),
	);

	const maxNumWidth = Math.max(1, String(maxLineNum).length);
	const gutterWidth = maxNumWidth + 3; // "<num> <sign> "
	const availCodeWidth = Math.max(10, targetWidth - gutterWidth);

	const output: string[] = [];

	for (const line of lines) {
		const paddedNum =
			line.lineNum === undefined
				? " ".repeat(maxNumWidth)
				: String(line.lineNum).padStart(maxNumWidth, " ");

		if (line.type === "added") {
			const baseBg = bgAnsi(colors.diffAddedBg);
			const wordBg = bgAnsi(colors.diffAddedWord);
			const gutterFg = fgAnsi(colors.diffAddedGutter);
			const code = line.wordParts
				? applyIntraLineBg(line.highlighted, line.wordParts, true, baseBg, wordBg)
				: line.highlighted;

			const wrapped =
				line.cleanContent.length > 0
					? wrapTextWithAnsi(baseBg + code, availCodeWidth)
					: [""];

			for (let r = 0; r < wrapped.length; r++) {
				const g =
					r === 0
						? `${baseBg}${gutterFg}${paddedNum} + ${FG_DEFAULT}`
						: `${baseBg}${" ".repeat(gutterWidth)}`;
				const row = g + wrapped[r]!;
				const visLen = visibleWidth(row);
				const pad = Math.max(0, targetWidth - visLen);
				output.push(`${row}${baseBg}${" ".repeat(pad)}${RESET}`);
			}
		} else if (line.type === "removed") {
			const baseBg = bgAnsi(colors.diffRemovedBg);
			const wordBg = bgAnsi(colors.diffRemovedWord);
			const gutterFg = fgAnsi(colors.diffRemovedGutter);
			const code = line.wordParts
				? applyIntraLineBg(line.highlighted, line.wordParts, false, baseBg, wordBg)
				: line.highlighted;

			const wrapped =
				line.cleanContent.length > 0
					? wrapTextWithAnsi(baseBg + code, availCodeWidth)
					: [""];

			for (let r = 0; r < wrapped.length; r++) {
				const g =
					r === 0
						? `${baseBg}${gutterFg}${paddedNum} - ${FG_DEFAULT}`
						: `${baseBg}${" ".repeat(gutterWidth)}`;
				const row = g + wrapped[r]!;
				const visLen = visibleWidth(row);
				const pad = Math.max(0, targetWidth - visLen);
				output.push(`${row}${baseBg}${" ".repeat(pad)}${RESET}`);
			}
		} else if (line.type === "context") {
			const gutterFg = fgAnsi(colors.diffContextGutter);
			const wrapped =
				line.cleanContent.length > 0
					? wrapTextWithAnsi(line.highlighted, availCodeWidth)
					: [""];

			for (let r = 0; r < wrapped.length; r++) {
				const g =
					r === 0
						? `${gutterFg}${paddedNum}   ${FG_DEFAULT}`
						: " ".repeat(gutterWidth);
				output.push(g + wrapped[r]!);
			}
		} else {
			// ellipsis
			const gutterFg = fgAnsi(colors.diffContextGutter);
			output.push(
				`${" ".repeat(gutterWidth)}${gutterFg}${line.content}${FG_DEFAULT}`,
			);
		}
	}

	return output;
}

/**
 * Pi TUI compatible Component that renders Claude Code style diffs.
 */
export class ClaudeDiffComponent {
	readonly diffText: string;
	readonly filePath: string;
	readonly theme?: Theme;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(diffText: string, filePath: string, theme?: Theme) {
		this.diffText = diffText;
		this.filePath = filePath;
		this.theme = theme;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}
		const lines = renderClaudeDiffLines(
			this.diffText,
			this.filePath,
			this.theme,
			width,
		);
		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}
