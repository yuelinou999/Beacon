#!/usr/bin/env node
/**
 * Beacon Stage 2 — Test Harness
 *
 * Runs fixed problems against Ollama (Gemma 4) in Guided and/or Explain mode.
 * Writes a timestamped markdown report to scripts/results/.
 *
 * Usage:
 *   node scripts/run-tests.mjs                         # both modes, all problems
 *   node scripts/run-tests.mjs --mode guided           # guided only
 *   node scripts/run-tests.mjs --mode explain          # explain only
 *   node scripts/run-tests.mjs --hero-only             # 3 hero problems only
 *   node scripts/run-tests.mjs --hero-only --mode guided
 *
 * Environment:
 *   OLLAMA_URL   (default: http://localhost:11434)
 *   OLLAMA_MODEL (default: gemma4)
 */

import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "gemma4";

// ── CLI args ────────────────────────────────────────────
const args = process.argv.slice(2);
const modeArg = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "both";
const heroOnly = args.includes("--hero-only");

if (!["guided", "explain", "both"].includes(modeArg)) {
  console.error(`Unknown mode: ${modeArg}. Use guided, explain, or both.`);
  process.exit(1);
}

const modesToRun = modeArg === "both" ? ["guided", "explain"] : [modeArg];

// ── System prompts (keep in sync with lib/prompts.ts) ──
const PROMPTS = {
  guided: `You are Beacon, a patient and encouraging math and physics tutor for middle and high school students (ages 12–18).

YOUR APPROACH:
- If the student shares a photo of a printed problem, read it and treat the problem in the image as their question.
- If the image contains multiple sub-questions (labeled a, b, c or 1, 2, 3), ask which part they would like help with before starting.
- Your first response must be 2–3 sentences total. No more.
- Start with one short, concrete hint — point directly at the first move (e.g. "To isolate x, you'll want to subtract 7 from both sides first."). Do not explain why or give background.
- End with one simple question that lets the student take the next step (e.g. "What do you get when you do that?").
- Never show the full solution in your first response.
- In later messages, give one small nudge at a time. Stay conversational and brief.
- If the student is stuck after two tries, show one more step and ask what comes next.
- If the student explicitly asks for the full answer, give a clear direct explanation or suggest Explain Mode.
- When the student reaches the correct answer, confirm it warmly and suggest they verify (substitute back for math, check units for physics).
- If you are unsure of a step, say so honestly.

MATH NOTATION — IMPORTANT:
- Never use LaTeX. No $...$, no $$...$$, no \frac, \mathbf, \left, \right, \times (symbol), or any backslash commands.
- Write all math in plain text: x = 5, 2/3, F = m x a, (2/3) x n = 18.
- Use x for multiplication when needed, or just write it out: "multiply both sides by 3/2".
- Write fractions as a/b (e.g. 2/3, 15/4).
- Write exponents as x^2, not x² or x\^{2}.

FORMATTING:
- No bullet lists or numbered steps in your first message.
- Use **bold** only for the final answer or a key number.
- Keep every response short. One idea per message.`,

  explain: `You are Beacon, a clear and efficient math and physics tutor for middle and high school students.

YOUR APPROACH:
- If the student shares a photo of a printed problem, read it and treat the problem in the image as their question.
- If the image contains multiple sub-questions (labeled a, b, c or 1, 2, 3), ask which part to solve first before proceeding.
- Jump straight into numbered steps. No preamble or lengthy intro.
- Step 1 should name the concept or formula being used (one sentence), then apply it immediately.
- Show all arithmetic or algebra. Every step on its own line.
- After the final answer, add one short verification step: substitute back (math) or check units (physics).
- If you are unsure of a step, say so: "Let me double-check this."

MATH NOTATION — IMPORTANT:
- Never use LaTeX. No $...$, no $$...$$, no \frac, \mathbf, \left, \right, \times (symbol), or any backslash commands.
- Write all math in plain text: x = 5, 2/3, F = m x a, 3x + 7 = 22.
- Use x for multiplication when needed, or just write it out: "multiply both sides by 3/2".
- Write fractions as a/b (e.g. 2/3, 15/4).
- Write exponents as x^2, not x² or x\^{2}.

FORMATTING:
- Use numbered steps: Step 1, Step 2, etc.
- Label the final answer clearly: **Answer: ...**
- Use **bold** for the formula, key numbers, and the final answer.
- One sentence per step. Do not pad.`,
};

// ── Load problems ────────────────────────────────────────
const allProblems = JSON.parse(
  readFileSync(join(__dir, "problems.json"), "utf8")
).problems;

const problems = heroOnly ? allProblems.filter((p) => p.hero) : allProblems;

// ── Ollama call ──────────────────────────────────────────
async function askOllama(systemPrompt, question) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        if (chunk.message?.content) accumulated += chunk.message.content;
      } catch {
        // skip malformed chunk
      }
    }
  }

  return accumulated.trim();
}

