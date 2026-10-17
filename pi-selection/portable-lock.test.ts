import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withProcessLock } from "./file-lock.js";

test("missing Python helper never runs operation and gives actionable error", async () => {
	const root = await mkdtemp(join(tmpdir(), "selection-portable-"));
	let ran = false;
	try {
		await expect(
			withProcessLock(
				join(root, "record.lock"),
				async () => {
					ran = true;
				},
				{
					backend: "python",
					program: "/definitely-missing/python3",
				}
			)
		).rejects.toThrow(/Python 3/);
		expect(ran).toBe(false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Python kernel lock excludes another process and releases after parent SIGKILL without replacing inode", async () => {
	const root = await mkdtemp(join(tmpdir(), "selection-python-"));
	const path = join(root, "record.lock");
	const module = new URL("./file-lock.ts", import.meta.url).pathname;
	const child = spawn(
		process.execPath,
		[
			"-e",
			`import {withProcessLock} from ${JSON.stringify(module)};
await withProcessLock(${JSON.stringify(path)},async()=>{console.log('ready');await new Promise(()=>{});},{backend:'python'});`,
		],
		{ stdio: ["ignore", "pipe", "pipe"] }
	);
	const done = new Promise<void>((resolve) => child.once("close", () => resolve()));
	try {
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("Python lock startup timed out")), 4000);
			child.stdout.once("data", () => {
				clearTimeout(timer);
				resolve();
			});
			child.once("error", (error) => {
				clearTimeout(timer);
				reject(error);
			});
			child.once("close", () => {
				clearTimeout(timer);
				reject(new Error("Python lock worker exited before ready"));
			});
		});
		const inode = (await stat(path)).ino;
		let entered = false;
		const pending = withProcessLock(
			path,
			async () => {
				entered = true;
			},
			{ backend: "python" }
		);
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(entered).toBe(false);
		child.kill("SIGKILL");
		await done;
		await pending;
		expect(entered).toBe(true);
		expect((await stat(path)).ino).toBe(inode);
	} finally {
		child.kill("SIGKILL");
		await done;
		await rm(root, { recursive: true, force: true });
	}
}, 10000);

test("Python helper interoperates with default kernel lock and releases on operation error", async () => {
	const root = await mkdtemp(join(tmpdir(), "selection-lock-interop-"));
	try {
		const path = join(root, "record.lock");
		let pending: Promise<void> | undefined;
		let entered = false;
		await withProcessLock(path, async () => {
			pending = withProcessLock(
				path,
				async () => {
					entered = true;
				},
				{ backend: "python" }
			);
			await new Promise((resolve) => setTimeout(resolve, 150));
			expect(entered).toBe(false);
		});
		await pending;
		expect(entered).toBe(true);
		await expect(
			withProcessLock(
				path,
				async () => {
					throw new Error("operation failed");
				},
				{ backend: "python" }
			)
		).rejects.toThrow("operation failed");
		await withProcessLock(path, async () => undefined, { backend: "python" });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
