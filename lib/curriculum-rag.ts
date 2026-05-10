// Curriculum-grounded retrieval for Gemma prompts.
//
// Given a topic id (and optionally the originating bank question), build
// a compact context block the LLM can be primed with. The goal is to
// keep Gemma's tutoring CONSISTENT with what was actually taught — not
// inventing a fresh approach that contradicts the lesson, not drifting
// off the curriculum's pedagogy.
//
// Why structured retrieval, not embedding similarity:
//
//   1. Curriculum has rigid hierarchy (unit → topic → 5 phases). The
//      caller already knows the originating topic id at every retrieval
//      site (WrongAnswer.topic, current lesson topicId, advisor unitId).
//      Similarity search would just rediscover what we already know.
//
//   2. Embedding-based RAG would add infra cost — an embedding model
//      (~25-100MB), an index, and a query pipeline — without
//      materially improving over exact topic lookups for our access
//      patterns. The demo claim "truly offline browser Gemma" already
//      argues for keeping the surface area minimal.
//
//   3. Demo narrative: "Beacon retrieves the exact lesson content the
//      student just learned and grounds Gemma's response in it" lands
//      better than "we run a vector store and hope similarity finds
//      the right snippet." Structure beats similarity when the
//      structure is reliable.
//
// If a future feature needs cross-topic free-form retrieval (e.g. a
// general "what's a denominator?" query with no known topic context),
// add an embedding path alongside this — don't replace it.

import type { CurriculumTopic } from "./types";
import { isTopicStub } from "./types";
import { getAllTopics, getUnitForTopic } from "./curriculum";

// What we hand to a prompt builder. All fields are strings (possibly
// empty) so the formatter doesn't have to switch on optionality.
export interface RagContext {
  topicTitle: string;
  unitTitle: string;
  conceptKeyIdea: string;
  conceptExplanation: string;
  // The pre-authored alt_explanation from the originating bank entry,
  // if a bank question was identified. Empty when no bank lookup
  // succeeded — Gemma still gets the topic-level grounding.
  bankAltExplanation: string;
  // Prerequisite topic concept (one level back). Helps Gemma name
  // what foundation the current lesson builds on. Empty when the
  // topic has no prereq OR the prereq is a stub.
  prereqTopicTitle: string;
  prereqKeyIdea: string;
}

// Look up the bank question's pre-authored alt_explanation. Returns ""
// when not found — caller treats that as "no specific guidance".
function lookupBankAlt(
  topic: CurriculumTopic,
  bankQuestionId: string | undefined,
  source: "practice" | "quiz" | undefined,
): string {
  if (!bankQuestionId) return "";
  // Source disambiguates the practice/quiz id namespaces. If absent,
  // try practice first (the more common bank), then quiz.
  if (source === "quiz") {
    const q = topic.quiz?.questions.find((q) => q.id === bankQuestionId);
    return q?.alt_explanation ?? "";
  }
  if (source === "practice") {
    const q = topic.practice?.questions.find((q) => q.id === bankQuestionId);
    return q?.alt_explanation ?? "";
  }
  const fromPractice = topic.practice?.questions.find(
    (q) => q.id === bankQuestionId,
  );
  if (fromPractice?.alt_explanation) return fromPractice.alt_explanation;
  const fromQuiz = topic.quiz?.questions.find((q) => q.id === bankQuestionId);
  return fromQuiz?.alt_explanation ?? "";
}

// Build a RagContext for a given topic. Returns null when:
// - topic id doesn't resolve (caller should treat as "no grounding"
//   and proceed without the context block, not error out)
// - topic is a stub (no authored concept to retrieve)
export function retrieveContextForTopic(
  topicId: string,
  bankQuestionId?: string,
  source?: "practice" | "quiz",
): RagContext | null {
  const allTopics = getAllTopics();
  const topic = allTopics.find((t) => t.id === topicId);
  if (!topic) return null;
  if (isTopicStub(topic.phases)) return null;

  const concept = topic.phases.concept;
  const unit = getUnitForTopic(topicId);

  let prereqTopicTitle = "";
  let prereqKeyIdea = "";
  if (topic.prerequisite) {
    const prereq = allTopics.find((t) => t.id === topic.prerequisite);
    if (prereq && !isTopicStub(prereq.phases)) {
      prereqTopicTitle = prereq.title.en;
      prereqKeyIdea = prereq.phases.concept.key_idea;
    }
  }

  return {
    topicTitle: topic.title.en,
    unitTitle: unit?.title ?? "",
    conceptKeyIdea: concept.key_idea,
    conceptExplanation: concept.explanation,
    bankAltExplanation: lookupBankAlt(topic, bankQuestionId, source),
    prereqTopicTitle,
    prereqKeyIdea,
  };
}

// Format a RagContext as a compact prompt block. Designed for Gemma 4
// e2b — short on tokens, dense on signal. Plain prose with labeled
// lines, no JSON / no markdown / no fenced code (Gemma handles plain
// labels reliably; markdown is ignored anyway since /api/explain
// strips it from output).
//
// Empty fields are simply omitted from the block — keeps the prompt
// uncluttered when prerequisite or bank alt is unavailable.
export function formatContextForPrompt(ctx: RagContext): string {
  const lines: string[] = [
    "[Curriculum context — what the student is currently learning]",
  ];
  if (ctx.unitTitle) lines.push(`Unit: ${ctx.unitTitle}`);
  lines.push(`Lesson: ${ctx.topicTitle}`);
  lines.push(`Key idea taught: ${ctx.conceptKeyIdea}`);
  if (ctx.conceptExplanation) {
    lines.push(`Lesson explanation: ${ctx.conceptExplanation}`);
  }
  if (ctx.bankAltExplanation) {
    lines.push(
      `Lesson's alternative explanation for this question: ${ctx.bankAltExplanation}`,
    );
  }
  if (ctx.prereqTopicTitle) {
    lines.push(
      `Prerequisite (foundation): ${ctx.prereqTopicTitle} — ${ctx.prereqKeyIdea}`,
    );
  }
  return lines.join("\n");
}
