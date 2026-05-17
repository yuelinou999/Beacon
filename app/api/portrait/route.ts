import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { generatePortrait } from "@/lib/portrait";
import type { StudentProfile } from "@/lib/types";

async function loadSeedProfile(): Promise<StudentProfile> {
  const p = path.join(process.cwd(), "data", "student.json");
  const txt = await fs.readFile(p, "utf8");
  return JSON.parse(txt) as StudentProfile;
}

export async function POST(req: NextRequest) {
  try {
    let profile: StudentProfile;
    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    if (
      body &&
      typeof body === "object" &&
      "profile" in (body as Record<string, unknown>) &&
      (body as Record<string, unknown>).profile
    ) {
      profile = (body as Record<string, unknown>).profile as StudentProfile;
    } else if (
      body &&
      typeof body === "object" &&
      "topics" in (body as Record<string, unknown>)
    ) {
      // Caller posted a profile directly as the top-level body.
      profile = body as StudentProfile;
    } else {
      profile = await loadSeedProfile();
    }

    const response = await generatePortrait(profile);
    return Response.json(response, { status: 200 });
  } catch (err) {
    console.error("Portrait API error:", err);
    // A failed fetch to the Ollama host — connection refused, DNS miss, or
    // no host at all — surfaces as a TypeError whose message (or .cause)
    // names the network failure. Two cases land here: the hosted demo,
    // where there is no Ollama by design (Beacon is offline-first, AI runs
    // on the device, not in the cloud), and a local run where `ollama
    // serve` simply isn't up yet. Neither is a generation bug, so return a
    // distinct code and let the dashboard explain the model-server
    // requirement instead of showing a red parse-style error.
    const cause =
      err instanceof Error
        ? String((err as { cause?: unknown }).cause ?? "")
        : "";
    const ollamaUnreachable =
      err instanceof Error &&
      /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network|other side closed/i.test(
        `${err.message} ${cause}`,
      );
    if (ollamaUnreachable) {
      return Response.json({ error: "ollama_unreachable" }, { status: 503 });
    }
    const detail =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return Response.json(
      { error: "portrait_generation_failed", detail },
      { status: 500 },
    );
  }
}
