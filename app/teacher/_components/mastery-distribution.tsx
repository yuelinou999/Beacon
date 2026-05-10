"use client";

// Horizontal stacked bar showing mastery-band distribution across all
// progressable topics. Empty bands collapse to 0-width so the bar
// stays a clean single horizontal stripe regardless of profile state.
// Legend below shows count + percentage per band.

import type { MasteryBandCounts } from "@/lib/efficacy";

const BANDS = [
  { key: "notStarted", label: "Not started", color: "#E5E7EB" },
  { key: "learning", label: "Learning", color: "#93C5FD" },
  { key: "practicing", label: "Practicing", color: "#60A5FA" },
  { key: "mastered", label: "Mastered", color: "#059669" },
] as const;

export default function MasteryDistribution({
  distribution,
}: {
  distribution: MasteryBandCounts;
}) {
  if (distribution.total === 0) {
    return (
      <div
        className="rounded-xl p-6"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <p style={{ fontSize: "13px", color: "#6B7280" }}>
          No progressable topics in the curriculum yet.
        </p>
      </div>
    );
  }

  // Per-band counts in the configured display order.
  const counts = BANDS.map((b) => ({
    ...b,
    count: distribution[b.key] as number,
    pct: (distribution[b.key] as number) / distribution.total,
  }));

  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
    >
      {/* Stacked bar */}
      <div
        className="w-full rounded-md overflow-hidden flex"
        style={{ height: "20px", backgroundColor: "#F3F4F6" }}
        role="img"
        aria-label={`Mastery distribution: ${counts
          .map((c) => `${c.label} ${c.count}`)
          .join(", ")}`}
      >
        {counts.map((c) =>
          c.count === 0 ? null : (
            <div
              key={c.key}
              style={{
                width: `${c.pct * 100}%`,
                backgroundColor: c.color,
                transition: "width 200ms ease",
              }}
            />
          ),
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {counts.map((c) => (
          <div key={c.key} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: c.color }}
              aria-hidden="true"
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "12px", color: "#6B7280" }}>{c.label}</div>
              <div style={{ fontSize: "14px", color: "#1F2937", fontWeight: 500 }}>
                {c.count}{" "}
                <span style={{ fontSize: "11px", color: "#9CA3AF", fontWeight: 400 }}>
                  ({Math.round(c.pct * 100)}%)
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
