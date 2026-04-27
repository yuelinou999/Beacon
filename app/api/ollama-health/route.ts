const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

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
