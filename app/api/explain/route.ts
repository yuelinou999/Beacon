import { NextRequest } from "next/server";
import { OLLAMA_URL, OLLAMA_MODEL } from "@/lib/config";
import type { ExplainRequest, ExplainResponse } from "@/lib/types";

// POST /api/explain — produce a NEW teaching approach for a problem the
// student already missed once with one explanation. Used by /review's
// wrong-again card when the user clicks "Show me a different way".
//
// Free-form text response (no tool call) — we want a short, conversational
// alt explanation, not a structured object. Mirrors the no-tools shape the
// quiz-take route uses for narrative output.

const SYSTEM_PROMPT_EN =
  "You are a patient tutor explaining the SAME problem in a NEW way. The " +
  "student's first explanation didn't click. Try a different angle: a " +
  "visual, a physical analogy, smaller numbers first, or a step-by-step " +
  "checklist. Do NOT repeat the original explanation. Keep it under 3 " +
  "short sentences. Plain prose only — no bullet lists, no markdown, no " +
  "emoji, no preamble like \"Here's another way\".";

const SYSTEM_PROMPT_ZH =
  "你是一位有耐心的辅导老师，用一种全新的方式重新讲解同一道题。学生用上一种解释没听懂。" +
  "请换一个角度：用图像、生活类比、先从更小的数字开始、或者一步一步的清单。" +
  "不要重复原来的解释。最多 3 句话。仅用普通文字 — 不要项目符号、Markdown、表情符号或前置语句。";

function buildUserPrompt(req: ExplainRequest): string {
  const cleanQuestion = req.question.trim();
  const cleanOriginal = req.originalExplanation.trim();
  if (req.language === "zh") {
    return [
      `题目：${cleanQuestion}`,
      `正确答案：${req.correctAnswer}`,
      `已经讲过的解释：${cleanOriginal || "(无)"}`,
      "请换一种方式讲解。",
    ].join("\n");
  }
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
    (b.language === "en" || b.language === "zh")
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
  const systemPrompt = body.language === "zh" ? SYSTEM_PROMPT_ZH : SYSTEM_PROMPT_EN;
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
