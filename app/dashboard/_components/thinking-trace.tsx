"use client";

import { useState } from "react";
import { Brain, ChevronDown, ChevronUp } from "lucide-react";

interface ThinkingTraceProps {
  thinking: string;
}

export default function ThinkingTrace({ thinking }: ThinkingTraceProps) {
  const [expanded, setExpanded] = useState(false);

  if (!thinking || !thinking.trim()) return null;

  const wordCount = thinking.split(/\s+/).filter(Boolean).length;

  return (
    <section className="rounded-xl bg-gray-50 border border-gray-200 mb-8 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-gray-100 transition"
      >
        <span className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-gray-500" />
          <span className="text-[11px] tracking-[0.08em] uppercase text-gray-500 font-medium">
            View Gemma 4&apos;s reasoning
          </span>
          <span className="text-[11px] text-gray-400">
            ({wordCount} words)
          </span>
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-gray-200 px-5 py-4 bg-white">
          <pre className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap font-mono">
            {thinking}
          </pre>
        </div>
      )}
    </section>
  );
}
