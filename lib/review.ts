// Pure helpers for the /review page. No React, no localStorage — just
// derivations from WrongAnswer + curriculum metadata.

import type { WrongAnswer } from "./types";
import { getAllTopics, getUnits } from "./curriculum";

// ── error_type display mapping ─────────────────────
// Internal ErrorType (lib/types.ts) has 4 values; figma uses 3 categories.
// Per codex review, we keep "Rushing" as its own label rather than collapsing
// into "Skipped step" (rushing != skipped — it's "moved too fast"). "careless"
// folds into "Calculation error" since both are arithmetic-execution slips.

const ERROR_TYPE_LABELS: Record<string, string> = {
  concept: "Concept confusion",
  calculation: "Calculation error",
  rushing: "Rushing",
  careless: "Calculation error",
};

export function errorTypeLabel(raw: string): string {
  return ERROR_TYPE_LABELS[raw] ?? "Mistake";
}

// Color tokens per error-type label. Matches the design-reference palette
// (calculation/rushing share the amber-ish family because they're both
// execution issues; concept gets blue because it's about understanding).
export interface ErrorTypeColor {
  fg: string;
  bg: string;
}

const ERROR_TYPE_COLORS: Record<string, ErrorTypeColor> = {
  "Concept confusion": { fg: "#2563EB", bg: "#EFF6FF" },
  "Calculation error": { fg: "#D97706", bg: "#FFFBEB" },
  Rushing: { fg: "#EF4444", bg: "#FEF2F2" },
  Mistake: { fg: "#6B7280", bg: "#F5F6F8" },
};

export function errorTypeColor(label: string): ErrorTypeColor {
  return ERROR_TYPE_COLORS[label] ?? ERROR_TYPE_COLORS.Mistake;
}

// ── Skill area derivation ──────────────────────────
// figma's "skillArea" field doesn't exist in our data. Closest mapping is
// the unit title for the topic — gives a grouping granularity comparable to
// figma's examples ("Equation solving") and aligns with Course Catalog.
// Falls back to topic title.en if the topic exists but its unit can't be
// resolved (legacy / orphan), then to "Other" if even the topic is gone.
export function getSkillAreaForTopic(topicId: string): string {
  const topics = getAllTopics();
  const topic = topics.find((t) => t.id === topicId);
  if (!topic) return "Other";

  const unit = getUnits().find((u) => u.id === topic.unit_id);
  if (unit) return unit.title;

  return topic.title.en;
}

// ── Date helpers ───────────────────────────────────

export function isMistakeDue(
  wa: Pick<WrongAnswer, "next_review_date">,
  now: Date = new Date()
): boolean {
  // YYYY-MM-DD string comparison works because of ISO format ordering.
  const today = now.toISOString().slice(0, 10);
  return wa.next_review_date <= today;
}

export function daysSince(timestamp: string, now: Date = new Date()): number {
  const then = new Date(timestamp).getTime();
  const ms = now.getTime() - then;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

// Short relative date for the mistake metadata line.
//   < 1 day   → "today"
//   == 1 day  → "yesterday"
//   < 7 days  → "N days ago"
//   else      → ISO date (YYYY-MM-DD)
export function formatRelativeDate(timestamp: string, now: Date = new Date()): string {
  const days = daysSince(timestamp, now);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return timestamp.slice(0, 10);
}

// ── Mistake review-state derivation ────────────────
// Three mutually-exclusive states for the "ALL MISTAKES" archive view:
//   - reviewed:     last_review_correct === true (the SR loop succeeded)
//   - failed:       last_review_correct === false (recent failure)
//   - not_reviewed: last_review_correct === null (never attempted)

export type MistakeReviewState = "reviewed" | "failed" | "not_reviewed";

export function reviewState(wa: WrongAnswer): MistakeReviewState {
  if (wa.last_review_correct === true) return "reviewed";
  if (wa.last_review_correct === false) return "failed";
  return "not_reviewed";
}
