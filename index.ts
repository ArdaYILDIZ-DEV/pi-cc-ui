/**
 * cc-ui — Claude Code UI extension for Pi.
 * Provides the official 20fps CC spinner glyph animation (· ✢ ✳ ✶ ✻ ✽) and dynamic action verbs,
 * plus a 5-minute Prompt Cache TTL counter widget positioned immediately below the editor,
 * plus compact Claude-style renderers (● Label(detail) / └ summary) for every tool.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSpinner } from "./spinner.ts";
import { registerCacheTimer } from "./cache-timer.ts";
import { registerToolRenderers } from "./tool-renderers.ts";

export { registerSpinner } from "./spinner.ts";
export {
 registerCacheTimer,
 CacheTimerController,
 CACHE_SOUND_MILESTONES,
 playAudio,
 resolveSoundPath,
} from "./cache-timer.ts";

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
 registerCacheTimer(pi);
 registerToolRenderers(pi);
}
