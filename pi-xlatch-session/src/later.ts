export interface ParkedItem {
	id: string;
	label: string;
	mime_type: string;
	created_at: number;
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
}

export function formatParkedContent(content: ParkedContent): string {
	const file = content.input.file;
	if (file?.path) {
		const size = typeof file.size === "number" ? `, ${formatBytes(file.size)}` : "";
		return [
			"Retrieved from xlatch Save for Later (file):",
			"",
			file.path,
			"",
			`(${file.mime_type ?? content.item.mime_type}${size})`,
		].join("\n");
	}
	const text = content.input.text?.trim();
	if (text) {
		const kind = content.item.mime_type === "text/uri-list" ? "link" : "text";
		return `Retrieved from xlatch Save for Later (${kind}):\n\n${text}`;
	}
	throw new Error("The parked item contains no readable text or local file path.");
}

export function formatParkedList(items: ParkedItem[]): string {
	if (items.length === 0) return "Nothing is saved for later.";
	return items.map((item, index) => `${index + 1}. ${item.label} [${item.mime_type}] (${item.id})`).join("\n");
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
