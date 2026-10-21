import { expect, test } from "bun:test";
import { ACCESS_TTL_SECONDS, APPROVAL_TIMEOUT_SECONDS, withApprovalDeadline } from "./access-request.js";

test("approval and access defaults are independently bounded", () => {
	expect(APPROVAL_TIMEOUT_SECONDS).toBe(120);
	expect(ACCESS_TTL_SECONDS).toBe(900);
});

for (const cancellation of [false, true]) {
	test(`late approval cannot continue after ${cancellation ? "cancellation" : "timeout"}`, async () => {
		const controller = new AbortController();
		let resolve!: () => void;
		const dialog = new Promise<void>((done) => {
			resolve = done;
		});
		let loaded = false;
		const request = withApprovalDeadline(0.01, controller.signal, async (check) => {
			await dialog;
			check();
			loaded = true;
		});
		if (cancellation) controller.abort();
		await expect(request).rejects.toThrow();
		resolve();
		await new Promise((done) => setTimeout(done, 5));
		expect(loaded).toBe(false);
	});
}

test("already cancelled request never starts", async () => {
	const controller = new AbortController();
	controller.abort();
	let started = false;
	await expect(
		withApprovalDeadline(1, controller.signal, async () => {
			started = true;
		})
	).rejects.toThrow();
	expect(started).toBe(false);
});
