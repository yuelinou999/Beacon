// Demo profile seed for Xiaomei — the persona Beacon is built around.
//
// Persona: Xiaomei (小美), 12 years old, rural Yunnan China, learning
// on a hand-me-down Android tablet. Hindi → Mandarin, India → China,
// chapati → mooncake, rupees → yuan. The "rural mountain area where
// the missing piece isn't bandwidth — it's the teacher and the
// textbook" thesis applies just as cleanly to highland Yunnan.
//
// Why this exists: a freshly-installed Beacon shows zeros everywhere
// (no mastery, no mistakes, no sessions), which means the Family view's
// efficacy HUD is mostly empty cards on a fresh profile. For demo
// recording we need realistic numbers across mastery distribution,
// weakest-topics, mistake taxonomy, and the 7-day activity strip.
// One click in Settings populates a learner profile that's been using
// Beacon for ~30 days with the activity patterns Xiaomei would plausibly
// produce: confident on early algebra, stuck on multi-step fractions,
// recovering on ratio basics.
//
// All dates are computed at click time relative to "today" so the
// activity strip always shows recent activity regardless of when the
// demo is recorded. The IDs reference real curriculum topics so the
// Family view's links into /practice resolve to real pages.
//
// This is a demo helper, not product surface. Hidden under a small
// "Demo helpers" section in Settings — judges who explore the settings
// will see honest "this is for video recording" copy.

"use client";

import type {
  StudentProfile,
  TopicProgress,
  WrongAnswer,
  SessionLog,
  AnswerRecord,
  StudentSettings,
} from "./types";
import { saveProfile } from "./progress";

const PERSONA_NAME = "Xiaomei";
const PERSONA_GRADE = "Grade 7";
const PERSONA_COUNTRY = "China";

// Settings keys mirrored from components/settings-modal.tsx — keeping
// them inline here (instead of importing) so this file has no React /
// component coupling and can be called from anywhere.
const STUDENT_NAME_KEY = "beacon_student_name";
const GRADE_KEY = "beacon_grade";
const COUNTRY_KEY = "beacon_country";
const BILINGUAL_KEY = "beacon_bilingual";
const SECOND_LANG_KEY = "beacon_second_language";

