import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	VAR_AGENT_ADDRESS,
	VAR_AGENT_ID,
	VAR_HARNESS,
	VAR_MACHINE_ID,
	VAR_MODEL,
	VAR_MULTIPLEXER,
	VAR_NODE_HOSTNAME,
	VAR_OS_ARCH,
	VAR_SESSION_ID,
	VAR_SESSION_NAME,
	VAR_VERSION,
	VAR_WORKSPACE_ID,
	clearOwned,
	exportAll,
	formatModel,
	formatOsArch,
	readHerdrLayer,
	readHostLayer,
	refreshFromContext,
	updateModel,
	updateSessionScope,
} from "./core.js";

function makeCtx(data = {}) {
	return {
		sessionManager: {
			getSessionId: () => data.sessionId,
			getSessionName: () => data.sessionName,
		},
		model: data.model,
	};
}

function fakeHost(overrides = {}) {
	return {
		hostname: () => "node-studio",
		platform: () => "darwin",
		arch: () => "arm64",
		...overrides,
	};
}

describe("formatModel", () => {
	test("returns provider/id for valid model", () => {
		expect(formatModel({ provider: "anthropic", id: "claude-3-7-sonnet" })).toBe("anthropic/claude-3-7-sonnet");
	});

	test("returns undefined for incomplete model", () => {
		expect(formatModel({ provider: "anthropic", id: "" })).toBeUndefined();
		expect(formatModel({ provider: "", id: "claude" })).toBeUndefined();
		expect(formatModel(undefined)).toBeUndefined();
	});
});

describe("formatOsArch", () => {
	test("maps x64 to amd64, keeps arm64", () => {
		expect(formatOsArch("darwin", "arm64")).toBe("darwin/arm64");
		expect(formatOsArch("linux", "arm64")).toBe("linux/arm64");
		expect(formatOsArch("linux", "x64")).toBe("linux/amd64");
	});

	test("falls back to unknown", () => {
		expect(formatOsArch("", "")).toBe("unknown/unknown");
	});
});

describe("readHerdrLayer", () => {
	test("no herdr env -> multiplexer/agent vars unset", () => {
		const env = {};
		readHerdrLayer(env);
		expect(env[VAR_MULTIPLEXER]).toBeUndefined();
		expect(env[VAR_AGENT_ID]).toBeUndefined();
		expect(env[VAR_AGENT_ADDRESS]).toBeUndefined();
		expect(env[VAR_WORKSPACE_ID]).toBeUndefined();
	});

	test("HERDR_ENV=1 + HERDR_PANE_ID -> multiplexer + agent id/address", () => {
		const env = { HERDR_ENV: "1", HERDR_PANE_ID: "pane_7c2f", HERDR_WORKSPACE_ID: "ws_a13f" };
		readHerdrLayer(env);
		expect(env[VAR_MULTIPLEXER]).toBe("herdr");
		expect(env[VAR_AGENT_ID]).toBe("pane_7c2f");
		expect(env[VAR_AGENT_ADDRESS]).toBe("pane_7c2f");
		expect(env[VAR_WORKSPACE_ID]).toBe("ws_a13f");
	});

	test("HERDR_ENV=1 without pane id leaves agent vars unset", () => {
		const env = { HERDR_ENV: "1" };
		readHerdrLayer(env);
		expect(env[VAR_MULTIPLEXER]).toBe("herdr");
		expect(env[VAR_AGENT_ID]).toBeUndefined();
		expect(env[VAR_AGENT_ADDRESS]).toBeUndefined();
	});

	test("stale multiplexer vars are cleared when not in herdr", () => {
		const env = { [VAR_AGENT_ID]: "stale", [VAR_MULTIPLEXER]: "herdr" };
		readHerdrLayer(env);
		expect(env[VAR_MULTIPLEXER]).toBeUndefined();
		expect(env[VAR_AGENT_ID]).toBeUndefined();
	});
});

