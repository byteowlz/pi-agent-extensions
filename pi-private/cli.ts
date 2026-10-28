import { launch } from "./launch.js";

const args = process.argv.slice(2);
const profile = args[0] === "nohistory" ? "nohistory" : "private";
if (profile === "nohistory") args.shift();
const resumeDir = args[0] === "--resume" && args.length === 2 ? args[1] : undefined;
if (args.length !== 0 && !resumeDir) {
	console.error("Usage: bun pi-private/cli.ts [nohistory] [--resume SESSION_DIR]");
	process.exitCode = 2;
} else {
	try {
		console.log(await launch(profile, process.cwd(), "plain", undefined, resumeDir));
	} catch (error) {
		console.error(String(error));
		process.exitCode = 1;
	}
}
