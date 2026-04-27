"use client";

import type { PortraitSuggestion } from "@/lib/portrait";
import type { ViewMode } from "./view-toggle";

interface SuggestionsCardProps {
  suggestions: PortraitSuggestion[];
  viewMode: ViewMode;
}

export default function SuggestionsCard({
  suggestions,
  viewMode,
}: SuggestionsCardProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <section className="rounded-xl bg-blue-50 border border-blue-200 p-6 mb-8">
      <p className="text-[11px] tracking-[0.08em] uppercase text-blue-800 font-semibold mb-3">
        WHAT WOULD HELP MOST RIGHT NOW
      </p>
      <ul className="space-y-2.5">
        {suggestions.map((s, i) => {
          const text = viewMode === "student" ? s.suggestion : s.rationale;
          if (!text) return null;
          return (
            <li key={i} className="flex gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-2 shrink-0" />
              <span className="text-sm text-blue-900 leading-relaxed">
                {text}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
