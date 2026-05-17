// Health route reads from the same shared config as every other route so
// OLLAMA_HOST / OLLAMA_URL / OLLAMA_MODEL resolution stays in one place.
import { OLLAMA_URL } from "@/lib/config";

export async function GET() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { cache: "no-store" });
    return new Response(JSON.stringify({ ok: res.ok }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
