"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { PortraitBody } from "@/lib/portrait";

// Section 3 — Two profile cards in a grid.
//   - Usage Preferences: model-written usage summary (learning_style.description)
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

  const hasUsageSummary = Boolean(
    ls && ls.description && ls.label !== "undetermined",
  );
  const hasEmergingPatterns = Boolean(ep && ep.length > 0);

  if (!hasUsageSummary && !hasEmergingPatterns) return null;

  const colsClass =
    hasUsageSummary && hasEmergingPatterns ? "grid-cols-2" : "grid-cols-1";

  return (
    <div className={`grid ${colsClass} gap-4 mb-8`}>
      {hasUsageSummary && <UsagePreferencesCard description={ls.description} />}
      {hasEmergingPatterns && <EmergingPatternsCard patterns={ep!} />}
    </div>
  );
}

// ── Card 1: Usage Preferences ──────────────────────
// Shows only the model's short prose summary of how Beacon has been used.
// The portrait's learning_style.label and modality_scores are model-written
// guesses with no deterministic source (nothing in lib/ computes them), so
// they are not rendered as learner traits or percentages. The field name
// learning_style is kept for API/schema compatibility.

function UsagePreferencesCard({ description }: { description: string }) {
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
        USAGE PREFERENCES
      </h3>

      <p style={{ fontSize: "13px", color: "#1F2937", lineHeight: 1.6, marginBottom: "6px" }}>
        {description}
      </p>
      <p style={{ fontSize: "12px", color: "#6B7280", lineHeight: 1.6 }}>
        Written by the model from the activity log. Not a measurement.
      </p>
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
