"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Clock, Check } from "lucide-react";
import MathRenderer from "@/components/math-renderer";
import { useAIContext } from "@/components/ai-context";
import { loadProfile, recordReviewAttempt } from "@/lib/progress";
import { onSettingsChanged } from "@/lib/settings-events";
import { isMistakeDue, errorTypeLabel, errorTypeColor, formatRelativeDate } from "@/lib/review";
import type { StudentProfile, WrongAnswer } from "@/lib/types";

// Per-mistake retry state machine. Only one mistake is in retry mode at a
// time (driven by retryingId). States:
//   - idle:        normal display, "Try again" button
//   - retrying:    answer input shown, awaiting submit
//   - correct:     retry succeeded, success card pauses then auto-closes
//   - wrong-again: retry failed, remediation card with "Try once more" / "Skip"
// SR write semantics (final-outcome-of-the-walkthrough wins):
//   - Submit-correct (first try OR after wrong-again): writeSR(true)
//   - Submit-wrong: NO write yet — user still has remediation paths
//   - "Skip for now" from wrong-again: writeSR(false) — user gave up
//   - Navigate away mid-retry: no write (drop UI state per spec H1)
type RetryState = "idle" | "retrying" | "correct" | "wrong-again";

const SUCCESS_AUTO_CLOSE_MS = 2200;

