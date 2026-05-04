"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Check, X, Flame, TrendingUp, TrendingDown } from "lucide-react";
import MathRenderer from "@/components/math-renderer";
import { getBilingual } from "@/components/settings-modal";
import { onSettingsChanged } from "@/lib/settings-events";
import { useAIContext } from "@/components/ai-context";
import {
  loadProfile,
  getTopicProgress,
  updateMasteryAfterPractice,
  getDifficulty,
  startSession,
  endSession,
  updateStreak,
  MASTERY_CORRECT_DELTA,
  MASTERY_INCORRECT_DELTA,
} from "@/lib/progress";
import type { StudentProfile, CurriculumTopic, PracticeQuestion, GradeResult } from "@/lib/types";
import curriculum from "@/data/curriculum.json";

// Practice runs in fixed-size batches. 5 mirrors the design reference; if
// adaptive sizing comes later, this becomes a per-mastery computed value.
const BATCH_SIZE = 5;

type PracticeState =
  | "loading"   // generating next question (initial OR mid-batch)
  | "question"  // question shown, awaiting answer
  | "grading"   // submitted, waiting for /api/practice grade response
  | "result"    // graded, showing inline correct/incorrect feedback
  | "complete"  // BATCH_SIZE questions answered — show summary
  | "error";

// Per-question record kept for the completion summary's dot grid, mistake
// count, and mastery-delta display.
interface QuestionResult {
  question: string;
  correctAnswer: string;
  studentAnswer: string;
  correct: boolean;
  difficulty: "easy" | "medium" | "hard";
  timeSeconds: number;
}

// Difficulty pill colors — match design-reference/PracticeScreen.tsx.
const DIFFICULTY_COLORS: Record<"easy" | "medium" | "hard", { fg: string; bg: string }> = {
  easy: { fg: "#059669", bg: "#ECFDF5" },
  medium: { fg: "#D97706", bg: "#FFFBEB" },
  hard: { fg: "#EF4444", bg: "#FEF2F2" },
};

// +10% / -5% display strings, derived from the source-of-truth constants in
// lib/progress.ts. Sign included so callers don't have to format.
const CORRECT_DELTA_LABEL = `+${Math.round(MASTERY_CORRECT_DELTA * 100)}% mastery`;
const INCORRECT_DELTA_LABEL = `${Math.round(MASTERY_INCORRECT_DELTA * 100)}% mastery`;

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-muted text-sm">Loading...</div>}>
      <PracticeContent />
    </Suspense>
  );
}

