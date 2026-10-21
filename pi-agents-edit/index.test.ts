import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { editorArgs } from "./editor-args.js";
import { loadedAgentsPaths, openEditor } from "./index.js";

describe("agents editor", () => {
	test("only loaded absolute AGENTS.md paths, deduplicated in load order", () => {
		expect(
			loadedAgentsPaths([
				{ path: "/home/me/AGENTS.md" },
				{ path: "/repo/AGENTS.md" },
				{ path: "/home/me/AGENTS.md" },
				{ path: "/repo/README.md" },
				{ path: "AGENTS.md" },
			])
		).toEqual(["/home/me/AGENTS.md", "/repo/AGENTS.md"]);
	});
	test("quoted editor arguments and shell rejection", () => {
		expect(editorArgs('"/some editor" --wait')).toEqual(["/some editor", "--wait"]);
		expect(() => editorArgs("vim; echo bad")).toThrow();
	});
	test("editor receives the real path as one argument and saves directly", async () => {
		const root = await mkdtemp(join(tmpdir(), "agents-editor-"));
		try {
			const path = join(root, "AGENTS.md");
			const script = join(root, "editor.cjs");
			await writeFile(path, "before");
			await writeFile(script, 'require("node:fs").writeFileSync(process.argv[2], "saved");');
			await openEditor(path, `"${process.execPath}" "${script}"`);
			expect(await readFile(path, "utf8")).toBe("saved");
			await expect(openEditor(path, "/no/such/editor")).rejects.toThrow();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
