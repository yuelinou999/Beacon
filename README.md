# Beacon

**A complete offline classroom — curriculum, lessons, practice, review, and family-facing analytics — running entirely on a single device. For places where the missing piece isn't bandwidth, but the teacher and the textbook.**

Built for the **Kaggle Gemma 4 Good Hackathon** — *Future of Education* and *Ollama Special Technology Prize* tracks.

---

## The strategic thesis

When most people think about underserved learners they think about **bandwidth**. Get the internet to the village and the rest follows. That framing misses the harder problem.

In many parts of the world the bottleneck isn't connectivity — it's **people and materials**. Schools where one teacher covers four grades. Communities where no textbook exists in the child's first language. A curious 12-year-old with a question, and no one to ask and no book to re-read.

Connectivity is logistics. **The real gap is the teacher and the textbook.**

Beacon is built for those places. A single tablet runs a complete classroom: hand-authored curriculum, scaffolded lessons, graded practice, spaced-repetition review, and a parent-facing analytics surface — all powered by Gemma running locally, with no requirement that the device be online today, tomorrow, or ever again. The model is the teacher; the bank is the textbook; the device is the classroom.

Beacon is built around a single persona: **Xiaomei** — 12 years old, rural Yunnan, China, Mandarin-bilingual, learning on a hand-me-down Android tablet that may or may not have wifi today. Every design choice is downstream of what works for Xiaomei.

Three gaps, three pillars:

1. **Closing the connectivity gap** — Gemma 2 2B runs in the browser tab via WebLLM (~1.6 GB, one-time download, then permanently cached in IndexedDB). Close the browser, turn wifi off entirely, reopen — the classroom still works. Verified end-to-end (`scripts/webllm-spike/` for the head-to-head A/B that picked the model).
2. **Closing the teacher gap** — three fully-authored math units (200+ practice questions, hand-written alt-explanations on every one), spaced-repetition review, deterministic verdict + LLM-narrated assessment, curriculum-grounded RAG, three-layer wrong-answer remediation. The model and the curriculum together do the work a teacher would normally do. See [PEDAGOGY.md](./PEDAGOGY.md) for the learning-science mapping.
3. **Closing the materials gap** — 7 supported languages (en/zh/hi/es/sw/fr/ar) via runtime translation; cultural anchors (mooncake / yuan) for learners whose textbook would otherwise be a foreign object; persona Xiaomei (rural Yunnan, China, 12 y/o, Mandarin-bilingual, old Android tablet) drives every difficulty and example choice.

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

## What Beacon is NOT

- Not a chatbot wrapper. It's a structured curriculum with a tutor on top.
- Not LLM-generated content. The 200+ practice/quiz questions and their alt-explanations are all hand-authored — see [PEDAGOGY.md §4](./PEDAGOGY.md).
- Not pretending to evaluate learning via LLM. The Teacher View is fully deterministic; assessment verdicts are deterministic; LLM is used for warm communication of structured data, not to score the student.
- Not online-only with an "offline mode" bolted on. Offline is the design center; the toggle just picks WHERE the model runs.

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
