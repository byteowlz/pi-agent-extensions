/**
 * Oqto Bridge Extension for Pi
 *
 * Emits granular agent phase status via ctx.ui.setStatus() so that the
 * Oqto runner can translate pi's native events into canonical
 * `agent.working { phase }` events.
 *
 * In RPC mode, setStatus calls become `extension_ui_request` JSON events
 * on stdout with method "setStatus", which the runner reads and maps to
 * canonical events.
 *
 * The runner uses these in combination with pi's native lifecycle events
 * (agent_start, agent_end, tool_execution_start, etc.) and PID-based
 * process monitoring to produce the full canonical event stream.
 *
 * Status key: "oqto_phase"
 * Status values:
 *   "generating"                - LLM is producing tokens
 *   "thinking"                  - LLM is in extended thinking mode
 *   "tool_running:<tool_name>"  - Tool is executing
 *   "compacting"                - Context compaction in progress
 *   undefined                   - Clear phase (runner determines state from native events)
 *
 * The runner's state machine rules:
 *   - agent_start  -> working("generating")
 *   - agent_end    -> idle
 *   - oqto_phase=X -> refine phase within working state (never transitions to idle)
 *   - oqto_phase=  -> clear phase, fall back to native event inference
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// ============================================================================
// Status helpers
// ============================================================================

const STATUS_KEY = "oqto_phase";

/** Set the current phase. The runner reads this from stdout. */
function setPhase(ctx: ExtensionContext, phase: string, detail?: string): void {
	const value = detail ? `${phase}:${detail}` : phase;
	ctx.ui.setStatus(STATUS_KEY, value);
}

/** Clear the current phase. Runner falls back to native event inference. */
function clearPhase(ctx: ExtensionContext): void {
	ctx.ui.setStatus(STATUS_KEY, undefined);
}

// ============================================================================
// Session env helpers
// ============================================================================

/**
 * Export session identity as env vars so child processes (agntz, etc.)
 * can identify which harness, session, and model they're running under.
 *
 * Called on session_start and turn_end (name may appear after auto-rename).
 */
function exportSessionEnv(ctx: ExtensionContext): void {
	process.env.PI_HARNESS = "pi";
	process.env.PI_SESSION_ID = ctx.sessionManager.getSessionId?.() ?? "";
	process.env.PI_SESSION_FILE = ctx.sessionManager.getSessionFile?.() ?? "";
	process.env.PI_CWD = ctx.cwd;

	const name = ctx.sessionManager.getSessionName?.();
	if (name) {
		process.env.PI_SESSION_NAME = name;
	}

	if (ctx.model) {
		process.env.PI_MODEL = `${ctx.model.provider}/${ctx.model.id}`;
	}
}

// ============================================================================
// Extension entry point
// ============================================================================

export default function oqtoBridge(pi: ExtensionAPI) {
	// Track whether we are inside an agent run so we only emit phase
	// updates when the agent is actually working. This avoids confusing
	// the runner with stale status events between runs.
	let agentRunning = false;

	// --- Agent lifecycle ---

	pi.on("agent_start", (_event, ctx) => {
		agentRunning = true;
		setPhase(ctx, "generating");
	});

	pi.on("agent_end", (_event, ctx) => {
		agentRunning = false;
		clearPhase(ctx);
	});

	// --- Tool execution ---
	//
	// tool_call fires when the LLM decides to call a tool (before execution).
	// tool_result fires after execution completes.
	//
	// We emit "tool_running:<name>" on tool_call and go back to "generating"
	// on tool_result (the agent loop will either call another tool or start
	// a new LLM turn).

	pi.on("tool_call", (event, ctx) => {
		if (!agentRunning) return;
		setPhase(ctx, "tool_running", event.toolName);
		// Return undefined: don't block the tool
	});

	pi.on("tool_result", (_event, ctx) => {
		if (!agentRunning) return;
		// Tool done. The agent loop will continue with the next turn.
		// Set back to generating so the runner knows we're waiting for LLM.
		setPhase(ctx, "generating");
	});

	// --- Turn tracking ---
	//
	// turn_start fires at the beginning of each LLM turn (there can be
	// multiple turns per agent run when tools are involved).
	// We reset to "generating" at the start of each turn.

	pi.on("turn_start", (_event, ctx) => {
		if (!agentRunning) return;
		setPhase(ctx, "generating");
	});

	// --- Compaction ---
	//
	// session_before_compact fires before compaction starts.
	// session_compact fires after compaction completes.
	// The runner also sees auto_compaction_start/end from pi's native events,
	// but the extension provides earlier notification via before_compact.

	pi.on("session_before_compact", (_event, ctx) => {
		setPhase(ctx, "compacting");
		// Return undefined: don't cancel compaction
	});

	pi.on("session_compact", (_event, ctx) => {
		// Compaction done. If agent is still running, go back to generating.
		// If not, clear phase entirely.
		if (agentRunning) {
			setPhase(ctx, "generating");
		} else {
			clearPhase(ctx);
		}
	});

	// --- Session lifecycle ---
	//
	// Reset state when switching sessions to avoid stale phase data.

	pi.on("session_switch", (_event, ctx) => {
		agentRunning = false;
		clearPhase(ctx);
	});

	pi.on("session_start", (_event, ctx) => {
		agentRunning = false;
		clearPhase(ctx);
		exportSessionEnv(ctx);
	});

	// Update env after each turn -- session name may have been set by
	// auto-rename or /rename during the turn.
	pi.on("turn_end", (_event, ctx) => {
		exportSessionEnv(ctx);
	});

	// Keep model env var current when model changes
	pi.on("model_change", (event, _ctx) => {
		if (event.model) {
			process.env.PI_MODEL = `${event.model.provider}/${event.model.id}`;
		}
	});
}
