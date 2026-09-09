/**
 * cc-ui — Claude Code UI extension for Pi.
 * Provides the official 20fps CC spinner glyph animation (· ✢ ✳ ✶ ✻ ✽), dynamic action verbs,
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

export default function (pi: ExtensionAPI): void {
	registerSpinner(pi);
	const gitController = registerGitInfo(pi);
	const cacheController = registerCacheTimer(pi, {
		gitInfoProvider: () => formatGitSummary(gitController.getState()),
	});
	gitController.addListener((state) => {
		cacheController.setGitInfoProvider(() => formatGitSummary(state));
	});
	registerToolRenderers(pi);
}
