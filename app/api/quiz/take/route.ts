import { NextRequest } from "next/server";
import { OLLAMA_URL, OLLAMA_MODEL } from "@/lib/config";
import type { QuizAttempt } from "@/lib/types";
import type { QuizQuestion, QuizSkill } from "@/lib/curriculum-types";

interface QuizTakeRequest {
  attempt: QuizAttempt;
  topicTitle: string;
  questions: QuizQuestion[];
}

// Ollama + gemma4:e2b runs this 2-3 sentence post-mortem in ~10-15s warm,
// but a cold model or a loaded host can run well past 30s. 60s keeps the
// post-mortem from silently degrading to the no-analysis fallback on a
// fresh machine — matches the /review explain budget. On timeout the route
// still returns gracefully (analysis: null), so this is a headroom bump,
// not a correctness fix.
const TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT =
  `You are a math tutor analyzing a student's quiz performance. Be encouraging but specific. Avoid generic praise. 2-3 sentences only. No bullet points, no headers, no markdown.`;

function buildUserPrompt(req: QuizTakeRequest): string {
  const { attempt, topicTitle, questions } = req;
  const minutes = Math.round(attempt.total_seconds / 60);

  const skills: QuizSkill[] = [
    "setting_up",
    "inverse_ops",
    "simplification",
    "verification",
    "common_denominators",
    "multiplying",
    "dividing",
    "mixed_numbers",
  ];
  const stats: Record<QuizSkill, { correct: number; total: number }> = {
    setting_up: { correct: 0, total: 0 },
    inverse_ops: { correct: 0, total: 0 },
    simplification: { correct: 0, total: 0 },
    verification: { correct: 0, total: 0 },
    common_denominators: { correct: 0, total: 0 },
    multiplying: { correct: 0, total: 0 },
    dividing: { correct: 0, total: 0 },
    mixed_numbers: { correct: 0, total: 0 },
  };
  for (const ans of attempt.answers) {
    const q = questions.find((qq) => qq.id === ans.question_id);
    if (!q) continue;
    stats[q.skill].total += 1;
    if (ans.correct) stats[q.skill].correct += 1;
  }

  const skillLines = skills
    .filter((s) => stats[s].total > 0)
    .map((s) => `- ${s}: ${stats[s].correct}/${stats[s].total} correct`)
    .join("\n");

  const wrongLines = attempt.answers
    .filter((a) => !a.correct)
    .map((a) => {
      const q = questions.find((qq) => qq.id === a.question_id);
      if (!q) return null;
      return `- "${q.question}" (${q.equation}); you answered ${a.student_answer || "(blank)"}, correct answer was ${q.answer}`;
    })
    .filter((s): s is string => s !== null);

  const mistakeBlock = wrongLines.length > 0
    ? wrongLines.join("\n")
    : "(none — all answers correct)";

  return [
    `Topic: ${topicTitle}`,
    `Score: ${attempt.score} out of ${attempt.total}`,
    `Time: ${minutes} minutes`,
    "",
    "Per-skill breakdown:",
    skillLines || "(no skill data)",
    "",
    "Mistake patterns (if any):",
    mistakeBlock,
    "",
    `Provide a 2-3 sentence analysis of the student's strengths and weaknesses based on this data. Address the student directly using "you". Be specific to the data — don't generalize.`,
  ].join("\n");
}

// Every nested field downstream of buildUserPrompt and the skill/mistake
// derivations must be type-checked. Anything malformed → caller returns 200
// with { analysis: null, error: "invalid_response" } — never throw.

function isAnswerShape(x: unknown): x is QuizAttempt["answers"][number] {
  if (!x || typeof x !== "object") return false;
  const a = x as Record<string, unknown>;
  return (
    typeof a.question_id === "string" &&
    typeof a.correct === "boolean" &&
    typeof a.student_answer === "string"
  );
}

const VALID_SKILLS: ReadonlySet<string> = new Set([
  "setting_up",
  "inverse_ops",
  "simplification",
  "verification",
  "common_denominators",
  "multiplying",
  "dividing",
  "mixed_numbers",
]);

function isQuestionShape(x: unknown): x is QuizQuestion {
  if (!x || typeof x !== "object") return false;
  const q = x as Record<string, unknown>;
  return (
    typeof q.id === "string" &&
    typeof q.skill === "string" &&
    VALID_SKILLS.has(q.skill) &&
    typeof q.question === "string" &&
    typeof q.equation === "string" &&
    typeof q.answer === "number"
  );
}

function isValidRequestShape(body: unknown): body is QuizTakeRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;

  if (typeof b.topicTitle !== "string") return false;

  const attempt = b.attempt;
  if (!attempt || typeof attempt !== "object") return false;
  const a = attempt as Record<string, unknown>;
  if (typeof a.total_seconds !== "number") return false;
  if (typeof a.score !== "number") return false;
  if (typeof a.total !== "number") return false;
  if (!Array.isArray(a.answers) || !a.answers.every(isAnswerShape)) return false;

  if (!Array.isArray(b.questions) || !b.questions.every(isQuestionShape)) {
    return false;
  }

  return true;
}

export async function POST(req: NextRequest) {
  const generated_at = new Date().toISOString();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({
      analysis: null,
      error: "invalid_response",
      generated_at,
    });
  }

  if (!isValidRequestShape(raw)) {
    return Response.json({
      analysis: null,
      error: "invalid_response",
      generated_at,
    });
  }
  const body = raw;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(body) },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || /aborted/i.test(err.message));
    return Response.json({
      analysis: null,
      error: isAbort ? "timeout" : "ollama_unavailable",
      generated_at,
    });
  }

  if (!res.ok) {
    return Response.json({
      analysis: null,
      error: "ollama_unavailable",
      generated_at,
    });
  }

  let data: { message?: { content?: string } };
  try {
    data = (await res.json()) as { message?: { content?: string } };
  } catch {
    return Response.json({
      analysis: null,
      error: "invalid_response",
      generated_at,
    });
  }

  const analysis = (data.message?.content ?? "").trim();
  if (!analysis) {
    return Response.json({
      analysis: null,
      error: "invalid_response",
      generated_at,
    });
  }

  return Response.json({ analysis, generated_at });
}
