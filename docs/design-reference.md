# Design reference

Beacon's visual design and content structure come from a Figma-derived
Vite + React prototype maintained outside this repository.

## Where the prototype lives

The prototype is a separate repo (sibling folder on disk, not a submodule).
It is **not** part of this build and is **not** part of the hackathon
submission. It exists purely as a design source of truth.

## The porting boundary

When porting a screen from the prototype into this Next.js app:

**Take from the prototype:**
- Visual structure (sections, grids, cards, spacing)
- Color tokens, typography, iconography
- Copy and tone of voice (e.g. the AI Portrait narrative voice)
- Component decomposition where it makes sense

**Do NOT take from the prototype:**
- useState / data shapes — rewrite against `lib/progress.ts` and the real
  profile schema
- Hardcoded mock data — replace with real reads from localStorage / Ollama
- Routing assumptions — the prototype is single-page, this app uses Next.js
  App Router
- Styling approach where it conflicts — prefer Tailwind utilities consistent
  with the rest of this repo over inline `style={{...}}` blocks copied from
  the prototype

## Pages with prototype designs available

| Page in this repo | Prototype component | Notes |
|---|---|---|
| `app/dashboard/page.tsx` | `DashboardScreen.tsx` | 5 sections; dual-mode (narrative + analytical) maps to Gemma 4 thinking mode |
| `app/quiz/page.tsx` | `QuizScreen.tsx` | Reuses Practice's tool-calling path |
| `app/review/page.tsx` | `ReviewScreen.tsx` | Reads from `profile.wrong_answers` |
| `app/subject/[id]/page.tsx` | `SubjectDetailScreen.tsx` + `UnitDetailScreen.tsx` | Adds unit-aware navigation that current implementation lacks |
| `app/learn/page.tsx` | `LearnScreen.tsx` + `LearnFeedbackScreen.tsx` | Already implemented; consult only if reworking phase structure |

## Workflow when porting a screen

1. Open the prototype component in a separate editor window
2. Re-implement the visual structure in this repo using existing patterns
3. Wire to real data via `lib/progress.ts` and `/api/...` routes
4. Verify offline behavior (Ollama down)
5. Delete any leftover mock data