// ── Heuristic: did the response mention verification? ────
function detectVerification(text) {
  if (!text) return false;
  return /verif|substitut|check|plug.?in|units?\s+(are|match|check)/i.test(text);
}

// ── Quality checklist per mode ───────────────────────────
function checklist(mode) {
  if (mode === "guided") {
    return [
      "- [ ] Opens with a hint (names concept/approach)",
      "- [ ] Follows with exactly one guiding question",
      "- [ ] Response is short (2–4 sentences)",
      "- [ ] Full solution NOT revealed",
      "- [ ] Correct mathematical direction",
      "- [ ] Age-appropriate language",
    ].join("\n");
  }
  return [
    "- [ ] Complete step-by-step solution in first response",
    "- [ ] States the formula/concept and why it applies",
    "- [ ] Shows all arithmetic",
    "- [ ] Verification step present at end",
    "- [ ] Final answer clearly labeled",
    "- [ ] Mathematically correct",
  ].join("\n");
}

// ── Run ──────────────────────────────────────────────────
const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const label = `${modeArg}-${heroOnly ? "hero" : "all"}-${timestamp}`;
const outPath = join(__dir, "results", `${label}.md`);

mkdirSync(join(__dir, "results"), { recursive: true });

const totalRuns = problems.length * modesToRun.length;
let completed = 0;
const sections = { hero: [], regular: [] };

console.log(`\nBeacon Test Harness`);
console.log(`Model: ${MODEL}  |  Ollama: ${OLLAMA_URL}`);
console.log(`Mode: ${modeArg}  |  Problems: ${problems.length}  |  Total runs: ${totalRuns}\n`);

for (const mode of modesToRun) {
  for (const problem of problems) {
    const tag = `[${problem.id}] (${mode}) ${problem.question.slice(0, 60)}`;
    process.stdout.write(`  Running ${tag}... `);

    let response;
    let error = null;
    const t0 = Date.now();

    try {
      response = await askOllama(PROMPTS[mode], problem.question);
    } catch (err) {
      error = err.message;
      response = null;
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    completed++;
    console.log(error ? `ERROR (${elapsed}s)` : `done (${elapsed}s) [${completed}/${totalRuns}]`);

    const verificationDetected = detectVerification(response);

    const block = [
      `### ${problem.hero ? "⭐ " : ""}[${problem.id}] ${problem.question}`,
      "",
      "| Field | Value |",
      "|---|---|",
      `| **ID** | \`${problem.id}\` |`,
      `| **Topic** | ${problem.topic} |`,
      `| **Hero** | ${problem.hero ? "✅ yes" : "no"} |`,
      `| **Mode** | ${mode} |`,
      `| **Latency** | ${elapsed}s |`,
      `| **Verification detected** | ${error ? "n/a" : verificationDetected ? "✅ yes" : "⚠️ no"} |`,
      `| **Verdict** | ⬜ |`,
      `| **Notes** | |`,
      "",
      "**Response:**",
      "",
      error ? `> ⚠️ ERROR: ${error}` : response,
      "",
      "**Quality checklist:**",
      checklist(mode),
      "",
      "---",
      "",
    ].join("\n");

    (problem.hero ? sections.hero : sections.regular).push(block);
  }
}

// ── Write output ─────────────────────────────────────────
const heroSummary = sections.hero.length
  ? ["## ⭐ Hero Problems", "", ...sections.hero].join("\n")
  : "";

const regularSummary = sections.regular.length
  ? ["## All Other Problems", "", ...sections.regular].join("\n")
  : "";

const header = [
  `# Beacon Test Run`,
  ``,
  `| | |`,
  `|---|---|`,
  `| **Date** | ${new Date().toUTCString()} |`,
  `| **Model** | ${MODEL} |`,
  `| **Ollama** | ${OLLAMA_URL} |`,
  `| **Mode** | ${modeArg} |`,
  `| **Problems** | ${problems.length} |`,
  `| **Filter** | ${heroOnly ? "hero only" : "all"} |`,
  ``,
  `## Hero Demo Candidates`,
  ``,
  `| ID | Question | Verdict |`,
  `|---|---|---|`,
  ...allProblems
    .filter((p) => p.hero)
    .map((p) => `| ${p.id} | ${p.question} | ⬜ not yet reviewed |`),
  ``,
  `> Fill in the Verdict column after reviewing: ✅ video-ready / ⚠️ needs work / ❌ broken`,
  ``,
  `---`,
  ``,
].join("\n");

const output = [header, heroSummary, regularSummary].filter(Boolean).join("\n");

writeFileSync(outPath, output, "utf8");

console.log(`\nDone. Results written to:\n  ${outPath}\n`);
