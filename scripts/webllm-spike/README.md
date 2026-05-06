# Beacon · WebLLM Spike

Day-1 de-risking: confirm browser-side Gemma inference holds up to a
demo claim of "truly offline". Plan A is **gemma3-1b-it-q4f16_1-MLC**
(~711 MB), Plan B is **gemma-2-2b-it-q4f16_1-MLC-1k** (~1.6 GB). Test
both — pick on data, not narrative. There is no Plan C: this is a
Gemma hackathon track, so a non-Gemma browser fallback is not an
acceptable substitute for Gemma-track credibility. If both Gemma
options fail the gate below, drop pillar A entirely and replan the
strategic thesis before Day 3.

## What this proves (and what it doesn't)

The actual claim Beacon's submission needs to defend in front of judges
is "truly offline browser inference". Codex flagged that this requires
TWO levels of offline verification, not one:

- **L1 — same-tab offline-after-load**: model loaded in this tab, then
  network goes off, inference still works. WebLLM keeps weights in
  page memory; this is the easy part.
- **L2 — refresh-with-network-off-then-boot**: close browser entirely
  (or refresh page) with network already off, page must boot AND
  re-attach to the IndexedDB-cached weights AND infer. This is what
  the demo claim actually requires. WebLLM CDN imports also need to
  cache — OR the integration must inline the WebLLM lib so first load
  is the only network dependency.

Without L2 passing, the submission narrative cannot honestly say
"truly offline in browser." A spike that only proves L1 is a spike
that mis-sells the product.

This page also adds a true multi-turn conversation test because:
- single-turn doesn't catch context overflow / quality decay
- single-turn doesn't catch tab freeze under sustained inference
- single-turn doesn't tell you whether the demo can actually run a
  3-message conversation

