# Beacon

**An offline mathematics classroom for a learner who has a device but no mathematics teacher within reach, no textbook in her language, and no reliable internet.** Hand-written grade-7 curriculum, deterministic practice and spaced-repetition review, a family-facing progress view, and a small Gemma model that is allowed to do a few specific things — and not others.

Built for the **Kaggle Gemma 4 Good Hackathon** (May 2026), *Future of Education* and *Ollama Special Technology Prize* tracks. Designed around one learner: Xiaomei, 12, rural Yunnan, Mandarin-bilingual, a hand-me-down Android tablet that may or may not have wifi today.

Live demo: https://beacon-xi-cyan.vercel.app · Three-minute video: https://youtu.be/KknRXptUryg · Learning-science rationale: [PEDAGOGY.md](./PEDAGOGY.md)

---

## Where the model is allowed to act

Beacon is not "an AI tutor." It is a structured curriculum with deterministic rules, and a language model that is given a bounded set of jobs. The table is the current product behavior, route by route.

| Job | Surface | What the model does | What it cannot do |
|---|---|---|---|
| Re-explain a wrong answer | `/review` → `/api/explain` | After the learner has read the **hand-written** explanation for that question and asks for another angle, the model re-explains the *same* problem, grounded in the lesson text (RAG). A second request gives a third angle. | Give the first explanation. Decide whether the answer was right. |
| Side-panel tutor | `components/ai-panel.tsx` → `/api/assistant` | Free-form chat next to the lesson. *Guided* mode gives hints and asks leading questions; *Explain* mode gives full step-by-step explanations on request. | Change any stored state — it cannot touch mastery, the review queue, or the curriculum. |
| Narrate a verdict | `/subject` → `/api/advisor` | Puts a readiness verdict (`ready / almost_ready / review_first`) into two warm sentences. | Change the verdict. It is computed in `lib/advisor.ts` from prerequisite mastery and passed to the model as a fact. |
| Quiz post-mortem | `/quiz` → `/api/quiz/take` | Two or three sentences on strengths and weaknesses, from a per-skill breakdown the code already computed. | Score the quiz. |
| Learner portrait | `/dashboard` → `/api/portrait` | Reads the learner's local profile and writes a narrative portrait: where time goes, behavior under difficulty, an independence trend, usage preferences, suggestions — with a required confidence level and an instruction to say "too few sessions to know" rather than invent. **This is the one surface where the model characterizes the learner, and it is shown in both the student and family views.** | Alter any number. The portrait is a reading of the log, not a source of it. |
| Greeting, practice-prompt chips, translation | `/api/greeting`, `/api/suggestions`, `/api/translate` | Short generative text; runtime translation of UI and content into 7 languages. | — |

**Never the model:** which answer is correct (`answersMatch`, bank-authored answers), mastery updates (`lib/progress.ts`), the spaced-repetition schedule, the readiness verdict, and every number in the family view (`lib/efficacy.ts` — no LLM calls in the metrics path). Practice and quiz questions are all hand-authored; none are generated.

## How the boundary got here

It was not a principle we started with. The first build (April 27) had the model teaching the lesson, generating practice questions, and grading them. A nine-run spike on `gemma4:e2b` produced schema-valid JSON every time and semantically clean content seven times out of nine — one run gave `x = 2.5` for `2x + 5 = 15`; one was flagged because its answer index and its explanation did not agree (raw runs and the verifier replay are in `scripts/spike-output/lesson/`; commit `c10605f`). A math-verifier layer was written the next day and abandoned the day after that: for a learner who cannot yet check the explanation herself, a wrong answer in the primary teaching content is not something to catch downstream. Commit `f16bf97` moves all lesson content to a hand-written `curriculum.json`; practice and quiz banks followed (`483e3f7`, `7055ac6`), and the model's re-explanation was demoted behind the hand-written one (`2a9a906`). `lib/prompts.ts` and the tool definitions in `lib/ollama.ts` are the retired April design, kept in the tree as the record of that evaluation; no route imports them.

## What the rules assume — open questions

Moving judgment out of the model into code makes it auditable. It does not make it correct. The rules in `lib/progress.ts` and `lib/efficacy.ts` each carry an assumption about how learning shows up in behavior, and they were not chosen together:

