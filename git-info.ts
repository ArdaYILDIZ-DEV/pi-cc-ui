/**
 * cc-ui — Git repository information tracker for Pi.
 *
 * Lightweight, zero-dependency git status inspection using native Node.js child_process.
 * Queries current branch, detached HEAD, count of modified/untracked files,
 * and optional GitHub open Pull Request info via `gh pr view`.
 */
import { execFile } from "node:child_process";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { sanitizeControlChars, stripAnsi } from "./palette.ts";

export interface PullRequestInfo {
	readonly number: number;
	readonly url: string;
	readonly isDraft?: boolean;
}

export interface GitInfoState {
	readonly isRepository: boolean;
	readonly branch: string;
	readonly changedFiles: number;
	readonly pullRequest: PullRequestInfo | null;
}

export function emptyGitInfoState(): GitInfoState {
	return {
		isRepository: false,
		branch: "",
		changedFiles: 0,
		pullRequest: null,
	};
}

export const DEFAULT_GIT_TIMEOUT_MS = 2500;
export const DEFAULT_GH_TIMEOUT_MS = 5000;

/**
 * Pure helper to count changed / untracked files from `git status --porcelain=v1` output.
 */
export function countChangedFiles(statusOutput: string): number {
	if (!statusOutput || typeof statusOutput !== "string") return 0;
	const lines = statusOutput.split("\n");
	let count = 0;
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.length > 0) {
			count++;
		}
	}
	return count;
}

/**
 * Parses JSON output from `gh pr view ... --json number,url,state,isDraft`.
 */
export function parsePullRequestJson(rawJson: string): PullRequestInfo | null {
	if (!rawJson || typeof rawJson !== "string") return null;
	try {
		const obj = JSON.parse(rawJson);
		if (
			typeof obj === "object" &&
			obj !== null &&
			typeof obj.number === "number" &&
			typeof obj.url === "string" &&
			obj.state === "OPEN"
		) {
			return {
				number: obj.number,
				url: obj.url,
				isDraft: Boolean(obj.isDraft),
			};
		}
	} catch {
		/* ignore JSON parse errors */
	}
	return null;
}

/**
 * Formats git information into a compact status string.
 * Examples:
 * - "main · 3 dosya" (or with PR: "main · 3 dosya · PR #12")
 * - "main" (clean)
 * - "detached@8c1fb7c · 1 dosya"
 */
export function formatGitSummary(
	info: GitInfoState,
	opts?: { includePr?: boolean; language?: "tr" | "en" },
): string {
	if (!info || !info.isRepository || !info.branch) {
		return "";
	}

	const lang = opts?.language ?? "tr";
	const includePr = opts?.includePr ?? true;

	const parts: string[] = [];
	const hasChanges = info.changedFiles > 0;
	const branchDisplay = hasChanges ? `${info.branch}*` : info.branch;
	parts.push(branchDisplay);

	if (hasChanges) {
		const fileWord =
			lang === "tr" ? "dosya" : info.changedFiles === 1 ? "file" : "files";
		parts.push(`${info.changedFiles} ${fileWord}`);
	}

	if (includePr && info.pullRequest) {
		parts.push(`PR #${info.pullRequest.number}`);
	}

	return parts.join(" · ");
}

export type CommandRunnerFn = (
	cmd: string,
	args: string[],
	cwd: string,
	timeoutMs?: number,
) => Promise<{ stdout: string; code: number }>;

/**
 * Native non-blocking command execution via child_process.execFile.
 */
export const defaultCommandRunner: CommandRunnerFn = (
	cmd: string,
	args: string[],
	cwd: string,
	timeoutMs: number = DEFAULT_GIT_TIMEOUT_MS,
): Promise<{ stdout: string; code: number }> => {
	return new Promise((resolve) => {
		try {
			execFile(
				cmd,
				args,
				{
					cwd: cwd || process.cwd(),
					timeout: timeoutMs,
					maxBuffer: 1024 * 1024,
					windowsHide: true,
				},
				(error, stdout) => {
					if (error) {
						resolve({
							stdout: "",
							code: typeof error.code === "number" ? error.code : 1,
						});
					} else {
						resolve({ stdout: stdout.toString(), code: 0 });
					}
				},
			);
		} catch {
			resolve({ stdout: "", code: 1 });
		}
	});
};

export class GitInfoController {
	private state: GitInfoState = emptyGitInfoState();
	private readonly listeners = new Set<(state: GitInfoState) => void>();
	private runner: CommandRunnerFn = defaultCommandRunner;
	private currentCwd: string = "";
	private isRefreshing = false;
	private refreshPending = false;
	private lastQueriedPrBranch: string | null = null;

	constructor(runner?: CommandRunnerFn) {
		if (typeof runner === "function") {
			this.runner = runner;
		}
	}

	public getState(): GitInfoState {
		return this.state;
	}

