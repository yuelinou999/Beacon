// Single source of truth for shared types in Beacon.
// Curriculum, student progress, quiz, practice, and Ollama types all live here.
// `lib/curriculum-types.ts` is a re-export shim retained for legacy import paths.

// ── Curriculum: phase content ──────────────────────────

export type VisualHint = "balance_scale" | "number_line" | "grid" | "none";

export interface ConceptPhaseContent {
  title: string;
  explanation: string;
  key_idea: string;
  visual: { type: VisualHint; left?: string; right?: string };
  main_equation?: string;
}

export interface AnalogyPhaseContent {
  title: string;
  scenario: string;
  illustration_hint: string;
  question: string;
  options: [number, number, number];
  correct: number;
  feedback_correct: string;
  feedback_incorrect: string;
}

export interface MathSegment {
  text: string;
  highlight?: boolean;
}

export interface ExampleStep {
  math: string | MathSegment[];
  explanation: string;
}

export interface ExamplePhaseContent {
  title: string;
  problem: string;
  steps: ExampleStep[];
}

export interface GuidedSubStepChoice {
  question: string;
  type: "choice";
  options: [string, string, string];
  correct: string;
  feedback_correct: string;
  feedback_wrong: string;
}

export interface GuidedSubStepNumber {
  question: string;
  type: "number";
  correct: number;
  feedback_correct: string;
  feedback_wrong: string;
}

export type GuidedSubStep = GuidedSubStepChoice | GuidedSubStepNumber;

export interface GuidedPhaseContent {
  title: string;
  problem: string;
  sub_steps: [GuidedSubStep, GuidedSubStep, GuidedSubStep];
}

export interface IndependentQuestion {
  equation: string;
  answer: number;
}

export interface IndependentPhaseContent {
  title: string;
  questions: [IndependentQuestion, IndependentQuestion, IndependentQuestion];
}

// Tier-3 topics ship as { stub: true } and are gated out of the lesson flow.
// Tier-1/2 topics carry a concept (required) and an optional analogy/example/
// guided/independent phase. All current non-stub topics in JSON have all five.
export type TopicPhases =
  | { stub: true }
  | {
      concept: ConceptPhaseContent;
      analogy?: AnalogyPhaseContent;
      example?: ExamplePhaseContent;
      guided?: GuidedPhaseContent;
      independent?: IndependentPhaseContent;
    };

export function isTopicStub(
  phases: TopicPhases | undefined,
): phases is { stub: true } {
  return phases !== undefined && "stub" in phases && phases.stub === true;
}

// ── Curriculum: quiz bank (static, hardcoded per topic) ─

export type QuizSkill =
  | "setting_up"
  | "inverse_ops"
  | "simplification"
  | "verification";

// Quiz-bank question. Pre-authored, fixed in curriculum.json. Numeric
// `answer` plus a `skill` tag for per-question categorization.
export interface QuizQuestion {
  id: string;
  question: string;
  equation: string;
  answer: number;
  skill: QuizSkill;
  // Optional pre-authored alternative explanation — see PracticeBankQuestion
  // for the same field. Quiz currently doesn't write to wrong_answers, but
  // the field is stamped here so /review can show it once that pipe is built.
  alt_explanation?: string;
}

export interface QuizBank {
  title: string;
  description: string;
  estimated_minutes: number;
  difficulty_label: string;
  questions: QuizQuestion[];
}

// ── Curriculum: practice bank (static, hardcoded per topic) ─

// Practice-bank question. Pre-authored in curriculum.json, carries a
// difficulty label for the per-question pill, and ships an `explanation`
// shown on the result screen.
export interface PracticeBankQuestion {
  id: string;
  question: string;
  // Optional separate equation field, mirroring QuizQuestion. Word problems
  // put the entire prompt in `question` and omit this field.
  equation?: string;
  // Allowed as string OR number to keep authoring ergonomic — most answers
  // are numeric, but topic 2 (expressions vs equations) has word answers like
  // "expression" / "equation". Compared as a normalized string at runtime.
  answer: string | number;
  difficulty: "easy" | "medium" | "hard";
  explanation: string;
  // Optional pre-authored "different angle" explanation. Used by /review's
  // "Show me a different way" — when present, the bank alt is shown by
  // default and /api/explain is demoted to a tertiary "Another angle from
  // Gemma" button. When absent (legacy mistakes, topics without bank
  // coverage), /review falls back to /api/explain as the primary path.
  alt_explanation?: string;
}

export interface PracticeBank {
  title: string;
  questions: PracticeBankQuestion[];
}

// ── Curriculum: topic ──────────────────────────────────

export interface TopicTitle {
  en: string;
  zh: string;
}