function PracticeContent() {
  const searchParams = useSearchParams();
  const topicId = searchParams.get("topic") || curriculum.topics[0].id;
  const { setContext } = useAIContext();

  const topic = (curriculum.topics as CurriculumTopic[]).find((t) => t.id === topicId);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [state, setState] = useState<PracticeState>("loading");
  const [quiz, setQuiz] = useState<PracticeQuestion | null>(null);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [bilingual, setBilingual] = useState(false);

  // ── Batch state ────────────────────────────────────
  // currentIdx is 0..BATCH_SIZE-1, the slot the user is currently working on.
  // results accumulates one entry per completed slot (excludes retries —
  // retries don't advance the slot). streak resets between batches and on
  // each incorrect answer. masteryAtStart is the snapshot the completion
  // screen will use to render the before→after delta.
  const [currentIdx, setCurrentIdx] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [streak, setStreak] = useState(0);
  const [masteryAtStart, setMasteryAtStart] = useState<number | null>(null);
  const [quizDifficulty, setQuizDifficulty] = useState<"easy" | "medium" | "hard">("easy");

  // ── Retry tracking ─────────────────────────────────
  // Per codex review: a same-slot retry is a practice signal, not a fresh
  // mastery attempt. Each slot can be retried at most once. recoveredCount
  // is the # of slots where the retry submit was correct after the first
  // attempt failed — surfaced in the completion summary.
  const [retriedSlots, setRetriedSlots] = useState<Set<number>>(new Set());
  const [recoveredCount, setRecoveredCount] = useState(0);

  // questionsAnswered and correctCount are derived from results — single
  // source of truth. Callers that need them as numbers should read these.
  const questionsAnswered = results.length;
  const correctCount = results.filter((r) => r.correct).length;

  // Mirrors `results` so unmount and state→complete effects can read the
  // latest stats without closing over stale state.
  const latestResultsRef = useRef<QuestionResult[]>([]);
  useEffect(() => {
    latestResultsRef.current = results;
  }, [results]);

  // Timing
  const questionStartRef = useRef<number>(0);
  // Session tracking
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const loaded = loadProfile();
    setProfile(loaded);
    setBilingual(getBilingual());
    updateStreak();
    sessionIdRef.current = startSession("practice", topicId);
    // Snapshot mastery at batch start so the completion screen can render
    // the before→after delta. Only set once per page lifetime; "Practice
    // more" reset will re-snapshot in step 5.
    setMasteryAtStart(getTopicProgress(loaded, topicId).mastery);
    // Session cleanup is owned by the dedicated finalizeSession effects
    // below — both batch-complete and unmount paths land there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same-tab settings refresh: kept separate from the mount effect above so
  // toggling bilingual mid-practice doesn't restart the session timer.
  useEffect(() => {
    const refresh = () => setBilingual(getBilingual());
    window.addEventListener("focus", refresh);
    const unsubscribe = onSettingsChanged(refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      unsubscribe();
    };
  }, []);

  // ── Session boundary = batch boundary ─────────────
  // Single session per batch. Mount starts the session (above), state →
  // "complete" closes it cleanly with full stats, unmount closes a
  // partial-batch session with whatever stats have accumulated. Reading
  // results via ref so neither effect closes over stale state.

  const finalizeSession = (reason: "complete" | "unmount") => {
    if (!sessionIdRef.current) return;
    const r = latestResultsRef.current;
    endSession(sessionIdRef.current, {
      questions_attempted: r.length,
      questions_correct: r.filter((x) => x.correct).length,
      hints_used: 0,
      explain_differently_used: 0,
    });
    sessionIdRef.current = null;
    // `reason` is unused right now but kept for future SessionLog tagging
    // (e.g. partial vs complete) — see Beacon Dashboard plans.
    void reason;
  };

  // Close session when batch completes.
  useEffect(() => {
    if (state === "complete") finalizeSession("complete");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Close session on unmount (partial-batch case). Mount-only — runs once.
  useEffect(() => {
    return () => finalizeSession("unmount");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const language = profile?.language || "en";
  const progress = profile ? getTopicProgress(profile, topicId) : { mastery: 0, status: "not_started" as const, attempts: 0, last_seen: null, lesson_completed: false, explain_differently_count: 0 };

  // Set AI panel context
  useEffect(() => {
    setContext({
      page: "practice",
      topicId,
      topicTitle: topic?.title.en,
      mastery: progress.mastery,
      correctCount,
      questionsAnswered,
    });
  }, [topicId, topic?.title.en, progress.mastery, correctCount, questionsAnswered, setContext]);

  const generateQuiz = useCallback(async () => {
    if (!topic || !profile) return;
    setState("loading");
    setError("");
    setGrade(null);
    setAnswer("");

    // Snapshot difficulty AT generation time. /api/practice picks difficulty
    // from current mastery; we freeze it for display so the difficulty pill
    // doesn't flicker mid-question as mastery shifts elsewhere.
    const masteryNow = getTopicProgress(profile, topicId).mastery;
    setQuizDifficulty(getDifficulty(masteryNow));

    try {
      const res = await fetch("/api/practice?action=generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId,
          topicTitle: topic.title[language],
          language,
          mastery: masteryNow,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `API ${res.status}`);
      }

      const data: PracticeQuestion = await res.json();
      setQuiz(data);
      setState("question");
      // Start timing when question is displayed
      questionStartRef.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate quiz");
      setState("error");
    }
  }, [topic, profile, topicId, language]);

  useEffect(() => {
    if (profile && state === "loading") {
      generateQuiz();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const submitAnswer = async () => {
    if (!answer.trim() || !quiz || !topic || !profile) return;
    setState("grading");

    // Calculate time spent on this question
    const timeSeconds = questionStartRef.current > 0
      ? (Date.now() - questionStartRef.current) / 1000
      : 0;

    try {
      const res = await fetch("/api/practice?action=grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId,
          topicTitle: topic.title[language],
          language,
          question: quiz.question,
          correctAnswer: quiz.correct_answer,
          studentAnswer: answer.trim(),
          timeSeconds,
        }),
      });

      if (!res.ok) throw new Error(`API ${res.status}`);

      const data: GradeResult = await res.json();
      setGrade(data);
      setState("result");

      const isRetrySubmit = retriedSlots.has(currentIdx);

      if (isRetrySubmit) {
        // Retry path — practice signal only. No mastery write, no second
        // results entry (the slot already has its original outcome). Track
        // the recovery if this attempt succeeded.
        if (data.correct) {
          setRecoveredCount((c) => c + 1);
        }
        // Streak only counts first-attempt correctness, so no update here
        // either — keeping retry isolated from the streak rhythm.
      } else {
        setStreak((s) => (data.correct ? s + 1 : 0));

        // Record this slot's outcome for the completion summary.
        const result: QuestionResult = {
          question: quiz.question,
          correctAnswer: data.correct_answer,
          studentAnswer: answer.trim(),
          correct: data.correct,
          difficulty: quizDifficulty,
          timeSeconds,
        };
        setResults((prev) => [...prev, result]);

        const updated = updateMasteryAfterPractice(
          profile,
          topicId,
          data.correct,
          quiz.question,
          answer.trim(),
          data.correct_answer,
          data.error_type,
          data.explanation,
          timeSeconds
        );
        setProfile(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grade answer");
      setState("error");
    }
  };

  // Advance to next slot OR complete the batch. Wired to the result-phase
  // "Next" button.
  const advanceSlot = () => {
    if (currentIdx + 1 >= BATCH_SIZE) {
      setState("complete");
    } else {
      setCurrentIdx((i) => i + 1);
      generateQuiz();
    }
  };

  // "Try a similar one" — refetch a fresh question for the SAME slot. Marks
  // the slot as retried so the button only renders once per slot. The next
  // submitAnswer call branches on retriedSlots and doesn't write mastery.
  const handleTrySimilar = () => {
    setRetriedSlots((prev) => {
      const next = new Set(prev);
      next.add(currentIdx);
      return next;
    });
    generateQuiz();
  };

  // "Practice more" — reset batch-local state and start a fresh batch on the
  // same topic. Preserves profile / settings / page-level subscriptions; only
  // batch state and the session counter restart.
  const restartBatch = () => {
    if (!profile) return;
    setCurrentIdx(0);
    setResults([]);
    setStreak(0);
    setQuiz(null);
    setGrade(null);
    setAnswer("");
    setRetriedSlots(new Set());
    setRecoveredCount(0);
    setMasteryAtStart(getTopicProgress(profile, topicId).mastery);
    sessionIdRef.current = startSession("practice", topicId);
    generateQuiz();
  };

  if (!topic) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-muted">Topic not found.</p>
        <Link href="/subject/math" className="text-blue text-sm mt-2 hover:underline">Back to subject</Link>
      </div>
    );
  }

  // Card border color reflects current state \u2014 green when correct, amber
  // when incorrect, neutral while answering/grading.
  const cardBorderLeft =
    state === "result" && grade
      ? grade.correct
        ? "3px solid #059669"
        : "3px solid #D97706"
      : "1px solid #E2E5EA";

  // Completion gates a different layout \u2014 render its own page-fill view.
  if (state === "complete") {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">
          <Link
            href="/subject/math"
            className="inline-flex items-center gap-2 mb-8 transition-colors hover:opacity-70"
            style={{ color: "#2563EB" }}
          >
            <ChevronLeft size={16} />
            <span style={{ fontSize: "14px" }}>Back to course</span>
          </Link>
          <CompletionSummary
            results={results}
            batchSize={BATCH_SIZE}
            masteryBefore={masteryAtStart ?? 0}
            masteryAfter={progress.mastery}
            topicId={topicId}
            hasQuiz={topic.quiz !== undefined}
            recoveredCount={recoveredCount}
            onPracticeMore={restartBatch}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-8">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/subject/math"
            className="inline-flex items-center gap-2 transition-colors hover:opacity-70"
            style={{ color: "#2563EB" }}
          >
            <ChevronLeft size={16} />
            <span style={{ fontSize: "14px" }}>Back to course</span>
          </Link>
          <div
            className="px-4 py-2 rounded-full border"
            style={{
              borderColor: "#BFDBFE",
              backgroundColor: "#EFF6FF",
              color: "#2563EB",
              fontSize: "13px",
              fontWeight: 500,
            }}
          >
            Practice mode
          </div>
        </div>

        {/* Practice header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 style={{ fontSize: "20px", fontWeight: 500, color: "#0F2A4A" }}>
                Practice: {topic.title[language]}
              </h1>
              {bilingual && language === "en" && (
                <p style={{ fontSize: "13px", color: "#9CA3AF", marginTop: "2px" }}>
                  {topic.title.zh}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span style={{ fontSize: "14px", color: "#6B7280" }}>
                <span style={{ fontWeight: 500, color: "#1F2937" }}>
                  {correctCount}/{BATCH_SIZE}
                </span>{" "}
                correct
              </span>
              {streak > 0 && (
                <div className="flex items-center gap-1.5">
                  <Flame size={16} style={{ color: "#EF4444" }} />
                  <span style={{ fontSize: "14px", fontWeight: 500, color: "#EF4444" }}>
                    {streak} streak
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 rounded-full" style={{ backgroundColor: "#E2E5EA" }}>
            <div
              className="h-2 rounded-full transition-all"
              style={{
                backgroundColor: "#2563EB",
                width: `${(Math.min(currentIdx, BATCH_SIZE - 1) + (state === "result" ? 1 : 0)) / BATCH_SIZE * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Loading state \u2014 initial OR mid-batch */}
        {state === "loading" && (
          <div
            className="rounded-xl p-12 text-center"
            style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
          >
            <p className="inline-flex items-center gap-2" style={{ fontSize: "14px", color: "#6B7280" }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#D97706" }} />
              {results.length === 0 ? "Generating your first question..." : "Generating next question..."}
            </p>
          </div>
        )}

        {/* Question card \u2014 answering / grading / result share this card with
            colored left border driven by state. */}
        {(state === "question" || state === "grading" || state === "result") && quiz && (
          <div
            className="rounded-xl p-8"
            style={{
              backgroundColor: "#FFFFFF",
              border: "1px solid #E2E5EA",
              borderLeft: cardBorderLeft,
            }}
          >
            {/* Card header: Question N of N + difficulty pill */}
            <div className="flex items-center justify-between mb-6">
              <span style={{ fontSize: "12px", color: "#6B7280" }}>
                Question {currentIdx + 1} of {BATCH_SIZE}
              </span>
              <div
                className="px-3 py-1 rounded-full"
                style={{
                  backgroundColor: DIFFICULTY_COLORS[quizDifficulty].bg,
                  color: DIFFICULTY_COLORS[quizDifficulty].fg,
                  fontSize: "11px",
                  fontWeight: 500,
                  textTransform: "capitalize",
                }}
              >
                {quizDifficulty}
              </div>
            </div>

            {/* Math display */}
            <div
              className="rounded-lg p-8 mb-8 text-center math-display"
              style={{ backgroundColor: "#F0F3F7" }}
            >
              <MathRenderer content={quiz.question} />
            </div>

            {/* Answering: input + submit */}
            {(state === "question" || state === "grading") && (
              <>
                <div className="flex gap-3 mb-2">
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
                    placeholder="Type your answer..."
                    disabled={state === "grading"}
                    className="flex-1 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 text-center disabled:opacity-50"
                    style={{
                      borderColor: "#E2E5EA",
                      backgroundColor: "#FFFFFF",
                      fontSize: "18px",
                      padding: "16px 20px",
                    }}
                  />
                  <button
                    onClick={submitAnswer}
                    disabled={state === "grading" || !answer.trim()}
                    className="px-8 rounded-lg transition-colors disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: state === "grading" || !answer.trim() ? "#E2E5EA" : "#0F2A4A",
                      color: "#FFFFFF",
                      fontSize: "15px",
                    }}
                  >
                    Submit
                  </button>
                </div>
                {state === "grading" && (
                  <div className="flex items-center gap-2 justify-center mt-4">
                    <div
                      className="w-2 h-2 rounded-full animate-pulse"
                      style={{ backgroundColor: "#D97706" }}
                    />
                    <span style={{ fontSize: "13px", color: "#D97706" }}>Grading answer...</span>
                  </div>
                )}
              </>
            )}

            {/* Result: correct or incorrect inline feedback */}
            {state === "result" && grade && (
              <div className="space-y-4">
                {grade.correct ? (
                  <div className="flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "#059669" }}
                    >
                      <Check size={18} style={{ color: "#FFFFFF" }} />
                    </div>
                    <div className="flex-1">
                      <p style={{ fontSize: "15px", fontWeight: 500, color: "#059669", marginBottom: "8px" }}>
                        Correct!
                      </p>
                      <div className="text-sm text-body math-display mb-3">
                        <MathRenderer content={grade.explanation} />
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <TrendingUp size={14} style={{ color: "#059669" }} />
                          <span style={{ fontSize: "13px", color: "#059669" }}>{CORRECT_DELTA_LABEL}</span>
                        </div>
                        {streak > 1 && (
                          <div className="flex items-center gap-1.5">
                            <Flame size={14} style={{ color: "#EF4444" }} />
                            <span style={{ fontSize: "13px", color: "#EF4444", fontWeight: 500 }}>
                              {streak} streak!
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "#D97706" }}
                    >
                      <X size={18} style={{ color: "#FFFFFF" }} />
                    </div>
                    <div className="flex-1">
                      <p style={{ fontSize: "14px", color: "#1F2937", marginBottom: "8px" }}>
                        <span style={{ textDecoration: "line-through", color: "#9CA3AF" }}>
                          Your answer: {answer}
                        </span>
                      </p>
                      <div className="text-sm text-body math-display mb-3">
                        <MathRenderer content={grade.explanation} />
                      </div>
                      <div
                        className="inline-block rounded-lg mb-3"
                        style={{
                          backgroundColor: "#ECFDF5",
                          border: "1px solid #059669",
                          padding: "8px 12px",
                        }}
                      >
                        <span style={{ fontSize: "14px", color: "#059669", fontWeight: 500 }}>
                          Correct: {grade.correct_answer}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <TrendingDown size={14} style={{ color: "#D97706" }} />
                        <span style={{ fontSize: "13px", color: "#D97706" }}>
                          {INCORRECT_DELTA_LABEL}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Next + (when incorrect & not yet retried) Try-a-similar */}
                {!grade.correct && !retriedSlots.has(currentIdx) ? (
                  <div className="flex gap-3">
                    <button
                      onClick={advanceSlot}
                      className="flex-1 rounded-lg transition-colors"
                      style={{
                        backgroundColor: "#0F2A4A",
                        color: "#FFFFFF",
                        fontSize: "15px",
                        padding: "16px 24px",
                      }}
                    >
                      {currentIdx + 1 >= BATCH_SIZE ? "Finish batch \u2192" : "Next question \u2192"}
                    </button>
                    <button
                      onClick={handleTrySimilar}
                      className="flex-1 rounded-lg border transition-colors hover:border-blue-500"
                      style={{
                        borderColor: "#E2E5EA",
                        color: "#1F2937",
                        fontSize: "15px",
                        padding: "16px 24px",
                      }}
                    >
                      Try a similar one
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={advanceSlot}
                    className="w-full rounded-lg transition-colors"
                    style={{
                      backgroundColor: "#0F2A4A",
                      color: "#FFFFFF",
                      fontSize: "15px",
                      padding: "16px 24px",
                    }}
                  >
                    {currentIdx + 1 >= BATCH_SIZE ? "Finish batch \u2192" : "Next question \u2192"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {state === "error" && (
          <div
            className="rounded-xl p-8 text-center space-y-3"
            style={{ backgroundColor: "#FFFFFF", border: "1px solid #FCA5A5" }}
          >
            <p style={{ fontSize: "14px", color: "#991B1B" }}>{error}</p>
            <button
              onClick={generateQuiz}
              className="px-4 py-2 rounded-lg border transition-colors"
              style={{ borderColor: "#E2E5EA", color: "#6B7280", fontSize: "13px" }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Completion summary ──────────────────────────────
// Step 3 builds the structure (heading, score line, mastery delta block, dot
// grid, mistake link, CTA stack). Visual polish (icons, exact colors,
// animations) lands in step 4. AI-stats insight callout lands in step 5.
//
// CTA priority:
//   - mastered (mastery ≥ MASTERY_STRONG_THRESHOLD) AND topic has a quiz:
//       primary "Go to quiz" → secondary "Practice more" → tertiary "Back"
//   - otherwise:
//       primary "Practice more" → secondary "Try a different topic" → "Back"
const MASTERY_STRONG_THRESHOLD = 0.7; // mirrors lib/progress.ts:deriveTopicStatus and /subject/[id]/page.tsx

function CompletionSummary({
  results,
  batchSize,
  masteryBefore,
  masteryAfter,
  topicId,
  hasQuiz,
  recoveredCount,
  onPracticeMore,
}: {
  results: QuestionResult[];
  batchSize: number;
  masteryBefore: number;
  masteryAfter: number;
  topicId: string;
  hasQuiz: boolean;
  recoveredCount: number;
  onPracticeMore: () => void;
}) {
  const correctCount = results.filter((r) => r.correct).length;
  const wrongCount = results.length - correctCount;
  const isMastered = masteryAfter >= MASTERY_STRONG_THRESHOLD;
  const masteryAfterPct = Math.round(masteryAfter * 100);
  const masteryBeforePct = Math.round(masteryBefore * 100);
  const passRate = batchSize > 0 ? correctCount / batchSize : 0;
  const isPassing = passRate >= 0.6;

  // Stats-based completion insight — NOT an LLM call. Two lines: a hard-stats
  // line and a single-rule heuristic observation. Honest about being stats.
  // TODO: when /review has real wrong-answer history, swap this for a proper
  // /api/portrait insight call gated on having enough data.
  const totalSeconds = results.reduce((s, r) => s + r.timeSeconds, 0);
  const avgSeconds = results.length > 0 ? totalSeconds / results.length : 0;
  const totalMins = Math.floor(totalSeconds / 60);
  const totalSecs = Math.round(totalSeconds % 60);
  const timeLabel = totalMins > 0 ? `${totalMins}m ${totalSecs}s` : `${totalSecs}s`;
  const statsLine = `You finished ${batchSize} questions in ${timeLabel}. ${correctCount}/${batchSize} correct.`;
  const heuristicLine = (() => {
    if (correctCount === batchSize) return "Clean sweep — all correct.";
    if (correctCount === 0) return "Tough batch. Revisit the lesson, then try again.";
    if (recoveredCount > 0) return `You recovered on ${recoveredCount} after a retry — good persistence.`;
    if (avgSeconds < 15) return "Quick rhythm — you trusted your answers.";
    if (avgSeconds >= 30 && correctCount >= Math.ceil(batchSize * 0.8)) {
      return "Steady pace — you took your time and it paid off.";
    }
    return "Mixed pace across the batch.";
  })();

  return (
    <div
      className="rounded-xl p-10 text-center"
      style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
    >
      {/* Big top icon */}
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
        style={{ backgroundColor: isPassing ? "#ECFDF5" : "#FFFBEB" }}
      >
        {isPassing ? (
          <Check size={40} style={{ color: "#059669" }} />
        ) : (
          <TrendingUp size={40} style={{ color: "#D97706" }} />
        )}
      </div>

      {/* Heading */}
      <h2
        style={{
          fontSize: "24px",
          fontWeight: 500,
          color: "#0F2A4A",
          marginBottom: "12px",
        }}
      >
        Practice complete!
      </h2>
      <p style={{ fontSize: "18px", color: "#1F2937", marginBottom: "32px" }}>
        {correctCount} out of {batchSize} correct
      </p>

      {/* Mastery delta block */}
      <div
        className="rounded-lg p-6 mb-8"
        style={{ backgroundColor: "#F0F3F7" }}
      >
        <p style={{ fontSize: "14px", color: "#6B7280", marginBottom: "12px" }}>
          Your mastery for this topic
        </p>
        <div className="flex items-center justify-center gap-4 mb-4">
          <span style={{ fontSize: "24px", fontWeight: 500, color: "#1F2937" }}>{masteryBeforePct}%</span>
          <span style={{ fontSize: "20px", color: "#9CA3AF" }}>→</span>
          <span
            style={{
              fontSize: "24px",
              fontWeight: 500,
              color: masteryAfterPct >= masteryBeforePct ? "#059669" : "#D97706",
            }}
          >
            {masteryAfterPct}%
          </span>
        </div>
        <div className="h-2 rounded-full" style={{ backgroundColor: "#E2E5EA" }}>
          <div
            className="h-2 rounded-full transition-all duration-1000"
            style={{
              backgroundColor: masteryAfterPct >= masteryBeforePct ? "#059669" : "#D97706",
              width: `${masteryAfterPct}%`,
            }}
          />
        </div>
      </div>

      {/* Per-question dot grid */}
      <div className="flex gap-3 justify-center mb-8">
        {Array.from({ length: batchSize }).map((_, i) => {
          const r = results[i];
          const status = r ? (r.correct ? "correct" : "incorrect") : "pending";
          return (
            <div
              key={i}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                backgroundColor:
                  status === "correct" ? "#ECFDF5" : status === "incorrect" ? "#FFFBEB" : "#F3F4F6",
                border: `2px solid ${
                  status === "correct" ? "#059669" : status === "incorrect" ? "#D97706" : "#E2E5EA"
                }`,
              }}
              aria-label={`Question ${i + 1}: ${status}`}
            >
              {status === "correct" ? (
                <Check size={18} style={{ color: "#059669" }} />
              ) : status === "incorrect" ? (
                <X size={18} style={{ color: "#D97706" }} />
              ) : (
                <span style={{ fontSize: "13px", color: "#9CA3AF" }}>{i + 1}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Mistake → review link */}
      {wrongCount > 0 && (
        <div className="mb-8">
          <p style={{ fontSize: "14px", color: "#6B7280" }}>
            {wrongCount} mistake{wrongCount > 1 ? "s" : ""} saved to your{" "}
            <Link
              href="/review"
              className="underline hover:opacity-80"
              style={{ color: "#2563EB" }}
            >
              Review notebook
            </Link>
          </p>
        </div>
      )}

      {/* Mastered callout */}
      {isMastered && (
        <div
          className="rounded-lg p-4 mb-8"
          style={{ backgroundColor: "#ECFDF5", border: "1px solid #059669", textAlign: "left" }}
        >
          <p style={{ fontSize: "14px", color: "#065F46", lineHeight: 1.6 }}>
            <strong>You&apos;ve mastered this topic.</strong>{" "}
            {hasQuiz ? "Try the quiz to lock it in." : "Move on to a new topic."}
          </p>
        </div>
      )}

      {/* Stats summary — explicitly labelled "Session stats", not AI insight */}
      <div
        className="rounded-lg p-5 mb-8"
        style={{ backgroundColor: "#EFF6FF", textAlign: "left" }}
      >
        <p
          style={{
            fontSize: "11px",
            color: "#2563EB",
            fontWeight: 500,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            marginBottom: "8px",
          }}
        >
          Session stats
        </p>
        <p style={{ fontSize: "14px", color: "#1E40AF", lineHeight: 1.6, marginBottom: "4px" }}>
          {statsLine}
        </p>
        <p style={{ fontSize: "14px", color: "#1E3A8A", lineHeight: 1.6 }}>
          {heuristicLine}
        </p>
      </div>

      {/* CTA stack — hierarchy depends on mastery + has-quiz */}
      <div className="flex gap-4 justify-center">
        {isMastered && hasQuiz ? (
          <>
            <Link
              href={`/quiz?topic=${topicId}`}
              className="px-8 py-3 rounded-lg transition-colors"
              style={{ backgroundColor: "#0F2A4A", color: "#FFFFFF", fontSize: "15px" }}
            >
              Go to quiz →
            </Link>
            <button
              onClick={onPracticeMore}
              className="px-8 py-3 rounded-lg border transition-colors hover:border-blue-500"
              style={{ borderColor: "#E2E5EA", color: "#1F2937", fontSize: "15px" }}
            >
              Practice more
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onPracticeMore}
              className="px-8 py-3 rounded-lg transition-colors"
              style={{ backgroundColor: "#0F2A4A", color: "#FFFFFF", fontSize: "15px" }}
            >
              Practice more →
            </button>
            <Link
              href="/subject/math"
              className="px-8 py-3 rounded-lg border transition-colors hover:border-blue-500"
              style={{ borderColor: "#E2E5EA", color: "#1F2937", fontSize: "15px" }}
            >
              Try a different topic
            </Link>
          </>
        )}
      </div>

      {/* Tertiary back link */}
      <div className="mt-4">
        <Link
          href="/"
          className="hover:underline transition-colors"
          style={{ fontSize: "14px", color: "#6B7280" }}
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
