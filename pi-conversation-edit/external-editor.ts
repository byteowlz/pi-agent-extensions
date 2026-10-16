import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_TEXT_BYTES, validateText } from "./core.js";

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

export async function editExternally(text: string, command: string, signal: AbortSignal): Promise<string> {
	validateText(text);
	const [program, ...args] = editorArgs(command);
	const root = await mkdtemp(join(tmpdir(), "pi-rewrite-")); // mkdtemp is 0700
	const path = join(root, "message.txt");
	try {
		await writeFile(path, text, { mode: 0o600 });
		if (signal.aborted) throw new Error("Rewrite cancelled.");
		await new Promise<void>((resolve, reject) => {
			const child = spawn(program, [...args, path], { stdio: "inherit", signal });
			child.once("error", reject);
			child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Editor exited with status ${code}.`))));
		});
		if (signal.aborted) throw new Error("Rewrite cancelled.");
		const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		try {
			const stat = await file.stat();
			if (!stat.isFile() || stat.size > MAX_TEXT_BYTES) throw new Error("Edited file is not regular text within 32 KiB.");
			const buffer = Buffer.alloc(MAX_TEXT_BYTES + 1);
			const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
			if (bytesRead > MAX_TEXT_BYTES) throw new Error("Edited message exceeds 32 KiB.");
			return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead));
		} finally {
			await file.close();
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
