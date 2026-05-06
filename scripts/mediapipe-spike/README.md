# Beacon · MediaPipe Spike (Day 2 of the 14-day push)

Day-2 feasibility compare: is **MediaPipe LLM Inference** (Google's
official Gemma web/on-device runtime, [docs](https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference/web_js))
a better Day-7 integration target than WebLLM for Beacon's
"truly offline browser Gemma" pillar?

This is **not** a product integration. It's evidence-gathering,
shaped to mirror the Day-1 WebLLM spike's measurement protocol so the
two runtimes can be judged 1:1 with consistent numbers.

## Why MediaPipe matters for the hackathon thesis

WebLLM is third-party and the Gemma 4 family isn't even in its
prebuilt registry yet ([issue #810](https://github.com/mlc-ai/web-llm/issues/810)).
MediaPipe is **Google's own on-device LLM runtime**. For a Gemma
hackathon track judging panel — where "running Gemma the way Google
intends Gemma to be run" is a credibility signal — picking
MediaPipe over WebLLM tightens the narrative even if performance
turns out identical.

The questions this spike has to answer:

1. Does MediaPipe actually run a usable Gemma in browser today, or
   is the web path still rough enough that WebLLM is the pragmatic
   pick despite weaker Gemma-track credibility?
2. Is offline credibility (L1 / L2 / L2 cold restart) better, worse,
   or equivalent vs WebLLM?
3. Is the main-thread blocking story better, worse, or equivalent?
4. Is operator setup credible — i.e. can a hackathon judge actually
   reproduce the demo without a 30-step setup?
5. On Hindi math quality — the demo-critical case — does MediaPipe
   produce comparable or better output than WebLLM?

## What this spike CAN prove

- That MediaPipe LlmInference loads a `.litertlm` Gemma file in a
  recent Chrome / Edge with WebGPU, and the resulting engine
  responds to prompts.
- That streaming inference works via the
  `generateResponse(prompt, callback)` callback shape.
- That a 3-turn conversation (built via manual transcript
  concatenation, since MediaPipe's web API doesn't have a built-in
  history primitive) does or doesn't degrade.
- That cold-load wall-clock, TTFT, rough tokens/sec, and total
  inference time are reasonable for a demo.
- That offline behavior (L1, L2 refresh, L2 cold restart) holds or
  doesn't, given the operator's chosen model-hosting strategy.

## What this spike CANNOT prove

- **Multi-turn fidelity vs WebLLM**: WebLLM uses a structured
  `messages: [...]` array fed to the model's chat template. MediaPipe
  web takes a single string; we approximate multi-turn via plain-text
  transcript concatenation ("User: ...\nAssistant: ...\n..."). This
  is a less faithful test — quality decay here may reflect the
  prompt-shape limitation, not a true model weakness. Day 7
  integration would either (a) inject the model's chat template
  manually, (b) wait for MediaPipe to add a chat helper, or (c)
  accept the concat-prompt limitation.
- **Model parity**: WebLLM ships pre-quantized Gemma 3 1B in the
  `q4f16_1` format optimized for its MLC compilation. MediaPipe
  ships its own pre-quantized `.litertlm` files (often `int4` or
  `int8`). Quality differences may stem from the quantization
  scheme, not the runtime per se. Note exact files used for both
  spikes when comparing.
- **Production deployment readiness**: this spike loads from a CDN
  WASM bundle. A real Beacon submission would npm-install
  `@mediapipe/tasks-genai` and self-host the WASM + model. CDN
  failures here don't necessarily predict integration failures.

## Setup — model acquisition is the hard part

Unlike WebLLM's prebuilt registry (one-line `model_id`), MediaPipe
expects you to provide the model file URL via `modelAssetPath`.

### Recommended source

[HuggingFace · litert-community](https://huggingface.co/litert-community)
— Google-curated repository of LiteRT-compiled Gemma variants
suitable for MediaPipe LLM Inference web.

Look for files matching the patterns:
- `gemma-3-1b-it-Web.litertlm` or `gemma-3-1b-it-int4-Web.litertlm` (Plan A)
- `gemma-2-2b-it-Web.litertlm` or `gemma-2-2b-it-int4-Web.litertlm` (Plan B)

⚠️ The exact filename / quantization may have shifted by the time
you run this. Pick the smallest GPU-compatible variant Google ships
for each model size.

### Local hosting (recommended for L2 offline test)

Download the `.litertlm` file once, place it in this spike directory,
and serve via the same Python server you use for the page itself:

```
cd /Users/yuelinou999/Desktop/Main/Beacon/beacon/scripts/mediapipe-spike
# place gemma-3-1b-it-Web.litertlm here
python3 -m http.server 8080
# open http://localhost:8080/
# in the spike page, paste: ./gemma-3-1b-it-Web.litertlm
```

Hosting locally on the same origin is the **only** way L2 cold
restart can pass — the page, the WASM, AND the `.litertlm` all need
to be reachable from a network-off browser via localhost.

### Direct HuggingFace URL (faster setup, no L2 cold restart)

You can paste the HuggingFace `resolve/main/...` URL directly into
the modelAssetPath field. Caveats:
- CORS may block depending on the HF endpoint
- L2 cold restart will fail (HF unreachable when network is off)
- L1 and L2 refresh **may** still pass if the browser's HTTP cache
  retained the file

## Test protocol — 6 phases (mirrors WebLLM spike for 1:1 compare)

### Phase 1 — Plan A baseline
1. Set top "Plan" to **Plan A**.
2. Paste the Gemma 3 1B `.litertlm` URL (relative or absolute).
3. Click **Load model**. Watch for tab freeze during init — record
   roughly how long.
4. Once loaded, click **Math · Hindi** quick-prompt → **Run
   inference**. Record TTFT, tps, response. Subjectively grade
   Hindi math quality 1-5.
5. Click **Run 3-turn stability test**. Note: this concatenates a
   plain-text transcript per turn, not a structured chat history.
   Watch for freeze / decay / errors.

### Phase 2 — L1 offline
6. DevTools → Network → check **Offline**. Click any quick-prompt →
   **Run inference**. Record pass/fail.

### Phase 3 — L2 offline
7. With DevTools still in offline mode, **refresh the page**.
8. Re-paste the same modelAssetPath URL (page state isn't preserved
   across refresh — only the saved snapshots are).
9. **Check "Skip asset preflight (offline L2 / L2-cold validation
   only)"** before clicking Load model. The preflight uses fetch HEAD
   / Range GET, which can't reliably see the browser's HTTP cache
   while DevTools is in offline mode — if you leave preflight enabled
   here, it can fail even when MediaPipe's own asset loader would
   succeed from cache, giving you a false negative on the L2 test.
10. Click **Load model**. Watch DevTools Network — should be no
    successful outgoing requests. Run inference. Record L2 pass/fail.

### Phase 4 — L2 cold restart
11. Close the tab. Turn wifi OFF (real network, not just DevTools).
12. Reopen browser → paste localhost URL → does the page load? If
    yes, paste model URL again. **Keep "Skip asset preflight"
    checked** for the same reason as Phase 3 — fetch-based reachability
    probes are not a fair proxy for browser-cached asset availability.
13. Click Load model. Inference works = pass. Note the exact failure
    step if anything 404s.

> **Preflight is for baseline only.** Phase 1 (the initial Plan A
> baseline test) MUST run with preflight enabled, since that's the
> phase where bad URLs / CORS / wrong files are most likely. Once
> baseline passes and the model is in cache, switch the checkbox on
> for the offline phases and leave it on until you reset cache or
> start testing a new model.

### Phase 5 — Save Plan A snapshot
13. In Observation log: confirm "Model under test" = Plan A. Mismatch
    warning will surface if the top "Plan" selector and the slot
    selector disagree.
14. Fill manual fields (warm load, Hindi quality, L1/L2/L2-cold,
    main-thread freeze, 3-turn stability, free-form notes).
15. Click **Save snapshot for current model**. Status line should
    read `Plan A: saved ✓`. Snapshot persists in sessionStorage —
    survives page reload but not tab close.

### Phase 6 — Plan B comparison + export
16. Click **Reset** (clears engine, keeps cached weights — does NOT
    reload page, so saved Plan A snapshot is safe).
17. Switch top "Plan" dropdown to Plan B. Switch "Model under test"
    selector to Plan B. Paste Gemma 2 2B `.litertlm` URL.
18. Repeat Phases 1-4 for Plan B.
19. Save Plan B snapshot. Status line: `Plan A: saved ✓ · Plan B:
    saved ✓`.
20. Click **Export both snapshots** → paste into chat.

## Decision criteria — when does MediaPipe win Day 7?

For **MediaPipe to replace WebLLM as the Day-7 integration target**,
all of these must hold:

| Criterion | Required |
|---|---|
| Plan A or B passes Hindi math quality ≥ 3/5 | ✅ |
| Same model passes L2 offline (refresh-with-net-off) | ✅ |
| Tokens/sec ≥ WebLLM's same-model tokens/sec | ⚠️ desirable; if MediaPipe is ≥ 50% of WebLLM, accept the credibility tradeoff |
| Cold load ≤ 1.5× WebLLM's | ⚠️ desirable |
| Main-thread freeze ≤ WebLLM's category | ⚠️ desirable |
| Operator setup is documentable in submission writeup | ✅ |

> ⚠️ **3-turn stability is NOT in the criteria above on purpose.**
> Per the comparison-table caveat below, MediaPipe's 3-turn test in
> this spike uses transcript concatenation as a substitute for
> structured chat history. That's not a fair lever to make a Day-7
> integration call on. Use 3-turn data only as a soft "is the model
> falling apart entirely" check — not as a precision compare against
> WebLLM. If 3-turn fails badly on MediaPipe but other criteria pass,
> the right Day-7 fix is to inject the chat template manually, not
> to reject MediaPipe.

**MediaPipe should be locked for Day 7 if all ✅ are met AND a
plurality of ⚠️ are met.**

If MediaPipe passes ✅ but loses badly on ⚠️ — for example
half-speed inference, 3× cold-load, severe main-thread freeze — keep
WebLLM as the integration runtime BUT update Day 9's pedagogical
write-up to call out that MediaPipe was evaluated and rejected for
specific perf reasons. That's still a credibility win in the
submission.

If MediaPipe **fails** ✅ on Hindi quality or L2 — i.e. the
Google-official path can't actually deliver the demo — that's
information. Document the failure mode honestly, ship WebLLM, and
acknowledge in the submission that the official MediaPipe path
isn't yet viable for the demo claim. Judges will understand.

## What to compare 1:1 with WebLLM (export both spike outputs)

Build a comparison table from the two exports:

| Metric | WebLLM Plan A | MediaPipe Plan A | WebLLM Plan B | MediaPipe Plan B |
|---|---|---|---|---|
| Cold load |  |  |  |  |
| Warm load |  |  |  |  |
| TTFT (Hindi) |  |  |  |  |
| Tokens/sec |  |  |  |  |
| Hindi quality 1-5 |  |  |  |  |
| L1 offline |  |  |  |  |
| L2 offline |  |  |  |  |
| L2 cold restart |  |  |  |  |
| Main-thread freeze |  |  |  |  |
| 3-turn stability ⚠️ |  |  |  |  |

> ⚠️ **The "3-turn stability" row is NOT apples-to-apples.** WebLLM
> exposes an OpenAI-compatible `messages: [...]` array, so its
> multi-turn test passes structured user/assistant turns through the
> model's native chat template. MediaPipe LLM Inference web's API
> takes a single string per call, so this spike approximates
> multi-turn by concatenating the conversation as plain text
> (`User: ... \n\nAssistant: ... \n\nUser: ...`). That's a real test
> of model context retention but ALSO a test of the prompt-shape
> approximation. Quality decay on this row could come from either
> the model OR the concat scheme — don't read it as pure model
> capability. The other 9 rows in this table are direct compares;
> this one needs interpretation.

The decision-gate evaluator (next session) reads both exports + this
table to make the Day-7 integration call.

## Unresolved risks before locking MediaPipe as final runtime

1. **Multi-turn faithfulness**: MediaPipe web's lack of structured
   chat history forces concat-prompt approximations. Day 7 would
   need to either inject the model's chat template manually, accept
   degraded multi-turn, or wait for MediaPipe to add a helper. None
   of these are deal-breakers, but each has cost.
2. **`.litertlm` ecosystem**: model files are big, Google-hosted on
   HF, and the filenames / quantizations aren't fully stable. A
   "best practices for self-hosting MediaPipe Gemma weights" doc
   doesn't yet exist; Beacon's submission might need to include its
   own.
3. **WASM + model + page caching for L2 cold restart**: needs the
   browser's HTTP cache to hold all three. Service Worker bundling
   would make this rock-solid; that's a Day 7 task if MediaPipe
   wins.
4. **Gemma 4 web instability**: issue #6270 confirms Gemma 4 E2B web
   crashes on Chrome 146 / M4. This spike sticks to Gemma 3 / 2 to
   avoid that, but if Beacon wants to claim "running Google's latest
   Gemma in browser" the answer today is no — only the previous
   generations. Submission narrative needs to be honest about which
   Gemma version actually runs.
5. **MediaPipe API turnover**: web genai is still labeled an
   experimental tasks API. A breaking change between now and Day 14
   submission is possible. Lock to a specific `@mediapipe/tasks-genai`
   version in the Day 7 npm install.

## After this spike

The whole `scripts/mediapipe-spike/` directory is throwaway, same
as its WebLLM sibling. Day 7 will install `@mediapipe/tasks-genai`
into the Next.js bundle properly (or stick with WebLLM, depending on
the decision-gate verdict). At that point both spike directories
can be deleted.
