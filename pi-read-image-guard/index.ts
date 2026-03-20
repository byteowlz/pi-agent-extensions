import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ImageContent, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type GuardConfig = {
	enabled: boolean;
	maxImageBase64Bytes: number;
	maxWidth: number;
	maxHeight: number;
	jpegQuality: number;
	notify: boolean;
};

type ToolContentBlock = TextContent | ImageContent;

type ResizeImageInput = {
	type: "image";
	data: string;
	mimeType: string;
};

type ResizeImageOptions = {
	maxWidth?: number;
	maxHeight?: number;
	maxBytes?: number;
	jpegQuality?: number;
};

type ResizeImageResult = {
	data: string;
	mimeType: string;
};

type ResizeImageFn = (img: ResizeImageInput, options?: ResizeImageOptions) => Promise<ResizeImageResult>;

const CONFIG_FILENAME = "read-image-guard.json";
const DEFAULT_CONFIG: GuardConfig = {
	enabled: true,
	maxImageBase64Bytes: 1_200_000,
	maxWidth: 1200,
	maxHeight: 1200,
	jpegQuality: 70,
	notify: true,
};

let resizeLoader: Promise<ResizeImageFn | null> | null = null;

function loadConfig(ctx: ExtensionContext): GuardConfig {
	const cwd = ctx.sessionManager.getCwd();
	const candidates = [
		join(cwd, CONFIG_FILENAME),
		join(cwd, ".pi", CONFIG_FILENAME),
		join(homedir(), ".pi", "agent", CONFIG_FILENAME),
	];

	for (const path of candidates) {
		if (!existsSync(path)) continue;
		try {
			const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<GuardConfig>;
			return { ...DEFAULT_CONFIG, ...parsed };
		} catch {
			// Ignore invalid config and continue.
		}
	}

	return DEFAULT_CONFIG;
}

function isImageBlock(block: ToolContentBlock): block is ImageContent {
	return block.type === "image" && typeof (block as { data?: unknown }).data === "string";
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function base64ToBinaryMaxBytes(base64Bytes: number): number {
	return Math.max(1, Math.floor((base64Bytes * 3) / 4));
}

async function getResizeImage(): Promise<ResizeImageFn | null> {
	if (resizeLoader) return resizeLoader;

	resizeLoader = (async () => {
		try {
			// @ts-ignore - deep import path not in package exports, but exists at runtime
			const mod = (await import("@mariozechner/pi-coding-agent/dist/utils/image-resize.js")) as { resizeImage?: ResizeImageFn };
			return typeof mod.resizeImage === "function" ? mod.resizeImage : null;
		} catch {
			return null;
		}
	})();

	return resizeLoader;
}

async function downscaleImageBlock(
	block: ImageContent,
	config: GuardConfig
): Promise<{ updated: ToolContentBlock; changed: boolean }> {
	const resizeImage = await getResizeImage();
	if (!resizeImage) {
		return {
			updated: {
				type: "text",
				text:
					"[read-image-guard] Omitted oversized inline image because resize helper is unavailable. " +
					"Please downscale the image and read it again.",
			},
			changed: true,
		};
	}

	const mimeType = block.mimeType.trim().length > 0 ? block.mimeType : "image/png";

	try {
		const resized = await resizeImage(
			{
				type: "image",
				data: block.data,
				mimeType,
			},
			{
				maxWidth: config.maxWidth,
				maxHeight: config.maxHeight,
				maxBytes: base64ToBinaryMaxBytes(config.maxImageBase64Bytes),
				jpegQuality: config.jpegQuality,
			}
		);

		if (resized.data.length <= config.maxImageBase64Bytes) {
			return {
				updated: {
					...block,
					data: resized.data,
					mimeType: resized.mimeType,
				},
				changed: resized.data !== block.data || resized.mimeType !== block.mimeType,
			};
		}
	} catch {
		// Fall through to omission note.
	}

	return {
		updated: {
			type: "text",
			text: `[read-image-guard] Omitted oversized inline image (${formatBytes(block.data.length)} base64). Please crop/downscale the image and read it again.`,
		},
		changed: true,
	};
}

interface RewriteResult {
	rewritten: ToolContentBlock[];
	changed: boolean;
	resizedCount: number;
	omittedCount: number;
}

async function rewriteImageBlocks(content: ToolContentBlock[], config: GuardConfig): Promise<RewriteResult> {
	const rewritten: ToolContentBlock[] = [];
	let changed = false;
	let resizedCount = 0;
	let omittedCount = 0;

	for (const block of content) {
		if (!isImageBlock(block) || block.data.length <= config.maxImageBase64Bytes) {
			rewritten.push(block);
			continue;
		}

		const result = await downscaleImageBlock(block, config);
		if (result.changed) {
			changed = true;
			if (isImageBlock(result.updated)) {
				resizedCount += 1;
			} else {
				omittedCount += 1;
			}
		}
		rewritten.push(result.updated);
	}

	return { rewritten, changed, resizedCount, omittedCount };
}

function notifyImageChanges(ctx: ExtensionContext, resizedCount: number, omittedCount: number): void {
	const parts: string[] = [];
	if (resizedCount > 0) parts.push(`resized ${resizedCount}`);
	if (omittedCount > 0) parts.push(`omitted ${omittedCount}`);
	ctx.ui.notify(
		`read-image-guard: ${parts.join(", ")} oversized image payload(s) from read tool to avoid request overflow.`,
		"warning"
	);
}

export default function (pi: ExtensionAPI): void {
	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "read") return;

		const config = loadConfig(ctx);
		if (!config.enabled) return;
		if (!Array.isArray(event.content)) return;

		const { rewritten, changed, resizedCount, omittedCount } = await rewriteImageBlocks(
			event.content as ToolContentBlock[],
			config
		);

		if (!changed) return;

		if (config.notify && ctx.hasUI) {
			notifyImageChanges(ctx, resizedCount, omittedCount);
		}

		return { content: rewritten };
	});
}