export default function ReviewPage() {
  const { setContext } = useAIContext();
  const [profile, setProfile] = useState<StudentProfile | null>(null);

  // Retry session state — only one mistake can be in retry mode at a time.
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryState, setRetryState] = useState<RetryState>("idle");
  const [retryAnswer, setRetryAnswer] = useState("");

  useEffect(() => {
    setContext({ page: "general" });
  }, [setContext]);

  useEffect(() => {
    const refresh = () => setProfile(loadProfile());
    refresh();
    window.addEventListener("focus", refresh);
    const unsubscribe = onSettingsChanged(refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      unsubscribe();
    };
  }, []);

  // Auto-close the "correct" success card after a brief pause so the user
  // sees the confirmation but doesn't have to dismiss it manually.
  useEffect(() => {
    if (retryState !== "correct") return;
    const t = setTimeout(closeRetry, SUCCESS_AUTO_CLOSE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryState]);

  const wrongAnswers: WrongAnswer[] = profile?.wrong_answers ?? [];
  const dueItems = wrongAnswers.filter((wa) => isMistakeDue(wa));
  const totalMistakes = wrongAnswers.length;
  const reviewedCount = wrongAnswers.filter((wa) => wa.last_review_correct === true).length;
  const remainingCount = totalMistakes - reviewedCount;

  function startRetry(id: string) {
    setRetryingId(id);
    setRetryState("retrying");
    setRetryAnswer("");
  }

  function closeRetry() {
    setRetryingId(null);
    setRetryState("idle");
    setRetryAnswer("");
  }

  // Local judging — trimmed case-insensitive string equality. No LLM round
  // trip per spec (H3): review goal is recalling the correct answer, not
  // re-grading nuance.
  function isAnswerCorrect(student: string, correct: string): boolean {
    return student.trim().toLowerCase() === correct.trim().toLowerCase();
  }

  function submitRetry() {
    if (!profile || !retryingId || !retryAnswer.trim()) return;
    const wa = profile.wrong_answers.find((w) => w.id === retryingId);
    if (!wa) return;

    if (isAnswerCorrect(retryAnswer, wa.correct_answer)) {
      // Success path — write SR immediately, show "correct" card briefly.
      const updated = recordReviewAttempt(profile, retryingId, true);
      setProfile(updated);
      setRetryState("correct");
    } else {
      // Wrong path — no SR write yet. User still has "Try once more" / "Skip".
      setRetryState("wrong-again");
    }
  }

  function tryOnceMore() {
    setRetryState("retrying");
    setRetryAnswer("");
  }

  function skipFromWrongAgain() {
    if (!profile || !retryingId) return;
    // Skip from the remediation card = user gave up = failed review.
    const updated = recordReviewAttempt(profile, retryingId, false);
    setProfile(updated);
    closeRetry();
  }

  // Total-empty state — no mistakes ever recorded. Step 4 may polish this
  // further; this is the load-bearing version.
  if (totalMistakes === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 mb-8 transition-colors hover:opacity-70"
            style={{ color: "#2563EB" }}
          >
            <ChevronLeft size={16} />
            <span style={{ fontSize: "14px" }}>Back to course</span>
          </Link>

          <div className="text-center py-16">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ backgroundColor: "#ECFDF5" }}
            >
              <Check size={40} style={{ color: "#059669" }} />
            </div>
            <h2
              style={{
                fontSize: "24px",
                fontWeight: 500,
                color: "#0F2A4A",
                marginBottom: "12px",
              }}
            >
              No mistakes yet — keep learning!
            </h2>
            <p
              style={{
                fontSize: "15px",
                color: "#6B7280",
                lineHeight: 1.7,
                marginBottom: "24px",
                maxWidth: "420px",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              Mistakes you miss in Practice will appear here for review.
            </p>
            <Link
              href="/practice?topic=solving_one_step"
              className="inline-block px-8 py-3 rounded-lg transition-colors"
              style={{ backgroundColor: "#0F2A4A", color: "#FFFFFF", fontSize: "15px" }}
            >
              Go to Practice →
            </Link>
          </div>
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
            href="/"
            className="inline-flex items-center gap-2 transition-colors hover:opacity-70"
            style={{ color: "#2563EB" }}
          >
            <ChevronLeft size={16} />
            <span style={{ fontSize: "14px" }}>Back to course</span>
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 style={{ fontSize: "24px", fontWeight: 500, color: "#0F2A4A", marginBottom: "4px" }}>
            Review
          </h1>
          <p style={{ fontSize: "14px", color: "#6B7280" }}>Your mistake notebook</p>
        </div>

        {/* Summary bar */}
        <div
          className="flex items-center gap-4 mb-8 flex-wrap"
          style={{ fontSize: "13px", color: "#6B7280" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#D97706" }} />
            <span>
              <strong style={{ color: "#1F2937" }}>{dueItems.length}</strong> due today
            </span>
          </div>
          <span>·</span>
          <span>
            <strong style={{ color: "#1F2937" }}>{totalMistakes}</strong> total mistake
            {totalMistakes !== 1 ? "s" : ""}
          </span>
          <span>·</span>
          <span>
            <strong style={{ color: "#059669" }}>{reviewedCount}</strong> reviewed
          </span>
          <span>·</span>
          <span>
            <strong style={{ color: "#1F2937" }}>{remainingCount}</strong> remaining
          </span>
        </div>

        {/* REVIEW DUE section */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} style={{ color: "#D97706" }} />
            <h2
              style={{
                fontSize: "11px",
                fontWeight: 500,
                color: "#D97706",
                letterSpacing: "0.5px",
              }}
            >
              REVIEW DUE
            </h2>
          </div>
          <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "20px" }}>
            These need your attention today
          </p>

          {dueItems.length === 0 ? (
            <div
              className="rounded-xl p-10 text-center"
              style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: "#ECFDF5" }}
              >
                <Check size={32} style={{ color: "#059669" }} />
              </div>
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 500,
                  color: "#0F2A4A",
                  marginBottom: "8px",
                }}
              >
                All caught up!
              </h3>
              <p
                style={{
                  fontSize: "14px",
                  color: "#6B7280",
                  lineHeight: 1.6,
                  marginBottom: "20px",
                  maxWidth: "400px",
                  marginLeft: "auto",
                  marginRight: "auto",
                }}
              >
                No reviews due today. Come back tomorrow, or keep practicing to build your memory.
              </p>
              <Link
                href="/practice?topic=solving_one_step"
                className="inline-block px-6 py-3 rounded-lg transition-colors"
                style={{ backgroundColor: "#0F2A4A", color: "#FFFFFF", fontSize: "14px" }}
              >
                Go to Practice →
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {dueItems.map((wa) => {
                const isInRetry = retryingId === wa.id;
                if (isInRetry) {
                  return (
                    <DueRetryingCard
                      key={wa.id}
                      mistake={wa}
                      retryState={retryState}
                      retryAnswer={retryAnswer}
                      onAnswerChange={setRetryAnswer}
                      onSubmit={submitRetry}
                      onTryOnceMore={tryOnceMore}
                      onSkip={skipFromWrongAgain}
                      onClose={closeRetry}
                    />
                  );
                }
                return <DueIdleCard key={wa.id} mistake={wa} onTry={() => startRetry(wa.id)} />;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Due item: idle (normal) display ────────────────

function DueIdleCard({ mistake, onTry }: { mistake: WrongAnswer; onTry: () => void }) {
  const label = errorTypeLabel(mistake.error_type);
  const labelColors = errorTypeColor(label);
  return (
    <div
      className="rounded-xl p-6"
      style={{
        backgroundColor: "#FFFFFF",
        borderLeft: "3px solid #D97706",
        border: "1px solid #E2E5EA",
        borderLeftWidth: "3px",
        borderLeftColor: "#D97706",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span style={{ fontSize: "12px", color: "#9CA3AF" }}>
          {formatRelativeDate(mistake.timestamp)}
        </span>
      </div>

      <div className="rounded-lg p-4 mb-4 math-display" style={{ backgroundColor: "#F5F6F8" }}>
        <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "8px" }}>Question:</p>
        <MathRenderer content={mistake.question} />
      </div>

      <div className="mb-4">
        <p style={{ fontSize: "13px", color: "#D97706", marginBottom: "4px" }}>
          <span style={{ textDecoration: "line-through" }}>
            Your answer: {mistake.student_answer}
          </span>
        </p>
        <p style={{ fontSize: "14px", color: "#059669", fontWeight: 500 }}>
          Correct: {mistake.correct_answer}
        </p>
      </div>

      <div
        className="inline-block px-3 py-1 rounded-full mb-3"
        style={{
          backgroundColor: labelColors.bg,
          color: labelColors.fg,
          fontSize: "11px",
          fontWeight: 500,
        }}
      >
        {label}
      </div>

      {mistake.explanation && (
        <p
          className="math-display"
          style={{ fontSize: "13px", color: "#6B7280", marginBottom: "20px", lineHeight: 1.6 }}
        >
          <MathRenderer content={mistake.explanation} />
        </p>
      )}

      <button
        onClick={onTry}
        className="px-6 py-3 rounded-lg transition-colors"
        style={{ backgroundColor: "#0F2A4A", color: "#FFFFFF", fontSize: "14px" }}
      >
        Try again →
      </button>
    </div>
  );
}

// ── Due item: retry-mode display (state machine: retrying / correct / wrong-again) ─

function DueRetryingCard({
  mistake,
  retryState,
  retryAnswer,
  onAnswerChange,
  onSubmit,
  onTryOnceMore,
  onSkip,
  onClose,
}: {
  mistake: WrongAnswer;
  retryState: RetryState;
  retryAnswer: string;
  onAnswerChange: (v: string) => void;
  onSubmit: () => void;
  onTryOnceMore: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  // borderLeft color reflects the substate
  const borderLeftColor =
    retryState === "correct" ? "#059669" : "#D97706";

  return (
    <div
      className="rounded-xl p-6"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid #E2E5EA",
        borderLeft: `3px solid ${borderLeftColor}`,
        borderLeftWidth: "3px",
        borderLeftColor,
      }}
    >
      {retryState === "retrying" && (
        <>
          <div
            className="rounded-lg p-6 mb-6 text-center math-display"
            style={{ backgroundColor: "#F0F3F7" }}
          >
            <MathRenderer content={mistake.question} />
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              value={retryAnswer}
              onChange={(e) => onAnswerChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
              placeholder="Type your answer..."
              autoFocus
              className="flex-1 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{
                borderColor: "#E2E5EA",
                fontSize: "16px",
                padding: "12px 16px",
              }}
            />
            <button
              onClick={onSubmit}
              disabled={!retryAnswer.trim()}
              className="px-8 py-3 rounded-lg transition-colors disabled:cursor-not-allowed"
              style={{
                backgroundColor: retryAnswer.trim() ? "#0F2A4A" : "#E2E5EA",
                color: "#FFFFFF",
                fontSize: "15px",
              }}
            >
              Submit
            </button>
          </div>
        </>
      )}

      {retryState === "correct" && (
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "#059669" }}
          >
            <Check size={18} style={{ color: "#FFFFFF" }} />
          </div>
          <div className="flex-1">
            <p
              style={{
                fontSize: "16px",
                fontWeight: 500,
                color: "#059669",
                marginBottom: "4px",
              }}
            >
              Reviewed ✓
            </p>
            <p style={{ fontSize: "14px", color: "#047857", lineHeight: 1.6 }}>
              Got it right this time — moving out of your review queue.
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 rounded-lg border transition-colors hover:border-blue-500"
              style={{
                borderColor: "#E2E5EA",
                color: "#1F2937",
                fontSize: "13px",
              }}
            >
              Close now
            </button>
          </div>
        </div>
      )}

      {retryState === "wrong-again" && (
        <>
          {/* Honest fallback — same explanation, more time. Not a "different
              approach" callout because we don't actually have a different
              explanation to show (no explain-differently endpoint yet). */}
          <div
            className="rounded-lg p-5 mb-6"
            style={{ backgroundColor: "#FFFBEB" }}
          >
            <p
              style={{
                fontSize: "15px",
                color: "#92400E",
                lineHeight: 1.7,
                marginBottom: "12px",
                fontWeight: 500,
              }}
            >
              Review the explanation, then try once more.
            </p>
            <p
              className="math-display"
              style={{ fontSize: "14px", color: "#78350F", lineHeight: 1.6, marginBottom: "8px" }}
            >
              <MathRenderer content={mistake.explanation || "No explanation recorded for this mistake."} />
            </p>
            <p style={{ fontSize: "13px", color: "#78350F" }}>
              Correct answer:{" "}
              <strong style={{ color: "#059669" }}>{mistake.correct_answer}</strong>
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onTryOnceMore}
              className="flex-1 rounded-lg transition-colors"
              style={{
                backgroundColor: "#D97706",
                color: "#FFFFFF",
                fontSize: "15px",
                padding: "12px 24px",
              }}
            >
              Try once more →
            </button>
            <button
              onClick={onSkip}
              className="rounded-lg border transition-colors hover:border-blue-500"
              style={{
                borderColor: "#E2E5EA",
                color: "#1F2937",
                fontSize: "14px",
                padding: "12px 24px",
              }}
            >
              Skip for now
            </button>
          </div>
        </>
      )}
    </div>
  );
}
