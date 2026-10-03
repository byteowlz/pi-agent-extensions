import { StringDecoder } from "node:string_decoder";
import { type SecretValue, scrubText } from "./scrub.js";

/** Redact before host accumulation/spill files, including matches across chunk boundaries. */
export function secretStream(secrets: readonly SecretValue[], emit: (data: Buffer) => void) {
	const decoder = new StringDecoder("utf8");
	const needles = secrets
		.flatMap((secret) => [secret.value, Buffer.from(secret.value).toString("base64"), encodeURIComponent(secret.value)])
		.filter(Boolean);
	const hold = Math.max(1, ...needles.map((value) => value.length));
	let pending = "";
	function flush(final: boolean) {
		let cut = final ? pending.length : Math.max(0, pending.length - hold);
		// Move the source boundary before any whole match crossing it.
		for (const needle of needles) {
			let index = pending.indexOf(needle);
			while (index >= 0 && index < cut) {
				if (index + needle.length > cut) cut = index;
				index = pending.indexOf(needle, index + 1);
			}
		}
		if (cut > 0) emit(Buffer.from(scrubText(pending.slice(0, cut), secrets)));
		pending = pending.slice(cut);
	}
	return {
		write(data: Buffer) {
			pending += decoder.write(data);
			flush(false);
		},
		end() {
			pending += decoder.end();
			flush(true);
		},
	};
}
