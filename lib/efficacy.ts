// Efficacy analytics — pure aggregation helpers for the Teacher view.
//
// All functions are deterministic, side-effect-free, and operate on a
// snapshot of StudentProfile + the curriculum. No localStorage reads,
// no LLM calls, no network. The Teacher view layer reads profile from
// localStorage once on mount and threads it into these helpers.
//
// Design choice: keep aggregations small and explicit. Charts can be
// rendered with vanilla CSS (no chart library). Each helper returns a
// shape the UI can paint in 5-15 lines of JSX without further math.
//
// What this module does NOT do:
// - Time-series forecasting / trend extrapolation. Mastery is reported
//   as a current-state distribution, not a trajectory. The 14-day demo
//   doesn't have enough history per learner for trend lines to be
//   meaningful, and the page would have to grey-out empty time buckets.
// - AI-generated coaching narrative. Day 8 stays deterministic; if a
//   future "coaching notes" surface gets added, it's a separate route
//   that calls /api/portrait or similar.
// - Cross-student aggregation. Single-profile only.

import type {
  StudentProfile,
  CurriculumTopic,
  TopicProgress,
  WrongAnswer,
  SessionLog,
} from "./types";
import { isTopicProgressable } from "./curriculum";
import { errorTypeLabel } from "./review";

// ── Mastery distribution ───────────────────────────────
// 4 bands matching the catalog's MASTERY_STRONG = 0.7 cutoff. The
// "learning" band (>0, <0.3) catches lessons in flight; "practicing"
// (0.3 ≤ m < 0.7) is the tier where /practice should be used.
//
// Only counts PROGRESSABLE topics — stubs and bridges are excluded for
// the same reason they're excluded from /subject completion math:
// they can't accumulate mastery, so counting them as "not started"
// permanently inflates that band and undersells real progress.

export interface MasteryBandCounts {
  notStarted: number;
  learning: number;
  practicing: number;
  mastered: number;
  total: number;
}

const MASTERY_BAND_PRACTICING = 0.3;
const MASTERY_BAND_MASTERED = 0.7;

export function computeMasteryDistribution(
  profile: StudentProfile,
  allTopics: CurriculumTopic[],
): MasteryBandCounts {
  const out: MasteryBandCounts = {
    notStarted: 0,
    learning: 0,
    practicing: 0,
    mastered: 0,
    total: 0,
  };
  for (const t of allTopics) {
    if (!isTopicProgressable(t)) continue;
    out.total += 1;
    const m = profile.topics[t.id]?.mastery ?? 0;
    if (m === 0) out.notStarted += 1;
    else if (m < MASTERY_BAND_PRACTICING) out.learning += 1;
    else if (m < MASTERY_BAND_MASTERED) out.practicing += 1;
    else out.mastered += 1;
  }
  return out;
}

// ── Weakest topics ─────────────────────────────────────
// Returns the bottom-N topics where the learner has tried at least
// once (attempts > 0) but mastery is still below MASTERED. We require
// attempts > 0 so this surface doesn't fill with "not started" rows
// — those belong on the catalog, not the Teacher view.
//
// Ties broken by attempt count (more attempts but still weak signals
// a topic that's actively struggling, vs one barely started).

export interface WeakTopic {
  id: string;
  title: string;
  unitTitle: string;
  mastery: number;
  attempts: number;
  lastSeen: string | null;
}

export function findWeakestTopics(
  profile: StudentProfile,
  allTopics: CurriculumTopic[],
  unitTitleById: Map<string, string>,
  limit: number,
): WeakTopic[] {
  const candidates: WeakTopic[] = [];
  for (const t of allTopics) {
    if (!isTopicProgressable(t)) continue;
    const tp: TopicProgress | undefined = profile.topics[t.id];
    if (!tp || tp.attempts === 0) continue;
    if (tp.mastery >= MASTERY_BAND_MASTERED) continue;
    candidates.push({
      id: t.id,
      title: t.title.en,
      unitTitle: unitTitleById.get(t.unit_id) ?? "",
      mastery: tp.mastery,
      attempts: tp.attempts,
      lastSeen: tp.last_seen,
    });
  }
  candidates.sort((a, b) => {
    if (a.mastery !== b.mastery) return a.mastery - b.mastery;
    return b.attempts - a.attempts;
  });
  return candidates.slice(0, limit);
}

