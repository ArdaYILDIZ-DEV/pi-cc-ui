import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	countChangedFiles,
	parsePullRequestJson,
	formatGitSummary,
	emptyGitInfoState,
	GitInfoController,
	registerGitInfo,
	type GitInfoState,
	type CommandRunnerFn,
} from "../git-info.ts";

describe("git-info pure helpers", () => {
	describe("countChangedFiles", () => {
		it("returns 0 for empty or invalid input", () => {
			assert.equal(countChangedFiles(""), 0);
			assert.equal(countChangedFiles("   \n\n  "), 0);
			assert.equal(countChangedFiles(null as any), 0);
			assert.equal(countChangedFiles(undefined as any), 0);
		});

		it("counts modified and untracked files accurately", () => {
			const output = " M src/index.ts\n?? new-file.txt\nD  deleted.ts\n";
			assert.equal(countChangedFiles(output), 3);
		});

		it("ignores blank lines in status output", () => {
			const output = "\n M foo.ts\n\n?? bar.ts\n\n";
			assert.equal(countChangedFiles(output), 2);
		});
	});

	describe("parsePullRequestJson", () => {
		it("parses valid open pull request JSON", () => {
			const raw = JSON.stringify({
				number: 42,
				url: "https://github.com/org/repo/pull/42",
				state: "OPEN",
				isDraft: false,
			});
			const pr = parsePullRequestJson(raw);
			assert.deepEqual(pr, {
				number: 42,
				url: "https://github.com/org/repo/pull/42",
				isDraft: false,
			});
		});

		it("returns null for non-OPEN PRs or malformed JSON", () => {
			assert.equal(
				parsePullRequestJson(
					JSON.stringify({ number: 42, url: "x", state: "MERGED" }),
				),
				null,
			);
			assert.equal(
				parsePullRequestJson(
					JSON.stringify({ number: 42, url: "x", state: "CLOSED" }),
				),
				null,
			);
			assert.equal(parsePullRequestJson("not-valid-json"), null);
			assert.equal(parsePullRequestJson(""), null);
			assert.equal(parsePullRequestJson(null as any), null);
		});
	});

	describe("formatGitSummary", () => {
		it("returns empty string for non-repositories", () => {
			assert.equal(formatGitSummary(emptyGitInfoState()), "");
			assert.equal(
				formatGitSummary({
					isRepository: false,
					branch: "main",
					changedFiles: 0,
					pullRequest: null,
				}),
				"",
			);
		});

		it("formats clean repository branch", () => {
			const state: GitInfoState = {
				isRepository: true,
				branch: "main",
				changedFiles: 0,
				pullRequest: null,
			};
			assert.equal(formatGitSummary(state), "main");
		});

		it("formats dirty repository with changed files in Turkish and English", () => {
			const state: GitInfoState = {
				isRepository: true,
				branch: "feature-ui",
				changedFiles: 3,
				pullRequest: null,
			};
			assert.equal(
				formatGitSummary(state, { language: "tr" }),
				"feature-ui* · 3 dosya",
			);
			assert.equal(
				formatGitSummary(state, { language: "en" }),
				"feature-ui* · 3 files",
			);
		});

		it("formats detached HEAD with hash", () => {
			const state: GitInfoState = {
				isRepository: true,
				branch: "detached@8c1fb7c",
				changedFiles: 1,
				pullRequest: null,
			};
			assert.equal(formatGitSummary(state), "detached@8c1fb7c* · 1 dosya");
		});

		it("includes PR information when available", () => {
			const state: GitInfoState = {
				isRepository: true,
				branch: "fix-bug",
				changedFiles: 2,
				pullRequest: {
					number: 105,
					url: "https://github.com/org/repo/pull/105",
				},
			};
			assert.equal(formatGitSummary(state), "fix-bug* · 2 dosya · PR #105");
			assert.equal(
				formatGitSummary(state, { includePr: false }),
				"fix-bug* · 2 dosya",
			);
		});
	});
});

