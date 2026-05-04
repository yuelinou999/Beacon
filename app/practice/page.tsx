"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grade answer");
      setState("error");
    }
  };

  // Advance to next slot OR complete the batch. Wired to the result-phase
  // "Next" button. retry path (refetch same slot) lands in step 5.
  const advanceSlot = () => {
    if (currentIdx + 1 >= BATCH_SIZE) {
      setState("complete");
    } else {
      setCurrentIdx((i) => i + 1);
      generateQuiz();
    }
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

  const difficulty = getDifficulty(progress.mastery);

  return (
    <div className="flex flex-col h-full">
      {/* Topic header */}
      <div className="flex items-center justify-between px-8 py-3 border-b border-border/60 bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/subject/math" className="text-muted hover:text-navy text-sm">&larr; Back</Link>
          <span className="text-border">|</span>
          <span className="text-sm font-medium text-navy">{topic.title[language]}</span>
          {bilingual && (
            <span className="text-xs text-muted">({language === "en" ? topic.title.zh : topic.title.en})</span>
          )}
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-surface text-muted border border-border">
            Practice
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted">
            Slot {Math.min(currentIdx + 1, BATCH_SIZE)} of {BATCH_SIZE}
          </span>
          {questionsAnswered > 0 && (
            <span className="text-xs text-muted">
              {correctCount} correct of {questionsAnswered}
            </span>
          )}
          <span className="text-xs text-muted">
            Mastery {(progress.mastery * 100).toFixed(0)}%
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-surface text-muted border border-border">
            {difficulty}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-[720px] space-y-6">

          {/* Loading */}
          {state === "loading" && (
            <p className="text-xs text-muted flex items-center gap-1.5 py-12">
              <span className="w-2 h-2 rounded-full bg-warning inline-block animate-pulse" />
              Generating quiz...
            </p>
          )}

          {/* Question card */}
          {(state === "question" || state === "grading") && quiz && (
            <>
              <div className="bg-card border border-border/60 rounded-xl px-6 py-5">
                <p className="text-label uppercase text-muted mb-3">
                  Question {currentIdx + 1} of {BATCH_SIZE}
                </p>
                <div className="text-body math-display">
                  <MathRenderer content={quiz.question} />
                </div>
              </div>

              {/* Answer input */}
              <div className="bg-card border border-border/60 rounded-xl px-6 py-5 space-y-3">
                <p className="text-label uppercase text-muted">Your answer</p>
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
                  placeholder="Type your answer..."
                  disabled={state === "grading"}
                  className="w-full rounded-lg border border-border px-4 py-2.5 text-sm text-body focus:outline-none focus:border-blue disabled:opacity-50"
                />
                <button
                  onClick={submitAnswer}
                  disabled={state === "grading" || !answer.trim()}
                  className="w-full py-2.5 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-light disabled:opacity-40 transition"
                >
                  {state === "grading" ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-warning inline-block animate-pulse" />
                      Grading answer...
                    </span>
                  ) : "Submit answer"}
                </button>
              </div>
            </>
          )}

          {/* Result */}
          {state === "result" && grade && quiz && (
            <>
              {/* Question (read-only) */}
              <div className="bg-card border border-border/60 rounded-xl px-6 py-5">
                <p className="text-label uppercase text-muted mb-3">
                  Question {currentIdx + 1} of {BATCH_SIZE}
                </p>
                <div className="text-body math-display">
                  <MathRenderer content={quiz.question} />
                </div>
              </div>

              {/* Result card */}
              <div className={`rounded-xl px-6 py-5 ${
                grade.correct ? "bg-success-bg border border-success/20" : "bg-danger-bg border border-danger/20"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-lg ${grade.correct ? "text-success" : "text-danger"}`}>
                    {grade.correct ? "\u2713" : "\u2717"}
                  </span>
                  <p className={`text-sm font-semibold ${grade.correct ? "text-success" : "text-danger"}`}>
                    {grade.correct ? "Correct!" : "Incorrect"}
                  </p>
                </div>
                <p className="text-xs text-muted mb-2">Your answer: {answer}</p>
                <div className="text-sm text-body math-display">
                  <MathRenderer content={grade.explanation} />
                </div>
              </div>

              {/* Mastery change indicator */}
              <p className="text-xs text-muted text-center">
                Mastery updated to {(progress.mastery * 100).toFixed(0)}%
              </p>

              {/* Actions \u2014 advance to next slot or finish batch */}
              <div className="flex gap-3">
                <button
                  onClick={advanceSlot}
                  className="flex-1 py-2.5 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-light transition"
                >
                  {currentIdx + 1 >= BATCH_SIZE ? "Finish batch" : "Next question"}
                </button>
                <Link
                  href="/subject/math"
                  className="px-5 py-2.5 rounded-lg border border-border text-muted text-sm hover:text-navy hover:border-navy transition text-center"
                >
                  Exit
                </Link>
              </div>
            </>
          )}

          {/* Complete \u2014 batch summary */}
          {state === "complete" && (
            <CompletionSummary
              results={results}
              batchSize={BATCH_SIZE}
              masteryBefore={masteryAtStart ?? 0}
              masteryAfter={progress.mastery}
              topicId={topicId}
              hasQuiz={topic.quiz !== undefined}
              onPracticeMore={restartBatch}
            />
          )}

          {/* Error */}
          {state === "error" && (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-danger">{error}</p>
              <button
                onClick={generateQuiz}
                className="text-sm px-4 py-2 rounded-lg border border-border text-muted hover:text-navy transition"
              >
                Try again
              </button>
            </div>
          )}
        </div>
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
  onPracticeMore,
}: {
  results: QuestionResult[];
  batchSize: number;
  masteryBefore: number;
  masteryAfter: number;
  topicId: string;
  hasQuiz: boolean;
  onPracticeMore: () => void;
}) {
  const correctCount = results.filter((r) => r.correct).length;
  const wrongCount = results.length - correctCount;
  const isMastered = masteryAfter >= MASTERY_STRONG_THRESHOLD;
  const masteryAfterPct = Math.round(masteryAfter * 100);
  const masteryBeforePct = Math.round(masteryBefore * 100);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-xl bg-card border border-border/60 p-10 text-center space-y-8">
        {/* Heading */}
        <div>
          <p className="text-2xl font-medium text-navy mb-2">Practice complete!</p>
          <p className="text-lg text-body">
            {correctCount} out of {batchSize} correct
          </p>
        </div>

        {/* Mastery delta block */}
        <div className="rounded-lg bg-surface px-6 py-5 space-y-3">
          <p className="text-xs uppercase text-muted">Your mastery for this topic</p>
          <div className="flex items-center justify-center gap-4">
            <span className="text-2xl font-medium text-body">{masteryBeforePct}%</span>
            <span className="text-xl text-muted">→</span>
            <span className="text-2xl font-medium text-success">{masteryAfterPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-border overflow-hidden">
            <div
              className="h-2 rounded-full bg-success transition-all"
              style={{ width: `${masteryAfterPct}%` }}
            />
          </div>
        </div>

        {/* Per-question dot grid */}
        <div className="flex gap-3 justify-center">
          {Array.from({ length: batchSize }).map((_, i) => {
            const r = results[i];
            const status = r ? (r.correct ? "correct" : "incorrect") : "pending";
            return (
              <div
                key={i}
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium border"
                style={{
                  backgroundColor:
                    status === "correct" ? "#ECFDF5" : status === "incorrect" ? "#FFFBEB" : "#F3F4F6",
                  borderColor:
                    status === "correct" ? "#059669" : status === "incorrect" ? "#D97706" : "#E2E5EA",
                  color:
                    status === "correct" ? "#059669" : status === "incorrect" ? "#D97706" : "#9CA3AF",
                }}
                aria-label={`Question ${i + 1}: ${status}`}
              >
                {status === "correct" ? "✓" : status === "incorrect" ? "✗" : i + 1}
              </div>
            );
          })}
        </div>

        {/* Mistake → review link */}
        {wrongCount > 0 && (
          <p className="text-sm text-muted">
            {wrongCount} mistake{wrongCount > 1 ? "s" : ""} saved to your{" "}
            <Link href="/review" className="text-blue underline hover:opacity-80">
              Review notebook
            </Link>
          </p>
        )}

        {/* Mastered callout */}
        {isMastered && (
          <div className="rounded-lg bg-success-bg border border-success/20 px-5 py-3">
            <p className="text-sm text-success font-medium">
              You&apos;ve mastered this topic. Try the quiz to lock it in.
            </p>
          </div>
        )}

        {/* CTA stack — hierarchy depends on mastery + has-quiz */}
        <div className="flex gap-3 justify-center">
          {isMastered && hasQuiz ? (
            <>
              <Link
                href={`/quiz?topic=${topicId}`}
                className="px-6 py-3 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-light transition"
              >
                Go to quiz →
              </Link>
              <button
                onClick={onPracticeMore}
                className="px-6 py-3 rounded-lg border border-border text-body text-sm hover:border-navy transition"
              >
                Practice more
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onPracticeMore}
                className="px-6 py-3 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-light transition"
              >
                Practice more →
              </button>
              <Link
                href="/subject/math"
                className="px-6 py-3 rounded-lg border border-border text-body text-sm hover:border-navy transition"
              >
                Try a different topic
              </Link>
            </>
          )}
        </div>

        {/* Tertiary back link */}
        <div>
          <Link
            href="/"
            className="text-sm text-muted hover:underline"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
