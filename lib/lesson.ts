/**
 * Phase L2-pre — Lesson schema, prompt builders, schema validators, and
 * semantic verifiers for the planned 5-phase Lesson rework.
 *
 * Lib only — no API route, no UI, no calls into existing app/learn/* code.
 *
 * Design split (mirrors the portrait-validator pattern from D2b.5):
 *   - Schema validators throw LessonValidationError when required shape
 *     is wrong. They are deliberately strict.
 *   - Semantic verifiers return a VerifierResult and never throw. They
 *     check content correctness on top of valid shape: math sanity,
 *     explanation/option consistency, etc.
 *
 * The L1 spike empirically demonstrated that gemma4:e2b reliably emits
 * schema-valid JSON for these shapes (9/9 schema-valid). The verifiers
 * below catch the residual *content* drift that the schema cannot
 * (B1 explanation/correct_index inconsistency, C3 wrong final_answer).
 */

import { evaluate } from "mathjs";

// ── 1. Types ────────────────────────────────────────────────

export type LessonPhaseNumber = 1 | 2 | 3 | 4 | 5;
export type VisualHint = "balance_scale" | "number_line" | "grid" | "none";
export type GuidedInputType = "operation" | "number" | "answer";

export interface ConceptPhase {
  phase: 1;
  concept_name: string;
  explanation: string;
  key_idea: string;
  visual_hint: VisualHint;
}

export interface AnalogyPhase {
  phase: 2;
  scenario: string;
  question: string;
  options: [string, string, string];
  correct_index: 0 | 1 | 2;
  explanation: string;
}

export interface ExampleStep {
  action: string;
  result: string;
  explanation: string;
}

export interface ExamplePhase {
  phase: 3;
  problem: string;
  steps: ExampleStep[];
  final_answer: number;
}

export interface GuidedStep {
  sub_step: 1 | 2 | 3;
  instruction: string;
  expected_input_type: GuidedInputType;
  expected_value: string | number;
  hint: string;
}

export interface GuidedPhase {
  phase: 4;
  problem: string;
  steps: [GuidedStep, GuidedStep, GuidedStep];
  final_answer: number;
}

export interface IndependentQuestion {
  problem: string;
  final_answer: number;
}

export interface IndependentPhase {
  phase: 5;
  topic: string;
  questions: [IndependentQuestion, IndependentQuestion, IndependentQuestion];
}

export type LessonPhaseContent =
  | ConceptPhase
  | AnalogyPhase
  | ExamplePhase
  | GuidedPhase
  | IndependentPhase;

// ── 2. Errors ───────────────────────────────────────────────

export class LessonValidationError extends Error {
  constructor(public errors: string[], public rawContent?: string) {
    super(`Lesson schema invalid: ${errors.join("; ")}`);
    this.name = "LessonValidationError";
  }
}

// ── 3. Prompt builders ──────────────────────────────────────

const OUTPUT_PREAMBLE =
  "OUTPUT FORMAT — return ONLY a single JSON object. No prose before or " +
  "after. No markdown code fences. The object must conform exactly to the " +
  "schema below.";

export function buildConceptPrompt(topic: string): { system: string; user: string } {
  const system =
    "You are a curriculum content generator producing the OPENING 'concept' " +
    "phase of a math lesson. Your job: introduce the core idea in a way a " +
    "7th grader can grasp.\n\n" +
    OUTPUT_PREAMBLE +
    "\n\n" +
    "{\n" +
    '  "concept_name": string — short name like "Equations are about balance" (≤8 words),\n' +
    '  "explanation":  string — 2-3 sentences,\n' +
    '  "key_idea":     string — single sentence to highlight as a callout,\n' +
    '  "visual_hint":  one of "balance_scale" | "number_line" | "grid" | "none"\n' +
    "}\n\n" +
    "visual_hint MUST be exactly one of those four literal strings. Do not " +
    "invent new values. Return ONLY the JSON.";
  const user =
    `Topic: ${topic}\n\n` +
    "Generate the JSON object for the concept phase of this topic now.";
  return { system, user };
}