The "Run 3-turn stability test" button accumulates conversation history
across all 3 turns — turn 2 sees turn 1's user message AND assistant
reply, turn 3 sees both prior turns. Prompts are crafted to reference
prior turns ("Now using the same method…", "Why did the inverse-
operation step we used in both problems…") so quality decay shows up
as the model losing the conversational thread, not just per-turn
latency drift. Per-turn metrics include the history size in messages
so you can see context growing.

## Run

Single static file. No build, no install.

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

### Phase 1 — Plan A baseline

1. Open the page. Status bar should say "WebGPU available."
2. Pick **Plan A** (`gemma3-1b-it-q4f16_1-MLC`). Click "Load model".
   Cold load downloads ~711 MB — expect 1-5 minutes depending on
   network. Watch the status bar for progress and the tab itself for
   main-thread freeze (per MediaPipe docs Gemma 3 1B can block main
   thread on init; this spike isn't worker-isolated, so we WILL feel
   it if it happens).
3. Once loaded, click each quick-prompt button:
   - Math · English
   - Math · Hindi
   - Math · Spanish
   - Word problem · Hindi answer
   For each: click "Run inference". Record **time-to-first-token**,
   **tokens/sec**, and a subjective **quality 1-5**. Hindi math is
   the demo-critical one — that's the persona's daily case.
4. Click **"Run 3-turn stability test"** — this fires 3 algebra
   prompts in sequence and logs per-turn TTFT/tps. Watch for: tab
   freeze, response degradation across turns, total tokens before
   exhaustion.

### Phase 2 — L1 offline (easy)

5. Open DevTools → Network → check **"Offline"**. Click "Run
   inference" once more. Inference must still work. This is the
   "model in page memory" case. Easy to pass.

### Phase 3 — L2 offline (the actual demo claim)

6. **L2 cold reload**: with DevTools still in offline mode, **refresh
   the page** (Cmd-R / F5). Page should boot. Click "Load model" —
   the model should load from IndexedDB without any network
   request. **Run inference offline.** This is the "real demo
   moment" verification. If THIS doesn't work, the offline claim is
   misleading.
7. **L2 cold restart**: close the browser tab AND turn off your
   network (wifi off, not just DevTools toggle). Open browser, paste
   the localhost URL, see if page loads at all. Some files
   (`index.html`, the WebLLM CDN bundle) may need to be cached by
   the browser for this to work; if it fails, note this as a Day 7
   integration requirement (we'll need to bundle WebLLM into the
   Next.js build, not import from CDN).

### Phase 4 — Save the Plan A snapshot BEFORE switching models

8. In the Observation log fieldset: confirm "Model under test" is set
   to **Plan A**. Fill in all the manual fields (warm load, Hindi
   quality, L1 / L2 / L2 cold restart pass-fail, main-thread freeze
   level, 3-turn stability, free-form notes).
9. Click **"Save snapshot for current model"**. Status line should
   read `Plan A: saved ✓`. Do NOT skip this step — the form fields
   only persist on screen until you switch models or reload the page.

### Phase 5 — Plan B comparison

10. Click "Reset cache (force redownload)" to clear Plan A weights.
11. Switch the **Model variant** dropdown to Plan B
    (`gemma-2-2b-it-q4f16_1-MLC-1k`). Click "Load model" — first load
    redownloads ~1.6 GB (larger than A by 2x).
12. Repeat Phase 1 + 2 + 3 with Plan B.
13. Switch the **Observation log "Model under test"** selector to
    Plan B. Click "Clear current form" if you want to start fresh
    (this does NOT touch the saved Plan A snapshot). Fill the manual
    fields for Plan B.
14. Click **"Save snapshot for current model"** again. Status line
    should now read `Plan A: saved ✓ · Plan B: saved ✓`.

### Phase 6 — Export

15. Click **"Export both snapshots"**. Both A + B observations bundle
    into one paste-ready block on your clipboard. Paste into the
    chat. The status line confirms which snapshots made it into the
    export.

If you forget to save one of the snapshots, the export will fall
back to whatever's on screen and append a "did you forget to click
Save?" warning so the decision-gate evaluator knows the data is
incomplete.

**Snapshot persistence**: Saved snapshots are stored in the page's
sessionStorage, so they DO survive `location.reload()` — including
the reload triggered by the "Reset cache (force redownload)" button.
This means the documented Plan-A-then-Plan-B workflow (Save A → Reset
cache → switch to Plan B → test → Save B → Export) is reliable: the
Plan A snapshot you saved before clicking Reset cache will still be
there after the reload.

What sessionStorage does NOT survive: closing the tab, closing the
window, or quitting the browser. If you finish Plan A, save the
snapshot, and close the tab to come back tomorrow, the snapshot is
gone — sessionStorage scope is per-tab. For the spike this is
intentional (clean slate per session) and acceptable since the full
A + B test fits in one ~30-90 minute sitting. If you need to
deliberately wipe saved snapshots without closing the tab (e.g.
restarting a botched Plan A run), use the "Clear saved snapshots"
button in the Observation log.

## Decision gate

Report back these numbers FOR EACH MODEL (A and B):

- Cold load wall-clock
- Time to first token (Hindi prompt)
- Tokens/sec (Hindi prompt)
- Subjective Hindi math quality (1-5)
- Multi-turn stability — did all 3 turns complete? Any decay?
- Main-thread blocking — did the tab freeze during init? For how long?
- L1 offline (DevTools offline + same-tab) — pass / fail
- L2 offline (refresh with network off) — pass / fail
- L2 cold restart (close + reopen, network off entire time) — pass / fail

### Outcome → action

| Result | Next step |
|---|---|
| Plan A passes everything incl. L2 | Lock Plan A. Day 7 integration starts with Gemma 3 1B. |
| Plan A passes L2 but Hindi quality is < 3/5 | Test Plan B. If B passes everything, lock B. |
| Both pass L1 but neither passes L2 | Day 7 needs bundling work — WebLLM lib inlined into Next build, not CDN. Add this to Day 7 scope. |
| Neither passes L2 even with bundling | **Drop pillar A entirely.** Do NOT fall back to non-Gemma — Gemma-track credibility matters more than the offline narrative. Replan the strategic thesis before Day 3. |
| Main-thread freeze is unbearable | Day 7 MUST run inference in a Web Worker, not main thread. Add to Day 7 scope. |

## Day 2 follow-up regardless of outcome

Per codex round-1: WebLLM is a fine spike tool, but the FINAL
integration target should likely be **MediaPipe LLM Inference**
(Google's official Gemma web/on-device line). That's a separate
Day 2 task (#84) — run a parallel mini-spike against MediaPipe and
compare on the same metrics. Pick the integration target based on
data, not on which library was easier to spike.

## After this spike

This whole `scripts/webllm-spike/` directory is a throwaway — once
Day 7 integrates the chosen runtime properly into the Next.js bundle,
this folder can be deleted with no production impact. Keep it for now
as a reference implementation of "minimal Gemma-in-browser" without
the rest of Beacon attached.