- Completing a lesson raises a topic to at least 0.3 mastery (completion is partial evidence).
- A practice answer moves mastery +0.10 / −0.05 (every answer is reversible evidence about current ability).
- A quiz score can only raise mastery (`max(existing, score/total)`; a low score does not count as counter-evidence).
- A review success advances the next-review interval (1, 2, 4, 8, 16, 32 days) and a failure resets it, but never touches mastery.
- The family view's "Mistakes corrected" counts a mistake as corrected after **one** successful review — a threshold chosen because a two-week pilot never reaches the higher tiers, not from a model of forgetting.
- `error_type` on a wrong answer is currently a constant (`calculation` for practice, `concept` for quiz); the mistake taxonomy shown in `/review` and `/teacher` reflects the schema, not a judgment about the learner.

Whether these local rules describe one coherent learner, and what evidence would tell us, is the question this project left open. It has been used by three children, two weeks each; that is enough to find bugs and not enough to evaluate any of the above.

---

## Two Gemma paths (honest about the model split)

Beacon ships with two parallel inference paths. They run different Gemma releases for the simple reason that the open ecosystem hasn't caught up to Gemma 4 in every runtime yet:

| Path | Model | When it runs | Why |
|---|---|---|---|
| **Server (default)** | `gemma4:e2b` via Ollama | All AI features unless the user toggles Browser-AI on | The Ollama track of this hackathon is built around Gemma 4. Ollama supports it natively; this is the primary path. |
| **Browser (toggle-on)** | `gemma-2-2b-it-q4f16_1-MLC-1k` via WebLLM | When `Browser-side AI (offline)` is on in Settings — only `/review`'s "Show me a different way" routes here today | WebLLM has not yet shipped a Gemma 4 model record ([mlc-ai/web-llm#810](https://github.com/mlc-ai/web-llm/issues/810)). MediaPipe's Gemma 4 E2B web build crashes on Chrome 146 / M4 ([google-ai-edge/mediapipe#6270](https://github.com/google-ai-edge/mediapipe/issues/6270)). Day 1-2 spike picked Gemma 2 2B head-to-head over Gemma 3 1B for Hindi multi-turn quality. |

**This is a technical-constraint trade-off, not a design choice.** The moment WebLLM adds Gemma 4, the change is one model-id update in `lib/webllm-engine.ts:43` — no other code moves. We deliberately did NOT pick a non-Gemma fallback (e.g., SmolLM2) for the browser path, because Gemma-track credibility outweighs an offline-narrative escape valve.

---

## What's in this build

Honest status table — every page, current state.

| Page | State | What works |
|---|---|---|
| **Home (`/`)** | ✅ Real | Live progress, weakest topic, last mistake — all derived from real practice history |
| **Subject catalog (`/subject/math`)** | ✅ Real | 6 grade-7 units, mastery bars, prereq gating, per-row "Preview only" for unauthored bridges |
| **Learn (`/learn-v2/[topicId]`)** | ✅ Real | 5-phase lesson flow (concept → analogy → example → guided → independent); markLessonComplete persists 0.3 mastery on first completion |
| **Practice (`/practice`)** | ✅ Real | Bank-backed deterministic questions, alt_explanation persisted to wrong_answers, mastery deltas |
| **Quiz (`/quiz`)** | ✅ Real | 10-question quiz on `solving_one_step` (unit_6) and `fraction_operations` (unit_5), per-skill breakdown, LLM post-mortem |
| **Review (`/review`)** | ✅ Real | Spaced-repetition queue, three-layer wrong-answer remediation (amber pre-authored / blue LLM grounded / purple "another angle") |
| **Dashboard (`/dashboard`)** | ✅ Real | AI-generated learner portrait via Gemma + thinking trace, view-mode toggle (student/teacher copy variants) |
| **Family view (`/teacher`)** | ✅ Real | Deterministic efficacy HUD for parents / caregivers / volunteer educators — KPIs, mastery distribution, weakest topics, mistake taxonomy, 7-day activity. **Zero LLM in the metrics path.** |

### Authored curriculum

| Unit | Topics | Practice questions | Quiz | Notes |
|---|---|---|---|---|
| `unit_2_proportional` | 4 full + 1 bridge + 1 stub | 24 | — | Condensed (breadth, not depth) |
| `unit_5_rational` | 6 full | 72 | 10 (fraction ops) | Demo-grade upgrade with Yunnan/China anchors (mooncake, yuan) |
| `unit_6_equations` | 7 full | 84 | 10 (solving one-step) | Original gold-standard authoring |
| **Total** | **17 full + 1 bridge + 1 stub** | **180 practice + 20 quiz = 200** | | |

Every practice and quiz question has a hand-authored `alt_explanation` (the amber-Layer-1 deterministic surface in `/review`).

---

## Demo flow — what to look at

For judges or evaluators with 5 minutes:

1. **Open `/`** → see Xiaomei's home with weakest topic + recent activity.
2. **Open `/subject/math`** → expand `unit_5_rational` → see the 6 topics + mastery bars + Preview-only signaling on the bridge/stub.
3. **`/learn-v2/fraction_operations`** → walk through 5 phases. Note the mooncake word problem in the practice bank.
4. **`/practice?topic=fraction_operations`** → answer 1-2 questions correctly, then deliberately wrong on a multi-step item. The alt_explanation that appears is the bank's pre-authored amber Layer 1.
5. **`/review`** → see the wrong answer in the queue. Click "Show me a different way" → blue Layer 2 (Gemma, grounded in the lesson via RAG). Click "Another angle from Gemma" → purple Layer 3.
6. **Open Settings → toggle "Browser-side AI (offline)"** → first time triggers the ~1.6 GB Gemma 2 2B download (progress modal). Once ready, **turn wifi off** and repeat the `/review` "Show different way" flow. AI tutoring works with no network.
7. **`/teacher`** → look at the efficacy HUD. Every number is computed in `lib/efficacy.ts` from the local profile — no AI, no fabrication.

---

## Architecture

```
                 ┌───────────────────────────────────────┐
                 │  curriculum.json (single source)      │
                 │  • 3 authored units                   │
                 │  • 200 practice/quiz questions        │
                 │  • alt_explanations on every one      │
                 └───────────────┬───────────────────────┘
                                 │
        ┌────────────────────────┼─────────────────────────┐
        │                        │                         │
        ▼                        ▼                         ▼
┌──────────────┐      ┌─────────────────────┐    ┌──────────────────────┐
│ /learn-v2    │      │ /practice  /quiz    │    │ /review              │
│ 5-phase flow │      │ deterministic bank, │    │ SR queue, 3-layer    │
│              │      │ mastery deltas      │    │ remediation          │
└──────────────┘      └──────────┬──────────┘    └──────────┬───────────┘
                                 │                          │
                                 │ wrong_answers[],         │
                                 │ session_logs[]           │
                                 ▼                          ▼
                       ┌──────────────────────────────────────┐
                       │  StudentProfile (localStorage)       │
                       │  topics, wrong_answers, sessions,    │
                       │  quiz_results, streak, last_active   │
                       └────────┬─────────────────────────────┘
                                │
        ┌───────────────────────┼─────────────────────────────┐
        │                       │                             │
        ▼                       ▼                             ▼
┌──────────────┐      ┌──────────────────┐         ┌────────────────────┐
│ /dashboard   │      │ /teacher         │         │ AI calls           │
│ AI portrait  │      │ deterministic    │         │ (explain/advisor/  │
│ (Gemma)      │      │ efficacy HUD     │         │ quiz/take/...)     │
└──────────────┘      └──────────────────┘         └─────────┬──────────┘
                                                             │
                                                             ▼
                                              ┌─────────────────────────┐
                                              │  AI engine — toggleable │
                                              │  ┌───────────────────┐  │
                                              │  │ /api/* → Ollama   │  │
                                              │  │ gemma4:e2b (host) │  │
                                              │  └───────────────────┘  │
                                              │  ┌───────────────────┐  │
                                              │  │ WebLLM (browser)  │  │
                                              │  │ gemma-2-2b in     │  │
                                              │  │ IndexedDB         │  │
                                              │  └───────────────────┘  │
                                              └─────────────────────────┘
```

**RAG**: every Gemma call from `/api/explain` (and the WebLLM mirror) injects retrieved curriculum context — concept explanation, bank's alt_explanation for the specific question, and the prerequisite topic's key idea. See `lib/curriculum-rag.ts`.

**Offline AI**: settings toggle picks WebLLM (browser) vs Ollama (host). `lib/explain-prompt.ts` is the shared prompt-construction module so the two backends behave identically. WebLLM lib is dynamic-imported, so users who never enable browser-AI never pay the bundle cost.

---

## Tech stack

- **Next.js 14** (App Router, TypeScript strict)
- **Tailwind CSS** + KaTeX for math rendering
- **Ollama** + **Gemma 4 E2B** for the default host-side AI path (`gemma4:e2b`)
- **`@mlc-ai/web-llm`** + **Gemma 2 2B** (`gemma-2-2b-it-q4f16_1-MLC-1k`) for the browser-side offline AI path — see "Two Gemma paths" above for the model-version rationale
- **localStorage** for student profile (no database; offline-first by design)
- **No analytics, no telemetry, no remote model**

---

## Setup

```bash
# 1. Clone and install
git clone <repo>
cd beacon
npm install

# 2. (Optional) Install Ollama for the host-AI path
#    https://ollama.com/download
ollama pull gemma4:e2b
ollama serve              # in one terminal

# 3. Start Beacon
npm run dev               # in another terminal
# → http://localhost:3000
```

**You can demo Beacon's offline AI without Ollama at all** — open Settings, toggle "Browser-side AI (offline)", and wait for the one-time Gemma 2 2B download (~1.6 GB). WebGPU required (Chrome 113+, Edge, Safari 17+).

Today this toggle routes the `/review` "Show me a different way" flow through the in-browser model — that's the hackathon's offline proof point: turn wifi off after the download and the wrong-answer remediation surface still tutors. Other AI surfaces (`/dashboard` portrait, `/quiz` post-mortem, `/subject` advisor narration, runtime translation) currently still call Ollama; broadening WebLLM coverage to those surfaces is on the roadmap and is a one-call swap per surface (see `lib/explain-prompt.ts` for the shared prompt-construction pattern).

### Environment

| Variable | Default | Notes |
|---|---|---|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama server URL. Matches Ollama's own conventional env var. |
| `OLLAMA_URL` | — | Legacy alias for `OLLAMA_HOST`; honored when set so older shell configs keep working. `OLLAMA_HOST` takes precedence. |
| `OLLAMA_MODEL` | `gemma4:e2b` | Override the host model. Default tracks the hackathon's Gemma 4 E2B release. |

---

## Privacy

Beacon transmits no student data. There is no analytics SDK, no telemetry endpoint, no remote model. Profile data lives in `localStorage` on the student's device. Models live in either Ollama (host disk) or IndexedDB (browser cache). **Turn wifi off and Beacon still works.**

---

## Repository tour

| Path | What's there |
|---|---|
| `app/` | Next.js routes (page-per-feature) |
| `lib/curriculum.ts`, `lib/curriculum-rag.ts` | Curriculum access + RAG retrieval |
| `lib/efficacy.ts` | Pure analytics helpers for Teacher view |
| `lib/explain-prompt.ts` | Shared prompt construction (Ollama path + WebLLM path use the same builder) |
| `lib/progress.ts` | Profile schema, mastery deltas, SR cadence |
| `lib/webllm-engine.ts` | Browser-side Gemma engine (lazy singleton, status pub/sub) |
| `data/curriculum.json` | All curriculum content (3 units, 200 questions, hand-authored) |
| `scripts/webllm-spike/` | Day 1-2 head-to-head spike that picked Plan B (gemma-2-2b) |
| `scripts/mediapipe-spike/` | Parallel MediaPipe spike (deferred, not integrated) |
| `PEDAGOGY.md` | Learning-science foundation, design choices mapped to research |

---

## License

MIT — see [LICENSE](./LICENSE).

## Attribution

Beacon was built by **Yuelin Ou** for the Kaggle Gemma 4 Good Hackathon, 2026.
