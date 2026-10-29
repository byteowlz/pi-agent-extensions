// Invoked inside a Herdr tab/tmux window. No secrets are accepted in argv or env.
import { type Profile, loadConfig, prepare } from "./launch.js";
import { runPrivate } from "./runner-core.js";

const [profile, vaultDir, cwd, option] = process.argv.slice(2);
if ((profile !== "private" && profile !== "nohistory") || !vaultDir || !cwd || (option && option !== "--resume")) {
	console.error("Invalid private vault launcher arguments");
	process.exitCode = 2;
} else {
	try {
		if (process.platform === "win32") throw new Error("native Windows private launcher is unverified; no unsafe fallback");
		const plan = prepare(profile as Profile, loadConfig(), vaultDir, option === "--resume");
		await runPrivate(plan, option === "--resume", cwd, { ...process.env, ...plan.env });
		console.log(`Individual session files sealed with age: ${plan.vaultDir}`);
	} catch (error) {
		console.error(String(error));
		process.exitCode = 1;
	}
}