// ── Date helpers ──────────────────────────────────────
// All seed dates are relative to the moment loadXiaomeiDemo() runs,
// so the Family view's "last 7 days" / "last 30 days" windows
// always show recent activity at demo time.

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoTimestamp(daysAgo: number, hour = 14, minute = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// ── Topic mastery distribution ────────────────────────
// Hand-picked to produce a plausible learning trajectory:
//   - 3 topics mastered (early algebra + ratio basics — confidence)
//   - 5 topics practicing (mid-tier, mastery in 0.4–0.6)
//   - 3 topics learning (the harder ones, mastery 0.15–0.3)
//   - rest unstarted
// All IDs reference real curriculum.json topics.

const MASTERED: Array<{ id: string; mastery: number; attempts: number; daysAgo: number }> = [
  { id: "what_is_variable", mastery: 0.92, attempts: 14, daysAgo: 8 },
  { id: "expressions_vs_equations", mastery: 0.85, attempts: 11, daysAgo: 6 },
  { id: "what_is_ratio", mastery: 0.78, attempts: 9, daysAgo: 4 },
];

const PRACTICING: Array<{ id: string; mastery: number; attempts: number; daysAgo: number }> = [
  { id: "solving_one_step", mastery: 0.62, attempts: 12, daysAgo: 3 },
  { id: "negative_numbers", mastery: 0.55, attempts: 8, daysAgo: 5 },
  { id: "unit_rate", mastery: 0.5, attempts: 7, daysAgo: 7 },
  { id: "adding_integers", mastery: 0.48, attempts: 9, daysAgo: 5 },
  { id: "proportional_tables", mastery: 0.4, attempts: 6, daysAgo: 9 },
];

// These show up as "Topics that need attention" on Family view.
const LEARNING: Array<{ id: string; mastery: number; attempts: number; daysAgo: number }> = [
  { id: "fraction_operations", mastery: 0.28, attempts: 10, daysAgo: 1 },
  { id: "multiplying_integers", mastery: 0.22, attempts: 5, daysAgo: 2 },
  { id: "constant_proportionality", mastery: 0.18, attempts: 4, daysAgo: 11 },
];

function buildTopics(): Record<string, TopicProgress> {
  const out: Record<string, TopicProgress> = {};
  for (const t of MASTERED) {
    out[t.id] = {
      mastery: t.mastery,
      attempts: t.attempts,
      last_seen: isoTimestamp(t.daysAgo),
      status: "strong",
      lesson_completed: true,
    };
  }
  for (const t of PRACTICING) {
    out[t.id] = {
      mastery: t.mastery,
      attempts: t.attempts,
      last_seen: isoTimestamp(t.daysAgo),
      status: "practicing",
      lesson_completed: true,
    };
  }
  for (const t of LEARNING) {
    out[t.id] = {
      mastery: t.mastery,
      attempts: t.attempts,
      last_seen: isoTimestamp(t.daysAgo),
      status: "learning",
      lesson_completed: true,
    };
  }
  return out;
}

// ── Wrong answers ─────────────────────────────────────
// Mix of error types so the Family view's mistake taxonomy bar shows
// real distribution: 3 calculation, 2 concept, 2 rushing. Some have
// review_count >= 1 so the "Mistakes corrected" KPI > 0; some don't
// so the queue isn't trivially empty.
//
// Bank IDs reference questions that exist in curriculum.json so
// alt_explanation lookup via the three-layer remediation surface
// works correctly when the demo viewer clicks "Show different way".

function buildWrongAnswers(): WrongAnswer[] {
  return [
    {
      id: "wa_demo_1",
      topic: "fraction_operations",
      question: "Compute step by step. Enter a decimal.",
      student_answer: "0.6",
      correct_answer: "0.5",
      error_type: "calculation",
      explanation:
        "Inside parentheses: 1/2 + 1/4 = 3/4. Then 3/4 × 2/3 = 6/12 = 0.5.",
      timestamp: isoTimestamp(1, 11, 5),
      review_count: 0,
      next_review_date: isoDate(-1),
      last_review_correct: null,
      bank_question_id: "p11",
      source: "practice",
    },
    {
      id: "wa_demo_2",
      topic: "fraction_operations",
      question: "Multiply the mixed number. Enter a decimal.",
      student_answer: "0.5",
      correct_answer: "0.6",
      error_type: "concept",
      explanation:
        "Convert 1 1/2 = 3/2, then 3/2 × 2/5 = 6/10 = 0.6.",
      timestamp: isoTimestamp(2, 16, 20),
      review_count: 1,
      next_review_date: isoDate(-2),
      last_review_correct: true,
      bank_question_id: "p10",
      source: "practice",
    },
    {
      id: "wa_demo_3",
      topic: "multiplying_integers",
      question: "Find the product.",
      student_answer: "-12",
      correct_answer: "12",
      error_type: "concept",
      explanation: "12 × 3 = 36, and same signs make the answer positive.",
      timestamp: isoTimestamp(2, 17, 5),
      review_count: 0,
      next_review_date: isoDate(0),
      last_review_correct: null,
      bank_question_id: "p7",
      source: "practice",
    },
    {
      id: "wa_demo_4",
      topic: "adding_integers",
      question: "Find the value.",
      student_answer: "10",
      correct_answer: "0",
      error_type: "rushing",
      explanation: "Combine left to right: -4 + 7 = 3, then 3 − 3 = 0.",
      timestamp: isoTimestamp(5, 9, 40),
      review_count: 1,
      next_review_date: isoDate(-3),
      last_review_correct: true,
      bank_question_id: "p8",
      source: "practice",
    },
    {
      id: "wa_demo_5",
      topic: "proportional_tables",
      question:
        "Table: 2 → 5, 4 → 10, 6 → 15. What is the value when input is 10?",
      student_answer: "20",
      correct_answer: "25",
      error_type: "calculation",
      explanation: "Ratio is 5/2 = 2.5. Then 10 × 2.5 = 25.",
      timestamp: isoTimestamp(7, 18, 10),
      review_count: 1,
      next_review_date: isoDate(0),
      last_review_correct: true,
      bank_question_id: "p5",
      source: "practice",
    },
    {
      id: "wa_demo_6",
      topic: "negative_numbers",
      question:
        "A scoreboard shows -15. After winning, the score changes to -8. By how many points did the score go up?",
      student_answer: "-7",
      correct_answer: "7",
      error_type: "rushing",
      explanation: "-8 - (-15) = -8 + 15 = 7.",
      timestamp: isoTimestamp(9, 13, 25),
      review_count: 2,
      next_review_date: isoDate(-7),
      last_review_correct: true,
      bank_question_id: "p12",
      source: "practice",
    },
    {
      id: "wa_demo_7",
      topic: "unit_rate",
      question: "A printer prints 50 pages in 4 minutes. How many pages per minute?",
      student_answer: "12",
      correct_answer: "12.5",
      error_type: "calculation",
      explanation: "50 ÷ 4 = 12.5 pages per minute.",
      timestamp: isoTimestamp(11, 20, 0),
      review_count: 1,
      next_review_date: isoDate(-9),
      last_review_correct: true,
      bank_question_id: "p3",
      source: "practice",
    },
  ];
}

// ── Session logs ──────────────────────────────────────
// 9 sessions across the last 7 days so the activity strip lights up,
// with a couple of older sessions extending into days 12-28 so
// "minutes studied (last 30 days)" KPI > zero.

function buildSessionLogs(): SessionLog[] {
  const sessions: Array<{
    daysAgo: number;
    hour: number;
    durationMin: number;
    module: SessionLog["module"];
    topic: string;
    attempted: number;
    correct: number;
  }> = [
    { daysAgo: 0, hour: 17, durationMin: 12, module: "practice", topic: "fraction_operations", attempted: 8, correct: 5 },
    { daysAgo: 1, hour: 16, durationMin: 9, module: "review", topic: "fraction_operations", attempted: 4, correct: 3 },
    { daysAgo: 1, hour: 18, durationMin: 14, module: "practice", topic: "multiplying_integers", attempted: 8, correct: 6 },
    { daysAgo: 2, hour: 14, durationMin: 18, module: "learn", topic: "fraction_operations", attempted: 0, correct: 0 },
    { daysAgo: 3, hour: 19, durationMin: 11, module: "practice", topic: "solving_one_step", attempted: 8, correct: 6 },
    { daysAgo: 4, hour: 15, durationMin: 8, module: "review", topic: "adding_integers", attempted: 3, correct: 3 },
    { daysAgo: 5, hour: 17, durationMin: 13, module: "practice", topic: "negative_numbers", attempted: 8, correct: 6 },
    { daysAgo: 7, hour: 18, durationMin: 10, module: "practice", topic: "unit_rate", attempted: 8, correct: 7 },
    { daysAgo: 12, hour: 16, durationMin: 16, module: "learn", topic: "what_is_ratio", attempted: 0, correct: 0 },
    { daysAgo: 19, hour: 17, durationMin: 14, module: "quiz", topic: "solving_one_step", attempted: 10, correct: 8 },
    { daysAgo: 26, hour: 14, durationMin: 12, module: "learn", topic: "what_is_variable", attempted: 0, correct: 0 },
  ];
  return sessions.map((s, i) => ({
    id: `sess_demo_${i + 1}`,
    date: isoDate(s.daysAgo),
    start_time: isoTimestamp(s.daysAgo, s.hour, 0),
    end_time: isoTimestamp(s.daysAgo, s.hour, s.durationMin),
    duration_minutes: s.durationMin,
    time_of_day:
      s.hour < 12 ? "morning" : s.hour < 17 ? "afternoon" : s.hour < 21 ? "evening" : "night",
    module: s.module,
    topic: s.topic,
    questions_attempted: s.attempted,
    questions_correct: s.correct,
    hints_used: 0,
    explain_differently_used: 0,
  }));
}

// ── Public seed function ──────────────────────────────
// Writes a complete Xiaomei profile + matching settings to localStorage.
// Caller should fire `emitSettingsChanged()` and refresh their profile
// state so the UI picks up the new data without a page reload.

export function loadXiaomeiDemoProfile(): void {
  if (typeof window === "undefined") return;

  // Settings — name, grade, country, bilingual, second-language.
  // Mirrors the persona: rural Yunnan China, Mandarin default.
  localStorage.setItem(STUDENT_NAME_KEY, PERSONA_NAME);
  localStorage.setItem(GRADE_KEY, PERSONA_GRADE);
  localStorage.setItem(COUNTRY_KEY, PERSONA_COUNTRY);
  localStorage.setItem(BILINGUAL_KEY, "true");
  localStorage.setItem(SECOND_LANG_KEY, "zh");

  const settings: StudentSettings = {
    bilingual_mode: true,
    second_language: "zh",
    interface_language: "en",
  };

  // answer_history kept empty — Family view doesn't read from it
  // (mistakes drive the wrong-answer-derived metrics; sessions drive
  // activity). Keeping it empty avoids manufacturing fake exact
  // answer strings.
  const answerHistory: AnswerRecord[] = [];

  const profile: StudentProfile = {
    student_id: "xiaomei_demo",
    name: PERSONA_NAME,
    grade: PERSONA_GRADE,
    language: "en",
    current_unit: "unit_5_rational",
    topics: buildTopics(),
    wrong_answers: buildWrongAnswers(),
    answer_history: answerHistory,
    session_logs: buildSessionLogs(),
    quiz_results: [],
    total_study_time_minutes: 137,
    streak_days: 4,
    last_active_date: isoDate(0),
    settings,
  };

  saveProfile(profile);
}
