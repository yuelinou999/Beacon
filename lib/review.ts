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
//
// Memoization: curriculum.json is a static module import so topic→skill is
// a build-time-stable map. Lazy-build on first call, then O(1) per lookup.
// Archive views with N items × M topic.find() were O(N·M); now O(N).
let _topicToSkillCache: Map<string, string> | null = null;

function buildTopicToSkillCache(): Map<string, string> {
  const cache = new Map<string, string>();
  const units = getUnits();
  const unitTitleById = new Map(units.map((u) => [u.id, u.title]));
  for (const topic of getAllTopics()) {
    const unitTitle = unitTitleById.get(topic.unit_id);
    cache.set(topic.id, unitTitle ?? topic.title.en);
  }
  return cache;
}

export function getSkillAreaForTopic(topicId: string): string {
  if (!_topicToSkillCache) _topicToSkillCache = buildTopicToSkillCache();
  return _topicToSkillCache.get(topicId) ?? "Other";
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

// ── Mistake patterns (stats-based insight) ────────────
// Computes a short "your most common pattern" observation from raw counts.
// Explicitly NOT an LLM call — see /review's callout, which is labelled
// "Mistake patterns" not "AI insight" to avoid implying inference.
//
// Rules per codex review:
//   - Need at least MIN_MISTAKES_FOR_PATTERN to surface anything (avoid
//     overfitting on tiny data).
//   - Headline: the dominant error_type label, action-oriented.
//   - Optional tip: only when there's a clear secondary type (>=30% share)
//     AND it differs from the dominant one. No psychological inferences.

const MIN_MISTAKES_FOR_PATTERN = 3;
const SECONDARY_SHARE_THRESHOLD = 0.3;

export interface MistakePattern {
  headline: string;
  tip?: string;
}

const PATTERN_HEADLINES: Record<string, string> = {
  "Calculation error":
    "Most mistakes are calculation errors. Slow down and check arithmetic before submitting.",
  "Concept confusion":
    "Most mistakes are concept confusions. Revisiting the lesson would help more than another practice round.",
  Rushing:
    "Most mistakes happen when you move too fast. Try pausing for a beat after reading each question.",
  Mistake: "Mistakes are spread across categories — keep practicing to surface a clearer pattern.",
};

const PATTERN_TIPS: Record<string, string> = {
  "Calculation error": "Re-read your last step before hitting submit.",
  "Concept confusion": "Open the lesson and re-read the key idea section.",
  Rushing: "Treat each question like a checklist — finish the steps, then commit.",
};

export function computeMistakePatterns(mistakes: WrongAnswer[]): MistakePattern | null {
  if (mistakes.length < MIN_MISTAKES_FOR_PATTERN) return null;

  const counts = new Map<string, number>();
  for (const m of mistakes) {
    const label = errorTypeLabel(m.error_type);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const entries = Array.from(counts.entries());

  // Find dominant
  let dominant: { label: string; count: number } | null = null;
  for (const [label, count] of entries) {
    if (!dominant || count > dominant.count) dominant = { label, count };
  }
  if (!dominant) return null;

  const headline = PATTERN_HEADLINES[dominant.label] ?? PATTERN_HEADLINES.Mistake;

  // Find secondary distinct type that crosses threshold
  let secondary: { label: string; count: number } | null = null;
  for (const [label, count] of entries) {
    if (label === dominant.label) continue;
    if (count / mistakes.length < SECONDARY_SHARE_THRESHOLD) continue;
    if (!secondary || count > secondary.count) secondary = { label, count };
  }
  const tip = secondary ? PATTERN_TIPS[secondary.label] : undefined;

  return { headline, tip };
}