export function buildAnalogyPrompt(topic: string): { system: string; user: string } {
  const system =
    "You are a curriculum content generator producing an 'analogy' phase: " +
    "a real-life scenario plus a multiple-choice check question.\n\n" +
    OUTPUT_PREAMBLE +
    "\n\n" +
    "{\n" +
    '  "scenario":      string — a real-life analogy, 1-2 sentences,\n' +
    '  "question":      string — multiple-choice question text about the analogy,\n' +
    '  "options":       array of EXACTLY 3 strings — the three choices,\n' +
    '  "correct_index": integer 0, 1, or 2 — the index of the correct option,\n' +
    '  "explanation":   string — why this is the right answer\n' +
    "}\n\n" +
    "options MUST contain exactly 3 elements. correct_index MUST be an " +
    "integer 0, 1, or 2.\n\n" +
    "CRITICAL — explanation must describe the option at index correct_index. " +
    "Do not contradict yourself. Before responding, double-check that the " +
    "explanation refers to the SAME option you marked as correct.";
  const user =
    `Topic: ${topic}\n\n` +
    "Generate the JSON object for the analogy phase of this topic now.";
  return { system, user };
}

export function buildExamplePrompt(topic: string): { system: string; user: string } {
  const system =
    "You are a curriculum content generator producing an 'example' phase: " +
    "a fully worked solution shown to the student, step by step. The student " +
    "watches but does not answer at this phase.\n\n" +
    OUTPUT_PREAMBLE +
    "\n\n" +
    "{\n" +
    '  "problem":      string — the equation, e.g. "Solve: 2x + 5 = 15",\n' +
    '  "steps":        array of step objects (typically 2-4) — the worked solution in order,\n' +
    "    each step: {\n" +
    '      "action":      string — the operation taken, e.g. "Subtract 5 from both sides",\n' +
    '      "result":      string — the new equation after the action, e.g. "2x = 10",\n' +
    '      "explanation": string — one sentence on why this step works\n' +
    "    },\n" +
    '  "final_answer": number — the numeric value of x\n' +
    "}\n\n" +
    "CRITICAL — final_answer must be a number that, when substituted for x in " +
    "problem, makes the equation true. Verify your own arithmetic before " +
    "responding. Return ONLY the JSON.";
  const user =
    `Topic: ${topic}\n\n` +
    "Generate the JSON object for the example phase of this topic now.";
  return { system, user };
}

export function buildGuidedPrompt(
  topic: string,
  problemHint?: string,
): { system: string; user: string } {
  const system =
    "You are a curriculum content generator producing a 'guided' phase: " +
    "a single problem the student solves in three sub-steps where the " +
    "student supplies each sub-step's answer.\n\n" +
    OUTPUT_PREAMBLE +
    "\n\n" +
    "{\n" +
    '  "problem": string — like "Solve: x + 7 = 15",\n' +
    '  "steps":   array of EXACTLY 3 step objects with sub_step 1, 2, 3 in order:\n' +
    "    {\n" +
    '      "sub_step":            integer 1 | 2 | 3,\n' +
    '      "instruction":         string — what to ask the student at this sub-step,\n' +
    '      "expected_input_type": one of "operation" | "number" | "answer",\n' +
    '      "expected_value":      string or number — the correct response,\n' +
    '      "hint":                string — shown if the student gets it wrong\n' +
    "    },\n" +
    '  "final_answer": number — the numeric answer to the original problem\n' +
    "}\n\n" +
    "steps MUST have EXACTLY 3 entries with sub_step 1, 2, 3 in order. The " +
    "operation→number→answer narrative is preferred but not strict; what " +
    "matters is that final_answer mathematically solves problem.\n\n" +
    "CRITICAL — final_answer must be a number that, when substituted for x in " +
    "problem, makes the equation true. Verify your own arithmetic before " +
    "responding. Return ONLY the JSON.";
  const hint = problemHint
    ? `\n\nUse a problem similar to this one: ${problemHint}`
    : "";
  const user =
    `Topic: ${topic}${hint}\n\n` +
    "Generate the JSON object for the guided phase of this topic now.";
  return { system, user };
}

