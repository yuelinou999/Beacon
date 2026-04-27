/**
 * Phase D1 v2 — Gemma 4 thinking-mode SPIKE
 *
 * Goal: empirically characterize what gemma4:e2b returns through Ollama
 * for three different thinking-mode mechanisms. Persists every raw
 * artifact to scripts/spike-output/ so a human (or Codex) can verify
 * independently.
 *
 * Hard rules followed:
 *   - Model is hardcoded to "gemma4:e2b" (never read from env, never
 *     copied from scripts/test-image.mjs which defaults to "gemma4").
 *   - Direct fetch to Ollama; does NOT use lib/ollama.ts.
 *   - Three experiments are independent; one failing does not abort.
 *   - Raw response JSON is written untouched.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = "gemma4:e2b"; // hardcoded on purpose
const REPO_ROOT = path.resolve(__dirname, "..");
const STUDENT_JSON = path.join(REPO_ROOT, "data", "student.json");
const OUT_DIR = path.join(REPO_ROOT, "scripts", "spike-output");

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

interface OllamaRequest {
  model: string;
  messages: ChatMessage[];
  stream: false;
  // optional thinking-related fields, intentionally permissive:
  think?: boolean | string;
}

const PORTRAIT_INSTRUCTIONS =
  "You are analyzing a student's learning history to build a portrait of who they are as a learner. " +
  "Given their data below, produce a short narrative (2-3 paragraphs) describing: " +
  "(1) their interests and what they choose to spend time on, " +
  "(2) how they behave under difficulty, " +
  "(3) their independence trend over time, " +
  "and (4) their dominant learning style. " +
  "Write in second person. Be specific to this student's data, not generic.";

function buildUserPrompt(studentJsonText: string): string {
  return `${PORTRAIT_INSTRUCTIONS}\n\nSTUDENT DATA (raw JSON):\n${studentJsonText}`;
}

interface ExperimentResult {
  name: "A" | "B" | "C";
  ok: boolean;
  durationSec: number;
  request: OllamaRequest;
  rawResponse?: unknown;
  errorText?: string;
}

async function runExperiment(
  name: "A" | "B" | "C",
  request: OllamaRequest,
): Promise<ExperimentResult> {
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
        name,
        ok: false,
        durationSec: (Date.now() - start) / 1000,
        request,
        errorText: `HTTP ${res.status}: ${text}`,
      };
    }
    const raw = await res.json();
    return {
      name,
      ok: true,
      durationSec: (Date.now() - start) / 1000,
      request,
      rawResponse: raw,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      durationSec: (Date.now() - start) / 1000,
      request,
      errorText: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}

function countSubstring(haystack: string, needle: string): number {
  if (!haystack) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

function summarize(result: ExperimentResult): string {
  const lines: string[] = [];
  lines.push(`Experiment ${result.name}`);
  lines.push(`status: ${result.ok ? "OK" : "FAILED"}`);
  lines.push(`duration_sec: ${result.durationSec.toFixed(2)}`);
  if (!result.ok) {
    lines.push(`error: ${result.errorText ?? "<none>"}`);
    return lines.join("\n") + "\n";
  }
  const raw = result.rawResponse as Record<string, unknown>;
  const message = (raw?.message ?? {}) as Record<string, unknown>;

  const modelReturned =
    typeof raw?.model === "string"
      ? raw.model
      : "<NO top-level model FIELD>";
  lines.push(`response.model: ${modelReturned}`);

  const content =
    typeof message.content === "string" ? message.content : "";
  lines.push(
    `message.content (length ${content.length}):\n----- BEGIN content -----\n${content}\n----- END content -----`,
  );

  const messageThinking =
    "thinking" in message
      ? typeof message.thinking === "string"
        ? message.thinking
        : JSON.stringify(message.thinking)
      : "<NO message.thinking FIELD>";
  lines.push(
    `message.thinking:\n----- BEGIN message.thinking -----\n${messageThinking}\n----- END message.thinking -----`,
  );

  const topThinking =
    "thinking" in (raw ?? {})
      ? typeof raw.thinking === "string"
        ? raw.thinking
        : JSON.stringify(raw.thinking)
      : "<NO top-level thinking FIELD>";
  lines.push(`top-level thinking: ${topThinking}`);

  const openTags = countSubstring(content, "<think>");
  const closeTags = countSubstring(content, "</think>");
  lines.push(`<think> tag count in content: ${openTags}`);
  lines.push(`</think> tag count in content: ${closeTags}`);

  const topKeys = Object.keys(raw ?? {});
  lines.push(`top-level keys in raw response: ${JSON.stringify(topKeys)}`);

  const messageKeys = Object.keys(message ?? {});
  lines.push(`keys in raw.message: ${JSON.stringify(messageKeys)}`);

  return lines.join("\n") + "\n";
}

async function persist(result: ExperimentResult): Promise<void> {
  const reqPath = path.join(OUT_DIR, `experiment-${result.name}-request.json`);
  await fs.writeFile(reqPath, JSON.stringify(result.request, null, 2) + "\n");

  if (result.ok) {
    const respPath = path.join(
      OUT_DIR,
      `experiment-${result.name}-response-raw.json`,
    );
    await fs.writeFile(
      respPath,
      JSON.stringify(result.rawResponse, null, 2) + "\n",
    );
    const summaryPath = path.join(
      OUT_DIR,
      `experiment-${result.name}-summary.txt`,
    );
    await fs.writeFile(summaryPath, summarize(result));
  } else {
    const failPath = path.join(
      OUT_DIR,
      `experiment-${result.name}-FAILURE.md`,
    );
    const body = [
      `# Experiment ${result.name} — FAILURE`,
      "",
      `Duration before failure: ${result.durationSec.toFixed(2)}s`,
      "",
      "## Error",
      "",
      "```",
      result.errorText ?? "<no error text>",
      "```",
      "",
      "## Request that triggered the failure",
      "",
      "```json",
      JSON.stringify(result.request, null, 2),
      "```",
      "",
    ].join("\n");
    await fs.writeFile(failPath, body);
  }
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });

  // Read student data raw, embed verbatim into the prompt.
  const studentText = await fs.readFile(STUDENT_JSON, "utf8");
  const userPrompt = buildUserPrompt(studentText);

  // Experiment A: top-level think:true param
  const reqA: OllamaRequest = {
    model: MODEL,
    messages: [{ role: "user", content: userPrompt }],
    stream: false,
    think: true,
  };

  // Experiment B: /think system directive
  const reqB: OllamaRequest = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "/think Take your time to reason step by step before producing the final answer.",
      },
      { role: "user", content: userPrompt },
    ],
    stream: false,
  };

  // Experiment C: control — no thinking mechanism
  const reqC: OllamaRequest = {
    model: MODEL,
    messages: [{ role: "user", content: userPrompt }],
    stream: false,
  };

  const tableRows: string[] = [];

  for (const [label, req] of [
    ["A", reqA],
    ["B", reqB],
    ["C", reqC],
  ] as const) {
    process.stdout.write(`\n=== Running experiment ${label} ===\n`);
    let result = await runExperiment(label, req);

    // Per spec: 3 attempts max per experiment. If A fails, retry ONCE
    // with think:"high" instead of think:true.
    if (!result.ok && label === "A") {
      process.stdout.write(
        `Experiment A failed once (${result.errorText}); retrying with think:"high"\n`,
      );
      const retryReq: OllamaRequest = { ...req, think: "high" };
      result = await runExperiment("A", retryReq);
    }

    await persist(result);
    process.stdout.write(
      `Experiment ${label} -> ${result.ok ? "OK" : "FAILED"} in ${result.durationSec.toFixed(2)}s\n`,
    );

    if (result.ok) {
      const raw = result.rawResponse as Record<string, unknown>;
      const message = (raw?.message ?? {}) as Record<string, unknown>;
      const content = typeof message.content === "string" ? message.content : "";
      tableRows.push(
        [
          label,
          "OK",
          String(raw?.model ?? "<missing>"),
          "thinking" in message ? "present" : "absent",
          "thinking" in (raw ?? {}) ? "present" : "absent",
          String(countSubstring(content, "<think>")),
          result.durationSec.toFixed(2) + "s",
        ].join(" | "),
      );
    } else {
      tableRows.push(
        [label, "FAILED", "-", "-", "-", "-", result.durationSec.toFixed(2) + "s"].join(" | "),
      );
    }
  }

  const readmeBody = [
    "# Spike artifacts — Gemma 4 thinking mode probe",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "These files are the raw, untouched output of three Ollama chat completions",
    "against `gemma4:e2b`, using three different mechanisms for invoking",
    "thinking mode:",
    "",
    "- Experiment A — request body has `think: true` (with one retry as `think: \"high\"` if A fails)",
    "- Experiment B — system message starts with `/think ...`",
    "- Experiment C — control, no thinking mechanism",
    "",
    "For each experiment we persist:",
    "",
    "- `experiment-{X}-request.json` — exact request body sent",
    "- `experiment-{X}-response-raw.json` — full unmodified Ollama response",
    "- `experiment-{X}-summary.txt` — derived view (model, thinking field, tag counts, top-level keys)",
    "",
    "If an experiment failed, you'll see `experiment-{X}-FAILURE.md` instead of",
    "the response/summary pair.",
    "",
    "## Summary table",
    "",
    "experiment | status | model returned | message.thinking | top-level thinking | <think> tag count | duration",
    "-- | -- | -- | -- | -- | -- | --",
    ...tableRows,
    "",
  ].join("\n");
  await fs.writeFile(path.join(OUT_DIR, "README.md"), readmeBody);

  process.stdout.write("\n=== DONE ===\n");
}

main().catch(async (err) => {
  process.stderr.write(`Top-level spike error: ${err}\n`);
  try {
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(
      path.join(OUT_DIR, "SPIKE-FAILED.md"),
      `# Spike could not complete\n\n\`\`\`\n${err instanceof Error ? err.stack : String(err)}\n\`\`\`\n`,
    );
  } catch {
    // best effort
  }
  process.exit(1);
});
