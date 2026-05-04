import type {
  StudentProfile,
  TopicProgress,
  WrongAnswer,
  AnswerRecord,
  SessionLog,
  ErrorType,
  LegacyTopicArchive,
  QuizAttempt,
} from "./types";
import seedData from "../data/student.json";
import curriculumData from "../data/curriculum.json";

const STORAGE_KEY = "beacon_student_profile";

// ── Legacy ID rename tables ────────────────────────────
// When a curriculum ID is renamed, add an entry here so old
// localStorage profiles migrate forward without losing progress.

const TOPIC_ID_RENAMES: Record<string, string> = {
  word_problems: "equation_word_problems",
};

const UNIT_ID_RENAMES: Record<string, string> = {
  linear_equations: "unit_6_equations",
};

let _validTopicIds: Set<string> | null = null;
function getValidTopicIds(): Set<string> {
  if (_validTopicIds) return _validTopicIds;
  const topics = (curriculumData.topics as Array<{ id: string }>) || [];
  _validTopicIds = new Set(topics.map((t) => t.id));
  return _validTopicIds;
}

function pickLaterTimestamp(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function mergeTopicProgress(a: TopicProgress, b: TopicProgress): TopicProgress {
  const mastery = Math.max(a.mastery, b.mastery);
  const attempts = a.attempts + b.attempts;
  const last_seen = pickLaterTimestamp(a.last_seen, b.last_seen);
  const lesson_completed = (a.lesson_completed ?? false) || (b.lesson_completed ?? false);
  const explain_differently_count = (a.explain_differently_count ?? 0) + (b.explain_differently_count ?? 0);
  const base: TopicProgress = {
    mastery,
    status: "not_started",
    attempts,
    last_seen,
    lesson_completed,
    explain_differently_count,
  };
  base.status = deriveTopicStatus(base);
  return base;
}

interface TopicMigrationResult {
  topics: Record<string, TopicProgress>;
  newlyArchived: LegacyTopicArchive[];
}

function migrateTopicIds(
  incoming: Record<string, TopicProgress>,
  existingLegacy: LegacyTopicArchive[]
): TopicMigrationResult {
  const valid = getValidTopicIds();
  const result: Record<string, TopicProgress> = {};
  const newlyArchived: LegacyTopicArchive[] = [];
  const now = new Date().toISOString();
  const alreadyArchivedIds = new Set(existingLegacy.map((la) => la.id));

  for (const [id, progress] of Object.entries(incoming)) {
    const renamedTo = TOPIC_ID_RENAMES[id];
    if (renamedTo) {
      result[renamedTo] = result[renamedTo]
        ? mergeTopicProgress(result[renamedTo], progress)
        : progress;
      continue;
    }
    if (valid.has(id)) {
      result[id] = result[id] ? mergeTopicProgress(result[id], progress) : progress;
      continue;
    }
    if (!alreadyArchivedIds.has(id)) {
      newlyArchived.push({ id, progress, archived_at: now, reason: "unknown_id" });
    }
  }

  return { topics: result, newlyArchived };
}

function migrateWrongAnswerTopics(
  incoming: WrongAnswer[],
  existingLegacy: WrongAnswer[]
): { wrong_answers: WrongAnswer[]; newlyArchived: WrongAnswer[] } {
  const valid = getValidTopicIds();
  const kept: WrongAnswer[] = [];
  const newlyArchived: WrongAnswer[] = [];
  const alreadyArchivedIds = new Set(existingLegacy.map((wa) => wa.id));

  for (const wa of incoming) {
    const renamedTo = TOPIC_ID_RENAMES[wa.topic];
    if (renamedTo) {
      kept.push({ ...wa, topic: renamedTo });
      continue;
    }
    if (valid.has(wa.topic)) {
      kept.push(wa);
      continue;
    }
    if (!alreadyArchivedIds.has(wa.id)) {
      newlyArchived.push(wa);
    }
  }

  return { wrong_answers: kept, newlyArchived };
}

// ── Mastery deltas ────────────────────────────────────
// Per-attempt mastery adjustment in updateMasteryAfterPractice. Exported so
// UI surfaces (e.g. Practice's mastery-change callout) can show the same
// numbers the formula actually applies — single source of truth.
export const MASTERY_CORRECT_DELTA = 0.1;
export const MASTERY_INCORRECT_DELTA = -0.05;

// ── Spaced repetition intervals ───────────────────────
// Indexed by WrongAnswer.review_count (= consecutive successful reviews).
// On success, review_count++; next_review_date = today + intervals[count].
// On failure, review_count = 0; next_review_date = tomorrow.
// Last index is the cap — counts beyond clamp to the final 32-day interval.
export const REVIEW_INTERVAL_DAYS: readonly number[] = [1, 2, 4, 8, 16, 32];

// ── Helpers ───────────────────────────────────────────

export function generateId(): string {
  return "wa_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
}

export function getTimeOfDay(): "morning" | "afternoon" | "evening" | "night" {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function dateNDaysFromTodayStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function deriveTopicStatus(tp: TopicProgress): TopicProgress["status"] {
  if (tp.mastery >= 1.0) return "mastered";
  if (tp.mastery >= 0.7) return "strong";
  if (tp.mastery >= 0.3) return "practicing";
  if (tp.mastery > 0 || tp.attempts > 0) return "learning";
  return "not_started";
}

// ── Migration ─────────────────────────────────────────
// Ensures old localStorage shapes get upgraded to the full schema.

function migrateProfile(raw: Record<string, unknown>): StudentProfile {
  const profile = raw as Partial<StudentProfile>;

  // Migrate topic progress entries to new shape
  const topics: Record<string, TopicProgress> = {};
  if (profile.topics) {
    for (const [id, tp] of Object.entries(profile.topics)) {
      const old = tp as unknown as Record<string, unknown>;
      const mastery = (typeof old.mastery === "number" ? old.mastery : 0);
      const attempts = (typeof old.attempts === "number" ? old.attempts : 0);
      const last_seen = (typeof old.last_seen === "string" ? old.last_seen : null);
      const lesson_completed = (typeof old.lesson_completed === "boolean" ? old.lesson_completed : mastery >= 0.3);
      const explain_differently_count = (typeof old.explain_differently_count === "number" ? old.explain_differently_count : 0);
      const status = typeof old.status === "string" ? old.status as TopicProgress["status"] : deriveTopicStatus({ mastery, status: "not_started", attempts, last_seen, lesson_completed, explain_differently_count });

      topics[id] = { mastery, status, attempts, last_seen, lesson_completed, explain_differently_count };
    }
  }

  // Migrate old wrong_answers (which lacked id, review fields) to new shape
  const wrongAnswers: WrongAnswer[] = [];
  if (Array.isArray(profile.wrong_answers)) {
    for (const wa of profile.wrong_answers) {
      const old = wa as unknown as Record<string, unknown>;
      wrongAnswers.push({
        id: (typeof old.id === "string" ? old.id : generateId()),
        topic: String(old.topic || ""),
        question: String(old.question || ""),
        student_answer: String(old.student_answer || ""),
        correct_answer: String(old.correct_answer || ""),
        error_type: (typeof old.error_type === "string" ? old.error_type : "concept"),
        explanation: (typeof old.explanation === "string" ? old.explanation : ""),
        timestamp: (typeof old.timestamp === "string" ? old.timestamp : new Date().toISOString()),
        review_count: (typeof old.review_count === "number" ? old.review_count : 0),
        next_review_date: (typeof old.next_review_date === "string" ? old.next_review_date : tomorrowStr()),
        last_review_correct: (typeof old.last_review_correct === "boolean" ? old.last_review_correct : null),
      });
    }
  }

  // Pull existing legacy archives (present on re-migrations)
  const existingLegacyTopics = Array.isArray(profile.legacy_topics)
    ? (profile.legacy_topics as LegacyTopicArchive[])
    : [];
  const existingLegacyWrongs = Array.isArray(profile.legacy_wrong_answers)
    ? (profile.legacy_wrong_answers as WrongAnswer[])
    : [];

  // Rename + archive pass for topics and wrong_answers
  const topicResult = migrateTopicIds(topics, existingLegacyTopics);
  const wrongResult = migrateWrongAnswerTopics(wrongAnswers, existingLegacyWrongs);

  // Current unit rename
  let currentUnit = typeof profile.current_unit === "string" ? profile.current_unit : "unit_6_equations";
  if (UNIT_ID_RENAMES[currentUnit]) {
    currentUnit = UNIT_ID_RENAMES[currentUnit];
  }

  const mergedLegacyTopics = [...existingLegacyTopics, ...topicResult.newlyArchived];
  const mergedLegacyWrongs = [...existingLegacyWrongs, ...wrongResult.newlyArchived];

  if (
    process.env.NODE_ENV !== "production" &&
    (topicResult.newlyArchived.length > 0 || wrongResult.newlyArchived.length > 0)
  ) {
    // eslint-disable-next-line no-console
    console.log("[Beacon] Legacy IDs archived on migrate:", {
      topics: topicResult.newlyArchived.map((l) => l.id),
      wrong_answers: wrongResult.newlyArchived.map((w) => ({ id: w.id, topic: w.topic })),
    });
  }

  const out: StudentProfile = {
    student_id: (typeof profile.student_id === "string" ? profile.student_id : "local_001"),
    name: (typeof profile.name === "string" ? profile.name : ""),
    grade: (typeof profile.grade === "string" ? profile.grade : "7"),
    language: (profile.language === "zh" ? "zh" : "en"),
    current_unit: currentUnit,
    settings: {
      bilingual_mode: (profile.settings?.bilingual_mode === true),
      second_language: (typeof profile.settings?.second_language === "string" ? profile.settings.second_language : null),
      interface_language: (typeof profile.settings?.interface_language === "string" ? profile.settings.interface_language : "en"),
    },
    topics: topicResult.topics,
    answer_history: Array.isArray(profile.answer_history) ? profile.answer_history : [],
    wrong_answers: wrongResult.wrong_answers,
    session_logs: Array.isArray(profile.session_logs) ? profile.session_logs : [],
    quiz_results: Array.isArray(profile.quiz_results) ? profile.quiz_results : [],
    total_study_time_minutes: (typeof profile.total_study_time_minutes === "number" ? profile.total_study_time_minutes : 0),
    streak_days: (typeof profile.streak_days === "number" ? profile.streak_days : 0),
    last_active_date: (typeof profile.last_active_date === "string" ? profile.last_active_date : ""),
  };
  if (mergedLegacyTopics.length > 0) out.legacy_topics = mergedLegacyTopics;
  if (mergedLegacyWrongs.length > 0) out.legacy_wrong_answers = mergedLegacyWrongs;
  return out;
}

// ── Load ───────────────────────────────────────────────
// First load: seed from student.json. Subsequent: localStorage.

export function loadProfile(): StudentProfile {
  if (typeof window === "undefined") {
    return migrateProfile(seedData as Record<string, unknown>);
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const raw = JSON.parse(stored);
      return migrateProfile(raw);
    } catch {
      // Corrupted — fall through to seed
    }
  }

  const profile = migrateProfile(seedData as Record<string, unknown>);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

// ── Save ───────────────────────────────────────────────

export function saveProfile(profile: StudentProfile): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

// ── Topic progress helpers ─────────────────────────────

export function getTopicProgress(profile: StudentProfile, topicId: string): TopicProgress {
  return profile.topics[topicId] || {
    mastery: 0,
    status: "not_started" as const,
    attempts: 0,
    last_seen: null,
    lesson_completed: false,
    explain_differently_count: 0,
  };
}

export function updateMasteryAfterPractice(
  profile: StudentProfile,
  topicId: string,
  correct: boolean,
  question?: string,
  studentAnswer?: string,
  correctAnswer?: string,
  errorType?: ErrorType,
  explanation?: string,
  timeSeconds?: number,
  // Bank-backed lookup fields. Optional so legacy callers (and future
  // non-bank callers, if any) keep working unchanged. When provided, both
  // are stamped onto the WrongAnswer so /review's resolveBankQuestion can
  // find the originating bank entry by id rather than by string match.
  bankQuestionId?: string,
  source?: "practice" | "quiz",
): StudentProfile {
  const tp = { ...getTopicProgress(profile, topicId) };
  const now = new Date().toISOString();

  tp.attempts += 1;
  tp.last_seen = now;

  if (correct) {
    tp.mastery = Math.min(1.0, +(tp.mastery + MASTERY_CORRECT_DELTA).toFixed(2));
  } else {
    tp.mastery = Math.max(0.0, +(tp.mastery + MASTERY_INCORRECT_DELTA).toFixed(2));
  }
  tp.status = deriveTopicStatus(tp);

  const newProfile: StudentProfile = {
    ...profile,
    topics: { ...profile.topics, [topicId]: tp },
  };

  // Record to answer_history
  if (question && studentAnswer) {
    const record: AnswerRecord = {
      topic: topicId,
      question,
      student_answer: studentAnswer,
      correct_answer: correctAnswer || "",
      correct,
      error_type: correct ? null : (errorType || null),
      time_seconds: timeSeconds || 0,
      timestamp: now,
    };
    newProfile.answer_history = [...(profile.answer_history ?? []), record];
  }

  // Record to wrong_answers if incorrect
  if (!correct && question && studentAnswer && correctAnswer) {
    const entry: WrongAnswer = {
      id: generateId(),
      topic: topicId,
      question,
      student_answer: studentAnswer,
      correct_answer: correctAnswer,
      error_type: errorType || "concept",
      explanation: explanation || "",
      timestamp: now,
      review_count: 0,
      next_review_date: tomorrowStr(),
      last_review_correct: null,
    };
    if (bankQuestionId) entry.bank_question_id = bankQuestionId;
    if (source) entry.source = source;
    newProfile.wrong_answers = [...profile.wrong_answers, entry];
  }

  saveProfile(newProfile);
  return newProfile;
}

// Quiz mastery rule: ratchet up only. mastery = max(existing, score/total).
// A failed quiz attempt is treated as learning, not regression — Beacon's
// stance is that taking the quiz at all is an act of effort and shouldn't
// be punished. Practice handles the per-question up-and-down adjustment.
export function recordQuizAttempt(
  profile: StudentProfile,
  attempt: QuizAttempt
): StudentProfile {
  // Idempotent on attempt_id — Strict Mode double-mount, hot reload, or any
  // re-fire of the on-mount persist effect can't double-write.
  if ((profile.quiz_results ?? []).some((a) => a.attempt_id === attempt.attempt_id)) {
    return profile;
  }

  const tp = { ...getTopicProgress(profile, attempt.topic_id) };
  const ratio = attempt.total > 0 ? attempt.score / attempt.total : 0;

  tp.mastery = Math.max(tp.mastery, +ratio.toFixed(2));
  tp.attempts += 1;
  tp.last_seen = attempt.finished_at;
  tp.status = deriveTopicStatus(tp);

  const sessionMinutes = Math.max(1, Math.round(attempt.total_seconds / 60));
  const startHour = new Date(attempt.started_at).getHours();
  const time_of_day: SessionLog["time_of_day"] =
    startHour >= 5 && startHour < 12
      ? "morning"
      : startHour >= 12 && startHour < 17
        ? "afternoon"
        : startHour >= 17 && startHour < 21
          ? "evening"
          : "night";

  const sessionLog: SessionLog = {
    id: "sess_" + Date.now(),
    date: attempt.started_at.slice(0, 10),
    start_time: attempt.started_at,
    end_time: attempt.finished_at,
    duration_minutes: sessionMinutes,
    time_of_day,
    module: "quiz",
    topic: attempt.topic_id,
    questions_attempted: attempt.total,
    questions_correct: attempt.score,
    hints_used: 0,
    explain_differently_used: 0,
  };

  const newProfile: StudentProfile = {
    ...profile,
    topics: { ...profile.topics, [attempt.topic_id]: tp },
    quiz_results: [...(profile.quiz_results ?? []), attempt],
    session_logs: [...(profile.session_logs ?? []), sessionLog],
    total_study_time_minutes: (profile.total_study_time_minutes ?? 0) + sessionMinutes,
  };

  saveProfile(newProfile);
  return newProfile;
}

export function markLessonComplete(
  profile: StudentProfile,
  topicId: string
): StudentProfile {
  const tp = { ...getTopicProgress(profile, topicId) };
  const now = new Date().toISOString();

  if (tp.mastery < 0.3) {
    tp.mastery = 0.3;
  }
  tp.last_seen = now;
  tp.lesson_completed = true;
  tp.status = deriveTopicStatus(tp);

  const newProfile: StudentProfile = {
    ...profile,
    topics: { ...profile.topics, [topicId]: tp },
  };

  saveProfile(newProfile);
  return newProfile;
}

// ── Review attempt: SR update for a single WrongAnswer ─
// Called from /review when the user retries a mistake. Updates the matching
// WrongAnswer's review_count, last_review_correct, and next_review_date per
// the SR rules:
//   - correct: review_count++ (capped); next due in REVIEW_INTERVAL_DAYS
//     entry indexed by the new count
//   - incorrect: review_count = 0; next due tomorrow
// Returns a new profile (immutable update). No-op if the id isn't found —
// the caller's UI may have raced a profile reset / migration.
export function recordReviewAttempt(
  profile: StudentProfile,
  wrongAnswerId: string,
  correct: boolean
): StudentProfile {
  const idx = profile.wrong_answers.findIndex((wa) => wa.id === wrongAnswerId);
  if (idx === -1) return profile;

  const prev = profile.wrong_answers[idx];
  const newCount = correct ? prev.review_count + 1 : 0;
  const intervalIdx = Math.min(newCount, REVIEW_INTERVAL_DAYS.length - 1);
  const intervalDays = REVIEW_INTERVAL_DAYS[intervalIdx];
  const nextDate = correct ? dateNDaysFromTodayStr(intervalDays) : tomorrowStr();

  const updated: WrongAnswer = {
    ...prev,
    review_count: newCount,
    last_review_correct: correct,
    next_review_date: nextDate,
  };

  const newWrongAnswers = [...profile.wrong_answers];
  newWrongAnswers[idx] = updated;

  const newProfile: StudentProfile = {
    ...profile,
    wrong_answers: newWrongAnswers,
  };
  saveProfile(newProfile);
  return newProfile;
}

export function getDifficulty(mastery: number): "easy" | "medium" | "hard" {
  if (mastery < 0.4) return "easy";
  if (mastery <= 0.7) return "medium";
  return "hard";
}

export function resetProfile(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

// ── Session tracking ──────────────────────────────────

export function startSession(
  module: SessionLog["module"],
  topic: string
): string {
  const profile = loadProfile();
  const id = "sess_" + Date.now();
  const now = new Date();

  const session: SessionLog = {
    id,
    date: todayStr(),
    start_time: now.toISOString(),
    end_time: "",
    duration_minutes: 0,
    time_of_day: getTimeOfDay(),
    module,
    topic,
    questions_attempted: 0,
    questions_correct: 0,
    hints_used: 0,
    explain_differently_used: 0,
  };

  profile.session_logs = [...(profile.session_logs ?? []), session];
  saveProfile(profile);
  return id;
}

export function endSession(
  sessionId: string,
  stats: {
    questions_attempted?: number;
    questions_correct?: number;
    hints_used?: number;
    explain_differently_used?: number;
  }
): void {
  const profile = loadProfile();
  const now = new Date();
  const sessionLogs = profile.session_logs ?? [];
  const idx = sessionLogs.findIndex((s) => s.id === sessionId);
  if (idx === -1) return;

  const session = { ...sessionLogs[idx] };
  session.end_time = now.toISOString();
  const startMs = new Date(session.start_time).getTime();
  session.duration_minutes = Math.round((now.getTime() - startMs) / 60000);
  session.questions_attempted = stats.questions_attempted ?? session.questions_attempted;
  session.questions_correct = stats.questions_correct ?? session.questions_correct;
  session.hints_used = stats.hints_used ?? session.hints_used;
  session.explain_differently_used = stats.explain_differently_used ?? session.explain_differently_used;

  const newLogs = [...sessionLogs];
  newLogs[idx] = session;
  profile.session_logs = newLogs;

  // Update total study time
  profile.total_study_time_minutes = (profile.total_study_time_minutes ?? 0) + session.duration_minutes;

  saveProfile(profile);
}

// ── Streak tracking ───────────────────────────────────

export function updateStreak(): void {
  const profile = loadProfile();
  const today = todayStr();

  if (profile.last_active_date === today) {
    return; // Already updated today
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (profile.last_active_date === yesterdayStr) {
    profile.streak_days += 1;
  } else {
    profile.streak_days = 1;
  }

  profile.last_active_date = today;
  saveProfile(profile);
}

// ── Explain differently tracking ──────────────────────

export function incrementExplainDifferently(
  profile: StudentProfile,
  topicId: string
): StudentProfile {
  const tp = { ...getTopicProgress(profile, topicId) };
  tp.explain_differently_count = (tp.explain_differently_count ?? 0) + 1;

  const newProfile: StudentProfile = {
    ...profile,
    topics: { ...profile.topics, [topicId]: tp },
  };
  saveProfile(newProfile);
  return newProfile;
}
