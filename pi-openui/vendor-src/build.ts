import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const here = dirname(new URL(import.meta.url).pathname);
const pkg = dirname(createRequire(import.meta.url).resolve("@byteowlz/oqto-openui/schema/profile.json"));
const fx = join(pkg, "..", "fixtures");
const fixtures = Object.fromEntries(
	readdirSync(fx)
		.sort()
		.map((n) => [n, readFileSync(join(fx, n, "input.oui"), "utf8")])
);
writeFileSync(
	join(here, "fixtures.gen.ts"),
	`export const FIXTURES: Record<string, string> = ${JSON.stringify(fixtures, null, "\t")};\n`
);
const out = await Bun.build({ entrypoints: [join(here, "entry.ts")], target: "node", format: "esm", minify: false });
if (!out.success) throw new AggregateError(out.logs, "bundle failed");
const version = JSON.parse(readFileSync(join(pkg, "profile.json"), "utf8")).version;
const banner = `// GENERATED vendored bundle of @byteowlz/oqto-openui ${version} (+@openuidev/lang-core, zod). MIT. Do not edit; rebuild with bun run pi-openui/vendor-src/build.ts\n`;
writeFileSync(join(here, "..", "openui-vendor.js"), banner + (await out.outputs[0].text()));
console.log("bundled oqto-openui", version);
