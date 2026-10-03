type NotifyLevel = "info" | "warning" | "error";

let notifyWarningLogged = false;

function warnNotifyFallback(error?: unknown): void {
	if (notifyWarningLogged) return;
	notifyWarningLogged = true;
	console.warn("[cc-ui] Pi notification API unavailable; command feedback is disabled.", error);
}

/** Uses the optional UI notification API without letting host-version drift escape. */
export function notifySafely(
	context: unknown,
	message: string,
	level: NotifyLevel = "info",
): void {
	const ui =
		context && typeof context === "object"
			? (context as { ui?: { notify?: unknown } }).ui
			: undefined;
	const notify = ui?.notify;
	if (typeof notify !== "function") {
		warnNotifyFallback();
		return;
	}

	try {
		(notify as (message: string, level: NotifyLevel) => void).call(
			ui,
			message,
			level,
		);
	} catch (error) {
		warnNotifyFallback(error);
	}
}
