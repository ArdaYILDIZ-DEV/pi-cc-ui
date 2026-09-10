import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import * as Diff from "diff";
import {
	applyIntraLineBg,
	ClaudeDiffComponent,
	getDiffThemeColors,
	getWordRanges,
	pairIntraLineDiffs,
	parseDiffText,
	renderClaudeDiffLines,
} from "../claude-diff.ts";
import { stripAnsi } from "../palette.ts";

const SAMPLE_DIFF = `+ 60 
  61   const webpBuffer = await sharp(req.file.buffer).webp({ quality: 80 }).toBuffer();
  62   const filename = \`\${req.user!.userId}-\${Date.now()}.webp\`;
- 54   const filePath = path.join(__dirname, "../../uploads/avatars", filename);
+ 63   const filePath = path.join(uploadsDir, filename);
  64   await fs.promises.writeFile(filePath, webpBuffer);
  65 
  66   const avatarUrl = \`/uploads/avatars/\${filename}\`;
  67   const user = updateUser(req.user!.userId, { avatar_url: avatarUrl });
  68   res.json(user);
- 60 } catch {
+ 69 } catch (err) {
  70   res.status(422).json({ error: "Failed to process image" });
  71 }
  72 });`;

describe("claude-diff parser and helpers", () => {
	describe("parseDiffText", () => {
		it("safely handles empty or null input", () => {
			assert.deepEqual(parseDiffText(""), { lines: [], maxLineNum: 1 });
			assert.deepEqual(parseDiffText(null as unknown as string), {
				lines: [],
				maxLineNum: 1,
			});
		});

		it("parses lines from sample diff accurately", () => {
			const { lines, maxLineNum } = parseDiffText(SAMPLE_DIFF);
			assert.equal(maxLineNum, 72);
			assert.equal(lines.length, 15);

			// Line 60 + (empty added line)
			assert.equal(lines[0]?.type, "added");
			assert.equal(lines[0]?.lineNum, 60);
			assert.equal(lines[0]?.content, "");

			// Line 61 (context)
			assert.equal(lines[1]?.type, "context");
			assert.equal(lines[1]?.lineNum, 61);
			assert.match(lines[1]!.content, /webpBuffer/);

			// Line 54 - (removed)
			assert.equal(lines[3]?.type, "removed");
			assert.equal(lines[3]?.lineNum, 54);
			assert.match(lines[3]!.content, /__dirname/);

			// Line 63 + (added)
			assert.equal(lines[4]?.type, "added");
			assert.equal(lines[4]?.lineNum, 63);
			assert.match(lines[4]!.content, /uploadsDir/);
		});

		it("handles skipped ellipsis lines", () => {
			const diffWithEllipsis = `  10 const a = 1;\n     ...\n  50 const b = 2;`;
			const { lines } = parseDiffText(diffWithEllipsis);
			assert.equal(lines.length, 3);
			assert.equal(lines[1]?.type, "ellipsis");
			assert.equal(lines[1]?.content, "...");
		});
	});

	describe("word diffing and intra-line background", () => {
		it("calculates accurate character ranges for word changes", () => {
			const oldL = "const filePath = path.join(__dirname, filename);";
			const newL = "const filePath = path.join(uploadsDir, filename);";
			const parts = Diff.diffWords(oldL, newL);

			const newRanges = getWordRanges(parts, true);
			assert.equal(newRanges.length, 1);
			assert.equal(newRanges[0]?.start, 27);
			assert.equal(newRanges[0]?.end, 37); // "uploadsDir"

			const oldRanges = getWordRanges(parts, false);
			assert.equal(oldRanges.length, 1);
			assert.equal(oldRanges[0]?.start, 27);
			assert.equal(oldRanges[0]?.end, 36); // "__dirname"
		});

		it("pairs single removed line with single added line", () => {
			const { lines } = parseDiffText(
				`- 10 const oldVal = 1;\n+ 10 const newVal = 2;`,
			);
			pairIntraLineDiffs(lines);
			assert.ok(lines[0]?.wordParts);
			assert.ok(lines[1]?.wordParts);
		});

		it("does not pair when multiple consecutive removed or added lines exist", () => {
			const { lines } = parseDiffText(
				`- 10 line1\n- 11 line2\n+ 10 new1\n+ 11 new2`,
			);
			pairIntraLineDiffs(lines);
			assert.equal(lines[0]?.wordParts, undefined);
			assert.equal(lines[1]?.wordParts, undefined);
		});

		it("applies intra-line background code around changed word token", () => {
			const oldL = "let a = 1;";
			const newL = "let a = 2;";
			const parts = Diff.diffWords(oldL, newL);
			const baseBg = "\x1b[48;2;10;40;10m";
			const wordBg = "\x1b[48;2;30;80;30m";

			const out = applyIntraLineBg(newL, parts, true, baseBg, wordBg);
			assert.ok(out.includes(wordBg));
			assert.ok(out.includes(baseBg));
			assert.equal(stripAnsi(out), newL);
		});
	});

	describe("getDiffThemeColors", () => {
		it("returns Claude Code dark colors for dark theme", () => {
			const colors = getDiffThemeColors({ name: "dark-cc" });
			assert.equal(colors.diffAddedBg, "#0d3516");
			assert.equal(colors.diffRemovedBg, "#420c10");
			assert.equal(colors.diffAddedGutter, "#4EBA65");
			assert.equal(colors.diffRemovedGutter, "#FF6B80");
		});

		it("returns high-contrast pastel colors for light theme", () => {
			const colors = getDiffThemeColors({ name: "claude-code-light" });
			assert.equal(colors.diffAddedBg, "#D7EAD9");
			assert.equal(colors.diffRemovedBg, "#F7D8DC");
			assert.equal(colors.diffAddedGutter, "#2E7D32");
			assert.equal(colors.diffRemovedGutter, "#C62828");
		});
	});
});