export function buildIndependentPrompt(
  topic: string,
  count: number = 3,
): { system: string; user: string } {
  const n = count === 3 ? 3 : 3; // schema is fixed at 3 questions
  const system =
    "You are a curriculum content generator producing an 'independent' " +
    "phase: a small set of standalone problems the student solves with no " +
    "scaffolding.\n\n" +
    OUTPUT_PREAMBLE +
    "\n\n" +
    "{\n" +
    '  "topic":     string — the topic name,\n' +
    `  "questions": array of EXACTLY ${n} objects, each shaped:\n` +
    "    {\n" +
    '      "problem":      string — the equation,\n' +
    '      "final_answer": number — the numeric answer\n' +
    "    }\n" +
    "}\n\n" +
    `questions MUST contain exactly ${n} elements.\n\n` +
    "CRITICAL — for each question, final_answer must be a number that, when " +
    "substituted for x in problem, makes the equation true. Verify your own " +
    "arithmetic before responding. Return ONLY the JSON.";
  const user =
    `Topic: ${topic}\n\n` +
    "Generate the JSON object for the independent phase of this topic now.";
  return { system, user };
}

// ── 4. Schema validators ────────────────────────────────────

const VALID_VISUAL_HINTS: VisualHint[] = ["balance_scale", "number_line", "grid", "none"];
const VALID_INPUT_TYPES: GuidedInputType[] = ["operation", "number", "answer"];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isStr(v: unknown): v is string {
  return typeof v === "string";
}
function isNonEmptyStr(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}
function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function validateConceptPhase(obj: unknown): ConceptPhase {
  const errors: string[] = [];
  if (!isObj(obj)) throw new LessonValidationError(["root is not an object"]);
  if (obj.phase !== 1) errors.push(`phase must be 1 (got ${JSON.stringify(obj.phase)})`);
  if (!isNonEmptyStr(obj.concept_name)) errors.push("concept_name missing or not non-empty string");
  if (!isNonEmptyStr(obj.explanation)) errors.push("explanation missing or not non-empty string");
  if (!isNonEmptyStr(obj.key_idea)) errors.push("key_idea missing or not non-empty string");
  if (!isStr(obj.visual_hint) || !VALID_VISUAL_HINTS.includes(obj.visual_hint as VisualHint)) {
    errors.push(`visual_hint not in enum (got ${JSON.stringify(obj.visual_hint)})`);
  }
  if (errors.length > 0) throw new LessonValidationError(errors);
  return obj as unknown as ConceptPhase;
}

export function validateAnalogyPhase(obj: unknown): AnalogyPhase {
  const errors: string[] = [];
  if (!isObj(obj)) throw new LessonValidationError(["root is not an object"]);
  if (obj.phase !== 2) errors.push(`phase must be 2 (got ${JSON.stringify(obj.phase)})`);
  if (!isNonEmptyStr(obj.scenario)) errors.push("scenario missing or not non-empty string");
  if (!isNonEmptyStr(obj.question)) errors.push("question missing or not non-empty string");
  if (!isNonEmptyStr(obj.explanation)) errors.push("explanation missing or not non-empty string");

  if (!Array.isArray(obj.options)) {
    errors.push("options missing or not an array");
  } else {
    if (obj.options.length !== 3) {
      errors.push(`options.length must be 3 (got ${obj.options.length})`);
    }
    obj.options.forEach((o, i) => {
      if (!isStr(o)) errors.push(`options[${i}] not a string`);
    });
  }

  if (!isInt(obj.correct_index) || (obj.correct_index as number) < 0 || (obj.correct_index as number) > 2) {
    errors.push(`correct_index must be integer 0|1|2 (got ${JSON.stringify(obj.correct_index)})`);
  }

  if (errors.length > 0) throw new LessonValidationError(errors);
  return obj as unknown as AnalogyPhase;
}

