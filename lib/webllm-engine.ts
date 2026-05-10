"use client";

// Browser-side Gemma engine for Beacon's offline AI mode.
//
// This module is the runtime side of the Day 7 settings toggle: when a
// learner switches "Browser-side AI" on, calls into Gemma route through
// here instead of /api/explain (which uses Ollama on the host machine).
// Day 1-2 spike data picked Plan B (gemma-2-2b-it-q4f16_1-MLC-1k) as
// the integration target — see scripts/webllm-spike/ for the head-to-head
// run that produced the rationale.
//
// Design choices:
//
//   1. Lazy + dynamic import. The WebLLM library is hefty (WASM +
//      tokenizer + scheduler glue). Static-importing it from this file
//      would pull WebLLM into every chunk that statically imports
//      `webllm-engine`. We dynamic-import inside `ensureEngine()` so
//      the WebLLM bundle only ships when a caller actually triggers
//      a model load — typically the settings toggle's onClick.
//
//   2. Singleton. One MLCEngine per page lifecycle. Re-entries (the
//      learner toggles off/on, or navigates back to /review) reuse
//      the in-memory engine and the IndexedDB-cached weights — no
//      re-download.
//
//   3. Subscribe pattern for download progress. The settings modal
//      and the download-progress modal both observe the same status
//      stream. Avoids prop-drilling progress through the React tree.
//
//   4. Plan B has NO model-record patch. The Day 1-2 spike's
//      `context_window_size: -1 + attention_sink_size: 0` override
//      was Gemma-3-1B-only — applying it to Plan B (Gemma 2 2B)
//      breaks loading with "Need to specify either sliding_window_size
//      or max_window_size". Plan B uses WebLLM defaults as-is.
//      (See spike for the full failure trace.)
//
//   5. Inference parameters: same `max_tokens: 280`, `frequency_penalty:
//      1.0`, `presence_penalty: 0.6` as the spike. Penalties are
//      load-bearing for Hindi quality on this size class.

import type { MLCEngine } from "@mlc-ai/web-llm";

const PLAN_B_MODEL_ID = "gemma-2-2b-it-q4f16_1-MLC-1k";

// Public progress / readiness states. Components subscribe to this
// stream to render download UI without the engine module having any
// React knowledge.
export type EngineStatus =
  | { phase: "idle" }
  | { phase: "loading"; progress: number; text: string }
  | { phase: "ready" }
  | { phase: "error"; message: string };

let status: EngineStatus = { phase: "idle" };
const subscribers = new Set<(s: EngineStatus) => void>();

function setStatus(s: EngineStatus): void {
  status = s;
  // forEach (not for...of) — tsconfig target/lib doesn't include
  // downlevel iterators for Set, and we don't need to break early.
  subscribers.forEach((cb) => cb(s));
}

export function getStatus(): EngineStatus {
  return status;
}

// Subscribe to status updates. The callback fires immediately with the
// current status so the subscriber doesn't need a separate getStatus()
// call. Returns an unsubscribe function for cleanup in useEffect.
export function subscribe(cb: (s: EngineStatus) => void): () => void {
  subscribers.add(cb);
  cb(status);
  return () => {
    subscribers.delete(cb);
  };
}

// WebGPU presence check. WebLLM requires WebGPU; without it, we can't
// load the model. The settings toggle reads this to decide whether to
// disable the switch and surface a "browser doesn't support it" hint.
// Pure runtime check — safe to call before any WebLLM code runs.
export function isWebGpuAvailable(): boolean {
  if (typeof navigator === "undefined") return false;
  return "gpu" in navigator;
}

// Public reset hook. Settings calls this when the Browser-AI toggle
// flips OFF — emits a fresh "idle" status so the download progress
// modal (and any other subscriber) can reset state cleanly. Does NOT
// touch enginePromise: weights stay cached in IndexedDB and the
// already-loaded MLCEngine instance stays in memory, so re-toggling
// ON later resolves instantly without re-downloading.
//
// Without this, the engine state machine has no path back to "idle"
// after the first load (it goes loading → ready / loading → error
// only), so subscribers that gate on phase transitions never see a
// "reset" signal across an off/on toggle cycle.
export function resetStatusToIdle(): void {
  setStatus({ phase: "idle" });
}