describe("renderClaudeDiffLines visual layout", () => {
	it("renders lines with matching line number and sign gutter", () => {
		const rendered = renderClaudeDiffLines(
			SAMPLE_DIFF,
			"test.ts",
			{ name: "dark-cc" },
			120,
		);
		assert.ok(rendered.length >= 15);

		// Added line has "60 + "
		const plainLine0 = stripAnsi(rendered[0]!);
		assert.match(plainLine0, /^60 \+ /);

		// Context line has "61   "
		const plainLine1 = stripAnsi(rendered[1]!);
		assert.match(plainLine1, /^61 {3}/);

		// Context line 62 has "62   "
		const plainLine2 = stripAnsi(rendered[2]!);
		assert.match(plainLine2, /^62 {3}/);

		// Removed line has "54 - "
		const plainLine3 = stripAnsi(rendered[3]!);
		assert.match(plainLine3, /^54 - /);

		// Added line has "63 + "
		const plainLine4 = stripAnsi(rendered[4]!);
		assert.match(plainLine4, /^63 \+ /);
	});

	it("pads added and removed lines across the full terminal width", () => {
		const width = 90;
		const rendered = renderClaudeDiffLines(
			SAMPLE_DIFF,
			"test.ts",
			{
				name: "dark-cc",
			},
			width,
		);

		// Added line 0 (60 +)
		assert.equal(visibleWidth(rendered[0]!), width);
		assert.ok(rendered[0]!.includes("\x1b[48;2;13;53;22m")); // #0d3516

		// Removed line 3 (54 -)
		assert.equal(visibleWidth(rendered[3]!), width);
		assert.ok(rendered[3]!.includes("\x1b[48;2;66;12;16m")); // #420c10
	});

	it("wraps long lines into multiple rows with blank continuation gutter", () => {
		const singleLongLine = `  10 const extremelyLongIdentifierNameThatWillDefinitelyWrapAcrossSmallColumns = 42;`;
		const narrowWidth = 40;
		const rendered = renderClaudeDiffLines(
			singleLongLine,
			"test.ts",
			undefined,
			narrowWidth,
		);
		assert.ok(rendered.length > 1);

		// First row has line number
		assert.match(stripAnsi(rendered[0]!), /^10 {3}/);

		// Continuation row has blank gutter of same width (5 spaces)
		assert.match(stripAnsi(rendered[1]!), /^ {5}/);
	});

	it("renders empty diff as empty array", () => {
		assert.deepEqual(renderClaudeDiffLines("", "test.ts"), []);
	});
});

describe("ClaudeDiffComponent", () => {
	it("satisfies Pi Component interface and caches width renders", () => {
		const comp = new ClaudeDiffComponent(SAMPLE_DIFF, "test.ts");
		const lines1 = comp.render(80);
		const lines2 = comp.render(80);
		assert.equal(lines1, lines2); // cached instance

		comp.invalidate();
		const lines3 = comp.render(80);
		assert.notEqual(lines1, lines3); // re-rendered after invalidation
		assert.deepEqual(lines1, lines3);
	});
});
