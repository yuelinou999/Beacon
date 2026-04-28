/**
 * Phase L2a smoketest — exercises POST /api/lesson for all 5 phase types
 * against a running dev server (npm run dev on :3000).
 *
 * For each phase:
 *   - POST { topicId: "linear_equations_basic", phase: <n> }
 *   - print status + truncated response body
 *   - persist full response to scripts/spike-output/lesson/api-smoketest-phase-<n>.json
 *   - track HTTP status, schema pass/fail, verifier severity, duration
 *
 * Exit code 0 only if every phase: HTTP 200, schema-valid, and verifier severity
 * is not "fail". Otherwise prints offending bodies in full and exits non-zero.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "scripts", "spike-output", "lesson");
const ENDPOINT = "http://localhost:3000/api/lesson";
const TOPIC_ID = "linear_equations_basic";
const PHASES = [1, 2, 3, 4, 5] as const;

interface PhaseResult {
  phase: number;
  http: number;
  schema: "pass" | "fail" | "n/a";
  verifier: "ok" | "warn" | "fail" | "n/a";
  durationSec: string;
  body: unknown;
}

function fmtCell(v: string, w: number): string {
  if (v.length >= w) return v.slice(0, w);
  return v + " ".repeat(w - v.length);
}

async function runPhase(phase: number): Promise<PhaseResult> {
  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId: TOPIC_ID, phase }),
    });
  } catch (err) {
    const durationSec = ((Date.now() - start) / 1000).toFixed(1);
    return {
      phase,
      http: 0,
      schema: "n/a",
      verifier: "n/a",
      durationSec,
      body: { error: "fetch_failed", detail: err instanceof Error ? err.message : String(err) },
    };
  }
  const durationSec = ((Date.now() - start) / 1000).toFixed(1);
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text };
  }

  let schema: PhaseResult["schema"] = "n/a";
  let verifier: PhaseResult["verifier"] = "n/a";

  if (res.status === 200 && body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (b.phase && b.verifier && b.meta) {
      schema = "pass";
      const v = b.verifier as Record<string, unknown>;
      if (v.severity === "ok" || v.severity === "warn" || v.severity === "fail") {
        verifier = v.severity;
      }
    } else {
      schema = "fail";
    }
  } else if (res.status === 502 && body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (b.error === "schema") schema = "fail";
  }

  return { phase, http: res.status, schema, verifier, durationSec, body };
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });

  process.stdout.write(`Smoketest target: ${ENDPOINT}\n`);
  process.stdout.write(`Topic: ${TOPIC_ID}\n\n`);

  const results: PhaseResult[] = [];
  for (const phase of PHASES) {
    process.stdout.write(`── Phase ${phase} ────────────────────────────────\n`);
    const r = await runPhase(phase);
    results.push(r);

    const outPath = path.join(OUT_DIR, `api-smoketest-phase-${phase}.json`);
    await fs.writeFile(outPath, JSON.stringify(r.body, null, 2) + "\n");

    const bodyStr = JSON.stringify(r.body, null, 2);
    const truncated = bodyStr.length > 800 ? bodyStr.slice(0, 800) + "\n... [truncated]" : bodyStr;
    process.stdout.write(`HTTP ${r.http}  duration ${r.durationSec}s\n`);
    process.stdout.write(`${truncated}\n\n`);
  }

  // ── Summary ───────────────────────────────────────────────
  process.stdout.write("\n=== SUMMARY ===\n");
  process.stdout.write(
    `${fmtCell("Phase", 6)}| ${fmtCell("HTTP", 5)}| ${fmtCell("Schema", 7)}| ${fmtCell("Verifier", 9)}| Duration\n`,
  );
  process.stdout.write(
    `------+------+--------+----------+---------\n`,
  );
  for (const r of results) {
    process.stdout.write(
      `${fmtCell(String(r.phase), 6)}| ${fmtCell(String(r.http), 5)}| ${fmtCell(r.schema, 7)}| ${fmtCell(r.verifier, 9)}| ${r.durationSec}s\n`,
    );
  }

  const failures = results.filter(
    (r) => r.http !== 200 || r.schema === "fail" || r.verifier === "fail",
  );

  if (failures.length === 0) {
    process.stdout.write("\nAll phases: HTTP 200, schema=pass, verifier!=fail.\n");
    process.exit(0);
  }

  process.stdout.write(`\n${failures.length} phase(s) failed expectations.\n`);
  for (const f of failures) {
    process.stdout.write(`\n── FAILED phase ${f.phase} (HTTP ${f.http}, schema=${f.schema}, verifier=${f.verifier}) ──\n`);
    process.stdout.write(JSON.stringify(f.body, null, 2) + "\n");
  }
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(
    `\nSMOKETEST CRASHED: ${err instanceof Error ? err.stack : String(err)}\n`,
  );
  process.exit(1);
});
