// Shared prompt construction for the wrong-answer "explain it differently"
// flow. Used by both:
//
//   - app/api/explain/route.ts (server-side, talks to Ollama)
//   - app/review/page.tsx     (client-side, talks to WebLLM when the
//                              "Browser-side AI" setting is on)
//
// Lifting prompt construction here keeps the two backends behaviorally
// identical — same system prompt, same RAG injection, same fallback path
// when topic context is unavailable. If we later add another route or
// switch one backend's prompting independently, that divergence has to
// happen here, not get lost in two parallel route files.
//
// Pure functions over plain types; no Next.js / React / Ollama / WebLLM
// imports. Safe to import from anywhere.

import type { ExplainRequest } from "./types";
import { buildLanguageSuffix } from "./learner-language";
import {
  retrieveContextForTopic,
  formatContextForPrompt,
} from "./curriculum-rag";

const SYSTEM_PROMPT_BASE =
  "You are a patient tutor explaining the SAME problem in a NEW way. The " +
  "student's first explanation didn't click. Try a different angle: a " +
  "visual, a physical analogy, smaller numbers first, or a step-by-step " +
  "checklist. Do NOT repeat the original explanation. Keep it under 3 " +
  "short sentences. Plain prose only — no bullet lists, no markdown, no " +
  "emoji, no preamble like \"Here's another way\".";

export function buildExplainSystemPrompt(req: ExplainRequest): string {
  return SYSTEM_PROMPT_BASE + buildLanguageSuffix(req.language);
}

export function buildExplainUserPrompt(req: ExplainRequest): string {
  const cleanQuestion = req.question.trim();
  const cleanOriginal = req.originalExplanation.trim();
  const lines: string[] = [
    `Question: ${cleanQuestion}`,
    `Correct answer: ${req.correctAnswer}`,
    `Explanation we already tried: ${cleanOriginal || "(none)"}`,
  ];

  // Curriculum-grounded RAG: when the caller knows the originating
  // topic, pull the lesson concept + bank alt_explanation and inject
  // as context. See lib/curriculum-rag.ts for the retrieval contract.
  if (req.topicId) {
    const ctx = retrieveContextForTopic(
      req.topicId,
      req.bankQuestionId,
      req.source,
    );
    if (ctx) {
      lines.push("");
      lines.push(formatContextForPrompt(ctx));
      lines.push("");
      lines.push(
        "Explain it differently — but stay consistent with the lesson context above.",
      );
      return lines.join("\n");
    }
  }

  // Backward-compat path (no topicId, or topic stub/missing):
  // un-grounded prompt, same as before RAG.
  lines.push("Explain it differently.");
  return lines.join("\n");
}
