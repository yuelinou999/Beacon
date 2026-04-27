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
    const detail =
      err instanceof Error
        ? `${err.name}: ${err.message}`
        : String(err);
    console.error("Portrait API error:", err);
    return Response.json(
      { error: "portrait_generation_failed", detail },
      { status: 500 },
    );
  }
}
