import { expect, test } from "bun:test";
import { secretStream } from "./stream.js";

test("stream redaction preserves UTF8 and catches every cross-chunk secret boundary", () => {
	const secret = "fake/SECRET:stream-fixture";
	const input = `α before ${secret} after ${encodeURIComponent(secret)} and ${Buffer.from(secret).toString("base64")} ω`;
	const bytes = Buffer.from(input);
	for (let split = 1; split < bytes.length; split++) {
		const chunks: Buffer[] = [];
		const stream = secretStream([{ name: "TEST", value: secret }], (data) => chunks.push(data));
		stream.write(bytes.subarray(0, split));
		stream.write(bytes.subarray(split));
		stream.end();
		const output = Buffer.concat(chunks).toString("utf8");
		expect(output).toBe("α before [REDACTED] after [REDACTED] and [REDACTED] ω");
	}
});
