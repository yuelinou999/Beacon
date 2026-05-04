"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Check, AlertTriangle, AlertCircle, X } from "lucide-react";
import { analyzeReadiness } from "@/lib/advisor";
import type {
  AdvisorAnalysis,
  AdvisorVerdict,
  StudentProfile,
} from "@/lib/types";

// AdvisorPanel — inline expandable panel under a unit card. Renders the
// deterministic readiness verdict + gap list IMMEDIATELY (synchronous from
// the lib/advisor analyzer), then streams Gemma's personalized narration
// from /api/advisor in a "Beacon AI's take" block below it. Per codex
// round-1: deterministic verdict ships first, LLM narration is purely
// additive, never gating.
//
// Stance is advisory — the student always has "Start anyway" as an
// override, plus a "Review first" shortcut to the weakest prereq topic
// when the verdict isn't ready.

interface AdvisorPanelProps {
  profile: StudentProfile | null;
  unitId: string;
  // Called when the user picks "Start anyway" — same activation hook the
  // standard Start Unit / Continue CTAs use. Pins this unit as
  // current_unit so the rest of the app realigns.
  onActivate: () => void;
  // Called when the user closes the panel (cancel button or after
  // navigating to a review topic).
  onClose: () => void;
  // First topic id of the target unit — used by "Start anyway" so the
  // navigation target matches what UnitFooterCta would have done.
  firstTopicId: string | null;
}

const VERDICT_STYLE: Record<
  AdvisorVerdict,
  {
    label: string;
    bg: string;
    border: string;
    fg: string;
    Icon: typeof Check;
    iconColor: string;
  }
> = {
  ready: {
    label: "Ready",
    bg: "#ECFDF5",
    border: "#059669",
    fg: "#065F46",
    Icon: Check,
    iconColor: "#059669",
  },
  almost_ready: {
    label: "Almost ready",
    bg: "#FFFBEB",
    border: "#D97706",
    fg: "#92400E",
    Icon: AlertTriangle,
    iconColor: "#D97706",
  },
  needs_review: {
    label: "Needs review",
    bg: "#FEF2F2",
    border: "#EF4444",
    fg: "#991B1B",
    Icon: AlertCircle,
    iconColor: "#EF4444",
  },
};

