# Beacon

**An offline AI classroom for math, running entirely on your laptop.**
No cloud, no API keys, no data leaving the device.

Built for the **Kaggle Gemma 4 Good Hackathon** — *Future of Education* and *Ollama Special Technology Prize* tracks.

---

## What Beacon is (and isn't)

Beacon is **not a chatbot wrapper**. It's a structured learning environment built around a real curriculum.

A student opens Beacon and sees a personal home page with their actual progress. They pick a unit, work through a guided lesson, practice with model-graded questions, and over time the system builds a **portrait of who they are as a learner** — not "78% mastery on linear equations" but *"You're a hands-on learner who slows down and gets dramatically more accurate, but your instinct under pressure is to speed up and guess."*

That portrait is generated locally by **Gemma 4 E2B** running through **Ollama**, using the model's thinking mode so the analytical reasoning is itself a viewable artifact — not a black box score.

The whole system runs on a single laptop. Offline. Forever.

---

## Why offline matters

Most AI tutoring tools assume always-on internet, paid API access, and willingness to ship every keystroke a child writes to a remote server. None of those are true for the students Beacon is built for — kids in rural classrooms, students with limited connectivity, families who don't want their child's learning data on someone else's cluster.

Beacon's claim is simple: **a five-year-old laptop + Ollama + Beacon = a complete math classroom**. No subscription. No account. No telemetry.

---

## Tech stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS** for styling
- **KaTeX** for math rendering
- **Ollama** for local model serving
- **Gemma 4 E2B** as the model (~2B effective parameters, fits on consumer hardware)
- **localStorage** for student profile persistence (no database required for v1)

---

## Setup

```bash
# 1. Install Ollama (https://ollama.com/download)
# 2. Pull the model
ollama pull gemma4:e2b

# 3. Install dependencies
npm install   # or pnpm install

# 4. Start Ollama and the dev server
ollama serve              # in one terminal
npm run dev               # in another

# Beacon runs at http://localhost:3000
```

The first lesson takes a few seconds to warm up the model. Subsequent calls are fast.

### Environment

| Variable | Default | Notes |
|---|---|---|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `gemma4:e2b` | Override the model name |

---

## What's in this build

Beacon is built for a hackathon, so every page is honest about its current state:

| Page | Status | What works |
|---|---|---|
| **Home** | Real | Live progress, weakest topic, fading topic, last mistake — all derived from real practice history |
| **Subject (Math)** | Real | Topic list, mastery bars, memory-strength panel based on real `last_seen` data |
| **Learn** | Real | Streaming lessons via Ollama, auto-detected lesson completion |
| **Practice** | Real | Model-generated questions, model-graded answers (with partial credit), persistence to profile |
| **Quiz** | Building | Topic-end check (5 questions, reuses Practice's tool-calling path) |
| **Review** | Building | Spaced re-prompting from `wrong_answers` (the data is already being collected by Practice) |
| **Dashboard / AI Portrait** | Building | The demo centerpiece — Gemma 4 E2B in thinking mode, ingesting full session history |

Other subjects (Science, English) are placeholders pointing at the curriculum-first architecture. The math curriculum is the deepest seam and the one being demoed.

---

## Architecture (current state)

```
[ Student action ]
       |
       v
[ Page component ] --> [ /api/{learn,practice,...} route ]
       |                          |
       |                          v
       |                  [ lib/ollama.ts ] --> localhost:11434 (Ollama)
       |                                              |
       |                                              v
       |                                      Gemma 4 E2B (local)
       |
       v
[ lib/progress.ts ] --> localStorage
       |
       v
[ Profile: topics, answer_history, wrong_answers, session_logs, ... ]
```

All AI calls are tool-calling where structure matters (question generation, grading), and streaming chat where flow matters (lesson delivery).

---

## Roadmap to submission (deadline: 2026-05-18)

- **Week 1**: Build the Dashboard / AI Portrait end-to-end. Schema, prompt, thinking-mode rendering, full UI per the design reference.
- **Week 2**: Build Review and Quiz on top of the data Practice already produces.
- **Week 3**: Demo polish — error paths, Ollama-offline handling, README and demo script, recorded walkthrough.

---

## Design reference

The visual design and content structure for Beacon's UI come from a Figma-derived prototype kept in a sibling repository (not part of this build). Page components in this repo target the same visual spec but are rewritten for the Next.js + real-data-layer environment.

See `docs/design-reference.md` for the porting boundary.

---

## Privacy

Beacon does not transmit student data anywhere. There is no analytics SDK, no telemetry endpoint, no remote model. Profile data lives in browser `localStorage` on the student's device. The model lives on disk via Ollama.

If you turn off your wifi, Beacon still works.

---

## License

[TBD before submission]

## Attribution

Beacon was built by Yuelin Ou for the Gemma 4 Good Hackathon, 2026.
