# Beacon — Pedagogical Foundation

**One-page brief for the Kaggle Gemma 4 Good Hackathon — Future of Education + Ollama Special Tech tracks.**

Beacon is built for **the places where the missing piece in education isn't bandwidth — it's the teacher and the textbook**. Connectivity is a logistics problem; pedagogy and materials are the harder problems. Other offline-first projects (rightly) close the connectivity gap. Beacon goes further: a single tablet running a complete classroom — curriculum, scaffolded lessons, graded practice, spaced-repetition review, and a parent-facing analytics surface — so a curious 12-year-old can learn even when no teacher and no textbook are within reach. Every design choice below is downstream of that claim, and every choice is grounded in established learning science.

---

## Three gaps, three pillars, mapped to learning science

| Pillar | The gap it closes | Beacon design choice | Learning principle |
|---|---|---|---|
| **A. Closing the connectivity gap** | No reliable internet | WebLLM + Gemma 2 2B cached in IndexedDB; L2 cold-restart verified (close browser, wifi off, reopen → still works) | Equity of access (UNESCO ICT-CFT). A classroom that demands a SIM card excludes the student who needs one most. |
| **B. Closing the teacher gap** | Schools without enough teachers; one teacher covering many grades | 5-phase lesson scaffold; bank-backed practice with hand-authored alt-explanations; three-layer wrong-answer remediation; spaced-repetition review; deterministic verdict + LLM narration | Cognitive Load Theory (Sweller); gradual release of responsibility (Pearson & Gallagher); retrieval practice (Roediger & Karpicke); multiple representations (Bruner). |
| **C. Closing the materials gap** | No textbook in the learner's first language; no curriculum that reflects their world | Xiaomei — rural Yunnan, China, 12 y/o, Mandarin-bilingual, old Android tablet — drives every difficulty/example choice; runtime translation across 7 languages; cultural anchors (mooncake / yuan) in unit_5 | Universal Design for Learning (CAST UDL); translanguaging as cognitive scaffold (García & Wei). |

