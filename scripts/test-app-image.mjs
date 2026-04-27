#!/usr/bin/env node
/**
 * Beacon — App Boundary Validator
 *
 * Validates the REAL app path: POST /api/chat with an imageDataUrl payload.
 * This is NOT the same as test-image.mjs, which calls Ollama directly.
 * This script exercises every layer of the actual product:
 *   browser payload shape → /api/chat → prefix stripping → Ollama → streamed response
 *
 * Requires the Next.js dev server to be running (npm run dev).
 *
 * Usage:
 *   node scripts/test-app-image.mjs <image-path>
 *   node scripts/test-app-image.mjs <image-path> --mode explain
 *   node scripts/test-app-image.mjs <image-path> --port 3001
 *
 * Exit codes:
 *   0 — route returned non-empty streamed content
 *   1 — empty response or route error
 *   2 — could not connect (app not running)
 */

import { readFileSync } from "fs";
import { extname } from "path";

// ── Args ─────────────────────────────────────────────────
const args = process.argv.slice(2);
const imagePath = args.find((a) => !a.startsWith("--"));
const mode = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "guided";
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3000";
const APP_URL = process.env.BASE_URL ?? `http://localhost:${port}`;

if (!imagePath) {
  console.error("Usage: node scripts/test-app-image.mjs <image-path> [--mode guided|explain] [--port 3000]");
  process.exit(2);
}

// ── Encode image as full data URL (matches browser behavior exactly) ─────────
const ext = extname(imagePath).toLowerCase().replace(".", "");
const mimeMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const mime = mimeMap[ext] ?? "image/jpeg";

let imageDataUrl;
try {
  const raw = readFileSync(imagePath).toString("base64");
  // This is the full data URL the browser sends — the route must strip the prefix
  imageDataUrl = `data:${mime};base64,${raw}`;
} catch {
  console.error(`Could not read file: ${imagePath}`);
  process.exit(2);
}

// ── Build payload matching ChatRequest exactly ────────────────────────────────
// content is intentionally empty to test the fallback in the route
const payload = {
  mode,
  messages: [
    {
      id: "validation_1",
      role: "user",
      content: "",           // empty — exercises the "|| Please help me..." guard
      imageDataUrl,          // full data URL — exercises prefix stripping in route
    },
  ],
};

// ── Send ──────────────────────────────────────────────────
console.log(`\nBeacon App Boundary Validator`);
console.log(`App   : ${APP_URL}`);
console.log(`Route : POST /api/chat`);
console.log(`Mode  : ${mode}`);
console.log(`Image : ${imagePath} (${mime}, ${(imageDataUrl.length / 1024).toFixed(1)} KB data URL)`);
console.log("\nSending to app route...\n");
console.log("─".repeat(60));

let res;
try {
  res = await fetch(`${APP_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
} catch (err) {
  console.error(`\nCould not connect to ${APP_URL}`);
  console.error("Is the Next.js app running? Start it with: npm run dev");
  process.exit(2);
}

// ── Non-2xx means route-level failure ────────────────────
if (!res.ok) {
  let body = "";
  try { body = await res.text(); } catch { /* ignore */ }
  console.error(`\nRoute returned ${res.status}`);
  if (body) console.error(body);
  if (res.status === 502) {
    console.error("\nHint: 502 usually means Ollama is not running. Try: ollama serve");
  }
  process.exit(1);
}

// ── Stream NDJSON — same parser the app uses ─────────────
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
    } catch { /* skip malformed chunk */ }
  }
}
process.stdout.write("\n\n");
console.log("─".repeat(60));

// ── Result ────────────────────────────────────────────────
if (!accumulated.trim()) {
  console.error("RESULT: EMPTY RESPONSE from /api/chat");
  console.error("Possible causes:");
  console.error("  • Model does not support vision (run: node scripts/test-image.mjs to confirm)");
  console.error("  • imageDataUrl prefix stripping failed in the route");
  console.error("  • Ollama returned an empty stream");
  process.exit(1);
}

const words = accumulated.trim().split(/\s+/).length;
console.log(`RESULT: OK  (${words} words)\n`);

console.log("Auto-checks:");
const hasLatex = /\$|\\\w+\{/.test(accumulated);
console.log(`  ${hasLatex ? "❌" : "✅"} No LaTeX in response`);
if (mode === "guided") {
  console.log(`  ${accumulated.includes("?") ? "✅" : "⚠️ "} Contains a guiding question`);
  console.log(`  ${words <= 80 ? "✅" : "⚠️ "} Response length (${words} words, target ≤ 80)`);
} else {
  console.log(`  ${/answer/i.test(accumulated) ? "✅" : "⚠️ "} Contains "Answer" label`);
  console.log(`  ${/step\s*1/i.test(accumulated) ? "✅" : "⚠️ "} Numbered steps present`);
  console.log(`  ${/verif|substitut|check|units/i.test(accumulated) ? "✅" : "⚠️ "} Verification step present`);
}

console.log("\nApp boundary: WORKING ✅");
console.log("\n── Manual UI checklist (run in browser before recording) ──────");
console.log("  [ ] Image preview appears after file is selected");
console.log("  [ ] Image-only send (no text) works and appears in thread");
console.log("  [ ] Image + note send works");
console.log("  [ ] Mode switch while image is attached clears the image");
console.log("  [ ] Response appears with timing line (e.g. '8.3s · 100% local')");
console.log("────────────────────────────────────────────────────────────\n");