// Singleton engine promise. Memoized across the page lifecycle so
// repeated callers (the settings toggle's pre-warm + /review's
// inference call) share the same in-flight or completed engine.
let enginePromise: Promise<MLCEngine> | null = null;

// Boot or return the WebLLM engine. First call kicks off the dynamic
// import + model download (~1.6 GB on first visit, ~2.4 s warm-load
// from IndexedDB on subsequent visits per Day 1-2 spike data).
//
// Status transitions:
//   idle -> loading (with progress updates) -> ready
//   idle -> loading -> error (e.g. WebGPU unavailable, network drop
//     during first download). On error, enginePromise is reset so a
//     subsequent ensureEngine() call can retry — the user can dismiss
//     the error and toggle off/on to retry without a page reload.
export async function ensureEngine(): Promise<MLCEngine> {
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    setStatus({
      phase: "loading",
      progress: 0,
      text: "Initializing browser AI…",
    });

    try {
      // Dynamic import — see header comment #1. Keeps WebLLM out of
      // chunks that don't actually call ensureEngine().
      const webllm = await import("@mlc-ai/web-llm");
      const engine = await webllm.CreateMLCEngine(PLAN_B_MODEL_ID, {
        initProgressCallback: (p: { progress: number; text: string; timeElapsed: number }) => {
          setStatus({
            phase: "loading",
            progress: p.progress,
            text: p.text,
          });
        },
      });
      setStatus({ phase: "ready" });
      return engine;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ phase: "error", message });
      // Reset so the user can retry. We don't auto-retry — that risks
      // hammering the network on a flaky connection.
      enginePromise = null;
      throw err;
    }
  })();

  return enginePromise;
}

// Generate a single completion with streaming under the hood. The
// caller gets the full text once generation finishes — for token-level
// streaming UI, switch to generateStream below. /api/explain currently
// returns full text, so this matches that contract.
//
// Penalty + max-token defaults mirror the Day 1-2 spike's hardened
// inference config (see scripts/webllm-spike/index.html). These values
// are load-bearing for Hindi quality on Gemma 2 2B — without them, the
// model is prone to repetition loops on token-sparse languages.
export interface GenerateOpts {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  // Optional cancellation. When provided and the signal aborts (e.g.
  // /review's 30 s timeout fires), the returned promise rejects with
  // an AbortError-shaped error so callers can detect cancellation
  // uniformly with their fetch path. WebLLM streaming may continue
  // briefly in the background after rejection — that's acceptable for
  // the UI use case (the result is dropped) and avoids depending on
  // WebLLM-version-specific interrupt APIs.
  signal?: AbortSignal;
}

function makeAbortError(): Error {
  const err = new Error("Browser AI generation aborted");
  err.name = "AbortError";
  return err;
}

// Resolves to a never-fulfilling promise that REJECTS as soon as the
// signal aborts. Used in Promise.race to enforce a hard cancellation
// boundary even if WebLLM is stuck before producing the first token.
function abortRejection(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(makeAbortError());
      return;
    }
    signal.addEventListener("abort", () => reject(makeAbortError()), {
      once: true,
    });
  });
}

export async function generate(opts: GenerateOpts): Promise<string> {
  if (opts.signal?.aborted) throw makeAbortError();
  const engine = await ensureEngine();
  if (opts.signal?.aborted) throw makeAbortError();

  const generation = (async () => {
    const stream = await engine.chat.completions.create({
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      stream: true,
      max_tokens: opts.maxTokens ?? 280,
      temperature: opts.temperature ?? 0.7,
      frequency_penalty: 1.0,
      presence_penalty: 0.6,
    });

    let result = "";
    for await (const chunk of stream) {
      // Cooperative cancellation: stop reading the stream as soon as
      // the signal aborts, even if upstream still has tokens to send.
      if (opts.signal?.aborted) throw makeAbortError();
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (delta) result += delta;
    }
    return result;
  })();

  // Race the actual generation against the abort signal. Whichever
  // settles first wins. Without the race, a WebLLM call stuck before
  // first token would never observe `signal.aborted` (the for-await
  // loop hasn't started iterating yet).
  if (opts.signal) {
    return Promise.race([generation, abortRejection(opts.signal)]);
  }
  return generation;
}
