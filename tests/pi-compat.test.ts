import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notifySafely } from "../pi-compat.ts";

describe("Pi UI compatibility helpers", () => {
	it("calls the host notification API when available", () => {
		const calls: unknown[][] = [];
		notifySafely(
			{ ui: { notify: (...args: unknown[]) => calls.push(args) } },
			"Ready",
			"info",
		);
		assert.deepEqual(calls, [["Ready", "info"]]);
	});

	it("does not throw when the host notification API is unavailable", () => {
		const originalWarn = console.warn;
		let warnings = 0;
		console.warn = () => warnings++;
		try {
			assert.doesNotThrow(() => notifySafely({}, "Ready"));
		} finally {
			console.warn = originalWarn;
		}
		assert.equal(warnings, 1);
	});
});
