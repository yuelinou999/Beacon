// Shared helpers for the Practice → /review wrong-answer pipeline.
//
// Two concerns live here so that the writer (practice/page.tsx) and the
// reader (review/page.tsx) cannot drift:
//
//   1. getDisplayQuestion — combines `question` + optional `equation` into the
//      single string the student actually sees. Practice writes this exact
//      string into WrongAnswer.question; /review's normalized-string fallback
//      reconstructs the same string from the bank to compare.
//
//   2. resolveBankQuestion — given a WrongAnswer, find the originating bank
//      entry. Prefers bank_question_id + source (post-pivot writes), falls
//      back to a normalized display-string match against the bank for legacy
//      mistakes that pre-date the id stamping.

import type {
  CurriculumTopic,
  PracticeBankQuestion,
  QuizQuestion,
  WrongAnswer,
} from "./types";

// Combine question prompt + optional separate equation into the single
// rendered string. Practice card displays them on two lines; the saved
// representation joins with a space so it round-trips through plain-string
// fields in WrongAnswer / AnswerRecord without losing information.
export function getDisplayQuestion(
  question: string,
  equation?: string,
): string {
  return equation ? `${question} ${equation}` : question;
}

// Normalize for the fallback string-match path. Lowercase + collapse runs of
// whitespace + trim. Authoring tweaks like "  Solve for x." vs "Solve for x. "
// shouldn't break the lookup; meaningful punctuation differences still will,
// which is fine — bank_question_id is the authoritative path.
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Either a practice or quiz bank entry. Discriminated by the optional
// `difficulty` field which only practice bank entries carry — the resolver
// returns a tagged result so /review can branch on source if needed.
export type BankResolution =
  | { source: "practice"; entry: PracticeBankQuestion; topic: CurriculumTopic }
  | { source: "quiz"; entry: QuizQuestion; topic: CurriculumTopic }
  | null;

export function resolveBankQuestion(
  wa: WrongAnswer,
  topics: CurriculumTopic[],
): BankResolution {
  const topic = topics.find((t) => t.id === wa.topic);
  if (!topic) return null;

  // ── Path 1: id-stamped lookup (post-pivot writes) ─────
  if (wa.bank_question_id && wa.source) {
    if (wa.source === "practice") {
      const entry = topic.practice?.questions.find(
        (q) => q.id === wa.bank_question_id,
      );
      if (entry) return { source: "practice", entry, topic };
    } else if (wa.source === "quiz") {
      const entry = topic.quiz?.questions.find(
        (q) => q.id === wa.bank_question_id,
      );
      if (entry) return { source: "quiz", entry, topic };
    }
  }

  // ── Path 2: normalized display-string fallback ────────
  // Walk both banks (when present) and compare against the WrongAnswer's
  // saved question text. Order matters when a practice and quiz prompt
  // happen to render to the same display string within the same topic:
  // without a hint, we'd always return "practice" first and silently
  // misattribute legacy quiz mistakes (or any future partial-shape row
  // that carries `source` but not `bank_question_id`).
  //
  // So: honor wa.source as a fallback-order hint when it exists. Default
  // to practice-first because practice is the common writer today.
  const target = normalize(wa.question);

  const checkPractice = (): BankResolution => {
    if (!topic.practice) return null;
    for (const q of topic.practice.questions) {
      if (normalize(getDisplayQuestion(q.question, q.equation)) === target) {
        return { source: "practice", entry: q, topic };
      }
    }
    return null;
  };
  const checkQuiz = (): BankResolution => {
    if (!topic.quiz) return null;
    for (const q of topic.quiz.questions) {
      if (normalize(getDisplayQuestion(q.question, q.equation)) === target) {
        return { source: "quiz", entry: q, topic };
      }
    }
    return null;
  };

  if (wa.source === "quiz") return checkQuiz() ?? checkPractice();
  return checkPractice() ?? checkQuiz();
}
