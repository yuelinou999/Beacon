"use client";

// Wrong-answer breakdown by error type. Horizontal bars where length
// is proportional to the largest bucket — keeps the visual ratio
// honest without forcing log/sqrt scaling. Color tokens reuse the
// /review page's errorTypeColor mapping so the same error gets the
// same color across surfaces.

import type { ErrorTypeBucket } from "@/lib/efficacy";
import { errorTypeColor } from "@/lib/review";

export default function MistakeTaxonomy({
  buckets,
}: {
  buckets: ErrorTypeBucket[];
}) {
  if (buckets.length === 0) {
    return (
      <div
        className="rounded-xl p-6"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <p style={{ fontSize: "13px", color: "#6B7280" }}>
          No mistakes to break down yet.
        </p>
      </div>
    );
  }

  const max = Math.max(...buckets.map((b) => b.count));
  const total = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
    >
      <div className="space-y-3">
        {buckets.map((b) => {
          const colors = errorTypeColor(b.label);
          const widthPct = max === 0 ? 0 : (b.count / max) * 100;
          const sharePct = total === 0 ? 0 : Math.round((b.count / total) * 100);
          return (
            <div key={b.label}>
              <div className="flex items-baseline justify-between mb-1">
                <span style={{ fontSize: "13px", color: "#1F2937", fontWeight: 500 }}>
                  {b.label}
                </span>
                <span style={{ fontSize: "12px", color: "#6B7280" }}>
                  {b.count}{" "}
                  <span style={{ color: "#9CA3AF" }}>· {sharePct}%</span>
                </span>
              </div>
              <div
                className="w-full h-2.5 rounded-full"
                style={{ backgroundColor: "#F3F4F6" }}
              >
                <div
                  className="h-2.5 rounded-full"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: colors.fg,
                    transition: "width 200ms ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
