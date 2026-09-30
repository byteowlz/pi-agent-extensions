#!/usr/bin/env bun
// Fake mmry for tests: logs argv to $FAKE_MMRY_DIR/argv.jsonl and replays
// $FAKE_MMRY_DIR/<subcommand>.json, or <subcommand>.stderr with exit code
// <subcommand>.code (default 1).
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.FAKE_MMRY_DIR ?? ".";
const args = process.argv.slice(2);
appendFileSync(join(dir, "argv.jsonl"), `${JSON.stringify({ args, cwd: process.cwd() })}\n`);
const sub = args[0] ?? "";
const stderr = join(dir, `${sub}.stderr`);
if (existsSync(stderr)) {
	process.stderr.write(readFileSync(stderr, "utf8"));
	const code = join(dir, `${sub}.code`);
	process.exit(existsSync(code) ? Number(readFileSync(code, "utf8")) : 1);
}
const out = join(dir, `${sub}.json`);
process.stdout.write(existsSync(out) ? readFileSync(out, "utf8") : "{}\n");
