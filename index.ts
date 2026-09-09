/**
 * cc-ui — Claude Code UI extension for Pi.
 * Provides the official 20fps CC spinner glyph animation (· ✢ ✳ ✶ ✻ ✽) and dynamic action verbs,
 * plus a 5-minute Prompt Cache TTL counter widget positioned immediately below the editor.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSpinner } from "./spinner.ts";
import { registerCacheTimer } from "./cache-timer.ts";

export { registerSpinner } from "./spinner.ts";
export { registerCacheTimer, CacheTimerController } from "./cache-timer.ts";

export default function (pi: ExtensionAPI): void {
 registerSpinner(pi);
 registerCacheTimer(pi);
}