> **A note on the two Gemma releases.** The default server-side path runs **Gemma 4 E2B** via Ollama (`gemma4:e2b`). The browser-side offline path runs **Gemma 2 2B** via WebLLM (`gemma-2-2b-it-q4f16_1-MLC-1k`) because WebLLM has not yet added Gemma 4 to its prebuilt records ([mlc-ai/web-llm#810](https://github.com/mlc-ai/web-llm/issues/810)) and MediaPipe's Gemma 4 web build crashes on Chrome 146/M4 ([google-ai-edge/mediapipe#6270](https://github.com/google-ai-edge/mediapipe/issues/6270)). Day 1-2 spike data picked Gemma 2 2B over Gemma 3 1B head-to-head for Hindi multi-turn correctness. We did not fall back to non-Gemma models — Gemma-track credibility outweighs the offline-narrative escape valve. See README "Two Gemma paths" for the full rationale.

---

## Why each Beacon-specific pattern exists

### 1. Three-layer wrong-answer remediation (amber → blue → purple)

When a learner answers wrong on `/review`:

- **Amber Layer 1** = the bank's pre-authored `alt_explanation` for that question. Hand-authored alongside the lesson, **deterministic**, always available, **never hallucinates**.
- **Blue Layer 2** = Gemma generates a fresh explanation grounded in curriculum RAG (see §4).
- **Purple Layer 3** = "Another angle from Gemma" — student-triggered second LLM take with the original Layer 1 explicitly excluded.

**Why three layers and not just one LLM call**: the first response is *always* correct because it is hand-authored. The student never sees a confident wrong answer from the AI. The AI's role is to add additional angles, not to replace the lesson author. This is the "**deterministic core, LLM scaffolding**" pattern applied to remediation.

Backed by: multiple representations (Bruner — varying explanations of the same idea aids transfer); error-correction-as-instruction (Hattie's effect-size analysis ranks corrective feedback in the top decile of pedagogical interventions).

### 2. Deterministic verdict + LLM narration (advisor pattern)

Beacon's "Check readiness with AI" surface uses a two-tier design:

- **Tier 1 (deterministic)**: client-side `analyzeReadiness()` computes a verdict — `ready / almost_ready / review_first` — by inspecting the prerequisite unit's mastery percentages. Auditable. Reproducible.
- **Tier 2 (LLM)**: Gemma narrates the verdict warmly in 2–3 sentences, naming what's strong and what's weak. **The LLM cannot override the verdict**. Its job is communication, not assessment.

**Why**: assessment by LLM is the failure mode educators fear most — quiet hallucination of competence. Beacon makes the assessment provably deterministic and uses the LLM only for the part it is provably good at (warm communication of structured information).

Backed by: formative assessment validity (Black & Wiliam); the "two systems" cognitive split applied to AI tutoring (Holstein et al., human-AI complementarity).

### 3. Curriculum-grounded RAG — structured retrieval, not embedding similarity

When a learner asks for a different explanation of a wrong answer, `/api/explain` retrieves:

- The originating topic's `concept.explanation` and `key_idea`
- The pre-authored bank `alt_explanation` for THAT specific question
- The prerequisite topic's `key_idea` (one level back)

Then injects that block into Gemma's prompt with the instruction *"Explain it differently — but stay consistent with the lesson context above."*

**Why structured retrieval, not embedding similarity**: the caller already knows the topic ID at every retrieval site (`WrongAnswer.topic`, current lesson, advisor unit). Embedding similarity would just rediscover information we already have, while adding infra cost and an extra failure mode. Embedding-based RAG is the right tool for free-form retrieval over an unstructured corpus — that's not Beacon's access pattern. (See `lib/curriculum-rag.ts` header comment for full rationale.)

Backed by: anchored instruction (CTGV — Cognition & Technology Group at Vanderbilt); the principle of consistency between assessment, instruction, and remediation.

### 4. Bank-backed deterministic practice + spaced-repetition review

Every authored unit ships with 6–12 practice questions per topic, each with explicit `difficulty` (easy/medium/hard, 4-4-4 distribution where authored at full quality) and a hand-authored `alt_explanation`. Wrong answers persist to `wrong_answers[]` with spaced-repetition cadence — intervals `[1, 2, 4, 8, 16, 32]` days, ratcheting on consecutive correct reviews, resetting on failed reviews.

**Why pre-authored questions, not LLM-generated**: LLM-generated math questions drift in difficulty and occasionally produce ambiguous or wrong answers. A demo where a tutor generates an unsolvable question is unrecoverable. Pre-authoring is the cost we accept to keep the practice surface trustworthy.

Backed by: retrieval practice (Roediger & Karpicke 2006 — the "testing effect"); spacing effect (Cepeda et al. 2008 meta-analysis of optimal review intervals); item response theory's argument for difficulty-tagged item banks.

### 5. Five-phase lesson scaffold

Each fully-authored topic has: **concept → analogy → example → guided practice → independent practice**. The phases match Pearson & Gallagher's gradual-release-of-responsibility framework: I-do (concept + worked example), we-do (guided), you-do (independent).

**Why all five and not just video + quiz**: cognitive load theory (Sweller) argues novice learners need worked examples *before* problem-solving practice; collapsing these phases together overloads working memory. The scaffold also aligns with Madeline Hunter's lesson-design model — explicit instructional moments rather than discovery-by-default.

### 6. Teacher View as evaluation surface

Beacon's `/teacher` route is the deterministic counterpart to the AI-narrated student dashboard:

- 4 KPI cards (active days, topics mastered, mistakes corrected, minutes studied)
- Mastery distribution across all progressable topics
- Top-3 weakest topics with practice links
- Mistake taxonomy (concept / calculation / rushing)
- 7-day activity strip

**Every number on this page is computed in pure functions over the student's local profile — no AI, no fabrication.** A teacher or evaluator can verify each metric by inspecting the underlying JSON. This is Beacon's answer to "how do you know your tutor is actually helping?"

Backed by: formative assessment principles (Black & Wiliam); the argument that AI-tutoring claims must be falsifiable to be credible.

---

## What we deliberately ruled out

- **MediaPipe LLM Inference web** — Codex's initial recommendation, but spike data showed Gemma 4 E2B has known crash on Chrome 146/M4 (issue #6270), and our WebLLM + Gemma 2 2B (Plan B) head-to-head data already passed every gate. Defer to Day 7+ if Day 7 integration blocks.
- **Embedding-based RAG** — adds an embedding model (~25-100 MB) + vector index without improving over exact topic lookups for our access patterns. We always know the topic ID at retrieval time. Reserved for future cross-topic free-form chat.
- **LLM-generated practice questions** — bank quality and difficulty consistency outweigh authoring cost.
- **Cloud sync / multi-device profiles** — explicit non-goal. Privacy + offline-first preclude it.
- **A non-Gemma fallback** — the spike's hard rule was *no SmolLM2 fallback even if Gemma proved hard*. Gemma-track credibility outweighs the offline-narrative escape valve.

---

## Reading list (selected)

- Sweller, J. (1988). *Cognitive Load During Problem Solving.*
- Pearson, P. D., & Gallagher, M. C. (1983). *The Instruction of Reading Comprehension* — gradual release of responsibility.
- Roediger, H. L., & Karpicke, J. D. (2006). *Test-Enhanced Learning.*
- Cepeda et al. (2008). *Spacing effects in learning: A temporal ridgeline of optimal retention.*
- Black, P., & Wiliam, D. (1998). *Assessment and Classroom Learning* — formative assessment foundation.
- Hattie, J. (2009). *Visible Learning* — meta-analyses of effect sizes.
- García, O., & Wei, L. (2014). *Translanguaging.*
- CAST. *Universal Design for Learning Guidelines.*

---

*Beacon was built by Yuelin Ou for the Gemma 4 Good Hackathon, 2026.*