	public setRunner(runner: CommandRunnerFn): void {
		this.runner = typeof runner === "function" ? runner : defaultCommandRunner;
	}

	public addListener(listener: (state: GitInfoState) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private notify(): void {
		const snap = { ...this.state };
		for (const listener of this.listeners) {
			try {
				listener(snap);
			} catch {
				/* ignore listener errors */
			}
		}
	}

	public async refresh(cwd?: string): Promise<GitInfoState> {
		if (cwd) {
			this.currentCwd = cwd;
		}
		const targetCwd = this.currentCwd || process.cwd();

		if (this.isRefreshing) {
			this.refreshPending = true;
			return this.state;
		}

		this.isRefreshing = true;
		try {
			// 1. Verify if directory is inside a git repository
			const repoCheck = await this.runner(
				"git",
				["rev-parse", "--is-inside-work-tree"],
				targetCwd,
				DEFAULT_GIT_TIMEOUT_MS,
			);

			if (repoCheck.code !== 0 || repoCheck.stdout.trim() !== "true") {
				this.lastQueriedPrBranch = null;
				this.state = emptyGitInfoState();
				this.notify();
				return this.state;
			}

			// 2. Query branch, HEAD commit hash, and changed files concurrently
			const [branchRes, headRes, statusRes] = await Promise.all([
				this.runner(
					"git",
					["branch", "--show-current"],
					targetCwd,
					DEFAULT_GIT_TIMEOUT_MS,
				),
				this.runner(
					"git",
					["rev-parse", "--short", "HEAD"],
					targetCwd,
					DEFAULT_GIT_TIMEOUT_MS,
				),
				this.runner(
					"git",
					["status", "--porcelain=v1", "--untracked-files=all"],
					targetCwd,
					DEFAULT_GIT_TIMEOUT_MS,
				),
			]);

			const rawBranch = branchRes.stdout.trim();
			const shortHead = headRes.stdout.trim();
			const branch =
				rawBranch || (shortHead ? `detached@${shortHead}` : "detached");
			const changedFiles =
				statusRes.code === 0 ? countChangedFiles(statusRes.stdout) : 0;
			const branchChanged = rawBranch !== this.lastQueriedPrBranch;

			this.state = {
				isRepository: true,
				branch,
				changedFiles,
				pullRequest: branchChanged ? null : this.state.pullRequest,
			};
			this.notify();

			// 3. If there is an active named branch, query GitHub PR in the background
			if (rawBranch) {
				this.lastQueriedPrBranch = rawBranch;
				try {
					const prRes = await this.runner(
						"gh",
						["pr", "view", rawBranch, "--json", "number,url,state,isDraft"],
						targetCwd,
						DEFAULT_GH_TIMEOUT_MS,
					);
					if (prRes.code === 0) {
						const pr = parsePullRequestJson(prRes.stdout);
						if (pr && this.state.branch === rawBranch) {
							this.state = {
								...this.state,
								pullRequest: pr,
							};
							this.notify();
						}
					}
				} catch {
					/* gh CLI might not be installed or authenticated; non-fatal */
				}
			} else {
				this.lastQueriedPrBranch = null;
			}
		} catch {
			this.state = emptyGitInfoState();
			this.notify();
		} finally {
			this.isRefreshing = false;
			if (this.refreshPending) {
				this.refreshPending = false;
				void this.refresh(this.currentCwd);
			}
		}

		return this.state;
	}
}

/**
 * Registers the Git Info extension with Pi ExtensionAPI.
 */
export function registerGitInfo(pi: ExtensionAPI): GitInfoController {
	const controller = new GitInfoController();

	pi.on("session_start", async (_event, ctx) => {
		await controller.refresh(ctx?.cwd);
	});

	pi.on("tool_execution_end", (_event, ctx) => {
		// Non-blocking asynchronous refresh after filesystem modifications
		void controller.refresh(ctx?.cwd);
	});

	pi.on("agent_settled", (_event, ctx) => {
		void controller.refresh(ctx?.cwd);
	});

	pi.registerCommand("git", {
		description:
			"Git dalı ve değişiklik özetini gösterir (/git refresh ile tazeler)",
		handler: async (args, ctx) => {
			const clean = sanitizeControlChars(stripAnsi(args)).trim().toLowerCase();
			if (clean === "refresh" || clean === "tazele") {
				await controller.refresh(ctx?.cwd);
				ctx.ui.notify("Git bilgileri güncellendi.", "info");
				return;
			}

			const state = controller.getState();
			if (!state.isRepository) {
				ctx.ui.notify("Mevcut dizin bir Git deposu değil.", "warning");
				return;
			}

			const summary = formatGitSummary(state, { includePr: true, language: "tr" });
			ctx.ui.notify(`Git: ${summary}`, "info");
		},
	});

	return controller;
}
