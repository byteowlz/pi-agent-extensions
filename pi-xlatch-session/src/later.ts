export interface ParkedItem {
	id: string;
	label: string;
	mime_type: string;
	created_at: number;
	preparation?: {
		capability_id: string;
		revision: string;
		status: string;
		job_id?: string;
		error?: string;
	};
}

export interface ParkedContent {
	item: ParkedItem;
	input: {
		text?: string;
		mime_type?: string;
		file?: {
			name?: string;
			mime_type?: string;
			size?: number;
			path?: string;
		};
	};
	prepared?: unknown;
}

export function formatParkedContent(content: ParkedContent): string {
	let original: string;
	const file = content.input.file;
	if (file?.path) {
		const size = typeof file.size === "number" ? `, ${formatBytes(file.size)}` : "";
		original = [
			"Retrieved from xlatch Save for Later (file):",
			"",
			file.path,
			"",
			`(${file.mime_type ?? content.item.mime_type}${size})`,
		].join("\n");
	} else if (content.input.text?.trim()) {
		const text = content.input.text.trim();
		const kind = content.item.mime_type === "text/uri-list" ? "link" : "text";
		original = `Retrieved from xlatch Save for Later (${kind}):\n\n${text}`;
	} else {
		throw new Error("The parked item contains no readable text or local file path.");
	}
	const preparation = content.item.preparation;
	if (!preparation) return original;
	if (preparation.status === "succeeded" && content.prepared !== undefined) {
		return `${original}\n\nCached prepared context from ${preparation.capability_id}:\n\n${formatPrepared(content.prepared)}`;
	}
	if (["queued", "running"].includes(preparation.status)) {
		return `${original}\n\nPreparation by ${preparation.capability_id} is still ${preparation.status}; no cached context is available yet.`;
	}
	return `${original}\n\nPreparation by ${preparation.capability_id} ${preparation.status}; no cached context is available.`;
}

export function formatParkedList(items: ParkedItem[]): string {
	if (items.length === 0) return "Nothing is saved for later.";
	return items
		.map((item, index) => {
			const preparation = item.preparation ? `, preparation: ${item.preparation.status}` : "";
			return `${index + 1}. ${item.label} [${item.mime_type}${preparation}] (${item.id})`;
		})
		.join("\n");
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPrepared(value: unknown): string {
	if (typeof value === "string") return value;
	if (value && typeof value === "object" && "text" in value && typeof value.text === "string") return value.text;
	return JSON.stringify(value, null, 2);
}
