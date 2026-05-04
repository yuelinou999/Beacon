"use client";

import { TrendingUp } from "lucide-react";
import type { PortraitBody } from "@/lib/portrait";
import type { ViewMode } from "./view-toggle";

// Section 2 — Three visual insight cards in a grid.
// Per codex spec E: each card hides itself if its optional data is missing
// (breakdown / behavior_pattern / weekly_values). The outer grid adjusts
// column count to render 1, 2, or 3 cards cleanly. If all three are missing,
// the entire section returns null.

interface Section2InsightsProps {
  portrait: PortraitBody;
  viewMode: ViewMode;
}

export default function Section2Insights({ portrait, viewMode }: Section2InsightsProps) {
  const { where_time_goes, under_difficulty, independence_trend } = portrait.insights;

  const cards: React.ReactNode[] = [];

  if (where_time_goes.breakdown && where_time_goes.breakdown.length > 0) {
    cards.push(
      <WhereTimeGoesCard
        key="time"
        observation={where_time_goes.observation}
        breakdown={where_time_goes.breakdown}
      />,
    );
  }

  if (under_difficulty.behavior_pattern && under_difficulty.behavior_pattern.length > 0) {
    cards.push(
      <DifficultyCard
        key="difficulty"
        observation={under_difficulty.observation}
        patterns={under_difficulty.behavior_pattern}
        viewMode={viewMode}
      />,
    );
  }

  if (independence_trend.weekly_values && independence_trend.weekly_values.length >= 2) {
    cards.push(
      <IndependenceCard
        key="indep"
        observation={independence_trend.observation}
        weeklyValues={independence_trend.weekly_values}
      />,
    );
  }

  if (cards.length === 0) return null;

  // Tailwind safelist needs literal strings; keep this small switch to ensure
  // the JIT picks them up.
  const colsClass =
    cards.length === 1 ? "grid-cols-1" : cards.length === 2 ? "grid-cols-2" : "grid-cols-3";

  return <div className={`grid ${colsClass} gap-4 mb-8`}>{cards}</div>;
}

// ── Card 1: Where Your Time Goes ───────────────────
// Horizontal stacked bar from breakdown. Subjects come from the LLM so we
// cycle a fixed palette by index — known subjects get figma's exact colors,
// anything else falls through the palette.

const SUBJECT_COLOR_OVERRIDE: Record<string, string> = {
  math: "#2563EB",
  mathematics: "#2563EB",
  science: "#7C3AED",
  english: "#059669",
};

const PALETTE = ["#2563EB", "#7C3AED", "#059669", "#D97706", "#EF4444"];

function colorForSubject(subject: string, idx: number): string {
  return SUBJECT_COLOR_OVERRIDE[subject.toLowerCase()] ?? PALETTE[idx % PALETTE.length];
}