export function validateExamplePhase(obj: unknown): ExamplePhase {
  const errors: string[] = [];
  if (!isObj(obj)) throw new LessonValidationError(["root is not an object"]);
  if (obj.phase !== 3) errors.push(`phase must be 3 (got ${JSON.stringify(obj.phase)})`);
  if (!isNonEmptyStr(obj.problem)) errors.push("problem missing or not non-empty string");
  if (!isFiniteNum(obj.final_answer)) {
    errors.push(`final_answer must be finite number (got ${JSON.stringify(obj.final_answer)})`);
  }

  if (!Array.isArray(obj.steps)) {
    errors.push("steps missing or not an array");
  } else {
    if (obj.steps.length < 1) {
      errors.push(`steps must have at least 1 entry (got ${obj.steps.length})`);
    }
    obj.steps.forEach((s, i) => {
      const prefix = `steps[${i}]`;
      if (!isObj(s)) {
        errors.push(`${prefix} not an object`);
        return;
      }
      if (!isNonEmptyStr(s.action)) errors.push(`${prefix}.action missing or not non-empty string`);
      if (!isNonEmptyStr(s.result)) errors.push(`${prefix}.result missing or not non-empty string`);
      if (!isNonEmptyStr(s.explanation)) errors.push(`${prefix}.explanation missing or not non-empty string`);
    });
  }

  if (errors.length > 0) throw new LessonValidationError(errors);
  return obj as unknown as ExamplePhase;
}

export function validateGuidedPhase(obj: unknown): GuidedPhase {
  const errors: string[] = [];
  if (!isObj(obj)) throw new LessonValidationError(["root is not an object"]);
  if (obj.phase !== 4) errors.push(`phase must be 4 (got ${JSON.stringify(obj.phase)})`);
  if (!isNonEmptyStr(obj.problem)) errors.push("problem missing or not non-empty string");
  if (!isFiniteNum(obj.final_answer)) {
    errors.push(`final_answer must be finite number (got ${JSON.stringify(obj.final_answer)})`);
  }

  if (!Array.isArray(obj.steps)) {
    errors.push("steps missing or not an array");
  } else {
    if (obj.steps.length !== 3) {
      errors.push(`steps must have exactly 3 entries (got ${obj.steps.length})`);
    }
    obj.steps.forEach((s, i) => {
      const prefix = `steps[${i}]`;
      if (!isObj(s)) {
        errors.push(`${prefix} not an object`);
        return;
      }
      if (!isInt(s.sub_step) || (s.sub_step as number) < 1 || (s.sub_step as number) > 3) {
        errors.push(`${prefix}.sub_step must be integer 1|2|3 (got ${JSON.stringify(s.sub_step)})`);
      }
      if (!isNonEmptyStr(s.instruction)) errors.push(`${prefix}.instruction missing or not non-empty string`);
      if (!isStr(s.expected_input_type) || !VALID_INPUT_TYPES.includes(s.expected_input_type as GuidedInputType)) {
        errors.push(`${prefix}.expected_input_type not in enum (got ${JSON.stringify(s.expected_input_type)})`);
      }
      if (typeof s.expected_value !== "string" && typeof s.expected_value !== "number") {
        errors.push(`${prefix}.expected_value must be string or number`);
      }
      if (!isNonEmptyStr(s.hint)) errors.push(`${prefix}.hint missing or not non-empty string`);
    });
  }

  if (errors.length > 0) throw new LessonValidationError(errors);
  return obj as unknown as GuidedPhase;
}

