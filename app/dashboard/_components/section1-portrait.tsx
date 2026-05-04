"use client";

import { useState } from "react";
import { Sparkles, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import type { PortraitBody } from "@/lib/portrait";
import type { ViewMode } from "./view-toggle";

// Section 1 — AI Portrait card.
// Layout per design-reference: 3px blue left border card, Sparkles header,
// metadata line ("Updated · N interactions across M sessions"), full headline
// paragraph (NOT split into emoji bullets — see codex spec A), thinking trace
// as collapsible (default collapsed, codex spec F), regenerate button at the
// bottom row alongside a model attribution caption.
//
// viewMode flips:
//   - header label: "BEACON AI PORTRAIT" (student) | "LEARNER PROFILE ANALYSIS" (teacher)
//   - body text: headline.narrative (student) | headline.analytical (teacher)
// Same fetch — no re-request on toggle (codex spec J1).

interface Section1PortraitProps {
  portrait: PortraitBody;
  thinking: string;
  viewMode: ViewMode;
  onRegenerate: () => void;
}

export default function Section1Portrait({
  portrait,
  thinking,
  viewMode,
  onRegenerate,
}: Section1PortraitProps) {
  const [thinkingOpen, setThinkingOpen] = useState(false);

  const headerLabel =
    viewMode === "student" ? "BEACON AI PORTRAIT" : "LEARNER PROFILE ANALYSIS";
  const headlineText =
    viewMode === "student" ? portrait.headline.narrative : portrait.headline.analytical;

  const meta = portrait.metadata;
  const metaParts: string[] = [];
  if (meta?.updated_label) metaParts.push(`Updated ${meta.updated_label}`);
  if (typeof meta?.interaction_count === "number") {
    metaParts.push(
      `Based on ${meta.interaction_count} interaction${meta.interaction_count === 1 ? "" : "s"}` +
        (typeof meta.session_count === "number"
          ? ` across ${meta.session_count} session${meta.session_count === 1 ? "" : "s"}`
          : ""),
    );
  }
  const metaLine = metaParts.join(" · ");

  // Confidence chip — only surface "low" (the actionable case for the user).
  // medium/high are silent so the chip doesn't add noise when data is fine.
  const showLowConfidence = portrait.confidence.level === "low";

  return (
    <div
      className="rounded-xl p-8 mb-8"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid #E2E5EA",
        borderLeft: "3px solid #2563EB",
        borderLeftWidth: "3px",
        borderLeftColor: "#2563EB",
      }}
    >
      {/* Header label */}
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={14} style={{ color: "#6B7280" }} aria-hidden="true" />
        <span
          style={{
            fontSize: "11px",
            fontWeight: 500,
            color: "#6B7280",
            letterSpacing: "0.5px",
          }}
        >
          {headerLabel}
        </span>
      </div>

      {/* Metadata line + optional confidence chip */}
      <div
        className="flex items-center gap-3 flex-wrap mb-6"
        style={{ fontSize: "11px", color: "#9CA3AF" }}
      >
        {metaLine && <span>{metaLine}</span>}
        {showLowConfidence && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: "#FFFBEB",
              color: "#D97706",
              fontSize: "10px",
              fontWeight: 500,
            }}
            title={portrait.confidence.reason}
          >
            Low confidence
          </span>
        )}
      </div>

      {/* Headline paragraph — full text, no bullet split */}
      <p
        style={{
          fontSize: "15px",
          color: "#1F2937",
          lineHeight: 1.8,
          marginBottom: "20px",
          whiteSpace: "pre-wrap",
        }}
      >
        {headlineText}
      </p>

      {/* Thinking trace — collapsible, default closed. Honest LLM-mode signal
          that figma's hardcoded prototype didn't have a place for. */}
      {thinking && thinking.trim().length > 0 && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setThinkingOpen((o) => !o)}
            aria-expanded={thinkingOpen}
            className="inline-flex items-center gap-1.5 transition-colors hover:opacity-80"
            style={{ fontSize: "12px", color: "#6B7280" }}
          >
            {thinkingOpen ? (
              <ChevronDown size={14} aria-hidden="true" />
            ) : (
              <ChevronRight size={14} aria-hidden="true" />
            )}
            {thinkingOpen ? "Hide thinking trace" : "Show thinking trace"}
          </button>
          {thinkingOpen && (
            <pre
              className="mt-3 p-4 rounded-lg overflow-x-auto"
              style={{
                backgroundColor: "#F5F6F8",
                fontSize: "12px",
                lineHeight: 1.6,
                color: "#374151",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {thinking}
            </pre>
          )}
        </div>
      )}

      {/* Footer row: regenerate + attribution */}
      <div
        className="flex items-center justify-between pt-6 border-t flex-wrap gap-3"
        style={{ borderColor: "#F0F3F7" }}
      >
        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors hover:border-blue-500"
          style={{ borderColor: "#E2E5EA", fontSize: "13px", color: "#6B7280" }}
        >
          <RefreshCw size={14} aria-hidden="true" />
          <span>Regenerate portrait</span>
        </button>
        <div style={{ fontSize: "11px", color: "#9CA3AF" }}>
          Gemma 4 thinking mode · analyzed locally
        </div>
      </div>
    </div>
  );
}
