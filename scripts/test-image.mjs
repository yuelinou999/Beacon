#!/usr/bin/env node
/**
 * Beacon — Image Pipeline Validator
 *
 * Validates the Ollama vision pipeline end-to-end WITHOUT needing to run
 * the Next.js app. Run this before recording demo videos.
 *
 * Usage:
 *   node scripts/test-image.mjs <image-path>
 *   node scripts/test-image.mjs <image-path> --mode explain
 *   node scripts/test-image.mjs <image-path> --prompt "What is this problem?"
 *
 * Exit codes:
 *   0 — Ollama responded with non-empty content
 *   1 — empty response (vision likely unsupported or image unreadable)
 *   2 — connection error (Ollama not running or wrong URL)
 *
 * Environment:
 *   OLLAMA_URL   (default: http://localhost:11434)
 *   OLLAMA_MODEL (default: gemma4)
 */

import { readFileSync } from "fs";
import { extname } from "path";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "gemma4";

// ── CLI args ─────────────────────────────────────────────
const args = process.argv.slice(2);
const imagePath = args.find((a) => !a.startsWith("--"));
const mode = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "guided";
const customPrompt = args.includes("--prompt") ? args[args.indexOf("--prompt") + 1] : null;

if (!imagePath) {
  console.error("Usage: node scripts/test-image.mjs <image-path> [--mode guided|explain] [--prompt '...']");
  process.exit(2);
}

// ── Encode image ─────────────────────────────────────────
const ext = extname(imagePath).toLowerCase().replace(".", "");
const mimeMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const mime = mimeMap[ext] ?? "image/jpeg";

let imageBase64;
try {
  imageBase64 = readFileSync(imagePath).toString("base64");
} catch {
  console.error(`Could not read file: ${imagePath}`);
  process.exit(2);
}

// ── System prompts (keep in sync with lib/prompts.ts) ────
const PROMPTS = {
  guided: `You are Beacon, a friendly math and physics tutor for middle and high school students.

YOUR APPROACH:
- If the student shares a photo of a printed problem, read it and treat the problem in the image as their question.
- Your first response must be 2–3 sentences total. No more.
- Start with one short, concrete hint — point directly at the first move. Do not explain why or give background.
- End with one simple question that lets the student take the next step.
- Never show the full solution in your first response.

MATH NOTATION — IMPORTANT:
- Never use LaTeX. No $...$, no $$...$$, no \\frac, \\mathbf, or any backslash commands.
- Write all math in plain text: x = 5, 2/3, F = m x a.

FORMATTING:
- No bullet lists or numbered steps in your first message.
- Use **bold** only for the final answer or a key number.
- Keep every response short. One idea per message.`,

  explain: `You are Beacon, a clear and efficient math and physics tutor for middle and high school students.

YOUR APPROACH:
- If the student shares a photo of a printed problem, read it and treat the problem in the image as their question.
- Jump straight into numbered steps. No preamble or lengthy intro.
- Step 1 should name the concept or formula being used (one sentence), then apply it immediately.
- Show all arithmetic or algebra. Every step on its own line.
- After the final answer, add one short verification step: substitute back (math) or check units (physics).

MATH NOTATION — IMPORTANT:
- Never use LaTeX. No $...$, no $$...$$, no \\frac, \\mathbf, or any backslash commands.
- Write all math in plain text: x = 5, 2/3, F = m x a.

FORMATTING:
- Use numbered steps: Step 1, Step 2, etc.
- Label the final answer clearly: **Answer: ...**
- Use **bold** for the formula, key numbers, and the final answer.
- One sentence per step. Do not pad.`,
};

const systemPrompt = PROMPTS[mode] ?? PROMPTS.guided;
const userText = customPrompt ?? "Please help me with this problem.";

// ── Call Ollama ───────────────────────────────────────────
console.log(`\nBeacon Image Pipeline Validator`);
console.log(`Model : ${MODEL}`);
console.log(`Ollama: ${OLLAMA_URL}`);
console.log(`Image : ${imagePath} (${mime})`);
console.log(`Mode  : ${mode}`);
console.log(`Prompt: "${userText}"\n`);
console.log("─".repeat(60));

let res;
try {
  res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText, images: [imageBase64] },
      ],
    }),
  });
} catch (err) {
  console.error(`\nConnection error: ${err.message}`);
  console.error("Is Ollama running? Try: ollama serve");
  process.exit(2);
}

if (!res.ok) {
  const body = await res.text();
  console.error(`\nOllama returned ${res.status}: ${body}`);
  console.error("\nIf you see 'model does not support images', your model tag is text-only.");
  console.error("Try: ollama pull gemma4");
  process.exit(1);
}

// ── Stream response ───────────────────────────────────────
const reader = res.body.getReader();
const decoder = new TextDecoder();
let accumulated = "";
let buffer = "";

process.stdout.write("\n");
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
      if (chunk.message?.content) {
        process.stdout.write(chunk.message.content);
        accumulated += chunk.message.content;
      }
    } catch { /* skip malformed */ }
  }
}
process.stdout.write("\n\n");
console.log("─".repeat(60));

// ── Result ────────────────────────────────────────────────
if (!accumulated.trim()) {
  console.error("RESULT: EMPTY RESPONSE");
  console.error("→ Vision is likely not supported by this model build.");
  console.error("→ Run: ollama pull gemma4   and try again.");
  process.exit(1);
}

console.log(`RESULT: OK  (${accumulated.trim().split(/\s+/).length} words)`);
console.log("\nValidation checklist:");
if (mode === "guided") {
  const hasQuestion = accumulated.includes("?");
  console.log(`  ${hasQuestion ? "✅" : "⚠️ "} Ends with a guiding question`);
  const wordCount = accumulated.trim().split(/\s+/).length;
  console.log(`  ${wordCount <= 80 ? "✅" : "⚠️ "} Response length (${wordCount} words — target ≤80)`);
  const hasLatex = /\$|\\\w+\{/.test(accumulated);
  console.log(`  ${hasLatex ? "❌" : "✅"} No LaTeX detected`);
} else {
  const hasAnswer = /answer/i.test(accumulated);
  console.log(`  ${hasAnswer ? "✅" : "⚠️ "} Contains "Answer" label`);
  const hasSteps = /step\s*1/i.test(accumulated);
  console.log(`  ${hasSteps ? "✅" : "⚠️ "} Numbered steps present`);
  const hasVerify = /verif|substitut|check|units/i.test(accumulated);
  console.log(`  ${hasVerify ? "✅" : "⚠️ "} Verification step present`);
  const hasLatex = /\$|\\\w+\{/.test(accumulated);
  console.log(`  ${hasLatex ? "❌" : "✅"} No LaTeX detected`);
}

console.log("\nImage pipeline: WORKING ✅\n");
