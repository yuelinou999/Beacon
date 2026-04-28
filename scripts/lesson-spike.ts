/**
 * Phase L1 — Schema-fidelity SPIKE for the planned 5-phase Lesson rework.
 *
 * Three experiments × three runs each. Each experiment asks gemma4:e2b
 * to emit a strict JSON schema for one phase shape:
 *   A — Phase 1 Concept
 *   B — Phase 2 Analogy (multiple choice)
 *   C — Phase 4 Guided (multi-step solve)
 *
 * Direct fetch to http://localhost:11434/api/chat, stream:false, model
 * hardcoded to "gemma4:e2b". Every run's request, raw response, and
 * derived summary land in scripts/spike-output/lesson/.
 *
 * No production code is touched. No retries within a run.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "gemma4:e2b"; // hardcoded — do not read from config
const TOPIC = "linear_equations_basic";
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "scripts", "spike-output", "lesson");
const RUNS_PER_EXPERIMENT = 3;

type ExperimentLabel = "A" | "B" | "C";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface OllamaRequest {
  model: string;
  messages: ChatMessage[];
  stream: false;
}

interface RawOllamaResponse {
  model?: string;
  message?: {
    role?: string;
    content?: string;
    thinking?: string;
  };
  // ...other fields not relevant to schema validation
}

interface RunResult {
  experiment: ExperimentLabel;
  runIndex: number;
  durationSec: number;
  ok: boolean;
  rawResponse?: RawOllamaResponse;
  errorText?: string;
}

interface ValidationOutcome {
  parseOk: boolean;
  schemaOk: boolean;
  reasons: string[];
  parsed?: unknown;
}

// ── Prompts ────────────────────────────────────────────────

function buildPromptA(): { system: string; user: string } {
  const system =
    "You are a curriculum content generator. You will produce ONE structured " +
    "JSON object describing the opening 'concept' phase of a math lesson.\n\n" +
    "OUTPUT FORMAT — return ONLY a single JSON object. No prose before or " +
    "after. No markdown code fences. The object must conform exactly to this " +
    "schema:\n\n" +
    "{\n" +
    '  "concept_name": string — short name like "Equations are about balance" (≤8 words),\n' +
    '  "explanation":  string — 2-3 sentences,\n' +
    '  "key_idea":     string — single sentence to highlight as a callout,\n' +
    '  "visual_hint":  one of "balance_scale" | "number_line" | "grid" | "none"\n' +
    "}\n\n" +
    "visual_hint MUST be exactly one of those four literal strings. Do not " +
    "invent new values. Return ONLY the JSON.";
  const user =
    `Topic: ${TOPIC}\n\n` +
    "Generate the JSON object for the concept phase of this topic now.";
  return { system, user };
}

function buildPromptB(): { system: string; user: string } {
  const system =
    "You are a curriculum content generator. You will produce ONE structured " +
    "JSON object describing an 'analogy' phase: a real-life scenario plus a " +
    "multiple-choice check question.\n\n" +
    "OUTPUT FORMAT — return ONLY a single JSON object. No prose before or " +
    "after. No markdown code fences. The object must conform exactly to this " +
    "schema:\n\n" +
    "{\n" +
    '  "scenario":      string — a real-life analogy, 1-2 sentences,\n' +
    '  "question":      string — multiple choice question text about the analogy,\n' +
    '  "options":       array of EXACTLY 3 strings — the choices,\n' +
    '  "correct_index": integer 0, 1, or 2 — the index of the correct option,\n' +
    '  "explanation":   string — why this is the right answer\n' +
    "}\n\n" +
    "options MUST contain exactly 3 elements. correct_index MUST be an " +
    "integer 0, 1, or 2. Return ONLY the JSON.";
  const user =
    `Topic: ${TOPIC}\n\n` +
    "Generate the JSON object for the analogy phase of this topic now.";
  return { system, user };
}

function buildPromptC(): { system: string; user: string } {
  const system =
    "You are a curriculum content generator. You will produce ONE structured " +
    "JSON object describing a 'guided' phase: a single problem the student " +
    "solves in three sub-steps.\n\n" +
    "OUTPUT FORMAT — return ONLY a single JSON object. No prose before or " +
    "after. No markdown code fences. The object must conform exactly to this " +
    "schema:\n\n" +
    "{\n" +
    '  "problem": string — like "Solve: x + 7 = 15",\n' +
    '  "steps":   array of EXACTLY 3 objects, each shaped:\n' +
    "    {\n" +
    '      "sub_step":            integer 1, 2, or 3 (in order),\n' +
    '      "instruction":         string — what to ask the student at this sub-step,\n' +
    '      "expected_input_type": one of "operation" | "number" | "answer",\n' +
    '      "expected_value":      string or number — the correct response,\n' +
    '      "hint":                string — shown if the student gets it wrong\n' +
    "    },\n" +
    '  "final_answer": number — the numeric answer to the original problem\n' +
    "}\n\n" +
    "The steps array MUST contain exactly 3 elements. Sub-steps should follow " +
    'the pattern operation → number → answer (e.g. "What operation undoes ' +
    'addition?" → "Subtract 7 from both sides — what is 15 - 7?" → "What ' +
    'is x?"). expected_input_type MUST be one of those three literal strings. ' +
    "Return ONLY the JSON.";
  const user =
    `Topic: ${TOPIC}\n\n` +
    "Generate the JSON object for the guided phase of this topic now.";
  return { system, user };
}

// ── Validators ─────────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isStr(v: unknown): v is string {
  return typeof v === "string";
}
function isNonEmptyStr(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

const VALID_VISUAL_HINTS = ["balance_scale", "number_line", "grid", "none"];
const VALID_INPUT_TYPES = ["operation", "number", "answer"];

function validateA(parsed: unknown): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!isObj(parsed)) {
    return { ok: false, reasons: ["root is not an object"] };
  }
  if (!isNonEmptyStr(parsed.concept_name)) reasons.push("concept_name missing or not non-empty string");
  if (!isNonEmptyStr(parsed.explanation)) reasons.push("explanation missing or not non-empty string");
  if (!isNonEmptyStr(parsed.key_idea)) reasons.push("key_idea missing or not non-empty string");
  if (!isStr(parsed.visual_hint)) {
    reasons.push("visual_hint missing or not string");
  } else if (!VALID_VISUAL_HINTS.includes(parsed.visual_hint)) {
    reasons.push(`visual_hint not in enum (got ${JSON.stringify(parsed.visual_hint)})`);
  }
  return { ok: reasons.length === 0, reasons };
}

function validateB(parsed: unknown): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!isObj(parsed)) {
    return { ok: false, reasons: ["root is not an object"] };
  }
  if (!isNonEmptyStr(parsed.scenario)) reasons.push("scenario missing or not non-empty string");
  if (!isNonEmptyStr(parsed.question)) reasons.push("question missing or not non-empty string");
  if (!isNonEmptyStr(parsed.explanation)) reasons.push("explanation missing or not non-empty string");

  const opts = parsed.options;
  if (!Array.isArray(opts)) {
    reasons.push("options missing or not an array");
  } else {
    if (opts.length !== 3) {
      reasons.push(`options.length === ${opts.length}, expected 3`);
    }
    opts.forEach((o, i) => {
      if (!isStr(o)) reasons.push(`options[${i}] not a string`);
    });
  }

  const ci = parsed.correct_index;
  if (typeof ci !== "number" || !Number.isInteger(ci)) {
    reasons.push(`correct_index missing or not integer (got ${JSON.stringify(ci)})`);
  } else if (ci < 0 || ci > 2) {
    reasons.push(`correct_index out of range [0,2] (got ${ci})`);
  }

  return { ok: reasons.length === 0, reasons };
}

function validateC(parsed: unknown): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!isObj(parsed)) {
    return { ok: false, reasons: ["root is not an object"] };
  }
  if (!isNonEmptyStr(parsed.problem)) reasons.push("problem missing or not non-empty string");
  if (typeof parsed.final_answer !== "number" || !Number.isFinite(parsed.final_answer)) {
    reasons.push(`final_answer missing or not number (got ${JSON.stringify(parsed.final_answer)})`);
  }

  const steps = parsed.steps;
  if (!Array.isArray(steps)) {
    reasons.push("steps missing or not an array");
  } else {
    if (steps.length !== 3) {
      reasons.push(`steps.length === ${steps.length}, expected 3`);
    }
    steps.forEach((s, i) => {
      const prefix = `steps[${i}]`;
      if (!isObj(s)) {
        reasons.push(`${prefix} not an object`);
        return;
      }
      const sub = s.sub_step;
      if (typeof sub !== "number" || !Number.isInteger(sub)) {
        reasons.push(`${prefix}.sub_step missing or not integer (got ${JSON.stringify(sub)})`);
      } else if (sub < 1 || sub > 3) {
        reasons.push(`${prefix}.sub_step out of range [1,3] (got ${sub})`);
      }
      if (!isNonEmptyStr(s.instruction)) reasons.push(`${prefix}.instruction missing or not non-empty string`);
      if (!isStr(s.expected_input_type)) {
        reasons.push(`${prefix}.expected_input_type missing or not string`);
      } else if (!VALID_INPUT_TYPES.includes(s.expected_input_type)) {
        reasons.push(
          `${prefix}.expected_input_type not in enum (got ${JSON.stringify(s.expected_input_type)})`,
        );
      }
      const ev = s.expected_value;
      if (typeof ev !== "string" && typeof ev !== "number") {
        reasons.push(`${prefix}.expected_value missing or not string|number (got ${typeof ev})`);
      }
      if (!isNonEmptyStr(s.hint)) reasons.push(`${prefix}.hint missing or not non-empty string`);
    });
  }

  return { ok: reasons.length === 0, reasons };
}

const VALIDATORS: Record<
  ExperimentLabel,
  (p: unknown) => { ok: boolean; reasons: string[] }
> = {
  A: validateA,
  B: validateB,
  C: validateC,
};

const PROMPT_BUILDERS: Record<
  ExperimentLabel,
  () => { system: string; user: string }
> = {
  A: buildPromptA,
  B: buildPromptB,
  C: buildPromptC,
};

// ── Parsing helpers ────────────────────────────────────────

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

function tryParse(text: string): { ok: boolean; value?: unknown; err?: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : String(e) };
  }
}

// ── Run / persist ──────────────────────────────────────────

async function runOnce(
  label: ExperimentLabel,
  runIndex: number,
  request: OllamaRequest,
): Promise<RunResult> {
  const start = Date.now();
  try {
    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        experiment: label,
        runIndex,
        durationSec: (Date.now() - start) / 1000,
        ok: false,
        errorText: `HTTP ${res.status}: ${text}`,
      };
    }
    const raw = (await res.json()) as RawOllamaResponse;
    return {
      experiment: label,
      runIndex,
      durationSec: (Date.now() - start) / 1000,
      ok: true,
      rawResponse: raw,
    };
  } catch (err) {
    return {
      experiment: label,
      runIndex,
      durationSec: (Date.now() - start) / 1000,
      ok: false,
      errorText: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}

function summarize(
  result: RunResult,
  validation: ValidationOutcome,
): string {
  const lines: string[] = [];
  lines.push(`Experiment ${result.experiment} run ${result.runIndex}`);
  lines.push(`status: ${result.ok ? "request OK" : "request FAILED"}`);
  lines.push(`duration_sec: ${result.durationSec.toFixed(2)}`);
  lines.push(`model_returned: ${result.rawResponse?.model ?? "<missing>"}`);

  if (!result.ok) {
    lines.push(`error: ${result.errorText ?? "<none>"}`);
    return lines.join("\n") + "\n";
  }

  const content = result.rawResponse?.message?.content ?? "";
  lines.push(`content_length: ${content.length}`);
  lines.push(`parse_ok: ${validation.parseOk}`);
  lines.push(`schema_ok: ${validation.schemaOk}`);
  lines.push(`overall: ${validation.parseOk && validation.schemaOk ? "PASS" : "FAIL"}`);

  if (!validation.parseOk) {
    lines.push("");
    lines.push("--- raw content (first 300 chars) ---");
    lines.push(content.slice(0, 300));
    lines.push("--- end raw content ---");
  } else if (!validation.schemaOk) {
    lines.push("");
    lines.push("validation reasons:");
    for (const r of validation.reasons) lines.push(`  - ${r}`);
    lines.push("");
    lines.push("parsed value:");
    lines.push(JSON.stringify(validation.parsed, null, 2));
  } else {
    lines.push("");
    lines.push("parsed value:");
    lines.push(JSON.stringify(validation.parsed, null, 2));
  }

  return lines.join("\n") + "\n";
}

async function persistRun(
  result: RunResult,
  validation: ValidationOutcome,
): Promise<void> {
  const base = path.join(OUT_DIR, `experiment-${result.experiment}-run-${result.runIndex}`);

  if (!result.ok) {
    const failPath = `${base}-FAILURE.md`;
    const body = [
      `# Experiment ${result.experiment} run ${result.runIndex} — request FAILURE`,
      "",
      `Duration before failure: ${result.durationSec.toFixed(2)}s`,
      "",
      "```",
      result.errorText ?? "<no error text>",
      "```",
      "",
    ].join("\n");
    await fs.writeFile(failPath, body);
    return;
  }

  await fs.writeFile(
    `${base}-raw.json`,
    JSON.stringify(result.rawResponse, null, 2) + "\n",
  );
  await fs.writeFile(`${base}-summary.txt`, summarize(result, validation));
}

interface ExperimentSummary {
  label: ExperimentLabel;
  runs: Array<{
    runIndex: number;
    requestOk: boolean;
    parseOk: boolean;
    schemaOk: boolean;
    reasons: string[];
    durationSec: number;
  }>;
}

async function runExperiment(label: ExperimentLabel): Promise<ExperimentSummary> {
  const { system, user } = PROMPT_BUILDERS[label]();
  const promptText = `=== SYSTEM ===\n${system}\n\n=== USER ===\n${user}\n`;
  await fs.writeFile(path.join(OUT_DIR, `experiment-${label}-prompt.txt`), promptText);

  const summary: ExperimentSummary = { label, runs: [] };

  for (let i = 1; i <= RUNS_PER_EXPERIMENT; i++) {
    process.stdout.write(`\n[Experiment ${label}] run ${i}/${RUNS_PER_EXPERIMENT} ...\n`);
    const request: OllamaRequest = {
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      stream: false,
    };
    const result = await runOnce(label, i, request);

    let validation: ValidationOutcome = {
      parseOk: false,
      schemaOk: false,
      reasons: [],
    };

    if (result.ok) {
      const content = result.rawResponse?.message?.content ?? "";
      const cleaned = stripCodeFence(content);
      const parsed = tryParse(cleaned);
      if (!parsed.ok) {
        validation = {
          parseOk: false,
          schemaOk: false,
          reasons: [`JSON.parse failed: ${parsed.err}`],
        };
      } else {
        const v = VALIDATORS[label](parsed.value);
        validation = {
          parseOk: true,
          schemaOk: v.ok,
          reasons: v.reasons,
          parsed: parsed.value,
        };
      }
    }

    await persistRun(result, validation);

    summary.runs.push({
      runIndex: i,
      requestOk: result.ok,
      parseOk: validation.parseOk,
      schemaOk: validation.schemaOk,
      reasons: validation.reasons,
      durationSec: result.durationSec,
    });

    process.stdout.write(
      `[Experiment ${label}] run ${i}: ${result.ok ? "request OK" : "request FAIL"}, ` +
        `parse=${validation.parseOk}, schema=${validation.schemaOk}, ` +
        `${result.durationSec.toFixed(1)}s\n`,
    );
  }

  return summary;
}

function summarizeAll(summaries: ExperimentSummary[]): string {
  const lines: string[] = [];
  lines.push("# Phase L1 Spike — Schema-Fidelity Summary");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Model: ${MODEL}`);
  lines.push(`Topic: ${TOPIC}`);
  lines.push(`Runs per experiment: ${RUNS_PER_EXPERIMENT}`);
  lines.push("");

  lines.push("## Pass-rate per experiment");
  lines.push("");
  lines.push("| Experiment | Phase | Pass-rate | Detail |");
  lines.push("| --- | --- | --- | --- |");
  const phaseLabels: Record<ExperimentLabel, string> = {
    A: "Phase 1 (Concept)",
    B: "Phase 2 (Analogy)",
    C: "Phase 4 (Guided)",
  };
  for (const s of summaries) {
    const pass = s.runs.filter((r) => r.requestOk && r.parseOk && r.schemaOk).length;
    const detail = s.runs
      .map(
        (r) =>
          `run${r.runIndex}: ${
            !r.requestOk ? "REQ_FAIL" : !r.parseOk ? "PARSE_FAIL" : !r.schemaOk ? "SCHEMA_FAIL" : "PASS"
          }`,
      )
      .join(", ");
    lines.push(`| ${s.label} | ${phaseLabels[s.label]} | ${pass}/${s.runs.length} | ${detail} |`);
  }
  lines.push("");

  lines.push("## Failure modes per experiment");
  lines.push("");
  for (const s of summaries) {
    lines.push(`### Experiment ${s.label} — ${phaseLabels[s.label]}`);
    const fails = s.runs.filter((r) => !(r.requestOk && r.parseOk && r.schemaOk));
    if (fails.length === 0) {
      lines.push("- No failures; all runs PASS.");
    } else {
      for (const r of fails) {
        lines.push(`- run ${r.runIndex} reasons: ${r.reasons.length === 0 ? "(none recorded)" : r.reasons.join("; ")}`);
      }
    }
    lines.push("");
  }

  // Recommendation logic
  const passRates = summaries.map(
    (s) => s.runs.filter((r) => r.requestOk && r.parseOk && r.schemaOk).length / s.runs.length,
  );
  const minPass = Math.min(...passRates);
  let verdict: string;
  if (minPass >= 1) {
    verdict =
      "**GREEN** — all 9 runs across all 3 phase shapes parsed and validated. " +
      "Proceed to L2-pre as planned; raw JSON in system prompt is reliable.";
  } else if (minPass >= 2 / 3) {
    verdict =
      "**YELLOW** — at least one experiment had a single failed run out of 3. " +
      "Proceed but consider tighter prompting (or tool-calling) for the weakest schema. " +
      "Specific weaknesses listed above.";
  } else {
    verdict =
      "**RED** — at least one experiment failed two or three of three runs. " +
      "Raw JSON via system prompt is not reliable for this shape. Consider native " +
      "tool-calling (Ollama tools API) or breaking the schema into multiple smaller calls.";
  }
  lines.push("## Recommendation");
  lines.push("");
  lines.push(verdict);
  lines.push("");

  return lines.join("\n");
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const summaries: ExperimentSummary[] = [];
  for (const label of ["A", "B", "C"] as const) {
    summaries.push(await runExperiment(label));
  }

  await fs.writeFile(path.join(OUT_DIR, "SUMMARY.md"), summarizeAll(summaries));
  process.stdout.write("\n=== DONE ===\n");
}

main().catch(async (err) => {
  process.stderr.write(`Top-level spike error: ${err}\n`);
  try {
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(
      path.join(OUT_DIR, "SPIKE-FAILED.md"),
      `# Lesson spike could not complete\n\n\`\`\`\n${err instanceof Error ? err.stack : String(err)}\n\`\`\`\n`,
    );
  } catch {
    // best effort
  }
  process.exit(1);
});