export default function AdvisorPanel({
  profile,
  unitId,
  onActivate,
  onClose,
  firstTopicId,
}: AdvisorPanelProps) {
  // Deterministic analysis — synchronous, runs on every render of this
  // panel. Cheap (~1ms over a handful of topics), no need to memoize.
  const analysis: AdvisorAnalysis = analyzeReadiness(profile, unitId);

  // Gemma narration state. "loading" until first token arrives or error.
  const [narration, setNarration] = useState<string>("");
  const [narrationState, setNarrationState] = useState<"loading" | "streaming" | "done" | "error">(
    "loading",
  );

  // AbortController for the fetch. Lets us cancel the stream when the
  // user closes the panel mid-flight (saves Gemma cycles on unmount).
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;
    let acc = "";

    async function run() {
      try {
        const res = await fetch("/api/advisor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysis, language: profile?.language ?? "en" }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`advisor http ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // Each ndjson line is one Ollama chunk:
          //   {"model":"...","message":{"role":"assistant","content":"..."},"done":false}
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const chunk = JSON.parse(line);
              const piece = chunk?.message?.content;
              if (typeof piece === "string" && piece.length > 0) {
                acc += piece;
                if (!cancelled) {
                  setNarration(acc);
                  setNarrationState("streaming");
                }
              }
            } catch {
              // Ignore malformed lines — stream may include partials at
              // chunk boundaries we'll catch on the next iteration.
            }
          }
        }
        if (!cancelled) setNarrationState("done");
      } catch (err) {
        if (cancelled) return;
        // AbortError from controller.abort() is intentional — silent.
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("[advisor] narration fetch failed:", err);
        setNarrationState("error");
      }
    }
    run();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  const style = VERDICT_STYLE[analysis.verdict];
  const VerdictIcon = style.Icon;

  // For "Review first", pick the lowest-mastery topic from the first
  // not-completed prereq. Falls back to null when verdict is ready (no
  // gap to review) — button is hidden in that case.
  const reviewFirstTopicId = (() => {
    const incomplete = analysis.prerequisites.find((p) => p.status !== "completed");
    return incomplete?.weakestTopics[0]?.topicId ?? null;
  })();

  return (
    <div
      className="border-t px-6 py-5"
      style={{ borderColor: "#F0F3F7", backgroundColor: "#FAFBFC" }}
      role="region"
      aria-label="Readiness check"
    >
      {/* Header row — title + close */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={14} style={{ color: "#5B21B6" }} aria-hidden="true" />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "#5B21B6",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}
          >
            Beacon AI · Readiness check
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close readiness check"
          className="p-1 -m-1 rounded-md transition-colors hover:bg-gray-100"
        >
          <X size={14} style={{ color: "#9CA3AF" }} />
        </button>
      </div>

      {/* Verdict pill + headline */}
      <div className="flex items-start gap-3 mb-4">
        <div
          className="inline-flex items-center gap-1.5 rounded-full"
          style={{
            backgroundColor: style.bg,
            border: `1px solid ${style.border}`,
            padding: "4px 12px",
          }}
        >
          <VerdictIcon size={14} style={{ color: style.iconColor }} aria-hidden="true" />
          <span style={{ fontSize: "12px", fontWeight: 500, color: style.fg }}>
            {style.label}
          </span>
        </div>
        <p
          className="flex-1"
          style={{ fontSize: "14px", color: "#1F2937", lineHeight: 1.6, paddingTop: 2 }}
        >
          {analysis.noPrereqs
            ? `${analysis.targetUnitTitle} has no prerequisites — you can start any time.`
            : analysis.verdict === "ready"
              ? `Prerequisites for ${analysis.targetUnitTitle} are all in place.`
              : analysis.verdict === "almost_ready"
                ? `You're close. A bit more practice on the prerequisites would help before ${analysis.targetUnitTitle}.`
                : `Some prerequisites for ${analysis.targetUnitTitle} need work first.`}
        </p>
      </div>

      {/* Gap list — only when verdict isn't ready */}
      {!analysis.noPrereqs && analysis.verdict !== "ready" && analysis.prerequisites.length > 0 && (
        <div className="mb-4">
          <p
            className="mb-2"
            style={{
              fontSize: "11px",
              color: "#6B7280",
              fontWeight: 500,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}
          >
            Prerequisite breakdown
          </p>
          <ul role="list" className="space-y-3 list-none p-0">
            {analysis.prerequisites.map((p) => (
              <li
                key={p.unitId}
                className="rounded-lg p-3"
                style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "#1F2937" }}>
                    {p.unitTitle}
                  </span>
                  <span style={{ fontSize: "12px", color: "#6B7280" }}>
                    {Math.round(p.avgMastery * 100)}% avg ·{" "}
                    {p.status === "completed"
                      ? "Completed"
                      : p.status === "in_progress"
                        ? "In progress"
                        : "Not started"}
                  </span>
                </div>
                {p.status !== "completed" && p.weakestTopics.length > 0 && (
                  <ul role="list" className="space-y-1 list-none p-0 mt-2">
                    {p.weakestTopics.map((t) => (
                      <li
                        key={t.topicId}
                        className="flex items-center justify-between"
                        style={{ fontSize: "12px", color: "#6B7280" }}
                      >
                        <span>· {t.topicTitle}</span>
                        <span>{Math.round(t.mastery * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Beacon AI's take — purple block, streams in. Same visual
          language as /review's tertiary "Another angle from Gemma". */}
      <div
        className="rounded-lg p-4 mb-4"
        style={{ backgroundColor: "#F5F3FF", border: "1px solid #C4B5FD" }}
        role="status"
        aria-live="polite"
      >
        <p
          className="inline-flex items-center gap-1.5 mb-2"
          style={{
            fontSize: "11px",
            fontWeight: 500,
            color: "#5B21B6",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}
        >
          <Sparkles size={12} aria-hidden="true" />
          Beacon AI&rsquo;s take
        </p>
        {narrationState === "loading" && narration === "" && (
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: "#7C3AED" }}
              aria-hidden="true"
            />
            <span style={{ fontSize: "13px", color: "#6B7280" }}>Beacon AI is thinking…</span>
          </div>
        )}
        {narration && (
          <p style={{ fontSize: "14px", color: "#4C1D95", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {narration}
          </p>
        )}
        {narrationState === "error" && narration === "" && (
          <p style={{ fontSize: "13px", color: "#991B1B" }} role="alert">
            Couldn&apos;t load Beacon AI&apos;s take right now. The verdict above stands on its own —
            you can decide based on it.
          </p>
        )}
      </div>

      {/* Actions — Start anyway always, Review first when there's a gap, Cancel */}
      <div className="flex flex-wrap gap-3">
        {firstTopicId ? (
          <Link
            href={`/learn-v2/${firstTopicId}`}
            onClick={() => onActivate()}
            className="rounded-lg transition-opacity hover:opacity-90"
            style={{
              fontSize: "13px",
              padding: "8px 20px",
              color: "#FFFFFF",
              backgroundColor: "#0F2A4A",
              textDecoration: "none",
            }}
          >
            {analysis.verdict === "ready" ? "Start unit →" : "Start anyway →"}
          </Link>
        ) : null}
        {analysis.verdict !== "ready" && reviewFirstTopicId && (
          <Link
            href={`/learn-v2/${reviewFirstTopicId}`}
            className="rounded-lg transition-colors hover:border-blue-500"
            style={{
              fontSize: "13px",
              padding: "8px 20px",
              color: "#1F2937",
              backgroundColor: "#FFFFFF",
              border: "1px solid #E2E5EA",
              textDecoration: "none",
            }}
          >
            Review weakest first →
          </Link>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg transition-colors"
          style={{
            fontSize: "13px",
            padding: "8px 20px",
            color: "#6B7280",
            backgroundColor: "transparent",
            border: "1px solid transparent",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