// Merged from the legacy `CurriculumTopic` (4 fields) and `TopicWithPhases`
// (full shape). Every topic in curriculum.json has all required fields below.
export interface CurriculumTopic {
  id: string;
  title: TopicTitle;
  prerequisite: string | null;
  difficulty_base: number;
  unit_id: string;
  phases: TopicPhases;
  quiz?: QuizBank; // Only `solving_one_step` carries a quiz bank today.
  practice?: PracticeBank; // Static practice bank — see PracticeBank above.
}

// ── Curriculum: units and grade ───────────────────────

export interface CurriculumUnit {
  id: string;
  number: number;
  title: string;
  description: string;
  skills: string[];
  estimated_lessons: number;
  estimated_hours: number;
  prerequisites: string[]; // Other unit ids
  topics: string[];        // Topic ids — FK into CurriculumTopic.id
}

export interface CurriculumGrade {
  id: string;
  title: string;
  summary: string;
  description: string;
  estimated_lessons: number;
  estimated_hours: number;
  who_its_for: string;
  units: CurriculumUnit[];
}

// ── Curriculum: top-level shape (not currently consumed) ─

export interface Curriculum {
  unit: string;
  grade: number;
  language_default: string;
  topics: CurriculumTopic[];
}

// ── Student progress ───────────────────────────────────

export type ErrorType = "concept" | "calculation" | "rushing" | "careless" | null;

export type TopicStatus = "not_started" | "learning" | "practicing" | "strong" | "mastered";

// Fields not present in seed student.json are marked optional so the type
// reflects the on-disk shape. lib/progress.ts:migrateProfile fills defaults
// before the profile is consumed by the rest of the app.
export interface TopicProgress {
  mastery: number;
  attempts: number;
  last_seen: string | null;
  status?: TopicStatus; // TODO: backfill in JSON
  lesson_completed?: boolean; // TODO: backfill in JSON
  explain_differently_count?: number; // TODO: backfill in JSON
}

export interface AnswerRecord {
  topic: string;
  question: string;
  student_answer: string;
  correct_answer: string;
  correct: boolean;
  error_type: ErrorType;
  time_seconds: number;
  timestamp: string;
}

export interface WrongAnswer {
  id: string;
  topic: string;
  question: string;
  student_answer: string;
  correct_answer: string;
  error_type: string;
  explanation: string;
  timestamp: string;
  // ── Spaced repetition fields ──
  // review_count: count of CONSECUTIVE SUCCESSFUL reviews (NOT total attempts).
  //   Resets to 0 on a failed review. Used to index REVIEW_INTERVAL_DAYS in
  //   lib/progress.ts:recordReviewAttempt.
  // next_review_date: YYYY-MM-DD; mistake is "due" when today >= this date.
  // last_review_correct: outcome of most recent review attempt (null if never).
  review_count: number;
  next_review_date: string;
  last_review_correct: boolean | null;
  // ── Bank-backed lookup fields (added with the alt_explanation pivot) ──
  // bank_question_id: the originating bank entry's `id` (e.g. "p3", "q7"),
  //   stamped at write time by /practice or /quiz. /review's
  //   resolveBankQuestion uses this to look up the bank entry directly,
  //   avoiding fragile question-string matching across formatting tweaks.
  // source: which bank the id lives in. Practice ids ("pN") and quiz ids
  //   ("qN") happen not to collide today, but `source` makes the namespace
  //   explicit and removes the dependency on that convention.
  // Both optional — legacy WrongAnswers written before the pivot don't
  // carry them and fall through to the normalized-string fallback.
  bank_question_id?: string;
  source?: "practice" | "quiz";
}

export interface SessionLog {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  time_of_day: "morning" | "afternoon" | "evening" | "night";
  module: "learn" | "practice" | "quiz" | "review";
  topic: string;
  questions_attempted: number;
  questions_correct: number;
  hints_used: number;
  explain_differently_used: number;
}

export interface StudentSettings {
  bilingual_mode: boolean;
  second_language: string | null;
  interface_language: string;
}

export interface LegacyTopicArchive {
  id: string;
  progress: TopicProgress;
  archived_at: string;
  reason: "unknown_id" | "renamed";
}

export interface StudentProfile {
  // Present in seed student.json
  student_id: string;
  language: "en" | "zh";
  current_unit: string;
  topics: Record<string, TopicProgress>;
  wrong_answers: WrongAnswer[];

  // Not in seed JSON — populated by lib/progress.ts:migrateProfile defaults.
  name?: string; // TODO: backfill in JSON
  grade?: string; // TODO: backfill in JSON
  settings?: StudentSettings; // TODO: backfill in JSON
  answer_history?: AnswerRecord[]; // TODO: backfill in JSON
  session_logs?: SessionLog[]; // TODO: backfill in JSON
  quiz_results?: QuizAttempt[]; // TODO: backfill in JSON
  total_study_time_minutes?: number; // TODO: backfill in JSON
  streak_days: number;
  last_active_date?: string; // TODO: backfill in JSON

  legacy_topics?: LegacyTopicArchive[];
  legacy_wrong_answers?: WrongAnswer[];
}

