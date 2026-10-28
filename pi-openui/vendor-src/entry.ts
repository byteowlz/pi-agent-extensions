// Bundle entry: everything pi-openui needs from the Oqto profile, self-contained.
// The extension installer copies only this folder (no node_modules), so external
// packages are vendored here. Rebuild: bun run pi-openui/vendor-src/build.ts
process.env.OPENUI_TELEMETRY_DISABLED = "1";
process.env.DO_NOT_TRACK = "1";
export { PROFILE_VERSION, createOqtoParser, renderFallback } from "@byteowlz/oqto-openui";
export { evaluate } from "@openuidev/lang-core";
import prompt from "@byteowlz/oqto-openui/schema/prompt.txt" with { type: "text" };
export const SYSTEM_PROMPT: string = prompt;
export { FIXTURES } from "./fixtures.gen.ts";
