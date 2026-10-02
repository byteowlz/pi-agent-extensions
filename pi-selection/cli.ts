#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { startBrowserReview } from "./browser.js";
import { SelectionStore } from "./store.js";

async function input(file?: string): Promise<unknown> {
	if (file) {
		const body = await readFile(file, "utf8");
		if (Buffer.byteLength(body) > 1_048_576) throw new Error("Input exceeds 1 MiB");
		return JSON.parse(body);
	}
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of process.stdin) {
		const bytes = Buffer.from(chunk);
		size += bytes.length;
		if (size > 1_048_576) throw new Error("Input exceeds 1 MiB");
		chunks.push(bytes);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function validateNetwork(network: string, bind?: string): void {
	if (!["tailnet", "lan"].includes(network)) throw new Error("Unknown network mode");
	if (network === "lan" && !bind) throw new Error("LAN requires --bind");
	if (network === "tailnet" && bind) throw new Error("--bind is only valid with explicit --network lan");
}
async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		strict: true,
		options: {
			root: { type: "string" },
			scope: { type: "string" },
			file: { type: "string" },
			id: { type: "string" },
			revision: { type: "string" },
			presentation: { type: "string", default: "none" },
			network: { type: "string", default: "tailnet" },
			bind: { type: "string" },
			help: { type: "boolean", short: "h" },
		},
	});
	if (values.help) {
		console.log(
			"Usage: bun pi-selection/cli.ts create|get|open|save|submit|close --scope NAMESPACE [--root DIR] [--id UUID] [--file JSON] [--revision N] [--presentation none|browser] [--network tailnet|lan --bind LOCAL_PRIVATE_IP]\nCreate reads spec JSON; save/submit read answers JSON. Missing --file reads stdin. JSON stdout, errors stderr. Browser mode stays in foreground; LAN requires explicit bind. Scope is a storage namespace/native Pi scope, never an Oqto platform ID or authorization grant."
		);
		return;
	}
	const action = positionals[0];
	if (positionals.length !== 1 || !["create", "get", "open", "save", "submit", "close"].includes(action))
		throw new Error("Choose one supported action; see --help");
	if (!values.scope) throw new Error("Explicit --scope required");
	if (!["none", "browser"].includes(values.presentation)) throw new Error("Unknown presentation");
	if (values.presentation === "browser" && !["create", "open"].includes(action))
		throw new Error("Browser presentation requires create/open");
	validateNetwork(values.network, values.bind);
	const root = values.root ?? join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "pi-selection", "reviews");
	const store = new SelectionStore(root);
	if (action !== "create" && !values.id) throw new Error("--id required");
	let record =
		action === "create"
			? await store.create(values.scope, await input(values.file))
			: await store.get(values.id ?? "", values.scope);
	if (action === "save" || action === "submit") {
		const revision = Number(values.revision);
		if (values.revision === undefined || !Number.isSafeInteger(revision) || revision < 0)
			throw new Error("Explicit integer --revision required");
		record = await store.update(record.id, values.scope, revision, await input(values.file), action === "submit");
	}
	if (action === "close") record = await store.cancel(record.id, values.scope, record.revision);
	if (values.presentation === "none") {
		console.log(JSON.stringify({ version: 1, record }));
		return;
	}
	if (!["create", "open"].includes(action) || record.state !== "draft")
		throw new Error("Browser presentation requires create/open of a draft");
	const browser = await startBrowserReview(store, record, {
		mode: values.network as "tailnet" | "lan",
		bindAddress: values.bind,
	});
	const close = () => {
		void browser.close();
	};
	process.once("SIGINT", close);
	process.once("SIGTERM", close);
	console.log(JSON.stringify({ version: 1, record, url: browser.url }));
}
main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
