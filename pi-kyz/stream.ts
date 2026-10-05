import { StringDecoder } from "node:string_decoder";
import { type SecretValue, scrubText, secretNeedles } from "./scrub.js";

/** Redact before host accumulation/spill files, including matches across chunk boundaries. */
export function secretStream(secrets: readonly SecretValue[], emit: (data: Buffer) => void) {
	const decoder = new StringDecoder("utf8");
	const needles = secretNeedles(secrets);
	const hold = needles.reduce((max, value) => Math.max(max, value.length), 1);
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
		// StringDecoder preserves UTF-8, but a UTF-16 slice can still split an emoji.
		const previous = pending.charCodeAt(cut - 1);
		const next = pending.charCodeAt(cut);
		if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) cut--;
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
