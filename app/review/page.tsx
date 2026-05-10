"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Clock, Check, X, ChevronDown, ChevronRight, BookOpen, Sparkles } from "lucide-react";
import MathRenderer from "@/components/math-renderer";
import BilingualSubtitle from "@/components/bilingual-subtitle";
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
import { getAllTopics } from "@/lib/curriculum";
import { resolveBankQuestion } from "@/lib/wrong-answer-key";
import { resolveActiveStudyTarget } from "@/lib/active-target";
import { resolveLearnerOutputLanguage } from "@/lib/learner-language";
import { getBilingual, getSecondLanguage, getBrowserAI } from "@/components/settings-modal";
import {
  buildExplainSystemPrompt,
  buildExplainUserPrompt,
} from "@/lib/explain-prompt";
import { isWebGpuAvailable } from "@/lib/webllm-engine";
import type { StudentProfile, WrongAnswer, ExplainRequest, ExplainResponse } from "@/lib/types";

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

  // ── Alternative explanation state (per current retrying slot) ──
  // Two layers of "another way" content:
  //   bankAltText — pre-authored alternative angle from curriculum.json
  //     (PracticeBankQuestion.alt_explanation / QuizQuestion.alt_explanation),
  //     resolved synchronously when startRetry runs. Free, instant, and
  //     locked-down — primary path post-pivot.
  //   altText — LLM-generated alternative from /api/explain. Optional
  //     tertiary layer (button: "Another angle from Gemma") that only
  //     shows up after bankAltText is rendered, OR as the primary path
  //     when no bank alt exists (legacy mistakes, unauthored topics).
  //
  // Both reset on closeRetry / startRetry; both persist across try-once-more
  // loops on the SAME slot.
  const [bankAltText, setBankAltText] = useState<string | null>(null);
  const [altText, setAltText] = useState<string | null>(null);
  const [altState, setAltState] = useState<"idle" | "loading" | "error">("idle");
  const [altError, setAltError] = useState<string>("");

  // ── Session tracking (one session per visit) ──
  // Mount opens a "review" session; unmount closes it with whatever stats
  // accumulated. Stats live in a ref so the unmount cleanup can read latest
  // values without re-firing on every state change. Topic is "" — review is
  // cross-topic by nature.
  const sessionIdRef = useRef<string | null>(null);
  const sessionStatsRef = useRef({ attempted: 0, correct: 0 });

  // Mirror of retryingId state — refs let async fetch resolutions check the
  // CURRENT slot owner without closing over a stale value. Required for the
  // /api/explain race fix below.
  const retryingIdRef = useRef<string | null>(null);
  useEffect(() => {
    retryingIdRef.current = retryingId;
  }, [retryingId]);

  // AbortController for the in-flight /api/explain request. Aborted when the
  // user moves on (closeRetry / startRetry on a different slot) or when the
  // 10s deadline elapses.
  const inflightExplainRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setContext({ page: "review" });
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
      // Drop any in-flight /api/explain — no point firing setStates after
      // the component has unmounted.
      abortInflightExplain();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // "Go to Practice" CTAs route through the active study target so /review's
  // empty state and "all caught up" state hand the user back to the same
  // topic Sidebar / Home / Subject all agree on.
  const activePracticeHref = `/practice?topic=${resolveActiveStudyTarget(profile).topicId}`;

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

  // Cancel any in-flight /api/explain request. Called when the user moves
  // off the slot that initiated it — without this, a late response would
  // call setAltText() and corrupt the next slot's UI state.
  function abortInflightExplain() {
    if (inflightExplainRef.current) {
      inflightExplainRef.current.abort();
      inflightExplainRef.current = null;
    }
  }

  function startRetry(id: string) {
    abortInflightExplain();
    setRetryingId(id);
    setRetryState("retrying");
    setRetryAnswer("");
    // Fresh slot — drop any alt explanation from a prior retry session.
    setAltText(null);
    setAltState("idle");
    setAltError("");
    // Resolve bank alt synchronously. Looks up the originating bank entry
    // by bank_question_id (post-pivot writes) or normalized display string
    // (legacy mistakes); when found and the entry carries an alt_explanation,
    // set it as the default "another way" content. No-op for mistakes
    // outside the authored topics — those fall through to the LLM path.
    const wa = profile?.wrong_answers.find((w) => w.id === id);
    if (wa) {
      const resolved = resolveBankQuestion(wa, getAllTopics());
      setBankAltText(resolved?.entry.alt_explanation ?? null);
    } else {
      setBankAltText(null);
    }
    // If the user clicked Try-again from inside the archive expanded view,
    // collapse it — the row swaps to a retry card and the expanded chrome
    // would otherwise sit on top of it.
    if (expandedMistakeId === id) setExpandedMistakeId(null);
  }

  function closeRetry() {
    abortInflightExplain();
    setRetryingId(null);
    setRetryState("idle");
    setRetryAnswer("");
    setBankAltText(null);
    setAltText(null);
    setAltState("idle");
    setAltError("");
  }

  // Local judging — no LLM round trip per spec (H3): review goal is
  // recalling the correct answer, not re-grading nuance.
  //
  // Two-tier match:
  //   1. If BOTH sides parse as a strict decimal number, compare numerically.
  //      Handles "07" vs "7", "1.0" vs "1", "+7" vs "7" cleanly.
  //   2. Otherwise fall back to trimmed case-insensitive string equality
  //      (covers algebraic expressions, word answers, etc.).
  //
  // "Strict" parse intentionally rejects expressions like "1+2" — a student
  // typing "0.1+0.2" should NOT be quietly normalized to 0.3; that's a
  // grading semantics call we're not making here.
  function parseStrictNumber(s: string): number | null {
    if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function isAnswerCorrect(student: string, correct: string): boolean {
    const s = student.trim();
    const c = correct.trim();
    const sn = parseStrictNumber(s);
    const cn = parseStrictNumber(c);
    if (sn !== null && cn !== null) return sn === cn;
    return s.toLowerCase() === c.toLowerCase();
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

  // Fetch an alternative explanation from /api/explain. User-triggered (no
  // auto-fetch on entering wrong-again); short-circuits if we already have
  // alt text for this slot.
  //
  // Race protection (codex review fix): captures the slot id at request
  // time and checks retryingIdRef on resolve — if the user moved to a
  // different slot mid-flight, the response is silently dropped instead of
  // corrupting the new slot's state. AbortController also cancels the
  // network request itself, plus enforces a 10s deadline.
  //
  // Error copy is product-safe; raw HTTP / Ollama detail logs to console
  // for diagnosis but is never shown to the learner.
  async function fetchAltExplanation() {
    if (!profile || !retryingId) return;
    if (altText) return; // already loaded for this slot
    const wa = profile.wrong_answers.find((w) => w.id === retryingId);
    if (!wa) return;

    abortInflightExplain();
    const controller = new AbortController();
    inflightExplainRef.current = controller;
    const requestSlotId = retryingId;
    // Browser-AI requires BOTH the persisted toggle AND a runtime
    // WebGPU capability check. The settings-modal capability check
    // only runs when the modal is opened — by the time the user
    // reaches /review, capability could differ (e.g., flag persisted
    // on a desktop session, then opened on mobile Safari). Without
    // the runtime gate the WebLLM path would fail loudly instead of
    // falling back to /api/explain.
    const useBrowserAI = getBrowserAI() && isWebGpuAvailable();
    // Server path uses 10s; browser-AI first inference can take longer
    // because of just-in-time JIT/warmup. Spike data showed worst-case
    // ~7s on M4 main thread; 30s gives Xiaomei's old Android headroom.
    // The browser-AI generate() now respects controller.signal so
    // this timeout actually enforces (previously it only aborted the
    // unused fetch on the server path).
    const timeoutMs = useBrowserAI ? 30_000 : 10_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    setAltState("loading");
    setAltError("");
    try {
      // Multilingual: alt explanation now mirrors the learner's reading
      // language rather than just profile.language. When bilingual mode is
      // on with a non-en second language picked (Hindi / Spanish / etc.),
      // Gemma narrates the alt in that language — same surface treatment
      // as the AI panel's chat output.
      const body: ExplainRequest = {
        question: wa.question,
        originalExplanation: wa.explanation,
        correctAnswer: wa.correct_answer,
        language: resolveLearnerOutputLanguage({
          profile,
          bilingualOn: getBilingual(),
          secondLang: getSecondLanguage(),
        }),
        // Curriculum-grounded RAG fields. `topic` is always present on
        // a WrongAnswer (stamped when the mistake was recorded). bank
        // fields are optional — legacy mistakes from before the
        // bank-id pivot will fall through to topic-only grounding.
        topicId: wa.topic,
        bankQuestionId: wa.bank_question_id,
        source: wa.source,
      };

      let trimmed: string;
      if (useBrowserAI) {
        // Browser-side path: bypass /api/explain entirely and run
        // Gemma 2 2B locally via WebLLM. Same prompt construction
        // (lib/explain-prompt) so the two backends behave identically.
        // First call after toggle-on triggers the ~1.6 GB download —
        // BrowserAIDownloadModal at app-shell level renders progress.
        // controller.signal is passed through so the 30 s timeout
        // and the slot-change abort both actually cancel generation.
        const { generate } = await import("@/lib/webllm-engine");
        trimmed = (
          await generate({
            system: buildExplainSystemPrompt(body),
            user: buildExplainUserPrompt(body),
            signal: controller.signal,
          })
        ).trim();
      } else {
        // Server-side path: existing /api/explain → Ollama on host.
        const res = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
        }
        const data = (await res.json()) as ExplainResponse;
        trimmed = (data.altExplanation ?? "").trim();
      }
      if (!trimmed) throw new Error("empty_alt_explanation");

      // Ownership check: drop if the user moved on while we were waiting.
      if (retryingIdRef.current !== requestSlotId) return;
      setAltText(trimmed);
      setAltState("idle");
    } catch (err) {
      // Always log the technical detail — useful when debugging Ollama
      // setup / model issues.
      console.error("[review] /api/explain failed:", err);

      // If the user moved off the slot while we were waiting (closeRetry /
      // startRetry triggered abort), silently drop — the UI moved on.
      if (retryingIdRef.current !== requestSlotId) return;

      const isAbort = err instanceof Error && err.name === "AbortError";
      setAltState("error");
      setAltError(
        isAbort
          ? "Took too long to load another explanation. Try again."
          : "Couldn't load another explanation right now. Try again in a moment.",
      );
    } finally {
      clearTimeout(timeoutId);
      if (inflightExplainRef.current === controller) {
        inflightExplainRef.current = null;
      }
    }
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
              href={activePracticeHref}
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
          <h1 style={{ fontSize: "24px", fontWeight: 500, color: "#0F2A4A", marginBottom: "2px" }}>
            Review
          </h1>
          <BilingualSubtitle
            english="Review"
            fallbackZh="复习"
            style={{ display: "block", fontSize: "13px", color: "#9CA3AF", marginBottom: "4px" }}
          />
          <p style={{ fontSize: "14px", color: "#6B7280" }}>Your mistake notebook</p>
          <BilingualSubtitle
            english="Your mistake notebook"
            fallbackZh="你的错题本"
            style={{ display: "block", fontSize: "12px", color: "#9CA3AF", marginTop: "2px" }}
          />
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
                href={activePracticeHref}
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
                      bankAltText={bankAltText}
                      altText={altText}
                      altState={altState}
                      altError={altError}
                      onFetchAlt={fetchAltExplanation}
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
                              bankAltText={bankAltText}
                              altText={altText}
                              altState={altState}
                              altError={altError}
                              onFetchAlt={fetchAltExplanation}
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
  bankAltText,
  altText,
  altState,
  altError,
  onFetchAlt,
}: {
  mistake: WrongAnswer;
  retryState: RetryState;
  retryAnswer: string;
  onAnswerChange: (v: string) => void;
  onSubmit: () => void;
  onTryOnceMore: () => void;
  onSkip: () => void;
  onClose: () => void;
  // Pre-authored alt from the bank — null when the mistake doesn't resolve
  // to an authored bank entry (legacy data or unauthored topic).
  bankAltText: string | null;
  // LLM-generated alt from /api/explain. Tertiary layer: only fetched when
  // user clicks the "Another angle from Gemma" / "Show me a different way"
  // button. null until then.
  altText: string | null;
  altState: "idle" | "loading" | "error";
  altError: string;
  onFetchAlt: () => void;
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
          {/* Layer 1: original explanation — always visible, amber. The
              learner saw this once already at submit time; reshowing it
              here keeps the original framing available even after they
              ask for a "different way" alt. Per codex review guidance:
              don't let alt content REPLACE the original.
              When mistake.explanation is empty (quiz wrong-answers, which
              are written without a primary authored explanation — see
              recordQuizAttempt in lib/progress.ts), the heading +
              body swap to honest copy that points the student at the
              actually-available content (bank alt below if present,
              Gemma alt button either way) instead of leaving the amber
              card half-empty with the placeholder "No explanation
              recorded for this mistake." stuck under a heading that
              implies an explanation exists. */}
          <div
            className="rounded-lg p-5 mb-3"
            style={{ backgroundColor: "#FFFBEB" }}
          >
            {mistake.explanation ? (
              <>
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
                  style={{
                    fontSize: "14px",
                    color: "#78350F",
                    lineHeight: 1.6,
                    marginBottom: "8px",
                  }}
                >
                  <MathRenderer content={mistake.explanation} />
                </p>
              </>
            ) : (
              <>
                <p
                  style={{
                    fontSize: "15px",
                    color: "#92400E",
                    lineHeight: 1.7,
                    marginBottom: "12px",
                    fontWeight: 500,
                  }}
                >
                  No original explanation was recorded for this mistake.
                </p>
                <p
                  style={{
                    fontSize: "14px",
                    color: "#78350F",
                    lineHeight: 1.6,
                    marginBottom: "8px",
                  }}
                >
                  {bankAltText
                    ? "Try the alternative explanation below, or ask Gemma for another angle."
                    : "Ask Gemma for another angle below."}
                </p>
              </>
            )}
            <p style={{ fontSize: "13px", color: "#78350F" }}>
              Correct answer:{" "}
              <strong style={{ color: "#059669" }}>{mistake.correct_answer}</strong>
            </p>
          </div>

          {/* Layer 2: pre-authored bank alt — blue, only when present.
              Sourced from PracticeBankQuestion.alt_explanation /
              QuizQuestion.alt_explanation in curriculum.json. Free,
              instant; no LLM round-trip.
              Intentionally NOT a live region: bank alt is part of the
              initial wrong-again render (synchronous, no fetch), and
              persists across "Try once more" loops as the slot's
              baseline alt content. Live-region announcement is reserved
              for the freshest dynamic layer (the LLM alt below). */}
          {bankAltText && (
            <div
              className="rounded-lg p-5 mb-3"
              style={{ backgroundColor: "#EFF6FF", border: "1px solid #BFDBFE" }}
            >
              <p
                style={{
                  fontSize: "13px",
                  color: "#1E40AF",
                  marginBottom: "8px",
                  fontWeight: 500,
                  letterSpacing: "0.3px",
                }}
              >
                Another way to think about it
              </p>
              <p
                className="math-display"
                style={{ fontSize: "14px", color: "#1E3A8A", lineHeight: 1.7 }}
              >
                <MathRenderer content={bankAltText} />
              </p>
            </div>
          )}

          {/* Layer 3: LLM-generated alt — purple, only when fetched.
              Tertiary "Another angle from Gemma" when bankAltText already
              showed; primary "Show me a different way" when no bank alt
              exists (legacy mistakes / topics without a bank). */}
          {altText && (
            <div
              className="rounded-lg p-5 mb-3"
              style={{ backgroundColor: "#F5F3FF", border: "1px solid #C4B5FD" }}
              role="status"
              aria-live="polite"
            >
              <p
                className="inline-flex items-center gap-1.5"
                style={{
                  fontSize: "13px",
                  color: "#5B21B6",
                  marginBottom: "8px",
                  fontWeight: 500,
                  letterSpacing: "0.3px",
                }}
              >
                <Sparkles size={13} aria-hidden="true" />
                {bankAltText ? "Another angle from Gemma" : "Here's another way to think about it"}
              </p>
              <p
                className="math-display"
                style={{ fontSize: "14px", color: "#4C1D95", lineHeight: 1.7 }}
              >
                <MathRenderer content={altText} />
              </p>
            </div>
          )}

          {/* Button — only when LLM alt hasn't loaded yet. Label depends
              on whether bank alt is the current "default" alt (tertiary
              ask) or whether there's no bank alt at all (primary ask). */}
          {!altText && (
            <div className="mb-4">
              <button
                type="button"
                onClick={onFetchAlt}
                disabled={altState === "loading"}
                className="rounded-lg border transition-colors hover:border-blue-500 disabled:cursor-wait"
                style={{
                  borderColor: "#E2E5EA",
                  color: "#2563EB",
                  fontSize: "13px",
                  padding: "8px 16px",
                  backgroundColor: "#FFFFFF",
                  opacity: altState === "loading" ? 0.7 : 1,
                }}
              >
                {altState === "loading" ? (
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full animate-pulse"
                      style={{ backgroundColor: "#2563EB" }}
                      aria-hidden="true"
                    />
                    Loading another explanation…
                  </span>
                ) : altState === "error" ? (
                  "Try fetching again"
                ) : bankAltText ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles size={13} aria-hidden="true" />
                    Another angle from Gemma
                  </span>
                ) : (
                  "Show me a different way"
                )}
              </button>
              {altState === "error" && altError && (
                <p
                  className="mt-2"
                  style={{ fontSize: "12px", color: "#991B1B" }}
                  role="alert"
                >
                  {altError}
                </p>
              )}
            </div>
          )}

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