export function validateIndependentPhase(obj: unknown): IndependentPhase {
  const errors: string[] = [];
  if (!isObj(obj)) throw new LessonValidationError(["root is not an object"]);
  if (obj.phase !== 5) errors.push(`phase must be 5 (got ${JSON.stringify(obj.phase)})`);
  if (!isNonEmptyStr(obj.topic)) errors.push("topic missing or not non-empty string");

  if (!Array.isArray(obj.questions)) {
    errors.push("questions missing or not an array");
  } else {
    if (obj.questions.length !== 3) {
      errors.push(`questions must have exactly 3 entries (got ${obj.questions.length})`);
    }
    obj.questions.forEach((q, i) => {
      const prefix = `questions[${i}]`;
      if (!isObj(q)) {
        errors.push(`${prefix} not an object`);
        return;
      }
      if (!isNonEmptyStr(q.problem)) errors.push(`${prefix}.problem missing or not non-empty string`);
      if (!isFiniteNum(q.final_answer)) {
        errors.push(`${prefix}.final_answer must be finite number (got ${JSON.stringify(q.final_answer)})`);
      }
    });
  }

  if (errors.length > 0) throw new LessonValidationError(errors);
  return obj as unknown as IndependentPhase;
}

// ── 5. Semantic verifiers ───────────────────────────────────

export interface VerifierResult {
  passed: boolean;
  reason: string;
  severity: "ok" | "warn" | "fail";
}

/**
 * Concept has no semantic claim a static verifier can check.
 */
export function verifyConceptSemantics(_phase: ConceptPhase): VerifierResult {
  return { passed: true, reason: "", severity: "ok" };
}

/**
 * Heuristic check: explanation should contain a recognizable fragment
 * of options[correct_index]. We compare the first ≤4 whitespace-tokens
 * of the marked option against a normalized form of the explanation.
 *
 * This is intentionally lightweight. It catches the common drift mode
 * (model says correct_index=N but explanation argues for option M) and
 * issues a "warn", not "fail", because a real semantic check requires
 * a Gemma re-call.
 */
export function verifyAnalogySemantics(phase: AnalogyPhase): VerifierResult {
  const correctOption = phase.options[phase.correct_index];
  if (!correctOption) {
    return {
      passed: false,
      reason: `No option found at correct_index=${phase.correct_index}`,
      severity: "fail",
    };
  }

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const optionTokens = norm(correctOption).split(" ");
  const fragmentTokens = optionTokens.slice(0, Math.min(4, optionTokens.length));
  const fragment = fragmentTokens.join(" ");
  const explanationNorm = norm(phase.explanation);

  if (fragment.length === 0) {
    return {
      passed: false,
      reason: "options[correct_index] is empty after normalization",
      severity: "warn",
    };
  }

  if (explanationNorm.includes(fragment)) {
    return { passed: true, reason: "", severity: "ok" };
  }

  return {
    passed: false,
    reason:
      `explanation may not describe the marked correct option ` +
      `(correct_index=${phase.correct_index}, fragment ${JSON.stringify(fragment)} ` +
      `not found in explanation)`,
    severity: "warn",
  };
}

/**
 * Strip leading verbs/phrases like "Solve:", "Solve for x:",
 * "Find x in:", "What is x in/when ...". Returns the core equation
 * string, or null if it can't be normalized to something with an "=".
 */
function normalizeProblemString(problem: string): string | null {
  let s = problem.trim();
  // Strip common verb prefixes (case-insensitive)
  const verbStrip =
    /^(?:solve(?:\s+for\s+\w+)?|find\s+\w+\s+in|what\s+is\s+\w+\s+(?:when|in))\s*[:?]?\s*/i;
  s = s.replace(verbStrip, "");
  // Strip trailing punctuation that the model leaves behind
  s = s.replace(/[.?!]+\s*$/, "").trim();
  if (!s.includes("=")) return null;
  return s;
}

/**
 * Insert "*" between any digit followed immediately by a letter so that
 * "2x" becomes "2*x", which mathjs.evaluate can parse.
 */
function injectImplicitMul(expr: string): string {
  return expr.replace(/(\d)([a-zA-Z])/g, "$1*$2");
}

/**
 * Verify that finalAnswer is a valid solution of the algebraic equation
 * embedded in problem. Uses mathjs.evaluate on each side of '='.
 *
 * Returns:
 *   - severity:"ok"   when both sides agree within 1e-9
 *   - severity:"fail" when sides disagree (the L1-C3 case)
 *   - severity:"warn" when the problem string can't be parsed at all
 *     (we can't auto-verify, so we don't fail loudly)
 */
