import { expect, test } from "bun:test";
import { editExternally, editorArgs } from "./external-editor.js";

const command = (script: string) => `${JSON.stringify(process.execPath)} -e '${script}'`;

test("editor command parses quoted executable/arguments without running shell expressions", () => {
	expect(editorArgs('"/some path/editor" --wait')).toEqual(["/some path/editor", "--wait"]);
	expect(() => editorArgs("vim; echo unsafe")).toThrow("shell expression");
	expect(() => editorArgs('"unfinished')).toThrow("unfinished");
});

test("external editor round-trips a private temporary UTF-8 file", async () => {
	const script =
		'const fs=require("node:fs"),p=process.argv.at(-1); if((fs.statSync(p).mode&511)!==384)process.exit(2); fs.writeFileSync(p,"edited ü");';
	expect(await editExternally("original", command(script), new AbortController().signal)).toBe("edited ü");
});

test("external editor cannot return oversized files", async () => {
	const script = 'require("node:fs").writeFileSync(process.argv.at(-1),"x".repeat(32769));';
	await expect(editExternally("original", command(script), new AbortController().signal)).rejects.toThrow("32 KiB");
});

test("external editor cannot return a symlink", async () => {
	const script = 'const fs=require("node:fs"),p=process.argv.at(-1);fs.unlinkSync(p);fs.symlinkSync("/etc/hosts",p);';
	await expect(editExternally("original", command(script), new AbortController().signal)).rejects.toThrow();
});

test("cancelled editor is never launched", async () => {
	const controller = new AbortController();
	controller.abort();
	await expect(editExternally("original", "/definitely-missing-editor", controller.signal)).rejects.toThrow("cancelled");
});