// ── Learn ──────────────────────────────────────────────

export interface LearnMessage {
  role: "beacon" | "student";
  content: string;
}

export interface LearnRequest {
  topicId: string;
  language: "en" | "zh";
  mastery: number;
  history: LearnMessage[];
}

// ── Quiz attempt (assessment) ──────────────────────────
// One full pass through a topic's quiz bank — recorded atomically at quiz
// completion.

export interface QuizAttemptAnswer {
  question_id: string;
  student_answer: string;
  parsed_answer: number | null;
  correct: boolean;
  time_seconds: number;
}

export interface QuizAttempt {
  attempt_id: string;
  topic_id: string;
  started_at: string;
  finished_at: string;
  total_seconds: number;
  score: number;
  total: number;
  answers: QuizAttemptAnswer[];
}

export interface GradeResult {
  correct: boolean;
  explanation: string;
  correct_answer: string;
  error_type: ErrorType;
}

// ── Advisor (AI-narrated readiness check) ──
// Deterministic analyzer (lib/advisor.ts) computes the verdict + gaps from
// curriculum.units[].prerequisites and topic mastery. /api/advisor is then a
// thin endpoint that streams Gemma's personalized narration on TOP of the
// already-decided analysis — never letting the LLM make the readiness call
// itself. Two-layer design per codex round-1 review:
//   1. Pure code = trustworthy, instant, demo-stable verdict
//   2. LLM      = personalized framing, lands the verdict warmly
// Stance is advisory, not gatekeeping — see SubjectPage's "Start anyway"
// action that lets the student override the recommendation.

// Overall judgment for a target unit's readiness gate.
//   ready          all prereq units fully completed
//   almost_ready   prereqs in progress but not done — close enough to consider
//   needs_review   at least one prereq unstarted or far from threshold
export type AdvisorVerdict = "ready" | "almost_ready" | "needs_review";

// Per-prereq-unit breakdown. "topic-level evidence" lives in weakestTopics
// so the gap list can drill into specifically what to review when a unit
// isn't fully mastered yet.
export interface AdvisorPrereqStatus {
  unitId: string;
  unitTitle: string;
  avgMastery: number;
  status: "completed" | "in_progress" | "not_started";
  // Top-N (default 3) lowest-mastery topics within this prereq unit, surfaced
  // as the concrete review-this-first targets when the unit isn't done.
  weakestTopics: Array<{
    topicId: string;
    topicTitle: string;
    mastery: number;
  }>;
}

export interface AdvisorAnalysis {
  targetUnitId: string;
  targetUnitTitle: string;
  verdict: AdvisorVerdict;
  prerequisites: AdvisorPrereqStatus[];
  // True when the target unit has no prerequisites at all — verdict is
  // trivially "ready", prerequisites is []. UI uses this flag to swap copy
  // ("No prerequisites for this unit" instead of an empty gap list).
  noPrereqs: boolean;
}

// /api/advisor request: caller sends the analysis IT already computed
// client-side. Server doesn't repeat the computation; it just narrates.
// language widened from en/zh to LearnerLanguage so bilingual-mode
// students reading in Hindi / Spanish / Swahili / French / Arabic see
// the verdict narration in their reading language.
export interface AdvisorNarrateRequest {
  analysis: AdvisorAnalysis;
  language?: import("./learner-language").LearnerLanguage;
}

// /api/advisor streams plaintext narration (newlines preserved). No
// structured response wrapper — the structured part is already in the
// client's hands by the time narration is requested.

// ── Explain (alternative explanation for a missed mistake) ──
// Used by /review's wrong-again card on demand. Caller passes the original
// LLM explanation we already showed the student; the endpoint returns a
// genuinely different teaching approach (visual / analogy / smaller numbers
// / step-by-step) for the SAME problem.

export interface ExplainRequest {
  question: string;
  originalExplanation: string;
  correctAnswer: string;
  // Widened from en/zh to all LearnerLanguage values so bilingual-mode
  // students reading in Hindi / Spanish / Swahili / French / Arabic see
  // the alt explanation in their reading language.
  language: import("./learner-language").LearnerLanguage;
}

export interface ExplainResponse {
  altExplanation: string;
}

// ── Translate (Gemma multilingual for bilingual mode subtitle) ──
// Used by components/bilingual-subtitle.tsx when the user has selected a
// secondary language other than Chinese (which is already in curriculum.json
// as topic.title.zh and uses no API call).

export type TranslateTargetLanguage = "zh" | "hi" | "es" | "sw" | "fr" | "ar";

export interface TranslateRequest {
  text: string;
  targetLanguage: TranslateTargetLanguage;
}

export interface TranslateResponse {
  translation: string;
}

// ── Ollama types ───────────────────────────────────────

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaStreamChunk {
  model: string;
  message: { role: string; content: string; thinking?: string };
  done: boolean;
}
