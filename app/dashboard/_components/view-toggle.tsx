"use client";

// View toggle — switches between learner-facing and teacher-facing copy.
// Per spec: only flips local display state; does NOT re-fetch the portrait.
// Same PortraitResponse drives both modes via headline.narrative vs analytical
// and suggestion.suggestion vs suggestion.rationale.

export type ViewMode = "student" | "teacher";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}

export default function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="flex gap-2">
      <ToggleButton
        active={value === "student"}
        onClick={() => onChange("student")}
        label="Student view"
      />
      <ToggleButton
        active={value === "teacher"}
        onClick={() => onChange("teacher")}
        label="Family view"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="px-3 py-1.5 rounded-lg transition-colors"
      style={{
        backgroundColor: active ? "#EFF6FF" : "transparent",
        color: active ? "#2563EB" : "#6B7280",
        border: active ? "1px solid #BFDBFE" : "1px solid #E2E5EA",
        fontSize: "12px",
      }}
    >
      {label}
    </button>
  );
}