describe("readHostLayer", () => {
	test("always emits host bag from injected host", () => {
		const env = {};
		readHostLayer(env, fakeHost());
		expect(env[VAR_MACHINE_ID]).toBe("node-studio");
		expect(env[VAR_NODE_HOSTNAME]).toBe("node-studio");
		expect(env[VAR_OS_ARCH]).toBe("darwin/arm64");
	});

	test("prefers herdr machine name when present, x64 -> amd64", () => {
		const env = { HERDR_MACHINE_NAME: "node-rtx6000" };
		readHostLayer(env, fakeHost({ platform: () => "linux", arch: () => "x64" }));
		expect(env[VAR_MACHINE_ID]).toBe("node-rtx6000");
		expect(env[VAR_NODE_HOSTNAME]).toBe("node-studio");
		expect(env[VAR_OS_ARCH]).toBe("linux/amd64");
	});
});

describe("exportAll", () => {
	test("maps pi state to AGENT_CTX vars", () => {
		const env = {};
		exportAll(
			makeCtx({
				sessionId: "sess_123",
				sessionName: "my-session",
				model: { provider: "anthropic", id: "claude-3-7-sonnet" },
			}),
			env,
			fakeHost()
		);

		expect(env[VAR_VERSION]).toBe("2");
		expect(env[VAR_HARNESS]).toBe("pi");
		expect(env[VAR_SESSION_ID]).toBe("sess_123");
		expect(env[VAR_MODEL]).toBe("anthropic/claude-3-7-sonnet");
		expect(env[VAR_SESSION_NAME]).toBe("my-session");
		// no herdr env -> multiplexer/agent bag unset
		expect(env[VAR_MULTIPLEXER]).toBeUndefined();
		expect(env[VAR_AGENT_ID]).toBeUndefined();
		expect(env[VAR_AGENT_ADDRESS]).toBeUndefined();
		// host bag always set
		expect(env[VAR_MACHINE_ID]).toBe("node-studio");
		expect(env[VAR_NODE_HOSTNAME]).toBe("node-studio");
		expect(env[VAR_OS_ARCH]).toBe("darwin/arm64");
	});

	test("emits multiplexer bag when env shows herdr", () => {
		const env = { HERDR_ENV: "1", HERDR_PANE_ID: "pane_99" };
		exportAll(
			makeCtx({
				sessionId: "sess_123",
				sessionName: "my-session",
				model: { provider: "anthropic", id: "claude-3-7-sonnet" },
			}),
			env,
			fakeHost()
		);

		expect(env[VAR_VERSION]).toBe("2");
		expect(env[VAR_HARNESS]).toBe("pi");
		expect(env[VAR_MULTIPLEXER]).toBe("herdr");
		expect(env[VAR_AGENT_ID]).toBe("pane_99");
		expect(env[VAR_AGENT_ADDRESS]).toBe("pane_99");
		expect(env[VAR_MACHINE_ID]).toBe("node-studio");
		expect(env[VAR_OS_ARCH]).toBe("darwin/arm64");
	});

	test("leaves unknown fields unset", () => {
		const env = {
			[VAR_SESSION_ID]: "stale-session",
			[VAR_MODEL]: "stale/model",
			[VAR_SESSION_NAME]: "stale-name",
		};
		exportAll(makeCtx(), env, fakeHost());

		expect(env[VAR_VERSION]).toBe("2");
		expect(env[VAR_HARNESS]).toBe("pi");
		expect(env[VAR_SESSION_ID]).toBeUndefined();
		expect(env[VAR_MODEL]).toBeUndefined();
		expect(env[VAR_SESSION_NAME]).toBeUndefined();
	});
});

