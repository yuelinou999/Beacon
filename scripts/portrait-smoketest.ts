/**
 * Phase D2b smoketest — runs lib/portrait.generatePortrait directly
 * against a real Ollama, prints the full PortraitResponse, and persists
 * it to scripts/spike-output/portrait-smoketest.json.
 *
 * Exit code:
 *   0  — generation + validation succeeded
 *   1  — anything threw (parse error, validation error, network)
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { generatePortrait } from "@/lib/portrait";
import type { StudentProfile } from "@/lib/types";

const REPO_ROOT = path.resolve(__dirname, "..");
const STUDENT_JSON = path.join(REPO_ROOT, "data", "student.json");
const OUT_PATH = path.join(
  REPO_ROOT,
  "scripts",
  "spike-output",
  "portrait-smoketest.json",
);

async function main(): Promise<void> {
  const txt = await fs.readFile(STUDENT_JSON, "utf8");
  const profile = JSON.parse(txt) as StudentProfile;

  process.stdout.write(`Loaded profile from ${STUDENT_JSON}\n`);
  process.stdout.write(`Calling generatePortrait()...\n`);

  const response = await generatePortrait(profile);

  process.stdout.write("\n=== PortraitResponse ===\n");
  process.stdout.write(JSON.stringify(response, null, 2));
  process.stdout.write("\n=== END ===\n");

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(response, null, 2) + "\n");
  process.stdout.write(`\nWrote ${OUT_PATH}\n`);
}

main().catch((err) => {
  process.stderr.write(
    `\nSMOKETEST FAILED: ${err instanceof Error ? err.stack : String(err)}\n`,
  );
  process.exit(1);
});