describe("GitInfoController lifecycle & commands", () => {
	it("handles non-git directories gracefully", async () => {
		const mockRunner: CommandRunnerFn = async (cmd, args) => {
			if (cmd === "git" && args[0] === "rev-parse") {
				return { stdout: "false", code: 128 };
			}
			return { stdout: "", code: 0 };
		};

		const controller = new GitInfoController(mockRunner);
		const state = await controller.refresh("/some/path");
		assert.equal(state.isRepository, false);
		assert.equal(state.branch, "");
		assert.equal(state.changedFiles, 0);
	});

	it("refreshes git branch and changed files using runner", async () => {
		const mockRunner: CommandRunnerFn = async (cmd, args) => {
			if (cmd === "git") {
				if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
					return { stdout: "true\n", code: 0 };
				}
				if (args[0] === "branch") {
					return { stdout: "develop\n", code: 0 };
				}
				if (args[0] === "rev-parse" && args[1] === "--short") {
					return { stdout: "ddee2db\n", code: 0 };
				}
				if (args[0] === "status") {
					return { stdout: " M index.ts\n?? new.txt\n", code: 0 };
				}
			}
			if (cmd === "gh") {
				return {
					stdout: JSON.stringify({
						number: 99,
						url: "https://github.com/pr/99",
						state: "OPEN",
					}),
					code: 0,
				};
			}
			return { stdout: "", code: 1 };
		};

		const controller = new GitInfoController(mockRunner);
		let listenerFired = 0;
		controller.addListener(() => {
			listenerFired++;
		});

		const state = await controller.refresh("/repo");
		assert.equal(state.isRepository, true);
		assert.equal(state.branch, "develop");
		assert.equal(state.changedFiles, 2);
		assert.equal(state.pullRequest?.number, 99);
		assert.ok(listenerFired > 0);
	});

	it("handles detached HEAD state when branch name is empty", async () => {
		const mockRunner: CommandRunnerFn = async (cmd, args) => {
			if (cmd === "git") {
				if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
					return { stdout: "true\n", code: 0 };
				}
				if (args[0] === "branch") {
					return { stdout: "\n", code: 0 };
				}
				if (args[0] === "rev-parse" && args[1] === "--short") {
					return { stdout: "abc1234\n", code: 0 };
				}
				if (args[0] === "status") {
					return { stdout: "", code: 0 };
				}
			}
			return { stdout: "", code: 1 };
		};

		const controller = new GitInfoController(mockRunner);
		const state = await controller.refresh("/repo");
		assert.equal(state.isRepository, true);
		assert.equal(state.branch, "detached@abc1234");
		assert.equal(state.changedFiles, 0);
	});

	it("registers slash command /git and handles /git refresh", async () => {
		type HandlerFn = (args: string, ctx: any) => Promise<void>;
		let registeredHandler: HandlerFn | undefined;
		const mockPi = {
			on: () => {},
			registerCommand: (name: string, opts: any) => {
				if (name === "git") registeredHandler = opts.handler;
			},
		};

		const controller = registerGitInfo(mockPi as any);
		assert.ok(registeredHandler !== undefined);
		const handler = registeredHandler!;

		const notified: string[] = [];
		const mockCtx = {
			cwd: "/mock",
			ui: {
				notify: (msg: string) => notified.push(msg),
			},
		};

		// Mock controller runner for testing the command
		controller.setRunner(async (cmd, args) => {
			if (cmd === "git" && args[1] === "--is-inside-work-tree")
				return { stdout: "true\n", code: 0 };
			if (cmd === "git" && args[0] === "branch")
				return { stdout: "main\n", code: 0 };
			if (cmd === "git" && args[0] === "status")
				return { stdout: " M a.ts\n", code: 0 };
			return { stdout: "", code: 0 };
		});

		await handler("refresh", mockCtx);
		assert.ok(notified.pop()?.includes("güncellendi"));

		await handler("", mockCtx);
		const statusMsg = notified.pop()!;
		assert.ok(statusMsg.includes("main* · 1 dosya"));
	});
});
