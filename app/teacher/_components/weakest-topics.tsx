"use client";

// Bottom-N topic list — actively-attempted topics with the lowest
// mastery. Each row links into /practice for that topic so a teacher
// can hand the device back to the student with a concrete next step.

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { WeakTopic } from "@/lib/efficacy";

export default function WeakestTopics({ topics }: { topics: WeakTopic[] }) {
  if (topics.length === 0) {
    return (
      <div
        className="rounded-xl p-6"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <p style={{ fontSize: "13px", color: "#6B7280" }}>
          Nothing to flag yet — once the student attempts a few practice
          questions, the weakest topics will appear here.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl"
      style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
    >
      <div className="divide-y" style={{ borderColor: "#F0F3F7" }}>
        {topics.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-4 px-5 py-4"
            style={{ borderColor: "#F0F3F7" }}
          >
            <div className="flex-1 min-w-0">
              <div
                className="truncate"
                style={{ fontSize: "14px", fontWeight: 500, color: "#1F2937" }}
              >
                {t.title}
              </div>
              {t.unitTitle && (
                <div
                  className="truncate"
                  style={{ fontSize: "11px", color: "#9CA3AF" }}
                >
                  {t.unitTitle}
                </div>
              )}
              {/* Inline progress bar so the magnitude of weakness is
                  visible at a glance, not just the number. */}
              <div
                className="w-full h-1.5 rounded-full mt-2"
                style={{ backgroundColor: "#F3F4F6" }}
              >
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${Math.max(t.mastery * 100, 4)}%`,
                    backgroundColor: t.mastery < 0.3 ? "#EF4444" : "#D97706",
                  }}
                />
              </div>
            </div>
            <div
              className="text-right shrink-0"
              style={{ minWidth: "100px" }}
            >
              <div style={{ fontSize: "16px", fontWeight: 500, color: "#1F2937" }}>
                {Math.round(t.mastery * 100)}%
              </div>
              <div style={{ fontSize: "11px", color: "#6B7280" }}>
                {t.attempts} {t.attempts === 1 ? "attempt" : "attempts"}
              </div>
            </div>
            <Link
              href={`/practice?topic=${t.id}`}
              className="rounded-md transition-colors hover:bg-blue-100 flex items-center gap-1 shrink-0"
              style={{
                backgroundColor: "#EFF6FF",
                color: "#2563EB",
                fontSize: "12px",
                padding: "6px 10px",
                textDecoration: "none",
              }}
            >
              Practice
              <ArrowUpRight size={12} aria-hidden="true" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