describe("mutation behavior", () => {
	test("updates model and session name over time", () => {
		const env = {};
		exportAll(
			makeCtx({
				sessionId: "sess_999",
				sessionName: "initial",
				model: { provider: "openai", id: "gpt-4.1" },
			}),
			env,
			fakeHost()
		);

		updateModel({ provider: "anthropic", id: "claude-3-7-sonnet" }, env);
		expect(env[VAR_MODEL]).toBe("anthropic/claude-3-7-sonnet");

		updateSessionScope(makeCtx({ sessionName: "renamed" }), env);
		expect(env[VAR_SESSION_NAME]).toBe("renamed");

		updateModel(undefined, env);
		expect(env[VAR_MODEL]).toBeUndefined();
	});

	test("updates session id when active session changes in the same process", () => {
		const env = {};
		exportAll(makeCtx({ sessionId: "sess_a", sessionName: "a" }), env, fakeHost());
		expect(env[VAR_SESSION_ID]).toBe("sess_a");

		updateSessionScope(makeCtx({ sessionId: "sess_b", sessionName: "b" }), env);
		expect(env[VAR_SESSION_ID]).toBe("sess_b");
		expect(env[VAR_SESSION_NAME]).toBe("b");
	});

	test("refreshFromContext updates session scope, model, layers together", () => {
		const env = { HERDR_ENV: "1", HERDR_PANE_ID: "pane_x" };
		exportAll(makeCtx({ sessionId: "sess_a", sessionName: "a", model: { provider: "openai", id: "gpt-4.1" } }), env, fakeHost());

		refreshFromContext(
			makeCtx({
				sessionId: "sess_z",
				sessionName: "z",
				model: { provider: "anthropic", id: "claude-3-7-sonnet" },
			}),
			env,
			fakeHost()
		);
		expect(env[VAR_SESSION_ID]).toBe("sess_z");
		expect(env[VAR_SESSION_NAME]).toBe("z");
		expect(env[VAR_MODEL]).toBe("anthropic/claude-3-7-sonnet");
		expect(env[VAR_MULTIPLEXER]).toBe("herdr");
		expect(env[VAR_AGENT_ADDRESS]).toBe("pane_x");
		expect(env[VAR_MACHINE_ID]).toBe("node-studio");
	});

	test("clearOwned removes all extension-owned vars", () => {
		const env = {};
		exportAll(
			makeCtx({
				sessionId: "sess_clear",
				sessionName: "clear-me",
				model: { provider: "openai", id: "gpt-4.1" },
			}),
			env,
			fakeHost()
		);
		readHerdrLayer({ ...env, HERDR_ENV: "1", HERDR_PANE_ID: "pane_c" });

		clearOwned(env);
		const owned = [
			VAR_VERSION,
			VAR_HARNESS,
			VAR_SESSION_ID,
			VAR_MODEL,
			VAR_SESSION_NAME,
			VAR_MULTIPLEXER,
			VAR_AGENT_ID,
			VAR_AGENT_ADDRESS,
			VAR_WORKSPACE_ID,
			VAR_MACHINE_ID,
			VAR_NODE_HOSTNAME,
			VAR_OS_ARCH,
		];
		for (const v of owned) {
			expect(env[v]).toBeUndefined();
		}
	});
});

describe("child process propagation", () => {
	test("spawned child process sees AGENT_CTX values", () => {
		const env = {};
		exportAll(
			makeCtx({
				sessionId: "sess_child",
				sessionName: "child-visible",
				model: { provider: "anthropic", id: "claude-3-5-haiku" },
			}),
			env,
			fakeHost()
		);

		const script = `
const keys = [
  "AGENT_CTX_VERSION",
  "AGENT_CTX_HARNESS",
  "AGENT_CTX_HARNESS_SESSION_ID",
  "AGENT_CTX_MODEL",
  "AGENT_CTX_SESSION_NAME",
  "AGENT_CTX_MULTIPLEXER",
  "AGENT_CTX_AGENT_ID",
  "AGENT_CTX_AGENT_ADDRESS",
  "AGENT_CTX_MACHINE_ID",
  "AGENT_CTX_NODE_HOSTNAME",
  "AGENT_CTX_OS_ARCH",
];
const out = Object.fromEntries(keys.map((k) => [k, process.env[k] ?? null]));
console.log(JSON.stringify(out));
`;
		const result = spawnSync(process.execPath, ["-e", script], {
			env: { ...process.env, ...env },
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
		const payload = JSON.parse(result.stdout.trim());
		expect(payload.AGENT_CTX_VERSION).toBe("2");
		expect(payload.AGENT_CTX_HARNESS).toBe("pi");
		expect(payload.AGENT_CTX_HARNESS_SESSION_ID).toBe("sess_child");
		expect(payload.AGENT_CTX_MODEL).toBe("anthropic/claude-3-5-haiku");
		expect(payload.AGENT_CTX_SESSION_NAME).toBe("child-visible");
		expect(payload.AGENT_CTX_MULTIPLEXER).toBeNull();
		expect(payload.AGENT_CTX_AGENT_ID).toBeNull();
		expect(payload.AGENT_CTX_MACHINE_ID).toBe("node-studio");
		expect(payload.AGENT_CTX_NODE_HOSTNAME).toBe("node-studio");
		expect(payload.AGENT_CTX_OS_ARCH).toBe("darwin/arm64");
	});
});
