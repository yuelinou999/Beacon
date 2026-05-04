"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { PortraitBody } from "@/lib/portrait";

// Section 3 — Two profile cards in a grid.
//   - Learning Style: progress bars from learning_style.modality_scores
//   - Patterns Watching: trend list from profile.emerging_patterns
//
// Per codex spec E: cards hide individually when their optional data is
// missing. The outer grid drops to grid-cols-1 if only one card qualifies;
// the whole section returns null if neither does.

interface Section3ProfileProps {
  portrait: PortraitBody;
}

export default function Section3Profile({ portrait }: Section3ProfileProps) {
  const ls = portrait.profile.learning_style;
  const ep = portrait.profile.emerging_patterns;

  const hasLearningStyle = Boolean(ls && (ls.modality_scores?.length ?? 0) > 0);
  const hasEmergingPatterns = Boolean(ep && ep.length > 0);

  if (!hasLearningStyle && !hasEmergingPatterns) return null;

  const colsClass =
    hasLearningStyle && hasEmergingPatterns ? "grid-cols-2" : "grid-cols-1";

  return (
    <div className={`grid ${colsClass} gap-4 mb-8`}>
      {hasLearningStyle && (
        <LearningStyleCard
          label={ls.label}
          description={ls.description}
          modalityScores={ls.modality_scores ?? []}
        />
      )}
      {hasEmergingPatterns && <EmergingPatternsCard patterns={ep!} />}
    </div>
  );
}

// ── Card 1: Your Learning Style ────────────────────
// Progress bars driven by modality_scores. Score is rendered as a 0–100
// percentage. If the LLM emits a 0–1 scale we still want it to read; clamp
// after multiplying so a score of 0.65 reads as 65% and a score of 65 reads
// the same — heuristic on max value seen.

function normalizeScore(score: number, max: number): number {
  // If the input range looks like 0–1, scale up. Otherwise treat as 0–100.
  const scaled = max <= 1 ? score * 100 : score;
  return Math.max(0, Math.min(100, scaled));
}

function LearningStyleCard({
  label,
  description,
  modalityScores,
}: {
  label: string;
  description: string;
  modalityScores: { modality: string; score: number }[];
}) {
  const max = Math.max(...modalityScores.map((m) => m.score), 0);

  return (
    <div
      className="rounded-xl p-6"
      style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
    >
      <h3
        style={{
          fontSize: "11px",
          fontWeight: 500,
          color: "#6B7280",
          marginBottom: "20px",
          letterSpacing: "0.5px",
        }}
      >
        YOUR LEARNING STYLE
      </h3>

      <div className="space-y-4 mb-5">
        {modalityScores.map((m, i) => {
          const pct = Math.round(normalizeScore(m.score, max));
          return (
            <div key={`${m.modality}-${i}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span style={{ fontSize: "13px", color: "#1F2937" }}>{m.modality}</span>
                <span style={{ fontSize: "13px", color: "#6B7280" }}>{pct}%</span>
              </div>
              <div
                className="h-2 rounded-full"
                style={{ backgroundColor: "#E2E5EA" }}
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${m.modality}: ${pct}%`}
              >
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ backgroundColor: "#2563EB", width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Label + description from the schema. label is the "headline" of the
          card (e.g. "Hands-on learner"); description fills it out. */}
      {label && (
        <p
          style={{
            fontSize: "13px",
            color: "#1F2937",
            lineHeight: 1.6,
            fontWeight: 500,
            marginBottom: description ? "6px" : 0,
          }}
        >
          {label}
        </p>
      )}
      {description && (
        <p style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.6 }}>
          {description}
        </p>
      )}
    </div>
  );
}

// ── Card 2: Patterns Beacon Is Watching ────────────
// Trend list from emerging_patterns. trend ∈ "rising" | "falling" | "stable"
// → TrendingUp (green) / TrendingDown (amber) / Minus (gray).

function trendIcon(trend: "rising" | "falling" | "stable") {
  if (trend === "rising") {
    return <TrendingUp size={16} style={{ color: "#059669", marginTop: "2px", flexShrink: 0 }} aria-hidden="true" />;
  }
  if (trend === "falling") {
    return <TrendingDown size={16} style={{ color: "#D97706", marginTop: "2px", flexShrink: 0 }} aria-hidden="true" />;
  }
  return <Minus size={16} style={{ color: "#6B7280", marginTop: "2px", flexShrink: 0 }} aria-hidden="true" />;
}

const TREND_LABEL: Record<"rising" | "falling" | "stable", string> = {
  rising: "trending up",
  falling: "trending down",
  stable: "steady",
};

function EmergingPatternsCard({
  patterns,
}: {
  patterns: { trend: "rising" | "falling" | "stable"; description: string }[];
}) {
  return (
    <div
      className="rounded-xl p-6"
      style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
    >
      <h3
        style={{
          fontSize: "11px",
          fontWeight: 500,
          color: "#6B7280",
          marginBottom: "20px",
          letterSpacing: "0.5px",
        }}
      >
        PATTERNS BEACON IS WATCHING
      </h3>

      <ul role="list" className="space-y-3 list-none p-0">
        {patterns.map((p, i) => (
          <li key={i} className="flex items-start gap-3">
            {trendIcon(p.trend)}
            <p
              style={{ fontSize: "13px", color: "#1F2937", lineHeight: 1.6 }}
              aria-label={`${TREND_LABEL[p.trend]}: ${p.description}`}
            >
              {p.description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
