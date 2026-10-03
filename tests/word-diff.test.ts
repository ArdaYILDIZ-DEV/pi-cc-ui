import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffWords } from "../word-diff.ts";

describe("dependency-free word diff", () => {
	it("keeps equal text unchanged", () => {
		assert.deepEqual(diffWords("same text", "same text"), [
			{ value: "same text" },
		]);
		assert.deepEqual(diffWords("", ""), []);
	});

	it("marks multiple changed words while retaining shared context", () => {
		assert.deepEqual(
			diffWords("const a = 1; const b = 2;", "const a = 3; const b = 4;"),
			[
				{ value: "const a = " },
				{ value: "1", removed: true },
				{ value: "3", added: true },
				{ value: "; const b = " },
				{ value: "2", removed: true },
				{ value: "4", added: true },
				{ value: ";" },
			],
		);
	});

	it("preserves Unicode token lengths for renderer ranges", () => {
		const changes = diffWords("İşlem eski", "İşlem yeni");
		assert.deepEqual(changes, [
			{ value: "İşlem " },
			{ value: "eski", removed: true },
			{ value: "yeni", added: true },
		]);
	});

	it("bounds work for very large unrelated lines", () => {
		const before = `${"old ".repeat(800)}tail`;
		const after = `${"new ".repeat(800)}tail`;
		const changes = diffWords(before, after);
		assert.equal(changes.length, 3);
		assert.equal(changes[0]?.value, before.slice(0, -5));
		assert.equal(changes[0]?.removed, true);
		assert.equal(changes[1]?.value, after.slice(0, -5));
		assert.equal(changes[1]?.added, true);
		assert.equal(changes[2]?.value, " tail");
	});
});
