/**
 * L2-pre verifier replay — replays the L1 spike artifacts through the
 * new schema validators + semantic verifiers in lib/lesson.ts. No new
 * Gemma calls; reads scripts/spike-output/lesson/experiment-*-raw.json
 * directly.
 *
 * Expected outcome (matching the L1 spike's known good/bad runs):
 *   A1 A2 A3   schema=PASS  semantic=ok       (concept verifier is trivial)
 *   B1         schema=PASS  semantic=warn     (explanation/option mismatch)
 *   B2 B3      schema=PASS  semantic=ok
 *   C1 C2      schema=PASS  semantic=ok       (math checks out)
 *   C3         schema=PASS  semantic=fail     (final_answer 2.5 wrong for 2x+5=15)
 *
 * Exits non-zero if the actual outcome diverges.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  validateConceptPhase,
  validateAnalogyPhase,
  validateGuidedPhase,
  verifyPhase,
  LessonValidationError,
  type LessonPhaseContent,
  type VerifierResult,
} from "@/lib/lesson";

const REPO_ROOT = path.resolve(__dirname, "..");
const ARTIFACT_DIR = path.join(REPO_ROOT, "scripts", "spike-output", "lesson");

interface ReplayCase {
  experiment: "A" | "B" | "C";
  run: 1 | 2 | 3;
  phase: 1 | 2 | 4;
  expectedSeverity: "ok" | "warn" | "fail";
}

const CASES: ReplayCase[] = [
  { experiment: "A", run: 1, phase: 1, expectedSeverity: "ok" },
  { experiment: "A", run: 2, phase: 1, expectedSeverity: "ok" },
  { experiment: "A", run: 3, phase: 1, expectedSeverity: "ok" },
  { experiment: "B", run: 1, phase: 2, expectedSeverity: "warn" },
  { experiment: "B", run: 2, phase: 2, expectedSeverity: "ok" },
  { experiment: "B", run: 3, phase: 2, expectedSeverity: "ok" },
  { experiment: "C", run: 1, phase: 4, expectedSeverity: "ok" },
  { experiment: "C", run: 2, phase: 4, expectedSeverity: "ok" },
  { experiment: "C", run: 3, phase: 4, expectedSeverity: "fail" },
];

function stripCodeFence(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    const firstNewline = t.indexOf("\n");
    if (firstNewline !== -1) t = t.slice(firstNewline + 1);
    if (t.endsWith("```")) t = t.slice(0, -3);
    t = t.trim();
  }
  return t;
}

function tagPhase(parsed: Record<string, unknown>, phase: 1 | 2 | 4): unknown {
  return { ...parsed, phase };
}

interface RowReport {
  label: string;
  schema: "pass" | "fail";
  schemaError?: string;
  semantic?: VerifierResult;
  expected: "ok" | "warn" | "fail";
  outcome: "match" | "mismatch";
}

async function processCase(c: ReplayCase): Promise<RowReport> {
  const label = `${c.experiment}${c.run}`;
  const file = path.join(
    ARTIFACT_DIR,
    `experiment-${c.experiment}-run-${c.run}-raw.json`,
  );
  const raw = JSON.parse(await fs.readFile(file, "utf8")) as {
    message?: { content?: string };
  };
  const content = stripCodeFence(raw.message?.content ?? "");
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const tagged = tagPhase(parsed, c.phase);

  let validated: LessonPhaseContent | null = null;
  let schemaError: string | undefined;
  try {
    if (c.phase === 1) validated = validateConceptPhase(tagged);
    else if (c.phase === 2) validated = validateAnalogyPhase(tagged);
    else if (c.phase === 4) validated = validateGuidedPhase(tagged);
  } catch (e) {
    schemaError =
      e instanceof LessonValidationError
        ? e.errors.join("; ")
        : e instanceof Error
          ? e.message
          : String(e);
  }

  if (!validated) {
    return {
      label,
      schema: "fail",
      schemaError,
      expected: c.expectedSeverity,
      outcome: "mismatch",
    };
  }

  const sem = verifyPhase(validated);
  const outcome = sem.severity === c.expectedSeverity ? "match" : "mismatch";

  return {
    label,
    schema: "pass",
    semantic: sem,
    expected: c.expectedSeverity,
    outcome,
  };
}

function formatRow(r: RowReport): string {
  if (r.schema === "fail") {
    return `Experiment ${r.label}: schema=FAIL  reason=${r.schemaError}  expected=${r.expected}  [MISMATCH]`;
  }
  const sev = r.semantic?.severity ?? "?";
  const reason = r.semantic?.reason ? ` reason="${r.semantic.reason}"` : "";
  const tag = r.outcome === "match" ? "MATCH" : "MISMATCH";
  return `Experiment ${r.label}: schema=pass  semantic=${sev.padEnd(4)} expected=${r.expected.padEnd(4)} [${tag}]${reason}`;
}

async function main(): Promise<void> {
  const rows: RowReport[] = [];
  for (const c of CASES) {
    rows.push(await processCase(c));
  }

  const lines: string[] = [];
  lines.push("=== L2-pre verifier replay ===");
  lines.push("");
  for (const r of rows) lines.push(formatRow(r));
  lines.push("");

  const matches = rows.filter((r) => r.outcome === "match").length;
  const mismatches = rows.length - matches;
  const oks = rows.filter((r) => r.semantic?.severity === "ok").length;
  const warns = rows.filter((r) => r.semantic?.severity === "warn").length;
  const fails = rows.filter((r) => r.semantic?.severity === "fail").length;

  lines.push(`Counts: ${oks} ok, ${warns} warn, ${fails} fail (expected: 7 ok, 1 warn, 1 fail)`);
  lines.push(`Matches: ${matches}/${rows.length}`);

  const output = lines.join("\n") + "\n";
  process.stdout.write(output);

  await fs.writeFile(
    path.join(ARTIFACT_DIR, "verifier-replay-results.txt"),
    output,
  );

  if (mismatches > 0) {
    process.stderr.write(`\n${mismatches} case(s) did not match expected severity.\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(
    `Replay error: ${err instanceof Error ? err.stack : String(err)}\n`,
  );
  process.exit(1);
});
