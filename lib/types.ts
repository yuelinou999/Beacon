// ── Curriculum ──────────────────────────────────────────

export interface TopicTitle {
  en: string;
  zh: string;
}

export interface CurriculumTopic {
  id: string;
  title: TopicTitle;
  prerequisite: string | null;
  difficulty_base: number;
}

export interface Curriculum {
  unit: string;
  grade: number;
  language_default: string;
  topics: CurriculumTopic[];
}

// ── Student progress ───────────────────────────────────

export type ErrorType = "concept" | "calculation" | "rushing" | "careless" | null;

export type TopicStatus = "not_started" | "learning" | "practicing" | "strong" | "mastered";

export interface TopicProgress {
  mastery: number;
  status: TopicStatus;
  attempts: number;
  last_seen: string | null;
  lesson_completed: boolean;
  explain_differently_count: number;
}

export interface AnswerRecord {
  topic: string;
  question: string;
  student_answer: string;
  correct_answer: string;
  correct: boolean;
  error_type: ErrorType;
  time_seconds: number;
  timestamp: string;
}

export interface WrongAnswer {
  id: string;
  topic: string;
  question: string;
  student_answer: string;
  correct_answer: string;
  error_type: string;
  explanation: string;
  timestamp: string;
  review_count: number;
  next_review_date: string;
  last_review_correct: boolean | null;
}

export interface SessionLog {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  time_of_day: "morning" | "afternoon" | "evening" | "night";
  module: "learn" | "practice" | "quiz" | "review";
  topic: string;
  questions_attempted: number;
  questions_correct: number;
  hints_used: number;
  explain_differently_used: number;
}

export interface StudentSettings {
  bilingual_mode: boolean;
  second_language: string | null;
  interface_language: string;
}

export interface LegacyTopicArchive {
  id: string;
  progress: TopicProgress;
  archived_at: string;
  reason: "unknown_id" | "renamed";
}

export interface StudentProfile {
  student_id: string;
  name: string;
  grade: string;
  language: "en" | "zh";
  current_unit: string;
  settings: StudentSettings;
  topics: Record<string, TopicProgress>;
  answer_history: AnswerRecord[];
  wrong_answers: WrongAnswer[];
  session_logs: SessionLog[];
  quiz_results: unknown[];
  total_study_time_minutes: number;
  streak_days: number;
  last_active_date: string;
  legacy_topics?: LegacyTopicArchive[];
  legacy_wrong_answers?: WrongAnswer[];
}

// ── Learn ──────────────────────────────────────────────

export interface LearnMessage {
  role: "beacon" | "student";
  content: string;
}

export interface LearnRequest {
  topicId: string;
  language: "en" | "zh";
  mastery: number;
  history: LearnMessage[];
}

// ── Practice ───────────────────────────────────────────

export interface QuizQuestion {
  question: string;
  correct_answer: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface GradeResult {
  correct: boolean;
  explanation: string;
  correct_answer: string;
  error_type: ErrorType;
}

export interface PracticeGenerateRequest {
  topicId: string;
  topicTitle: string;
  language: "en" | "zh";
  mastery: number;
}

export interface PracticeGradeRequest {
  topicId: string;
  topicTitle: string;
  language: "en" | "zh";
  question: string;
  correctAnswer: string;
  studentAnswer: string;
  timeSeconds: number;
}

// ── Ollama types ───────────────────────────────────────

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaStreamChunk {
  model: string;
  message: { role: string; content: string; thinking?: string };
  done: boolean;
}
