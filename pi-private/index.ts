import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { launch } from "./launch.js";

export default function (pi: ExtensionAPI): void {
	pi.registerCommand("private", {
		description: "Start a fresh isolated pi tab; /private nohistory excludes history-search and all other optional extensions",
		handler: async (args, ctx) => {
			const mode = args.trim();
			if (mode !== "" && mode !== "nohistory") {
				ctx.ui.notify("Usage: /private [nohistory]", "error");
				return;
			}
			try {
				ctx.ui.notify(await launch(mode === "nohistory" ? "nohistory" : "private", ctx.cwd), "info");
			} catch (error) {
				ctx.ui.notify(String(error), "error");
			}
		},
	});
}
