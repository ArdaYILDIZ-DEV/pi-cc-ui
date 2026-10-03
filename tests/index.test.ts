import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "../index.ts";

describe("extension startup compatibility", () => {
	it("isolates Pi API registration failures to the affected features", () => {
		const failures: string[] = [];
		const originalError = console.error;
		console.error = (message: string) => failures.push(message);

		try {
			assert.doesNotThrow(() =>
				extension({
					on() {
						throw new Error("simulated host API mismatch");
					},
					registerCommand() {
						throw new Error("simulated host API mismatch");
					},
				} as unknown as ExtensionAPI),
			);
		} finally {
			console.error = originalError;
		}

		assert.deepEqual(failures, [
			"[cc-ui] Spinner disabled during Pi API setup.",
			"[cc-ui] Git status disabled during Pi API setup.",
			"[cc-ui] Cache timer disabled during Pi API setup.",
			"[cc-ui] Tool renderers disabled during Pi API setup.",
		]);
	});
});
