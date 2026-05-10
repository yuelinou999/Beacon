import { NextRequest } from "next/server";
import { OLLAMA_URL, OLLAMA_MODEL } from "@/lib/config";
import type { ExplainRequest, ExplainResponse } from "@/lib/types";
import { isLearnerLanguage } from "@/lib/learner-language";
import {
  buildExplainSystemPrompt,
  buildExplainUserPrompt,
} from "@/lib/explain-prompt";

// POST /api/explain — produce a NEW teaching approach for a problem the
// student already missed once with one explanation. Used by /review's
// wrong-again card when the user clicks "Show me a different way".
//
// Free-form text response (no tool call) — we want a short, conversational
// alt explanation, not a structured object. Mirrors the no-tools shape the
// quiz-take route uses for narrative output.
//
// Multilingual note: system prompt is authored in English regardless of
// target language so Gemma reliably parses the instruction set, then a
// "Respond in {Language}" suffix steers the OUTPUT into the learner's
// chosen language. Same strategy /api/advisor uses. The zh-specific
// SYSTEM_PROMPT_ZH was retained originally for prompt-quality concerns
// but the suffix approach generalizes cleanly to all 7 supported
// languages without needing per-language hand-tuned prompts.

// Prompt construction lives in lib/explain-prompt.ts so the WebLLM
// browser path (app/review/page.tsx when "Browser-side AI" toggle is
// on) and this Ollama path stay behaviorally identical. Any tweak to
// the system prompt or RAG injection strategy must happen in that
// shared module to avoid backend drift.

function isExplainRequest(body: unknown): body is ExplainRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.question !== "string") return false;
  if (typeof b.originalExplanation !== "string") return false;
  if (typeof b.correctAnswer !== "string") return false;
  if (!isLearnerLanguage(b.language)) return false;
  // Optional curriculum-context fields — when present, must match shape.
  if (b.topicId !== undefined && typeof b.topicId !== "string") return false;
  if (b.bankQuestionId !== undefined && typeof b.bankQuestionId !== "string") {
    return false;
  }
  if (b.source !== undefined && b.source !== "practice" && b.source !== "quiz") {
    return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  let parsed: unknown = null;
  try {
    parsed = await req.json();
  } catch {
    parsed = null;
  }
  if (!isExplainRequest(parsed)) {
    return Response.json(
      { error: "invalid_request_shape" },
      { status: 400 },
    );
  }

  const body: ExplainRequest = parsed;
  const systemPrompt = buildExplainSystemPrompt(body);
  const userPrompt = buildExplainUserPrompt(body);

  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
      }),
    });
  } catch (err) {
    console.error("Explain API: Ollama fetch failed:", err);
    return Response.json(
      { error: "ollama_unreachable", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  if (!ollamaRes.ok) {
    const text = await ollamaRes.text();
    return Response.json(
      { error: "ollama_error", status: ollamaRes.status, detail: text.slice(0, 200) },
      { status: 502 },
    );
  }

  const data = (await ollamaRes.json()) as { message?: { content?: string } };
  const altExplanation = (data.message?.content ?? "").trim();

  if (!altExplanation) {
    return Response.json(
      { error: "empty_alt_explanation" },
      { status: 502 },
    );
  }

  const out: ExplainResponse = { altExplanation };
  return Response.json(out);
}
