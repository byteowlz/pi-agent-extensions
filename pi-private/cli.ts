import { sealLeftovers } from "./age-store.js";
import { launch, loadConfig, prepare } from "./launch.js";

const args = process.argv.slice(2);
const profile = args[0] === "nohistory" ? "nohistory" : "private";
if (profile === "nohistory") args.shift();
const command = args[0];
const vaultDir = (command === "--resume" || command === "--seal") && args.length === 2 ? args[1] : undefined;
if (args.length !== 0 && !vaultDir) {
	console.error("Usage: bun pi-private/cli.ts [nohistory] [--resume|--seal VAULT_DIR]");
	process.exitCode = 2;
} else {
	try {
		if (process.platform === "win32") throw new Error("native Windows private launcher is unverified; no unsafe fallback");
		if (command === "--seal" && vaultDir) {
			const plan = prepare(profile, loadConfig(), vaultDir, false);
			await sealLeftovers(plan);
			console.log(`Individual session files sealed with age: ${plan.vaultDir}`);
		} else console.log(await launch(profile, process.cwd(), "plain", undefined, vaultDir));
	} catch (error) {
		console.error(String(error));
		process.exitCode = 1;
	}
}
