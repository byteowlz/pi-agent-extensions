/**
 * Regression test for piext-ge92: `pi --no-session -p "say ok"` prints the
 * answer but never exits (the process hangs, consumer sees a timeout kill).
 *
 * Root cause (pi-herdr-tools): on `session_start` it opened a long-lived
 * socket to herdr (`startEventSubscriber`) when `HERDR_ENV=1`. After
 * `session_shutdown` the destroyed socket's close/error handler re-armed a 5s
 * reconnect timer, which re-opened the socket forever — keeping the Node event
 * loop alive after `pi -p` had already answered, so the process never exited.
 *
 * Fix: gate the long-lived trackers to TUI/RPC sessions only (single-shot
 * print/json must exit promptly) and make `stopEventSubscriber` suppress the
 * reconnect loop entirely.
 *
 * This test drives a REAL pi binary (the exact Pi1 launcher) in the actual
 * `pi --no-session -p` mode with an isolated temp HOME/config and a synthetic
 * local SSE provider, and asserts the process exits 0 within seconds while
 * printing the expected answer.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { type Server, createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);

/**
 * Locate a pi binary. Prefer the exact official Node Pi1 launcher when it is
 * present (matching the environment the bug was reported on); otherwise fall
 * back to `pi` on PATH. Set PI_TEST_PI_BIN to override.
 */
function resolvePiBinary(): string {
	const override = process.env.PI_TEST_PI_BIN;
	if (override) return override;
	const pi1 = "/home/wismut/byteowlz/oqto-release-artifacts/pi1-node-qualification/runtime/pi";
	try {
		require("node:fs").accessSync(pi1);
		return pi1;
	} catch {
		return "pi";
	}
}

const repoRoot = resolve(import.meta.dirname, "..");
const PI_BIN = resolvePiBinary();

/** A socket path that is definitely reachable (we bind a dummy listener to it). */
function reachableSocketPath(): string {
	return join(tmpdir(), `piext-ge92-test-${process.pid}-${Date.now()}.sock`);
}

function once(child: ChildProcess): Promise<number | null> {
	return new Promise((resolve) => child.once("close", resolve));
}

describe("pi print-mode lifecycle (piext-ge92)", () => {
	let temp: string;
	let agent: string;
	let provider: Server;
	let socketServer: Server | null = null;
	let socketPath: string;
	let child: ChildProcess | null = null;

	beforeEach(async () => {
		temp = await mkdtemp(join(tmpdir(), "pi-print-exit-"));
		agent = join(temp, "agent");
		await mkdir(agent, { recursive: true });

		// Synthetic local SSE provider that answers "ok".
		provider = createServer(async (req, res) => {
			const chunks: Buffer[] = [];
			for await (const c of req) chunks.push(c as Buffer);
			res.writeHead(200, { "Content-Type": "text/event-stream" });
			res.write(
				`data: ${JSON.stringify({ id: "f", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: { role: "assistant", content: "ok" }, finish_reason: null }] })}\n\n`
			);
			res.write(
				`data: ${JSON.stringify({ id: "f", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`
			);
			res.end("data: [DONE]\n\n");
		});
		await new Promise<void>((r) => provider.listen(0, "127.0.0.1", r));
		const port = (provider.address() as { port: number }).port;

		await writeFile(
			join(agent, "models.json"),
			JSON.stringify({
				providers: {
					fixture: {
						baseUrl: `http://127.0.0.1:${port}/v1`,
						api: "openai-completions",
						apiKey: "synthetic",
						models: [{ id: "fixture", input: ["text"], contextWindow: 8192, maxTokens: 512 }],
					},
				},
			})
		);
		await writeFile(join(agent, "settings.json"), JSON.stringify({ defaultProvider: "fixture", defaultModel: "fixture" }));

		// A reachable Unix socket so the herdr event subscriber actually connects.
		socketPath = reachableSocketPath();
		socketServer = new (await import("node:net")).Server();
		await new Promise<void>((r) => socketServer!.listen(socketPath, r));
	});

	afterEach(async () => {
		if (child) {
			child.kill("SIGKILL");
			child = null;
		}
		if (socketServer) {
			await new Promise<void>((r) => socketServer!.close(() => r()));
			socketServer = null;
		}
		await new Promise<void>((r) => provider.close(() => r()));
		await rm(temp, { recursive: true, force: true });
	});

	test("culprit pi-herdr-tools: `pi -p` prints answer and exits 0 within seconds", async () => {
		child = spawn(
			PI_BIN,
			[
				"--no-session",
				"-p",
				"say ok",
				"--provider",
				"fixture",
				"--model",
				"fixture",
				"-e",
				join(repoRoot, "pi-herdr-tools", "index.ts"),
			],
			{
				cwd: temp,
				env: {
					...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("HERDR_"))),
					HOME: temp,
					PI_CODING_AGENT_DIR: agent,
					PI_OFFLINE: "1",
					HERDR_ENV: "1",
					HERDR_SOCKET_PATH: socketPath,
				},
				stdio: ["pipe", "pipe", "pipe"],
			}
		);
		let out = "";
		child.stdout.on("data", (c) => {
			out += c;
		});
		child.stdin.end();

		const deadline = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error(`pi -p did not exit within 20s (hang); stdout: ${JSON.stringify(out)}`)), 20000)
		);
		const code = await Promise.race([once(child), deadline]);
		expect(code).toBe(0);
		expect(out).toContain("ok");
	});

	test("full maintained repo extension set: `pi -p` exits 0 within seconds", async () => {
		// Globally load every pi-* extension from the repo (the reported config
		// loads these globally), in print mode with a reachable herdr socket.
		const extensions: string[] = [];
		for (const name of [
			"pi-herdr-tools",
			"pi-history-search",
			"pi-tui-rpc",
			"pi-xlatch-session",
			"pi-crosstalk",
			"pi-statusline",
		]) {
			try {
				require("node:fs").accessSync(join(repoRoot, name, "index.ts"));
				extensions.push("-e", join(repoRoot, name, "index.ts"));
			} catch {
				// skip missing
			}
		}
		const args = ["--no-session", "-p", "say ok", "--provider", "fixture", "--model", "fixture", ...extensions];

		child = spawn(PI_BIN, args, {
			cwd: temp,
			env: {
				...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("HERDR_"))),
				HOME: temp,
				PI_CODING_AGENT_DIR: agent,
				PI_OFFLINE: "1",
				HERDR_ENV: "1",
				HERDR_SOCKET_PATH: socketPath,
			},
			stdio: ["pipe", "pipe", "pipe"],
		});
		let out = "";
		child.stdout.on("data", (c) => {
			out += c;
		});
		child.stdin.end();

		const deadline = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error(`full-set pi -p did not exit within 25s (hang); stdout: ${JSON.stringify(out)}`)), 25000)
		);
		const code = await Promise.race([once(child), deadline]);
		expect(code).toBe(0);
		expect(out).toContain("ok");
	});
});
