import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { pickKeys } from "./index.js";

type Picker = { handleInput(data: string): void; render(width: number): string[] };

async function exercise(inputs: string[]) {
	const root = await mkdtemp(join(tmpdir(), "ssh-picker-"));
	try {
		for (const name of ["alpha#", "beta#", "zzz"]) {
			await writeFile(join(root, name), "-----BEGIN OPENSSH PRIVATE KEY-----\nsynthetic\n");
		}
		const screens: string[] = [];
		const ctx = {
			ui: {
				custom: async (factory: (...args: unknown[]) => Picker) => {
					let result: { path: string }[] | undefined;
					const picker = factory(
						{
							requestRender() {
								/* Rendering is captured synchronously below. */
							},
						},
						{ fg: (_color: string, text: string) => text },
						{},
						(value: typeof result) => {
							result = value;
						}
					);
					for (const input of inputs) {
						picker.handleInput(input);
						screens.push(picker.render(160).join("\n"));
					}
					picker.handleInput("\r");
					return result;
				},
			},
		} as unknown as ExtensionCommandContext;
		const result = await pickKeys(ctx, root);
		return { screens, names: result?.map((item) => basename(item.path)) };
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

for (const letter of ["a", "A"]) {
	test(`plain ${letter} filters without selecting keys`, async () => {
		const { screens, names } = await exercise([letter]);
		expect(screens[0]).toContain(`filter: ${letter}`);
		expect(screens[0]).toContain("0 selected");
		expect(screens[0]).toContain("Ctrl+A select all");
		expect(names).toHaveLength(1);
	});
}

test("Ctrl+A toggles all currently filtered keys without changing the query", async () => {
	const { screens, names } = await exercise(["#", "\x01", "\x01", "\x01"]);
	expect(screens[1]).toContain("2 selected");
	expect(screens[2]).toContain("0 selected");
	expect(screens[3]).toContain("filter: #");
	expect(names?.sort()).toEqual(["alpha#", "beta#"]);
});
