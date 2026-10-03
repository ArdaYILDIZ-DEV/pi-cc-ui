/** A minimal diff segment compatible with the fields used by the renderer. */
export interface Change {
	readonly value: string;
	readonly added?: boolean;
	readonly removed?: boolean;
}

const MAX_LCS_CELLS = 250_000;
const TOKEN_PATTERN = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;

type ChangeKind = "same" | "added" | "removed";

function tokenize(value: string): string[] {
	return value.match(TOKEN_PATTERN) ?? [];
}

function appendChange(changes: Change[], value: string, kind: ChangeKind): void {
	if (!value) return;
	const previous = changes[changes.length - 1];
	const added = kind === "added";
	const removed = kind === "removed";
	if (
		previous &&
		Boolean(previous.added) === added &&
		Boolean(previous.removed) === removed
	) {
		changes[changes.length - 1] = {
			value: previous.value + value,
			...(added ? { added: true } : {}),
			...(removed ? { removed: true } : {}),
		};
		return;
	}
	changes.push({
		value,
		...(added ? { added: true } : {}),
		...(removed ? { removed: true } : {}),
	});
}

function appendBoundedFallback(
	changes: Change[],
	oldTokens: string[],
	newTokens: string[],
): void {
	let prefix = 0;
	while (
		prefix < oldTokens.length &&
		prefix < newTokens.length &&
		oldTokens[prefix] === newTokens[prefix]
	) {
		prefix++;
	}

	let suffix = 0;
	while (
		suffix < oldTokens.length - prefix &&
		suffix < newTokens.length - prefix &&
		oldTokens[oldTokens.length - 1 - suffix] ===
			newTokens[newTokens.length - 1 - suffix]
	) {
		suffix++;
	}

	appendChange(changes, oldTokens.slice(0, prefix).join(""), "same");
	appendChange(
		changes,
		oldTokens.slice(prefix, oldTokens.length - suffix).join(""),
		"removed",
	);
	appendChange(
		changes,
		newTokens.slice(prefix, newTokens.length - suffix).join(""),
		"added",
	);
	appendChange(
		changes,
		oldTokens.slice(oldTokens.length - suffix).join(""),
		"same",
	);
}

/**
 * Computes a bounded token-level diff without a runtime package dependency.
 * Large inputs fall back to a common-prefix/suffix diff to keep work bounded.
 */
export function diffWords(oldText: string, newText: string): Change[] {
	if (oldText === newText) return oldText ? [{ value: oldText }] : [];

	const oldTokens = tokenize(oldText);
	const newTokens = tokenize(newText);
	const columns = newTokens.length + 1;
	const cellCount = (oldTokens.length + 1) * columns;
	const changes: Change[] = [];

	if (cellCount > MAX_LCS_CELLS) {
		appendBoundedFallback(changes, oldTokens, newTokens);
		return changes;
	}

	const lcs = new Uint32Array(cellCount);
	for (let oldIndex = oldTokens.length - 1; oldIndex >= 0; oldIndex--) {
		const row = oldIndex * columns;
		const nextRow = row + columns;
		for (let newIndex = newTokens.length - 1; newIndex >= 0; newIndex--) {
			const index = row + newIndex;
			lcs[index] =
				oldTokens[oldIndex] === newTokens[newIndex]
					? lcs[nextRow + newIndex + 1]! + 1
					: Math.max(lcs[nextRow + newIndex]!, lcs[index + 1]!);
		}
	}

	let oldIndex = 0;
	let newIndex = 0;
	while (oldIndex < oldTokens.length && newIndex < newTokens.length) {
		if (oldTokens[oldIndex] === newTokens[newIndex]) {
			appendChange(changes, oldTokens[oldIndex]!, "same");
			oldIndex++;
			newIndex++;
		} else if (
			lcs[(oldIndex + 1) * columns + newIndex]! >=
			lcs[oldIndex * columns + newIndex + 1]!
		) {
			appendChange(changes, oldTokens[oldIndex]!, "removed");
			oldIndex++;
		} else {
			appendChange(changes, newTokens[newIndex]!, "added");
			newIndex++;
		}
	}
	while (oldIndex < oldTokens.length) {
		appendChange(changes, oldTokens[oldIndex]!, "removed");
		oldIndex++;
	}
	while (newIndex < newTokens.length) {
		appendChange(changes, newTokens[newIndex]!, "added");
		newIndex++;
	}

	return changes;
}
