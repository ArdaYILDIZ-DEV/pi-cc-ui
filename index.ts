/**
 * cc-ui — Claude Code UI extension for Pi.
 * Provides a compact CC-style spinner (· ✢ ✳ ✶ ✻ ✽), dynamic action verbs,
 * live tokens/sec streaming rate, 5-minute Prompt Cache TTL counter widget with git branch status,
 * and compact Claude-style renderers (● Label(detail) / └ summary) for every tool.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSpinner } from "./spinner.ts";
import { registerCacheTimer } from "./cache-timer.ts";
import { registerGitInfo, formatGitSummary } from "./git-info.ts";
import { registerToolRenderers } from "./tool-renderers.ts";

export { registerSpinner, SpinnerController } from "./spinner.ts";
export {
	registerCacheTimer,
	CacheTimerController,
	CACHE_SOUND_MILESTONES,
	playAudio,
	resolveSoundPath,
	buildCacheTimerLine,
} from "./cache-timer.ts";

export {
	registerGitInfo,
	GitInfoController,
	formatGitSummary,
	emptyGitInfoState,
	countChangedFiles,
} from "./git-info.ts";

export {
	registerToolRenderers,
	registerClaudeToolRenderers,
	restoreBuiltinToolRenderers,
	setClaudeToolsEnabled,
	isClaudeToolsEnabled,
	installGlobalClaudeToolPatch,
	uninstallGlobalClaudeToolPatch,
	isGlobalClaudeToolPatchInstalled,
	prettyToolLabel,
	genericDetail,
	genericSummary,
	addAssistantResponseMarker,
} from "./tool-renderers.ts";

function registerSafely<T>(feature: string, register: () => T): T | undefined {
	try {
		return register();
	} catch (error) {
		console.error(`[cc-ui] ${feature} disabled during Pi API setup.`, error);
		return undefined;
	}
}

export default function (pi: ExtensionAPI): void {
	registerSafely("Spinner", () => registerSpinner(pi));
	const gitController = registerSafely("Git status", () => registerGitInfo(pi));
	const cacheController = registerSafely("Cache timer", () =>
		registerCacheTimer(
			pi,
			gitController
				? { gitInfoProvider: () => formatGitSummary(gitController.getState()) }
				: undefined,
		),
	);
	if (gitController && cacheController) {
		registerSafely("Git/cache integration", () =>
			gitController.addListener((state) => {
				cacheController.setGitInfoProvider(() => formatGitSummary(state));
			}),
		);
	}
	registerSafely("Tool renderers", () => registerToolRenderers(pi));
}
