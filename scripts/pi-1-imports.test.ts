import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modules = new Map<string, object>([
	["@earendil-works/pi-ai", await import("@earendil-works/pi-ai")],
	["@earendil-works/pi-coding-agent", await import("@earendil-works/pi-coding-agent")],
	["@earendil-works/pi-tui", await import("@earendil-works/pi-tui")],
]);

function sources(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(path);
		return /\.(?:ts|js)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
	});
}

// jiti can load a module whose unused named import is undefined. Compilation
// also skips files marked ts-nocheck. Neither proves late tool/event callbacks
// are callable: catch removed Pi value exports for every extension explicitly.
for (const entry of readdirSync(root, { withFileTypes: true })) {
	if (!entry.isDirectory() || !entry.name.startsWith("pi-")) continue;
	for (const path of sources(join(root, entry.name))) {
		const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
		for (const statement of source.statements) {
			if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
			const namespace = modules.get(statement.moduleSpecifier.text);
			const clause = statement.importClause;
			if (!namespace || !clause || clause.isTypeOnly || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
				continue;
			}
			for (const symbol of clause.namedBindings.elements) {
				if (symbol.isTypeOnly) continue;
				const name = (symbol.propertyName ?? symbol.name).text;
				test(`${relative(root, path)} imports real Pi 1.0 value ${name}`, () => {
					expect(Object.hasOwn(namespace, name)).toBe(true);
				});
			}
		}
	}
}
