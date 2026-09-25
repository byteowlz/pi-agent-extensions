import { describe, expect, test } from "bun:test";
import { GUARD_ALLOW_TOKEN, guardRelevantText, sudoGuardDecision } from "./index";

describe("pi-sudo guard: guardRelevantText", () => {
	test("preserves command substitution content (it executes)", () => {
		const text = guardRelevantText('echo "$(sudo reboot)"');
		expect(text).toContain("sudo reboot");
	});

	test("preserves backtick substitution content (it executes)", () => {
		const text = guardRelevantText("echo `sudo reboot`");
		expect(text).toContain("sudo reboot");
	});

	test("strips double-quoted text (data, not command position)", () => {
		const text = guardRelevantText('git commit -m "fix ssh host sudo handling"');
		expect(text).not.toContain("sudo");
	});

	test("strips single-quoted text", () => {
		const text = guardRelevantText("grep 'sudo faillock' /var/log/auth.log");
		expect(text).not.toContain("sudo");
	});

	test("strips comments", () => {
		const text = guardRelevantText("echo hi # run sudo later");
		expect(text).not.toContain("sudo");
	});
});

describe("pi-sudo guard: sudoGuardDecision", () => {
	test("blocks interactive local sudo", () => {
		expect(sudoGuardDecision("sudo systemctl restart nginx").block).toBe(true);
		expect(sudoGuardDecision("sudo systemctl restart nginx").remote).toBe(false);
	});

	test("blocks nested substitution sudo (it would execute)", () => {
		expect(sudoGuardDecision('echo "$(sudo reboot)"').block).toBe(true);
	});

	test("allows sudo -n (non-interactive)", () => {
		expect(sudoGuardDecision("sudo -n -l").block).toBe(false);
	});

	test("allows sudo mentioned only inside quotes (commit message case)", () => {
		expect(sudoGuardDecision('git commit -m "fix ssh host sudo handling"').block).toBe(false);
	});

	test("allows sudo mentioned only in comments", () => {
		expect(sudoGuardDecision("echo hi # run sudo later").block).toBe(false);
	});

	test("blocks interactive remote sudo through ssh", () => {
		const d = sudoGuardDecision("ssh workbox 'sudo systemctl restart foo'");
		expect(d.block).toBe(true);
		expect(d.remote).toBe(true);
	});

	test("reason mentions the escape token", () => {
		expect(sudoGuardDecision("sudo true").reason).toContain(GUARD_ALLOW_TOKEN);
	});
});
