/**
 * Host-neutral consumer surface for the shared runtime interactions.
 *
 * Imported by Oq, oqt and mobile builds. Contains no pi, pi-tui, socket, hub or
 * extension-entry imports: a producer (pi-tui-rpc personal bridge, a managed
 * runner, or oqt's own pinned-source hook) supplies `InteractionPorts` and an
 * `InteractionAdmission`.
 */
export * from "./interaction-port.js";
export * from "./interaction-runtime.js";
export * from "./interaction-terminal.js";
export * from "./interaction-coverage.js";
export * from "./wire.js";
