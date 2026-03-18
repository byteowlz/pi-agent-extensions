/**
 * pi-think-tag-extension
 *
 * Parses <think>...</think> tags from OpenAI-compatible model responses
 * and converts them into proper thinking blocks that pi can display natively.
 *
 * Many models (MiniMax, DeepSeek, GLM, etc.) emit reasoning inside <think> tags
 * in the regular content stream when served via OpenAI-compatible endpoints.
 * Pi's built-in openai-completions handler only recognizes reasoning from the
 * reasoning_content field, so these tags show up as raw text.
 *
 * This extension registers a custom API type named
 * "openai-completions-convert-think-tags".
 *
 * Usage:
 *   1. Add provider names to THINK_TAG_PROVIDERS below
 *   2. In models.json, set provider.api to "openai-completions-convert-think-tags"
 *   3. Keep model.reasoning enabled when thinking is desired
 *   4. Copy/symlink to ~/.pi/agent/extensions/
 *   5. /reload in pi
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type Api,
  createAssistantMessageEventStream,
  streamSimpleOpenAICompletions,
} from "@mariozechner/pi-ai";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Provider names whose streams should be wrapped with think-tag parsing.
 * Add your custom provider names here.
 */
const THINK_TAG_PROVIDERS = new Set([
  "fhgenie-preview",
  "eavs-fhgenie",
  "eavs-internal-iem",
  // Add more provider names as needed
]);

// Supported tag pairs. First match wins.
const TAG_PAIRS = [
  { open: "<think>", close: "</think>" },
  { open: "<thinking>", close: "</thinking>" },
];

// ---------------------------------------------------------------------------
// State machine for streaming think-tag extraction
// ---------------------------------------------------------------------------

const ParseState = {
  /** Normal text output */
  Text: 0,
  /** Inside a think block -- routing deltas to thinking events */
  Thinking: 1,
  /** Buffering chars that might be the start of an opening or closing tag */
  MaybeTag: 2,
} as const;
type ParseState = (typeof ParseState)[keyof typeof ParseState];

interface ParserContext {
  state: ParseState;
  /** Buffer for partial tag matches */
  tagBuf: string;
  /** Which tag pair we matched (set once we see the opening tag) */
  activeTag: (typeof TAG_PAIRS)[number] | null;
  /** The previous state before entering MaybeTag (to know where to return) */
  preTagState: ParseState;
  /** The output AssistantMessage we're building */
  output: AssistantMessage;
  /** The wrapper stream we push events to */
  stream: AssistantMessageEventStream;
}

function contentIndex(ctx: ParserContext): number {
  return ctx.output.content.length - 1;
}

/** Ensure there is an active text block to write into */
function ensureTextBlock(ctx: ParserContext): void {
  const last = ctx.output.content[ctx.output.content.length - 1];
  if (!last || last.type !== "text") {
    ctx.output.content.push({ type: "text", text: "" });
    ctx.stream.push({
      type: "text_start",
      contentIndex: contentIndex(ctx),
      partial: ctx.output,
    });
  }
}

/** Ensure there is an active thinking block to write into */
function ensureThinkingBlock(ctx: ParserContext): void {
  const last = ctx.output.content[ctx.output.content.length - 1];
  if (!last || last.type !== "thinking") {
    ctx.output.content.push({ type: "thinking", thinking: "" });
    ctx.stream.push({
      type: "thinking_start",
      contentIndex: contentIndex(ctx),
      partial: ctx.output,
    });
  }
}

/** Emit text delta to the current text block */
function emitTextDelta(ctx: ParserContext, text: string): void {
  if (!text) return;
  ensureTextBlock(ctx);
  const block = ctx.output.content[contentIndex(ctx)];
  if (block.type === "text") {
    block.text += text;
    ctx.stream.push({
      type: "text_delta",
      contentIndex: contentIndex(ctx),
      delta: text,
      partial: ctx.output,
    });
  }
}

/** Emit thinking delta to the current thinking block */
function emitThinkingDelta(ctx: ParserContext, text: string): void {
  if (!text) return;
  ensureThinkingBlock(ctx);
  const block = ctx.output.content[contentIndex(ctx)];
  if (block.type === "thinking") {
    block.thinking += text;
    ctx.stream.push({
      type: "thinking_delta",
      contentIndex: contentIndex(ctx),
      delta: text,
      partial: ctx.output,
    });
  }
}

/** Close the current text block */
function endTextBlock(ctx: ParserContext): void {
  const idx = contentIndex(ctx);
  const block = ctx.output.content[idx];
  if (block && block.type === "text") {
    ctx.stream.push({
      type: "text_end",
      contentIndex: idx,
      content: block.text,
      partial: ctx.output,
    });
  }
}

