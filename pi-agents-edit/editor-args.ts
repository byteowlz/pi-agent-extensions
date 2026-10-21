/** Small argv parser, not a shell. Supports quoted editor paths and --wait. */
export function editorArgs(command: string): string[] {
	const result: string[] = [];
	let word = "";
	let quote = "";
	let escaped = false;
	for (const ch of command.trim()) {
		if (escaped) {
			word += ch;
			escaped = false;
		} else if (ch === "\\" && quote !== "'") escaped = true;
		else if (quote) {
			if (ch === quote) quote = "";
			else word += ch;
		} else if (ch === "'" || ch === '"') quote = ch;
		else if (/\s/.test(ch)) {
			if (word) {
				result.push(word);
				word = "";
			}
		} else if (/[|;&<>`$]/.test(ch)) throw new Error("EDITOR must be an executable plus arguments, not a shell expression.");
		else word += ch;
	}
	if (quote || escaped) throw new Error("EDITOR has an unfinished quote or escape.");
	if (word) result.push(word);
	if (!result.length) throw new Error("Set VISUAL or EDITOR (for example: code --wait).");
	return result;
}