// ── Mistake taxonomy ───────────────────────────────────
// Buckets the wrong_answers list by display label (Concept confusion /
// Calculation error / Rushing / Mistake). Optional date cutoff lets
// the Teacher view show "last 30 days" instead of "all time" — useful
// for separating recent struggles from historical context.

export interface ErrorTypeBucket {
  label: string;
  count: number;
}

export function computeErrorTypeBreakdown(
  profile: StudentProfile,
  sinceISODate?: string,
): ErrorTypeBucket[] {
  const counts = new Map<string, number>();
  for (const wa of profile.wrong_answers) {
    if (sinceISODate && wa.timestamp < sinceISODate) continue;
    const label = errorTypeLabel(wa.error_type);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

// ── Recent activity ────────────────────────────────────
// Bucketed by ISO date (YYYY-MM-DD). Returns one entry per day in the
// requested window, including ZERO-activity days so the UI can render
// a stable-width bar series without gaps. Day 0 is `today` in the
// caller's local time, day N-1 is the oldest.

export interface DailyActivity {
  date: string; // YYYY-MM-DD
  sessions: number;
  questionsAttempted: number;
  questionsCorrect: number;
  durationMinutes: number;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function computeRecentActivity(
  profile: StudentProfile,
  days: number,
): DailyActivity[] {
  const today = new Date();
  // Build the day window first (oldest → newest) so empty days render.
  const buckets = new Map<string, DailyActivity>();
  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const iso = isoDate(d);
    buckets.set(iso, {
      date: iso,
      sessions: 0,
      questionsAttempted: 0,
      questionsCorrect: 0,
      durationMinutes: 0,
    });
  }
  for (const log of profile.session_logs ?? []) {
    const slot = buckets.get(log.date);
    if (!slot) continue;
    slot.sessions += 1;
    slot.questionsAttempted += log.questions_attempted ?? 0;
    slot.questionsCorrect += log.questions_correct ?? 0;
    slot.durationMinutes += log.duration_minutes ?? 0;
  }
  return Array.from(buckets.values());
}

// ── Key metrics (top-of-page cards) ────────────────────
// Headline numbers the Teacher view leads with. All four are
// computable directly from the profile without curriculum context;
// the only curriculum dependency is `topicsMastered` which needs
// progressable-topic filtering.

export interface KeyMetrics {
  // Days where at least one session was logged in the last `windowDays`.
  activeDays: number;
  windowDays: number;
  // Topics meeting MASTERY_STRONG, vs total progressable count.
  topicsMastered: number;
  topicsProgressable: number;
  // Mistakes that have at least one successful review (review_count >= 1)
  // — i.e. the student showed they fixed it at least once. We don't
  // require N consecutive successful reviews because the SR cadence
  // means most learners haven't reached the higher review tiers yet.
  mistakesCorrected: number;
  mistakesTotal: number;
  // Aggregate study minutes over the same window.
  studyMinutesWindow: number;
}

export function computeKeyMetrics(
  profile: StudentProfile,
  allTopics: CurriculumTopic[],
  windowDays: number,
): KeyMetrics {
  // Active days + study minutes over the activity window.
  const activity = computeRecentActivity(profile, windowDays);
  const activeDays = activity.filter((a) => a.sessions > 0).length;
  const studyMinutesWindow = activity.reduce(
    (s, a) => s + a.durationMinutes,
    0,
  );

  // Mastered count over progressable topics only.
  let topicsMastered = 0;
  let topicsProgressable = 0;
  for (const t of allTopics) {
    if (!isTopicProgressable(t)) continue;
    topicsProgressable += 1;
    const m = profile.topics[t.id]?.mastery ?? 0;
    if (m >= MASTERY_BAND_MASTERED) topicsMastered += 1;
  }

  const mistakesTotal = profile.wrong_answers.length;
  const mistakesCorrected = profile.wrong_answers.filter(
    (wa) => (wa.review_count ?? 0) >= 1,
  ).length;

  return {
    activeDays,
    windowDays,
    topicsMastered,
    topicsProgressable,
    mistakesCorrected,
    mistakesTotal,
    studyMinutesWindow,
  };
}

// ── Re-exports for the page ────────────────────────────
// Convenience: the page imports a single module. Type exports help
// the page's components stay strictly typed without a deeper import.

export type { TopicProgress, WrongAnswer, SessionLog };