/** Close the current thinking block */
function endThinkingBlock(ctx: ParserContext): void {
  const idx = contentIndex(ctx);
  const block = ctx.output.content[idx];
  if (block && block.type === "thinking") {
    ctx.stream.push({
      type: "thinking_end",
      contentIndex: idx,
      content: block.thinking,
      partial: ctx.output,
    });
  }
}

/**
 * Check if buf is a prefix of any candidate string.
 */
function isPrefixOfAny(buf: string, candidates: string[]): boolean {
  return candidates.some((c) => c.startsWith(buf));
}

/**
 * Process a chunk of text through the state machine.
 * Handles tags split across multiple streaming deltas.
 */
function processChunk(ctx: ParserContext, chunk: string): void {
  let i = 0;

  while (i < chunk.length) {
    const ch = chunk[i];

    switch (ctx.state) {
      case ParseState.Text: {
        if (ch === "<") {
          ctx.tagBuf = "<";
          ctx.preTagState = ParseState.Text;
          ctx.state = ParseState.MaybeTag;
          i++;
        } else {
          const nextLt = chunk.indexOf("<", i);
          if (nextLt === -1) {
            emitTextDelta(ctx, chunk.slice(i));
            i = chunk.length;
          } else {
            emitTextDelta(ctx, chunk.slice(i, nextLt));
            i = nextLt;
          }
        }
        break;
      }

      case ParseState.Thinking: {
        if (ch === "<") {
          ctx.tagBuf = "<";
          ctx.preTagState = ParseState.Thinking;
          ctx.state = ParseState.MaybeTag;
          i++;
        } else {
          const nextLt = chunk.indexOf("<", i);
          if (nextLt === -1) {
            emitThinkingDelta(ctx, chunk.slice(i));
            i = chunk.length;
          } else {
            emitThinkingDelta(ctx, chunk.slice(i, nextLt));
            i = nextLt;
          }
        }
        break;
      }

      case ParseState.MaybeTag: {
        ctx.tagBuf += ch;
        i++;

        const wasInThinking = ctx.preTagState === ParseState.Thinking;
        const candidates = wasInThinking
          ? [ctx.activeTag!.close]
          : TAG_PAIRS.map((t) => t.open);

        // Check for closing tag match
        if (wasInThinking && ctx.tagBuf === ctx.activeTag!.close) {
          endThinkingBlock(ctx);
          ctx.activeTag = null;
          ctx.tagBuf = "";
          ctx.state = ParseState.Text;
          break;
        }

        // Check for opening tag match
        const matchedOpen = !wasInThinking
          ? TAG_PAIRS.find((t) => ctx.tagBuf === t.open)
          : null;

        if (matchedOpen) {
          const last = ctx.output.content[contentIndex(ctx)];
          if (last && last.type === "text") {
            endTextBlock(ctx);
          }
          ctx.activeTag = matchedOpen;
          ctx.tagBuf = "";
          ctx.state = ParseState.Thinking;
          break;
        }

        // Still a possible prefix?
        if (isPrefixOfAny(ctx.tagBuf, candidates)) {
          break;
        }

        // Not a tag -- flush buffer as regular content
        const buf = ctx.tagBuf;
        ctx.tagBuf = "";
        ctx.state = ctx.preTagState;

        if (wasInThinking) {
          emitThinkingDelta(ctx, buf);
        } else {
          emitTextDelta(ctx, buf);
        }
        break;
      }
    }
  }
}

/**
 * Flush remaining buffered content at end of stream.
 */
function flush(ctx: ParserContext): void {
  if (ctx.tagBuf) {
    const wasInThinking =
      ctx.preTagState === ParseState.Thinking || ctx.activeTag !== null;
    if (wasInThinking) {
      emitThinkingDelta(ctx, ctx.tagBuf);
    } else {
      emitTextDelta(ctx, ctx.tagBuf);
    }
    ctx.tagBuf = "";
  }

  // Close any open blocks
  const last = ctx.output.content[contentIndex(ctx)];
  if (last) {
    if (last.type === "text") {
      endTextBlock(ctx);
    } else if (last.type === "thinking") {
      endThinkingBlock(ctx);
    }
  }
}

// ---------------------------------------------------------------------------
// Stream wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps an upstream AssistantMessageEventStream, intercepting text events
 * and converting <think> tags into proper thinking events.
 */
