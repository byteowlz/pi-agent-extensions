import {
	closeAll,
	findSessionPath,
	getStats,
	grepSession,
	listBranchesInProject,
	listRecent,
	queryProject,
	readSession,
	rebuildProjectIndex,
	updateProjectIndex,
} from "./indexer.js";
import { searchReport } from "./operations.js";

const handlers = {
	searchReport,
	findSessionPath,
	getStats,
	grepSession,
	listBranchesInProject,
	listRecent,
	queryProject,
	readSession,
	rebuildProjectIndex,
	updateProjectIndex,
};
export type WorkerMethods = typeof handlers;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

async function main() {
	let input = "";
	process.stdin.setEncoding("utf8");
	for await (const chunk of process.stdin) {
		input += chunk.toString();
		if (Buffer.byteLength(input) > MAX_REQUEST_BYTES) throw new Error("History request exceeds worker IPC limit");
	}
	const request = JSON.parse(input) as { method: keyof WorkerMethods; args: unknown[] };
	if (!Object.hasOwn(handlers, request.method) || !Array.isArray(request.args)) throw new Error("Invalid history operation");
	const handler = handlers[request.method] as (...args: unknown[]) => unknown;
	const value = await handler(...request.args);
	const response = JSON.stringify({ ok: true, value });
	if (Buffer.byteLength(response) > MAX_RESPONSE_BYTES)
		throw new Error("History result exceeds worker IPC limit; narrow the request");
	process.stdout.write(response);
}
main()
	.catch((error: unknown) => {
		process.stdout.write(
			JSON.stringify({ ok: false, error: error instanceof Error ? error.message.slice(0, 2000) : "History worker failed" })
		);
		process.exitCode = 1;
	})
	.finally(() => closeAll());
