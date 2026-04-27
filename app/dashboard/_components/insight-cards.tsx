"use client";

import { TrendingUp } from "lucide-react";
import type { PortraitBody } from "@/lib/portrait";
import type { ViewMode } from "./view-toggle";

interface InsightCardsProps {
  portrait: PortraitBody;
  viewMode: ViewMode;
}

const SEGMENT_BG = ["bg-blue-600", "bg-purple-600", "bg-green-600"] as const;
const SEGMENT_DOT = ["bg-blue-600", "bg-purple-600", "bg-green-600"] as const;

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

export default function InsightCards({
  portrait,
  viewMode,
}: InsightCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      <WhereTimeGoesCard
        insight={portrait.insights.where_time_goes}
        viewMode={viewMode}
      />
      <WhenThingsGetHardCard
        insight={portrait.insights.under_difficulty}
        viewMode={viewMode}
      />
      <GrowingIndependenceCard
        insight={portrait.insights.independence_trend}
      />
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white border border-gray-200 p-5">
      {children}
    </section>
  );
}

function CardHeader({ label }: { label: string }) {
  return (
    <p className="text-[11px] tracking-[0.08em] uppercase text-gray-500 font-medium mb-3">
      {label}
    </p>
  );
}

/* ── 2.1 Where Your Time Goes ──────────────────────────────── */

function WhereTimeGoesCard({
  insight,
  viewMode,
}: {
  insight: PortraitBody["insights"]["where_time_goes"];
  viewMode: ViewMode;
}) {
  const breakdown = insight.breakdown;
  const hasBreakdown = !!breakdown && breakdown.length > 0;
  const footer = viewMode === "student" ? insight.observation : insight.evidence;

  return (
    <CardShell>
      <CardHeader label="WHERE YOUR TIME GOES" />
      {hasBreakdown ? (
        <>
          <div className="flex h-8 w-full rounded-full overflow-hidden bg-gray-100">
            {breakdown!.map((seg, i) => {
              const pct = clampPct(seg.percentage);
              if (pct <= 0) return null;
              const color = SEGMENT_BG[i % SEGMENT_BG.length];
              return (
                <div
                  key={i}
                  className={`${color} flex items-center justify-center text-[11px] font-medium text-white`}
                  style={{ width: `${pct}%` }}
                >
                  {pct > 10 ? `${Math.round(pct)}%` : null}
                </div>
              );
            })}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {breakdown!.map((seg, i) => (
              <li
                key={i}
                className="flex items-center gap-1.5 text-[12px] text-gray-600"
              >
                <span
                  className={`w-2 h-2 rounded-full ${SEGMENT_DOT[i % SEGMENT_DOT.length]}`}
                />
                {seg.subject}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-gray-700 leading-relaxed">
          {insight.observation}
        </p>
      )}
      {footer && (
        <p className="mt-3 text-center text-[11px] text-gray-500 leading-relaxed">
          {footer}
        </p>
      )}
    </CardShell>
  );
}

/* ── 2.2 When Things Get Hard ──────────────────────────────── */

function WhenThingsGetHardCard({
  insight,
  viewMode,
}: {
  insight: PortraitBody["insights"]["under_difficulty"];
  viewMode: ViewMode;
}) {
  const patterns = insight.behavior_pattern;
  const hasPatterns = !!patterns && patterns.length > 0;
  const footer = viewMode === "student" ? insight.observation : insight.evidence;

  return (
    <CardShell>
      <CardHeader label="WHEN THINGS GET HARD" />
      {hasPatterns ? (
        <ul className="space-y-2">
          {patterns!.map((p, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 bg-red-50 rounded-lg px-3 py-2"
            >
              <span className="text-[12px] text-gray-700">{p.trigger}</span>
              <span className="flex items-center gap-1 text-[12px] text-red-700 font-medium">
                {p.reaction}
                <TrendingUp className="w-3.5 h-3.5 text-red-500" />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-700 leading-relaxed">
          {insight.observation}
        </p>
      )}
      {footer && (
        <p className="mt-3 text-center text-[11px] text-gray-500 leading-relaxed">
          {footer}
        </p>
      )}
    </CardShell>
  );
}

/* ── 2.3 Growing Independence ──────────────────────────────── */

function GrowingIndependenceCard({
  insight,
}: {
  insight: PortraitBody["insights"]["independence_trend"];
}) {
  const values = insight.weekly_values;
  const hasSparkline = !!values && values.length >= 2;

  return (
    <CardShell>
      <CardHeader label="GROWING INDEPENDENCE" />
      {hasSparkline ? (
        <Sparkline values={values!.map(clampPct)} />
      ) : (
        <p className="text-sm text-gray-700 leading-relaxed">
          {insight.observation}
          <span className="block mt-2 text-[11px] uppercase tracking-wide text-gray-400">
            Trend: {insight.direction}
          </span>
        </p>
      )}
      {insight.observation && hasSparkline && (
        <p className="mt-3 text-center text-[11px] text-gray-500 leading-relaxed">
          {insight.observation}
        </p>
      )}
    </CardShell>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const W = 180;
  const H = 70;
  const PAD_Y = 6;
  const usableH = H - PAD_Y * 2;

  // Normalize to 0..100 -> y-pixel (invert so high = top)
  const points = values.map((v, i) => {
    const x = values.length === 1 ? W / 2 : (i * W) / (values.length - 1);
    const y = PAD_Y + (1 - v / 100) * usableH;
    return { x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const areaPath =
    `M ${points[0].x.toFixed(1)} ${H} ` +
    points
      .map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ") +
    ` L ${points[points.length - 1].x.toFixed(1)} ${H} Z`;

  const gradId = "spark-grad-blue";

  return (
    <div>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          fill="none"
          stroke="#2563EB"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="#2563EB" />
        ))}
      </svg>
      <div className="flex items-center justify-between mt-1 text-[10px] text-gray-400">
        <span>Week 1</span>
        <span>This week</span>
      </div>
    </div>
  );
}
