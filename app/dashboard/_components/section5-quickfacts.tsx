"use client";

import {
  Clock,
  Flame,
  Target,
  BookOpen,
  AlertCircle,
  Calendar,
  Sun,
  Sparkles,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { PortraitQuickFact } from "@/lib/portrait";

// Section 5 — Quick facts grid.
// Renders portrait.quick_facts (3–5 items per schema). icon_hint maps to a
// lucide icon; the LLM prompt constrains hints to a small enum, but figma-
// style aliases are also accepted in case the model goes off-script.
// Sparkles is the fallback. Per codex spec K5, render any count 3–5 without
// slicing to a fixed 4.

type IconCmp = ComponentType<SVGProps<SVGSVGElement>>;

// Primary hints from the portrait prompt enum (lib/portrait.ts:161).
// Aliases below cover figma-style names if the model emits them anyway.
const ICON_MAP: Record<string, IconCmp> = {
  // prompt enum
  time: Clock,
  streak: Flame,
  accuracy: Target,
  topic: BookOpen,
  mistake: AlertCircle,
  session: Calendar,
  // figma-style aliases
  calendar: Calendar,
  clock: Clock,
  fire: Flame,
  flame: Flame,
  sun: Sun,
  morning: Sun,
  afternoon: Sun,
  book: BookOpen,
  target: Target,
  alert: AlertCircle,
  warning: AlertCircle,
};

function pickIcon(hint: string | undefined): IconCmp {
  if (!hint) return Sparkles;
  return ICON_MAP[hint.toLowerCase()] ?? Sparkles;
}

interface Section5QuickFactsProps {
  quickFacts: PortraitQuickFact[];
}

export default function Section5QuickFacts({ quickFacts }: Section5QuickFactsProps) {
  if (!quickFacts || quickFacts.length === 0) return null;

  // Schema allows 3–5 items. Pick a literal Tailwind grid-cols class to keep
  // the JIT happy. Fall through gracefully for unexpected counts.
  const colsClass =
    quickFacts.length === 5
      ? "grid-cols-5"
      : quickFacts.length === 4
        ? "grid-cols-4"
        : quickFacts.length === 3
          ? "grid-cols-3"
          : quickFacts.length === 2
            ? "grid-cols-2"
            : "grid-cols-1";

  return (
    <ul role="list" className={`grid ${colsClass} gap-3 list-none p-0`}>
      {quickFacts.map((fact, i) => {
        const Icon = pickIcon(fact.icon_hint);
        return (
          <li
            key={i}
            className="rounded-lg p-3 text-center flex flex-col items-center"
            style={{ backgroundColor: "#F5F6F8" }}
          >
            <Icon
              width={16}
              height={16}
              className="mb-1.5"
              style={{ color: "#6B7280" }}
              aria-hidden="true"
            />
            <span style={{ fontSize: "11px", color: "#6B7280", lineHeight: 1.4 }}>
              {fact.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
