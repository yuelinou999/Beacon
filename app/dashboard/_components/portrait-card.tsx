"use client";

import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import type { PortraitBody } from "@/lib/portrait";
import type { ViewMode } from "./view-toggle";

interface PortraitCardProps {
  portrait: PortraitBody;
  viewMode: ViewMode;
  onRegenerate?: () => void;
}

// Take the first sentence-ish chunk of a longer narrative for the
// compressed 4-line view. Splits on the first period+space; if there's
// no internal punctuation the full string falls through.
function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/^(.+?[.!?])(\s|$)/);
  return m ? m[1].trim() : trimmed;
}

// Split a multi-paragraph narrative into <p> chunks. Prefer double-newline
// breaks (Gemma sometimes emits them); else fall back to one-paragraph.
function splitParagraphs(text: string): string[] {
  const parts = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text.trim()].filter(Boolean);
}

interface CompressedLine {
  emoji: string;
  text: string;
}

function buildCompressedLines(
  portrait: PortraitBody,
  viewMode: ViewMode,
): CompressedLine[] {
  const isStudent = viewMode === "student";

  const headlineText = isStudent
    ? portrait.headline.narrative
    : portrait.headline.analytical;

  const difficultyText = isStudent
    ? portrait.insights.under_difficulty.observation
    : portrait.insights.under_difficulty.evidence;

  const timeText = isStudent
    ? portrait.insights.where_time_goes.observation
    : portrait.insights.where_time_goes.evidence;

  const firstSuggestion =
    portrait.suggestions && portrait.suggestions.length > 0
      ? isStudent
        ? portrait.suggestions[0].suggestion
        : portrait.suggestions[0].rationale
      : "";

  const lines: CompressedLine[] = [
    { emoji: "✅", text: firstSentence(headlineText) },
    { emoji: "⚠️", text: difficultyText?.trim() ?? "" },
    { emoji: "🔍", text: timeText?.trim() ?? "" },
    { emoji: "→", text: firstSuggestion?.trim() ?? "" },
  ];

  return lines.filter((l) => l.text.length > 0);
}

export default function PortraitCard({
  portrait,
  viewMode,
  onRegenerate,
}: PortraitCardProps) {
  const [expanded, setExpanded] = useState(false);

  const label =
    viewMode === "student"
      ? "BEACON AI PORTRAIT"
      : "LEARNER PROFILE ANALYSIS";

  const meta = portrait.metadata;
  const interactionCount = meta?.interaction_count ?? 0;
  const sessionCount = meta?.session_count ?? 0;
  const updatedLabel = meta?.updated_label || "just now";
  const hasActivity = interactionCount > 0 || sessionCount > 0;

  const compressedLines = buildCompressedLines(portrait, viewMode);

  const fullText =
    viewMode === "student"
      ? portrait.headline.narrative
      : portrait.headline.analytical;
  const paragraphs = splitParagraphs(fullText);

  return (
    <section className="rounded-xl bg-white border border-gray-200 border-l-[3px] border-l-blue-600 p-8 mb-8">
      {/* Header row */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
          <span className="text-[11px] tracking-[0.08em] uppercase text-gray-500 font-medium">
            {label}
          </span>
        </div>
        <p className="text-xs text-gray-500">
          {hasActivity ? (
            <>
              Updated {updatedLabel} · Based on {interactionCount} interaction
              {interactionCount === 1 ? "" : "s"} across {sessionCount} session
              {sessionCount === 1 ? "" : "s"}
            </>
          ) : (
            <>No interactions yet · Updated {updatedLabel}</>
          )}
        </p>
      </div>

      {/* Compressed insights */}
      {compressedLines.length > 0 && (
        <ul className="space-y-2.5 mb-6">
          {compressedLines.map((line, i) => (
            <li key={i} className="flex gap-3 text-sm text-gray-800 leading-relaxed">
              <span aria-hidden className="shrink-0 select-none">
                {line.emoji}
              </span>
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="text-sm text-blue-600 hover:text-blue-700 font-medium transition mb-2"
      >
        {expanded ? "Hide full portrait ↑" : "Read full portrait →"}
      </button>

      {/* Expanded paragraphs */}
      {expanded && paragraphs.length > 0 && (
        <div className="mt-3 space-y-3">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-sm text-gray-700 leading-relaxed">
              {p}
            </p>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 pt-5 border-t border-gray-100 flex items-center justify-between">
        <button
          type="button"
          onClick={onRegenerate}
          disabled={!onRegenerate}
          className={
            onRegenerate
              ? "rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium px-3.5 py-1.5 inline-flex items-center gap-1.5 transition"
              : "rounded-lg border border-gray-200 bg-gray-50 text-gray-400 text-xs font-medium px-3.5 py-1.5 cursor-not-allowed inline-flex items-center gap-1.5"
          }
        >
          <RefreshCw className="w-3 h-3" />
          Regenerate portrait
        </button>
        <span className="text-[11px] text-gray-400">
          Gemma 4 thinking mode · analyzed locally
        </span>
      </div>
    </section>
  );
}
