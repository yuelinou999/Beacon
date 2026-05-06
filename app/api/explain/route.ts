import { NextRequest } from "next/server";
import { OLLAMA_URL, OLLAMA_MODEL } from "@/lib/config";
import type { ExplainRequest, ExplainResponse } from "@/lib/types";
import {
  buildLanguageSuffix,
  isLearnerLanguage,
} from "@/lib/learner-language";

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

const SYSTEM_PROMPT_BASE =
  "You are a patient tutor explaining the SAME problem in a NEW way. The " +
  "student's first explanation didn't click. Try a different angle: a " +
  "visual, a physical analogy, smaller numbers first, or a step-by-step " +
  "checklist. Do NOT repeat the original explanation. Keep it under 3 " +
  "short sentences. Plain prose only — no bullet lists, no markdown, no " +
  "emoji, no preamble like \"Here's another way\".";

function buildUserPrompt(req: ExplainRequest): string {
  const cleanQuestion = req.question.trim();
  const cleanOriginal = req.originalExplanation.trim();
  return [
    `Question: ${cleanQuestion}`,
    `Correct answer: ${req.correctAnswer}`,
    `Explanation we already tried: ${cleanOriginal || "(none)"}`,
    "Explain it differently.",
  ].join("\n");
}

function isExplainRequest(body: unknown): body is ExplainRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.question === "string" &&
    typeof b.originalExplanation === "string" &&
    typeof b.correctAnswer === "string" &&
    isLearnerLanguage(b.language)
  );
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
  const systemPrompt = SYSTEM_PROMPT_BASE + buildLanguageSuffix(body.language);
  const userPrompt = buildUserPrompt(body);

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
