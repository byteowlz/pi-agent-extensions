// Types for the generated openui-vendor.js bundle (see vendor-src/build.ts).
export const PROFILE_VERSION: string;
export const SYSTEM_PROMPT: string;
export const FIXTURES: Record<string, string>;
export function renderFallback(node: unknown): string;
export function evaluate(node: never, context: { getState(name: string): unknown; resolveRef(name: string): unknown }): unknown;
export function createOqtoParser(): {
	parse(text: string): {
		root: unknown;
		stateDeclarations: Record<string, unknown>;
		meta: { incomplete: boolean; errors: { code: string; message?: string }[] };
	};
};
