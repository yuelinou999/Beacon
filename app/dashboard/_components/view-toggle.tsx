"use client";

export type ViewMode = "student" | "teacher";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}

export default function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <ToggleButton
        active={value === "student"}
        onClick={() => onChange("student")}
        label="Student view"
      />
      <ToggleButton
        active={value === "teacher"}
        onClick={() => onChange("teacher")}
        label="Teacher view"
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
  const base =
    "rounded-full border px-3.5 py-1.5 text-xs font-medium transition";
  const cls = active
    ? "bg-blue-50 text-blue-600 border-blue-200"
    : "bg-transparent text-gray-500 border-gray-200 hover:text-gray-700";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${base} ${cls}`}
    >
      {label}
    </button>
  );
}
