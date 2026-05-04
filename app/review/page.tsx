"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Clock, Check, X, ChevronDown, ChevronRight, BookOpen, Sparkles } from "lucide-react";
import MathRenderer from "@/components/math-renderer";
import { useAIContext } from "@/components/ai-context";
import { loadProfile, recordReviewAttempt, startSession, endSession } from "@/lib/progress";
import { onSettingsChanged } from "@/lib/settings-events";
import {
  isMistakeDue,
  errorTypeLabel,
  errorTypeColor,
  formatRelativeDate,
  getSkillAreaForTopic,
  reviewState,
  computeMistakePatterns,
  type MistakeReviewState,
} from "@/lib/review";
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

  // Archive expanded-row state — only one row expanded at a time. Auto-collapses
  // when a retry starts on the same item to avoid double UI.
  const [expandedMistakeId, setExpandedMistakeId] = useState<string | null>(null);

  // ── Session tracking (one session per visit) ──
  // Mount opens a "review" session; unmount closes it with whatever stats
  // accumulated. Stats live in a ref so the unmount cleanup can read latest
  // values without re-firing on every state change. Topic is "" — review is
  // cross-topic by nature.
  const sessionIdRef = useRef<string | null>(null);
  const sessionStatsRef = useRef({ attempted: 0, correct: 0 });

  useEffect(() => {
    setContext({ page: "general" });
  }, [setContext]);

  useEffect(() => {
    sessionIdRef.current = startSession("review", "");
    return () => {
      if (sessionIdRef.current) {
        endSession(sessionIdRef.current, {
          questions_attempted: sessionStatsRef.current.attempted,
          questions_correct: sessionStatsRef.current.correct,
          hints_used: 0,
          explain_differently_used: 0,
        });
        sessionIdRef.current = null;
      }
    };
  }, []);

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

  // Archive: ALL mistakes, sorted timestamp DESC. If a mistake is currently
  // in retry AND it's also in the due list, suppress it here so the retry UI
  // only renders once (in the due section above). Items in retry that aren't
  // due render their retry UI inline at the archive position.
  const archiveItems = wrongAnswers
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .filter((wa) => !(wa.id === retryingId && isMistakeDue(wa)));

  // Stats-based "Mistake patterns" callout. Computed across ALL wrong_answers
  // (not just due) so the observation reflects long-running tendencies, not
  // just today's queue. Returns null when there's not enough signal.
  const pattern = computeMistakePatterns(wrongAnswers);

  // Group archive items by skill area (= unit title via review.ts helper).
  // Insertion order preserved per first occurrence — newer mistakes within a
  // group still come first because the input is already DESC.
  const groupedArchive = new Map<string, WrongAnswer[]>();
  for (const wa of archiveItems) {
    const skill = getSkillAreaForTopic(wa.topic);
    const list = groupedArchive.get(skill) ?? [];
    list.push(wa);
    groupedArchive.set(skill, list);
  }

  function startRetry(id: string) {
    setRetryingId(id);
    setRetryState("retrying");
    setRetryAnswer("");
    // If the user clicked Try-again from inside the archive expanded view,
    // collapse it — the row swaps to a retry card and the expanded chrome
    // would otherwise sit on top of it.
    if (expandedMistakeId === id) setExpandedMistakeId(null);
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

    // Every submit counts as one session attempt — including the "wrong"
    // submit that lands on wrong-again. The terminal SR write happens
    // separately (success path here, skip path in skipFromWrongAgain).
    sessionStatsRef.current.attempted += 1;

    if (isAnswerCorrect(retryAnswer, wa.correct_answer)) {
      // Success path — write SR immediately, show "correct" card briefly.
      sessionStatsRef.current.correct += 1;
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
          <span aria-hidden="true">·</span>
          <span>
            <strong style={{ color: "#1F2937" }}>{totalMistakes}</strong> total mistake
            {totalMistakes !== 1 ? "s" : ""}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong style={{ color: "#059669" }}>{reviewedCount}</strong> reviewed
          </span>
          <span aria-hidden="true">·</span>
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

        {/* ALL MISTAKES archive — grouped by skill area, sorted DESC */}
        {archiveItems.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BookOpen size={14} style={{ color: "#6B7280" }} />
                <h2
                  style={{
                    fontSize: "11px",
                    fontWeight: 500,
                    color: "#6B7280",
                    letterSpacing: "0.5px",
                  }}
                >
                  ALL MISTAKES
                </h2>
              </div>
              {/* figma had a "Most recent" pseudo-button with no toggle. We
                  show it as a static label for visual parity, no UI alts. */}
              <span
                className="px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: "#EFF6FF", color: "#2563EB", fontSize: "12px" }}
              >
                Most recent
              </span>
            </div>
            <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "20px" }}>
              Grouped by skill area
            </p>

            <div className="space-y-6">
              {Array.from(groupedArchive.entries()).map(([skill, items]) => (
                <div key={skill}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 style={{ fontSize: "15px", fontWeight: 500, color: "#0F2A4A" }}>
                      {skill}
                    </h3>
                    <div
                      className="px-3 py-1 rounded-full"
                      style={{
                        backgroundColor: "#F5F6F8",
                        color: "#6B7280",
                        fontSize: "12px",
                      }}
                    >
                      {items.length} mistake{items.length !== 1 ? "s" : ""}
                    </div>
                  </div>

                  <ul role="list" className="space-y-2 list-none p-0">
                    {items.map((wa) => {
                      // If this archive item is currently the retry target
                      // AND it's not in the due section (we already filtered
                      // those out), render the retry card inline here.
                      if (wa.id === retryingId) {
                        return (
                          <li key={wa.id}>
                            <DueRetryingCard
                              mistake={wa}
                              retryState={retryState}
                              retryAnswer={retryAnswer}
                              onAnswerChange={setRetryAnswer}
                              onSubmit={submitRetry}
                              onTryOnceMore={tryOnceMore}
                              onSkip={skipFromWrongAgain}
                              onClose={closeRetry}
                            />
                          </li>
                        );
                      }
                      return (
                        <li key={wa.id}>
                          <ArchiveRow
                            mistake={wa}
                            expanded={expandedMistakeId === wa.id}
                            onToggle={() =>
                              setExpandedMistakeId(
                                expandedMistakeId === wa.id ? null : wa.id,
                              )
                            }
                            onTryAgain={() => startRetry(wa.id)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mistake patterns callout — stats-based, NOT AI inference. Header
            says "Mistake patterns" not "AI insight" so users don't expect a
            personalized model-generated read. Hidden until there's enough
            signal (see computeMistakePatterns threshold). */}
        {pattern && (
          <div
            className="rounded-lg p-5 flex items-start gap-3 mb-6"
            style={{ backgroundColor: "#EFF6FF" }}
          >
            <Sparkles
              size={16}
              style={{ color: "#2563EB", marginTop: "2px", flexShrink: 0 }}
            />
            <div className="flex-1">
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
                Mistake patterns
              </p>
              <p style={{ fontSize: "14px", color: "#1E40AF", lineHeight: 1.6 }}>
                {pattern.headline}
              </p>
              {pattern.tip && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "#1E3A8A",
                    lineHeight: 1.6,
                    marginTop: "6px",
                  }}
                >
                  Tip: {pattern.tip}
                </p>
              )}
            </div>
          </div>
        )}
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
        <div className="flex items-start gap-3" role="status" aria-live="polite">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "#059669" }}
            aria-hidden="true"
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
            role="status"
            aria-live="polite"
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

// ── Archive row: collapsed-by-default, click-to-expand ──
// Status of last review attempt (reviewed | failed | not_reviewed) drives the
// status icon + status text. Reviewed items render the same row layout as
// pending — just with a different icon — so the archive looks uniform.

function ArchiveRow({
  mistake,
  expanded,
  onToggle,
  onTryAgain,
}: {
  mistake: WrongAnswer;
  expanded: boolean;
  onToggle: () => void;
  onTryAgain: () => void;
}) {
  const label = errorTypeLabel(mistake.error_type);
  const labelColors = errorTypeColor(label);
  const status: MistakeReviewState = reviewState(mistake);

  const statusIcon =
    status === "reviewed" ? (
      <Check size={14} style={{ color: "#059669" }} />
    ) : status === "failed" ? (
      <X size={14} style={{ color: "#EF4444" }} />
    ) : (
      <Clock size={14} style={{ color: "#D97706" }} />
    );
  const statusBg =
    status === "reviewed" ? "#ECFDF5" : status === "failed" ? "#FEF2F2" : "#FFFBEB";
  const statusText =
    status === "reviewed" ? "Reviewed ✓" : status === "failed" ? "Failed review" : "Not reviewed";
  const statusTextColor =
    status === "reviewed" ? "#059669" : status === "failed" ? "#EF4444" : "#D97706";

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between p-4 rounded-lg border transition-colors hover:border-blue-500 text-left"
        style={{ borderColor: "#E2E5EA", backgroundColor: "#FFFFFF" }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: statusBg }}
            aria-hidden="true"
          >
            {statusIcon}
          </div>
          <span
            className="truncate"
            style={{ fontSize: "14px", color: "#1F2937", flex: 1, minWidth: 0 }}
          >
            {mistake.question}
          </span>
          <div
            className="px-2 py-0.5 rounded-full shrink-0"
            style={{
              backgroundColor: labelColors.bg,
              color: labelColors.fg,
              fontSize: "10px",
              fontWeight: 500,
            }}
          >
            {label}
          </div>
          <span style={{ fontSize: "12px", color: "#9CA3AF" }} className="shrink-0">
            {formatRelativeDate(mistake.timestamp)}
          </span>
          <span
            style={{ fontSize: "12px", color: statusTextColor }}
            className="shrink-0"
          >
            {statusText}
          </span>
        </div>
        {expanded ? (
          <ChevronDown size={16} style={{ color: "#6B7280" }} />
        ) : (
          <ChevronRight size={16} style={{ color: "#6B7280" }} />
        )}
      </button>

      {expanded && (
        <div className="p-5 mt-2 rounded-lg" style={{ backgroundColor: "#F5F6F8" }}>
          <div
            className="rounded-lg p-4 mb-4 text-center math-display"
            style={{ backgroundColor: "#FFFFFF" }}
          >
            <MathRenderer content={mistake.question} />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <span style={{ fontSize: "12px", color: "#9CA3AF" }}>Your answer: </span>
              <span
                style={{
                  fontSize: "14px",
                  color: "#D97706",
                  textDecoration: "line-through",
                }}
              >
                {mistake.student_answer}
              </span>
            </div>
            <div>
              <span style={{ fontSize: "12px", color: "#9CA3AF" }}>Correct: </span>
              <span style={{ fontSize: "14px", color: "#059669", fontWeight: 500 }}>
                {mistake.correct_answer}
              </span>
            </div>
          </div>

          {mistake.explanation && (
            <p
              className="math-display"
              style={{
                fontSize: "14px",
                color: "#1F2937",
                lineHeight: 1.6,
                marginBottom: "16px",
              }}
            >
              <MathRenderer content={mistake.explanation} />
            </p>
          )}

          <button
            onClick={onTryAgain}
            className="px-6 py-2.5 rounded-lg transition-colors"
            style={{ backgroundColor: "#0F2A4A", color: "#FFFFFF", fontSize: "14px" }}
          >
            Try again →
          </button>
        </div>
      )}
    </div>
  );
}
