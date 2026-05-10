"use client";

// Last-N-days activity strip. One small vertical bar per day, height
// proportional to session count (or minutes — both are reasonable;
// session count is more legible for short windows). Empty days
// render as a thin baseline so consistency / streaks are visually
// obvious.

import type { DailyActivity } from "@/lib/efficacy";

const STRIP_HEIGHT_PX = 56;

export default function ActivityStrip({
  activity,
}: {
  activity: DailyActivity[];
}) {
  if (activity.length === 0) {
    return (
      <div
        className="rounded-xl p-6"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <p style={{ fontSize: "13px", color: "#6B7280" }}>
          No activity recorded.
        </p>
      </div>
    );
  }

  const maxSessions = Math.max(1, ...activity.map((a) => a.sessions));
  const totalMinutes = activity.reduce((s, a) => s + a.durationMinutes, 0);
  const totalSessions = activity.reduce((s, a) => s + a.sessions, 0);
  const totalAttempted = activity.reduce(
    (s, a) => s + a.questionsAttempted,
    0,
  );

  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
    >
      <div
        className="flex items-end gap-2 mb-3"
        style={{ height: `${STRIP_HEIGHT_PX}px` }}
      >
        {activity.map((day) => {
          const heightPct = (day.sessions / maxSessions) * 100;
          const dayLabel = formatDayLabel(day.date);
          return (
            <div
              key={day.date}
              className="flex-1 flex flex-col items-center justify-end"
              style={{ minWidth: "0" }}
              title={`${day.date}: ${day.sessions} session${day.sessions === 1 ? "" : "s"}, ${day.durationMinutes} min`}
            >
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: day.sessions === 0 ? "3px" : `${Math.max(heightPct, 8)}%`,
                  backgroundColor: day.sessions === 0 ? "#E5E7EB" : "#2563EB",
                  minHeight: "3px",
                }}
                aria-label={`${dayLabel}: ${day.sessions} sessions`}
              />
            </div>
          );
        })}
      </div>

      {/* Day labels under each bar. Uses short day-of-week to stay
          readable in narrow columns. */}
      <div className="flex gap-2 mb-4">
        {activity.map((day) => (
          <div
            key={`${day.date}-label`}
            className="flex-1 text-center"
            style={{ fontSize: "10px", color: "#9CA3AF", minWidth: "0" }}
          >
            {formatDayLabel(day.date)}
          </div>
        ))}
      </div>

      {/* Window summary — keeps the strip's information density up
          even when individual day counts are 0. */}
      <div
        className="flex items-center justify-between pt-3 border-t"
        style={{ borderColor: "#F0F3F7" }}
      >
        <Stat label="Sessions" value={`${totalSessions}`} />
        <Stat label="Questions attempted" value={`${totalAttempted}`} />
        <Stat label="Minutes" value={`${totalMinutes}`} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{label}</div>
      <div style={{ fontSize: "14px", color: "#1F2937", fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}

// "YYYY-MM-DD" → short day-of-week. Uses local date interpretation so
// the strip aligns with what the learner perceives as "today" rather
// than UTC. Falls through to the raw ISO date if parsing somehow
// fails (defensive).
function formatDayLabel(iso: string): string {
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3) return iso;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short" });
}
