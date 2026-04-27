"use client";

import {
  Clock,
  Flame,
  Target,
  BookOpen,
  AlertCircle,
  Calendar,
  Sparkles,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { PortraitQuickFact } from "@/lib/portrait";

interface QuickFactsProps {
  quickFacts: PortraitQuickFact[];
}

type IconCmp = ComponentType<SVGProps<SVGSVGElement>>;

const ICON_MAP: Record<string, IconCmp> = {
  time: Clock,
  streak: Flame,
  accuracy: Target,
  topic: BookOpen,
  mistake: AlertCircle,
  session: Calendar,
};

function pickIcon(hint: string | undefined): IconCmp {
  if (!hint) return Sparkles;
  return ICON_MAP[hint.toLowerCase()] ?? Sparkles;
}

export default function QuickFacts({ quickFacts }: QuickFactsProps) {
  if (!quickFacts || quickFacts.length === 0) return null;

  const items = quickFacts.slice(0, 4);

  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((fact, i) => {
        const Icon = pickIcon(fact.icon_hint);
        return (
          <div
            key={i}
            className="rounded-lg bg-gray-100 p-3 text-center flex flex-col items-center"
          >
            <Icon
              width={16}
              height={16}
              className="text-gray-500 mb-1.5"
              aria-hidden
            />
            <span className="text-xs text-gray-500 leading-tight">
              {fact.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
