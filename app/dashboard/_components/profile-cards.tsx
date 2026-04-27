"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { PortraitBody, EmergingPattern } from "@/lib/portrait";

interface ProfileCardsProps {
  portrait: PortraitBody;
}

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

export default function ProfileCards({ portrait }: ProfileCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-8">
      <LearningStyleCard learningStyle={portrait.profile.learning_style} />
      <EmergingPatternsCard
        patterns={portrait.profile.emerging_patterns}
      />
    </div>
  );
}

function CardHeader({ label }: { label: string }) {
  return (
    <p className="text-[11px] tracking-[0.08em] uppercase text-gray-500 font-medium mb-3">
      {label}
    </p>
  );
}

/* ── 3.1 Your Learning Style ───────────────────────────────── */

function LearningStyleCard({
  learningStyle,
}: {
  learningStyle: PortraitBody["profile"]["learning_style"];
}) {
  const scores = learningStyle.modality_scores;
  const hasScores = !!scores && scores.length > 0;

  return (
    <section className="rounded-xl bg-white border border-gray-200 p-6">
      <CardHeader label="YOUR LEARNING STYLE" />
      {hasScores ? (
        <ul className="space-y-3">
          {scores!.map((s, i) => {
            const pct = clampPct(s.score);
            return (
              <li key={i}>
                <div className="flex items-center justify-between text-[12px] text-gray-700 mb-1">
                  <span>{s.modality}</span>
                  <span className="text-gray-500">{Math.round(pct)}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-blue-600"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-gray-800">
            {learningStyle.label}
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">
            {learningStyle.description}
          </p>
        </div>
      )}
      {hasScores && learningStyle.description && (
        <p className="mt-4 text-sm font-medium text-gray-800 leading-snug">
          {learningStyle.description}
        </p>
      )}
    </section>
  );
}

/* ── 3.2 Patterns Beacon Is Watching ───────────────────────── */

function EmergingPatternsCard({
  patterns,
}: {
  patterns: EmergingPattern[] | undefined;
}) {
  const hasPatterns = !!patterns && patterns.length > 0;
  return (
    <section className="rounded-xl bg-white border border-gray-200 p-6">
      <CardHeader label="PATTERNS BEACON IS WATCHING" />
      {hasPatterns ? (
        <ul className="space-y-2.5">
          {patterns!.map((p, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <PatternIcon trend={p.trend} />
              <span className="text-sm text-gray-700 leading-relaxed">
                {p.description}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 leading-relaxed">
          Patterns will emerge as you use Beacon more.
        </p>
      )}
    </section>
  );
}

function PatternIcon({ trend }: { trend: EmergingPattern["trend"] }) {
  if (trend === "rising") {
    return (
      <TrendingUp
        className="w-4 h-4 mt-0.5 text-green-600 shrink-0"
        aria-label="rising"
      />
    );
  }
  if (trend === "falling") {
    return (
      <TrendingDown
        className="w-4 h-4 mt-0.5 text-amber-600 shrink-0"
        aria-label="falling"
      />
    );
  }
  return (
    <Minus
      className="w-4 h-4 mt-0.5 text-gray-400 shrink-0"
      aria-label="stable"
    />
  );
}
