import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as net from "node:net";
import { SlotEndpoint, removeDeadSocket, socketLive } from "./src/slot.js";

async function bind(endpoint: SlotEndpoint) {
	const server = net.createServer((socket) => socket.end());
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(endpoint.socket, resolve);
	});
	endpoint.publish();
	return server;
}

test("late old close cannot remove a replacement route", async () => {
	const dir = fs.mkdtempSync("/tmp/xlt-");
	const path = `${dir}/slot.sock`;
	const old = new SlotEndpoint(path);
	const first = await bind(old);
	fs.unlinkSync(path);
	const current = new SlotEndpoint(path);
	const second = await bind(current);
	try {
		expect(await old.healthy(first)).toBe(false);
		old.close(first);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(await current.healthy(second)).toBe(true);
	} finally {
		current.close(second);
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("missing alias is restored only to its owner, and live sockets cannot be pruned", async () => {
	const dir = fs.mkdtempSync("/tmp/xlt-");
	const endpoint = new SlotEndpoint(`${dir}/slot.sock`);
	const server = await bind(endpoint);
	try {
		expect(() => removeDeadSocket(endpoint.publicPath, process.pid)).toThrow();
		fs.unlinkSync(endpoint.publicPath);
		expect(await endpoint.healthy(server)).toBe(true);
		expect(await socketLive(endpoint.publicPath)).toBe(true);
		expect(() => removeDeadSocket(endpoint.publicPath)).toThrow();
	} finally {
		endpoint.close(server);
		fs.rmSync(dir, { recursive: true, force: true });
	}
});
