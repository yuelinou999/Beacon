/**
 * Math answer verifier — checks whether a numeric answer satisfies an
 * algebraic equation embedded in a problem string. Used as the source of
 * truth for grading numeric answers.
 *
 * The 5-phase Lesson generation pipeline (prompt builders, schema validators,
 * semantic verifiers) was retired in L4 along with /api/lesson and /api/learn,
 * leaving only this math-substitution check, which has lasting value beyond
 * the AI-generation flow.
 */

import { evaluate } from "mathjs";

export interface VerifierResult {
  passed: boolean;
  reason: string;
  severity: "ok" | "warn" | "fail";
}

/**
 * Strip leading verbs/phrases like "Solve:", "Solve for x:",
 * "Find x in:", "What is x in/when ...". Returns the core equation
 * string, or null if it can't be normalized to something with an "=".
 */
function normalizeProblemString(problem: string): string | null {
  let s = problem.trim();
  const verbStrip =
    /^(?:solve(?:\s+for\s+\w+)?|find\s+\w+\s+in|what\s+is\s+\w+\s+(?:when|in))\s*[:?]?\s*/i;
  s = s.replace(verbStrip, "");
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
 *   - severity:"fail" when sides disagree
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

  if (
    typeof lhsValue !== "number" ||
    typeof rhsValue !== "number" ||
    !Number.isFinite(lhsValue) ||
    !Number.isFinite(rhsValue)
  ) {
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
