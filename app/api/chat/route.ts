import { NextRequest } from "next/server";
import { OLLAMA_URL, OLLAMA_MODEL } from "@/lib/config";
import type { OllamaMessage } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────
// Dev test compatibility only — NOT a product surface.
//
// This route was deleted in commit 92ca7de as dead code, then restored
// here because scripts/test-app-image.mjs (the `npm run test:app-image`
// boundary validator) still POSTs against /api/chat to exercise the
// image-upload pipeline end-to-end. Removing the route broke the
// pre-demo dev pipeline, so it lives on as a thin compatibility layer.
//
// The product itself does NOT call this endpoint. All real chat
// surfaces (the right-side AI panel on every page) hit /api/assistant
// instead, which carries the current chat schema (context, mode,
// images[], history). New code MUST NOT add callers here — funnel
// through /api/assistant.
//
// Lifecycle: when scripts/test-app-image.mjs is migrated to call
// /api/assistant (or the test script is retired), delete this file
// and its directory in the same commit.
// ─────────────────────────────────────────────────────────────────────

interface LegacyChatRequest {
  messages: Array<{ role: string; content: string }>;
}

const MODEL = OLLAMA_MODEL;

export async function POST(req: NextRequest) {
  try {
    const body: LegacyChatRequest = await req.json();
    const { messages } = body;

    const ollamaMessages: OllamaMessage[] = messages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content || "Hello",
    }));

    const ollamaReq = {
      model: MODEL,
      messages: ollamaMessages,
      stream: true,
    };

    // Forward to Ollama
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ollamaReq),
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text();
      return new Response(
        JSON.stringify({
          error: `Ollama returned ${ollamaRes.status}`,
          detail: errText,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // Stream Ollama's response directly to the client.
    // Ollama sends newline-delimited JSON chunks, each with a
    // { message: { content: "..." }, done: bool } shape.
    // We pass these through so the frontend can parse them incrementally.
    const stream = new ReadableStream({
      async start(controller) {
        const reader = ollamaRes.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (err) {
          // If the client disconnects, the stream will error — that's fine.
          console.error("Stream error:", err);
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
