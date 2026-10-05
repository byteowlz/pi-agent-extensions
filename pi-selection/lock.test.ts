import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withProcessLock } from "./file-lock.js";
import { SelectionStore } from "./store.js";

const lockModule = new URL("./file-lock.ts", import.meta.url).pathname;
const storeModule = new URL("./store.ts", import.meta.url).pathname;
function worker(source: string) {
	const child = spawn(process.execPath, ["-e", source], { stdio: ["ignore", "pipe", "pipe"] });
	const done = new Promise<number | null>((resolve, reject) => {
		child.once("error", reject);
		child.once("close", resolve);
	});
	return { child, done };
}
test("kernel lock releases after parent SIGKILL without replacing the lock inode", async () => {
	const root = await mkdtemp(join(tmpdir(), "selection-lock-"));
	const path = join(root, "record.lock");
	const w = worker(
		`import {withProcessLock} from ${JSON.stringify(lockModule)}; await withProcessLock(${JSON.stringify(path)}, async()=>{console.log('ready'); await new Promise(()=>{});});`
	);
	try {
		await new Promise<void>((resolve, reject) => {
			w.child.stdout.once("data", () => resolve());
			w.child.once("exit", () => reject(new Error("Worker exited before locking")));
		});
		const inode = (await stat(path)).ino;
		w.child.kill("SIGKILL");
		await w.done;
		let acquired = false;
		await withProcessLock(path, async () => {
			acquired = true;
		});
		expect(acquired).toBe(true);
		expect((await stat(path)).ino).toBe(inode);
	} finally {
		w.child.kill("SIGKILL");
		await w.done;
		await rm(root, { recursive: true, force: true });
	}
}, 10000);
test("separate processes preserve update versus cancel CAS", async () => {
	const root = await mkdtemp(join(tmpdir(), "selection-cas-"));
	try {
		const store = new SelectionStore(root);
		const r = await store.create("s", {
			version: 1,
			mode: "questions",
			title: "CAS",
			questions: [{ id: "t", title: "Text", kind: "text" }],
		});
		const answers = { t: { answered: true, selectedIds: [], text: "preserved" } };
		const prefix = `import {SelectionStore} from ${JSON.stringify(storeModule)}; const s=new SelectionStore(${JSON.stringify(root)}); try {`;
		const suffix = `; process.exitCode=0; } catch(e) { if(e.message!=='Revision conflict' && e.message!=='Terminal record') throw e; process.exitCode=2; }`;
		const jobs = [
			worker(`${prefix}await s.update('${r.id}','s',0,${JSON.stringify(answers)},false)${suffix}`),
			worker(`${prefix}await s.cancel('${r.id}','s',0,${JSON.stringify(answers)})${suffix}`),
		];
		expect((await Promise.all(jobs.map((w) => w.done))).sort()).toEqual([0, 2]);
		const next = await store.get(r.id, "s");
		expect(next.revision).toBe(1);
		expect(next.answers).toEqual(answers);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