export function verifyMathAnswer(
  problem: string,
  finalAnswer: number,
): VerifierResult {
  const normalized = normalizeProblemString(problem);
  if (!normalized) {
    return {
      passed: false,
      reason: `Could not parse problem as algebraic equation: ${JSON.stringify(problem)}`,
      severity: "warn",
    };
  }

  const eqIdx = normalized.indexOf("=");
  if (eqIdx === -1 || eqIdx === 0 || eqIdx === normalized.length - 1) {
    return {
      passed: false,
      reason: `Could not split problem on '=': ${JSON.stringify(normalized)}`,
      severity: "warn",
    };
  }

  const lhsRaw = normalized.slice(0, eqIdx).trim();
  const rhsRaw = normalized.slice(eqIdx + 1).trim();
  const lhs = injectImplicitMul(lhsRaw);
  const rhs = injectImplicitMul(rhsRaw);

  let lhsValue: unknown;
  let rhsValue: unknown;
  try {
    lhsValue = evaluate(lhs, { x: finalAnswer });
    rhsValue = evaluate(rhs, { x: finalAnswer });
  } catch (err) {
    return {
      passed: false,
      reason: `mathjs failed to evaluate (${err instanceof Error ? err.message : String(err)})`,
      severity: "warn",
    };
  }

  if (typeof lhsValue !== "number" || typeof rhsValue !== "number" ||
      !Number.isFinite(lhsValue) || !Number.isFinite(rhsValue)) {
    return {
      passed: false,
      reason: `Non-numeric evaluation result (lhs=${JSON.stringify(lhsValue)}, rhs=${JSON.stringify(rhsValue)})`,
      severity: "warn",
    };
  }

  if (Math.abs(lhsValue - rhsValue) < 1e-9) {
    return { passed: true, reason: "", severity: "ok" };
  }

  return {
    passed: false,
    reason:
      `Substituting x=${finalAnswer} into ${JSON.stringify(problem)} ` +
      `gives ${lhsValue} != ${rhsValue}`,
    severity: "fail",
  };
}

export function verifyExamplePhase(phase: ExamplePhase): VerifierResult {
  return verifyMathAnswer(phase.problem, phase.final_answer);
}

export function verifyGuidedPhase(phase: GuidedPhase): VerifierResult {
  return verifyMathAnswer(phase.problem, phase.final_answer);
}

export function verifyIndependentPhase(phase: IndependentPhase): VerifierResult {
  for (let i = 0; i < phase.questions.length; i++) {
    const q = phase.questions[i];
    const r = verifyMathAnswer(q.problem, q.final_answer);
    if (r.severity === "fail") {
      return {
        passed: false,
        reason: `Question ${i + 1}: ${r.reason}`,
        severity: "fail",
      };
    }
    if (r.severity === "warn" && r.reason) {
      // Surface the first warn but keep checking remaining questions for fails.
      // If no later question fails, the warn becomes the aggregate verdict.
      let firstWarn: VerifierResult = r;
      for (let j = i + 1; j < phase.questions.length; j++) {
        const next = verifyMathAnswer(phase.questions[j].problem, phase.questions[j].final_answer);
        if (next.severity === "fail") {
          return {
            passed: false,
            reason: `Question ${j + 1}: ${next.reason}`,
            severity: "fail",
          };
        }
      }
      firstWarn = {
        passed: false,
        reason: `Question ${i + 1}: ${r.reason}`,
        severity: "warn",
      };
      return firstWarn;
    }
  }
  return { passed: true, reason: "", severity: "ok" };
}

// ── 6. Single dispatcher ────────────────────────────────────

export function verifyPhase(phase: LessonPhaseContent): VerifierResult {
  switch (phase.phase) {
    case 1:
      return verifyConceptSemantics(phase);
    case 2:
      return verifyAnalogySemantics(phase);
    case 3:
      return verifyExamplePhase(phase);
    case 4:
      return verifyGuidedPhase(phase);
    case 5:
      return verifyIndependentPhase(phase);
  }
}
