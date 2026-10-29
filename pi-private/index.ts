import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type Profile, launch } from "./launch.js";

export function parsePrivateRequest(raw: string): { profile: Profile; resumeDir?: string } {
	const args = raw.trim();
	if (!args) return { profile: "private" };
	if (args === "nohistory") return { profile: "nohistory" };
	if (args.startsWith("nohistory resume ") && args.slice("nohistory resume ".length).trim()) {
		return { profile: "nohistory", resumeDir: args.slice("nohistory resume ".length).trim() };
	}
	if (args.startsWith("resume ") && args.slice("resume ".length).trim()) {
		return { profile: "private", resumeDir: args.slice("resume ".length).trim() };
	}
	throw new Error("Usage: /private [nohistory] [resume /absolute/vault/path]");
}

export default function (pi: ExtensionAPI): void {
	pi.registerCommand("private", {
		description: "Open or resume an age-sealed Pi vault; nohistory excludes history-search",
		handler: async (args, ctx) => {
			try {
				const { profile, resumeDir } = parsePrivateRequest(args);
				ctx.ui.notify(await launch(profile, ctx.cwd, "auto", undefined, resumeDir), "info");
			} catch (error) {
				ctx.ui.notify(String(error), "error");
			}
		},
	});
}
