# Beacon · WebLLM Spike

Day-1 de-risking: confirm browser-side Gemma inference is viable before
investing the rest of the 14-day plan in pillar A ("truly offline").

## What this proves

- A browser tab can download a Gemma weights blob (~700 MB for Plan A)
- WebGPU on this machine can actually run inference
- The answer quality on a Hindi math question is acceptable for demo
- Cold-load + tokens-per-second numbers are demo-acceptable
- After first load, IndexedDB caches the weights so a second visit is instant

If those land, Day 7's Settings-toggle integration is unblocked. If they
don't, the strategic thesis falls back to Ollama-only and the winning shot
contracts to "Top 10 ceiling, no Top 3."

## Run

This is a single static file. No build, no install.

```
cd scripts/webllm-spike
python3 -m http.server 8080
# open http://localhost:8080/ in a recent Chrome / Edge / Safari
```

Why a separate static server: WebLLM model weights are fetched from
huggingface.co cross-origin, and loading via `file://` triggers WebGPU /
worker-script restrictions in some browsers. A trivial localhost http
server sidesteps that.

## Test plan

1. Open the page. Status bar should say "WebGPU available."
2. Pick **Plan A** (gemma3-1b-it-q4f16_1-MLC) from the dropdown. Click
   "Load model". First load downloads ~711 MB — expect 1-5 minutes
   depending on network. Progress streams in the status bar.
3. Once loaded, click each quick-prompt button in turn:
   - Math · English
   - Math · Hindi
   - Math · Spanish
   - Word problem · Hindi answer
   Click "Run inference" for each. Record:
   - cold load time (one-time)
   - time to first token
   - tokens/sec
   - response quality (subjective)
4. Refresh the page and click "Load model" again — the second load should
   come from IndexedDB cache, not the network. Note the second-load time.
5. **Verify offline**: open DevTools → Network → check "Offline" → click
   "Run inference" once more. Inference must still work; this is the
   "pull network plug" demo moment we're trying to confirm.
6. If Plan A quality is poor on Hindi math, repeat with Plan B
   (gemma-2-2b-it-q4f16_1-MLC-1k, ~1.6 GB).
7. If both Gemma options fail / are too slow, fall back to Plan C
   (SmolLM2-360M) just to prove the zero-network browser path is real
   even if the model isn't Gemma.

## Decision gate

After the test pass, report back:

- Cold load wall-clock (Plan A)
- Time to first token (Plan A, Hindi prompt)
- Tokens/sec (Plan A, Hindi prompt)
- Subjective Hindi math quality (1-5)
- Second-load time (cache-warm)
- Did offline mode work? (Y/N)

If Plan A passes (cold-load < 3 min, tokens/sec ≥ 5, Hindi math quality
≥ 3/5, offline works), commit to Plan A and unblock Day 7 integration.

If Plan A fails on quality but B passes, commit to Plan B (heavier but
safer).

If neither passes, replan: drop pillar A, ship "Ollama-only with offline
bank fallback" and aim for Top 10 instead of Top 3.

## After this spike

This whole `scripts/webllm-spike/` directory is a throwaway — once Day 7
integrates WebLLM into the Next.js bundle properly, this folder can be
deleted with no production impact. Keep it for now as a reference
implementation of "minimal Gemma-in-browser" that doesn't depend on the
rest of Beacon.
