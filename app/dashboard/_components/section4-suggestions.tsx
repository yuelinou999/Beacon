"use client";

import type { PortraitBody } from "@/lib/portrait";
import type { ViewMode } from "./view-toggle";

// Section 4 — "What would help most right now" blue callout card.
// Renders portrait.suggestions[]. Each suggestion has both `suggestion`
// (student-facing copy) and `rationale` (teacher-facing technical reasoning).
// viewMode picks which one is the primary text per row — same data, no
// re-fetch (codex spec J1).
// Hides the entire callout if suggestions is empty.

interface Section4SuggestionsProps {
  portrait: PortraitBody;
  viewMode: ViewMode;
}

export default function Section4Suggestions({
  portrait,
  viewMode,
}: Section4SuggestionsProps) {
  const suggestions = portrait.suggestions ?? [];
  if (suggestions.length === 0) return null;

  return (
    <div
      className="rounded-xl p-6 mb-8"
      style={{ backgroundColor: "#EFF6FF", border: "1px solid #BFDBFE" }}
    >
      <h3
        style={{
          fontSize: "11px",
          fontWeight: 500,
          color: "#1E40AF",
          marginBottom: "20px",
          letterSpacing: "0.5px",
        }}
      >
        WHAT WOULD HELP MOST RIGHT NOW
      </h3>

      <ul role="list" className="space-y-3 list-none p-0">
        {suggestions.map((s, i) => {
          // Student gets the directive ("Keep sessions under 15 minutes.").
          // Teacher gets the reasoning ("Cognitive load evidence shows ...").
          // Either may be empty depending on what the LLM emitted; fall back
          // to whichever exists to avoid blank rows.
          const primary =
            viewMode === "student"
              ? s.suggestion || s.rationale
              : s.rationale || s.suggestion;
          if (!primary) return null;
          return (
            <li key={i} className="flex items-start gap-3">
              <div
                className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                style={{ backgroundColor: "#2563EB" }}
                aria-hidden="true"
              />
              <p style={{ fontSize: "14px", color: "#1E3A8A", lineHeight: 1.7 }}>
                {primary}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