function WhereTimeGoesCard({
  observation,
  breakdown,
}: {
  observation: string;
  breakdown: { subject: string; percentage: number }[];
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 500,
          color: "#6B7280",
          marginBottom: "16px",
          letterSpacing: "0.5px",
        }}
      >
        WHERE YOUR TIME GOES
      </div>

      {/* Stacked bar */}
      <div className="mb-4">
        <div
          className="flex h-8 rounded-full overflow-hidden"
          style={{ backgroundColor: "#F0F3F7" }}
          role="img"
          aria-label={
            "Time breakdown: " +
            breakdown.map((b) => `${b.subject} ${Math.round(b.percentage)}%`).join(", ")
          }
        >
          {breakdown.map((b, i) => (
            <div
              key={`${b.subject}-${i}`}
              className="flex items-center justify-center"
              style={{ width: `${b.percentage}%`, backgroundColor: colorForSubject(b.subject, i) }}
            >
              {b.percentage >= 10 && (
                <span style={{ fontSize: "11px", color: "#FFFFFF", fontWeight: 500 }}>
                  {Math.round(b.percentage)}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {breakdown.map((b, i) => (
            <div key={`${b.subject}-legend-${i}`} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: colorForSubject(b.subject, i) }}
                aria-hidden="true"
              />
              <span style={{ fontSize: "11px", color: "#6B7280" }}>{b.subject}</span>
            </div>
          ))}
        </div>
      </div>

      <p
        style={{ fontSize: "13px", color: "#1F2937", lineHeight: 1.6, textAlign: "center" }}
      >
        {observation}
      </p>
    </div>
  );
}

// ── Card 2: When Things Get Hard ────────────────────
// Renders behavior_pattern rows. Each row's reaction text drives a rough
// color tint so users get a sense of severity at a glance — neutral fallback
// when we can't classify.

function reactionColors(reaction: string): { fg: string; bg: string } {
  const r = reaction.toLowerCase();
  if (r.includes("speed") || r.includes("rush") || r.includes("guess")) {
    return { fg: "#EF4444", bg: "#FEF2F2" };
  }
  if (r.includes("slow") || r.includes("pause") || r.includes("careful")) {
    return { fg: "#059669", bg: "#ECFDF5" };
  }
  return { fg: "#D97706", bg: "#FFFBEB" };
}

function DifficultyCard({
  observation,
  patterns,
  viewMode: _viewMode,
}: {
  observation: string;
  patterns: { trigger: string; reaction: string }[];
  viewMode: ViewMode;
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 500,
          color: "#6B7280",
          marginBottom: "16px",
          letterSpacing: "0.5px",
        }}
      >
        WHEN THINGS GET HARD
      </div>

      <div className="mb-4 space-y-3">
        {patterns.map((p, i) => {
          const colors = reactionColors(p.reaction);
          return (
            <div
              key={`${p.trigger}-${i}`}
              className="flex items-center justify-between p-3 rounded-lg gap-2"
              style={{ backgroundColor: colors.bg }}
            >
              <span style={{ fontSize: "12px", color: "#1F2937" }}>{p.trigger}</span>
              <span
                style={{
                  fontSize: "11px",
                  color: colors.fg,
                  fontWeight: 500,
                  textAlign: "right",
                }}
              >
                {p.reaction}
              </span>
            </div>
          );
        })}
      </div>

      <p
        style={{ fontSize: "13px", color: "#1F2937", lineHeight: 1.6, textAlign: "center" }}
      >
        {observation}
      </p>
    </div>
  );
}

// ── Card 3: Growing Independence ────────────────────
// Sparkline + area gradient. Coordinates computed from weekly_values rather
// than hardcoded — supports 2..N data points. Y-axis normalized to chart
// height by max value so any input scale renders cleanly.

const CHART_W = 180;
const CHART_H = 70;
const CHART_TOP_PAD = 8; // leave room above the highest point

function IndependenceCard({
  observation,
  weeklyValues,
}: {
  observation: string;
  weeklyValues: number[];
}) {
  const n = weeklyValues.length;
  const max = Math.max(...weeklyValues, 1);
  const stepX = n > 1 ? CHART_W / (n - 1) : 0;
  const yFor = (v: number) => CHART_H - (v / max) * (CHART_H - CHART_TOP_PAD);
  const points = weeklyValues.map((v, i) => ({ x: i * stepX, y: yFor(v) }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const areaPath =
    `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} ` +
    points
      .slice(1)
      .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ") +
    ` L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;

  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 500,
          color: "#6B7280",
          marginBottom: "16px",
          letterSpacing: "0.5px",
        }}
      >
        GROWING INDEPENDENCE
      </div>

      <svg
        width="100%"
        height={CHART_H}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        style={{ marginBottom: "12px" }}
        role="img"
        aria-label={`Weekly independence trend, ${weeklyValues.join(" then ")}`}
      >
        <defs>
          <linearGradient id="independenceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#independenceGradient)" />
        <path d={linePath} stroke="#2563EB" strokeWidth="2.5" fill="none" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#2563EB" />
        ))}
      </svg>

      <div
        className="flex justify-between mb-3"
        style={{ fontSize: "10px", color: "#9CA3AF" }}
      >
        <span>Week 1</span>
        <span>This week</span>
      </div>

      <p
        style={{ fontSize: "13px", color: "#1F2937", lineHeight: 1.6, textAlign: "center" }}
      >
        {observation}
      </p>

      {/* Optional secondary direction signal — TrendingUp when rising; we
          don't show down/stable variants because the area chart already
          carries that information visually. */}
      {weeklyValues.length >= 2 &&
        weeklyValues[weeklyValues.length - 1] > weeklyValues[0] && (
          <div
            className="flex items-center justify-center gap-1.5 mt-2"
            style={{ fontSize: "11px", color: "#059669" }}
          >
            <TrendingUp size={12} aria-hidden="true" />
            <span>Trending up</span>
          </div>
        )}
    </div>
  );
}
