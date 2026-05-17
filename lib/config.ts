// Ollama connection config — single source so every API route reads the
// same env-var resolution path.
//
// Env-var priority for the host URL:
//   1. OLLAMA_HOST — Ollama's own conventional env var (matches `ollama
//      serve`'s OLLAMA_HOST). Preferred name; documented in README.
//   2. OLLAMA_URL — earlier Beacon-local name. Kept as a fallback so
//      anyone who set this in their shell from an older README still
//      gets honored instead of silently falling back to localhost.
//   3. http://localhost:11434 — default `ollama serve` listen address.
//
// Env-var for the model:
//   OLLAMA_MODEL — overrides the default. Documented in README.
//   Default tracks the hackathon's Gemma 4 release so a fresh clone
//   talks to gemma4:e2b without configuration.

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "gemma4:e2b";

export const OLLAMA_URL =
  process.env.OLLAMA_HOST ||
  process.env.OLLAMA_URL ||
  DEFAULT_OLLAMA_URL;

export const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;