function wrapStream(
  upstream: AssistantMessageEventStream,
): AssistantMessageEventStream {
  const wrapper = createAssistantMessageEventStream();

  (async () => {
    let parserCtx: ParserContext | null = null;

    try {
      for await (const event of upstream) {
        switch (event.type) {
          case "start": {
            const output: AssistantMessage = {
              ...event.partial,
              content: [],
            };
            parserCtx = {
              state: ParseState.Text,
              tagBuf: "",
              activeTag: null,
              preTagState: ParseState.Text,
              output,
              stream: wrapper,
            };
            wrapper.push({ type: "start", partial: output });
            break;
          }

          case "text_delta": {
            if (!parserCtx) break;
            processChunk(parserCtx, event.delta);
            break;
          }

          case "text_start":
          case "text_end": {
            // Swallowed -- our parser creates/ends its own blocks
            break;
          }

          // Native thinking events pass through (model may use reasoning_content)
          case "thinking_start":
          case "thinking_delta":
          case "thinking_end": {
            wrapper.push(event);
            break;
          }

          // Tool calls: copy into our output with corrected content indices
          case "toolcall_start": {
            if (!parserCtx) break;
            const upstreamBlock = event.partial.content[event.contentIndex];
            if (upstreamBlock && upstreamBlock.type === "toolCall") {
              // End any open text/thinking block
              const last = parserCtx.output.content[contentIndex(parserCtx)];
              if (last && last.type === "text") endTextBlock(parserCtx);
              else if (last && last.type === "thinking") endThinkingBlock(parserCtx);

              parserCtx.output.content.push({ ...upstreamBlock });
              wrapper.push({
                ...event,
                contentIndex: contentIndex(parserCtx),
                partial: parserCtx.output,
              });
            }
            break;
          }

          case "toolcall_delta": {
            if (!parserCtx) break;
            const idx = parserCtx.output.content.length - 1;
            const block = parserCtx.output.content[idx];
            if (block && block.type === "toolCall") {
              const upBlock = event.partial.content[event.contentIndex];
              if (upBlock && upBlock.type === "toolCall") {
                block.arguments = upBlock.arguments;
              }
            }
            wrapper.push({
              ...event,
              contentIndex: parserCtx.output.content.length - 1,
              partial: parserCtx.output,
            });
            break;
          }

          case "toolcall_end": {
            if (!parserCtx) break;
            const idx = parserCtx.output.content.length - 1;
            const block = parserCtx.output.content[idx];
            if (block && block.type === "toolCall") {
              const upBlock = event.partial.content[event.contentIndex];
              if (upBlock && upBlock.type === "toolCall") {
                block.arguments = upBlock.arguments;
                block.id = upBlock.id;
                block.name = upBlock.name;
              }
            }
            wrapper.push({
              type: "toolcall_end",
              contentIndex: idx,
              toolCall: block as any,
              partial: parserCtx.output,
            });
            break;
          }

          case "done": {
            if (parserCtx) {
              flush(parserCtx);
              parserCtx.output.usage = event.message.usage;
              parserCtx.output.stopReason = event.message.stopReason;

              // Remove empty blocks
              parserCtx.output.content = parserCtx.output.content.filter(
                (block) => {
                  if (block.type === "text" && block.text === "") return false;
                  if (block.type === "thinking" && block.thinking === "")
                    return false;
                  return true;
                },
              );

              wrapper.push({
                type: "done",
                reason: event.reason,
                message: parserCtx.output,
              });
            } else {
              wrapper.push(event);
            }
            wrapper.end();
            break;
          }

          case "error": {
            if (parserCtx) {
              flush(parserCtx);
              parserCtx.output.usage = event.error.usage;
              parserCtx.output.stopReason = event.error.stopReason;
              parserCtx.output.errorMessage = event.error.errorMessage;
              wrapper.push({
                type: "error",
                reason: event.reason,
                error: parserCtx.output,
              });
            } else {
              wrapper.push(event);
            }
            wrapper.end();
            break;
          }

          default:
            wrapper.push(event);
            break;
        }
      }
    } catch (err) {
      if (parserCtx) {
        flush(parserCtx);
        parserCtx.output.stopReason = "error";
        parserCtx.output.errorMessage =
          err instanceof Error ? err.message : String(err);
        wrapper.push({
          type: "error",
          reason: "error",
          error: parserCtx.output,
        });
      }
      wrapper.end();
    }
  })();

  return wrapper;
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  for (const providerName of THINK_TAG_PROVIDERS) {
    const apiName = "openai-completions-convert-think-tags" as Api;

    pi.registerProvider(providerName, {
      api: apiName,
      streamSimple(
        model: Model<Api>,
        context: Context,
        options?: SimpleStreamOptions,
      ): AssistantMessageEventStream {
        // Call the built-in OpenAI completions streamer directly,
        // bypassing the API registry. This works because
        // streamSimpleOpenAICompletions does not check model.api.
        const upstream = streamSimpleOpenAICompletions(
          model as any,
          context,
          options,
        );
        return wrapStream(upstream);
      },
    });
  }
}
