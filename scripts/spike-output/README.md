# Spike artifacts — Gemma 4 thinking mode probe

Generated: 2026-04-27T16:53:23.438Z

These files are the raw, untouched output of three Ollama chat completions
against `gemma4:e2b`, using three different mechanisms for invoking
thinking mode:

- Experiment A — request body has `think: true` (with one retry as `think: "high"` if A fails)
- Experiment B — system message starts with `/think ...`
- Experiment C — control, no thinking mechanism

For each experiment we persist:

- `experiment-{X}-request.json` — exact request body sent
- `experiment-{X}-response-raw.json` — full unmodified Ollama response
- `experiment-{X}-summary.txt` — derived view (model, thinking field, tag counts, top-level keys)

If an experiment failed, you'll see `experiment-{X}-FAILURE.md` instead of
the response/summary pair.

## Summary table

experiment | status | model returned | message.thinking | top-level thinking | <think> tag count | duration
-- | -- | -- | -- | -- | -- | --
A | OK | gemma4:e2b | present | absent | 0 | 26.70s
B | OK | gemma4:e2b | present | absent | 0 | 22.38s
C | OK | gemma4:e2b | present | absent | 0 | 16.66s
