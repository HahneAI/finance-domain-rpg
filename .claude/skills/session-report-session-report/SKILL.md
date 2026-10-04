---
name: session-report
description: Generate an explorable, offline HTML report of Claude Code session usage (tokens, cache, subagents, skills, expensive turns) from ~/.claude/projects transcripts. Run only when the user explicitly asks for a usage / session-insights report. Output goes outside the repo with prompt text redacted by default.
---

# Session Report — Authority Finance edition

Produce a self-contained HTML report of Claude Code **development** usage (not the app's Coach API spend — that is Anthropic billing from `api/coach.js`, which this cannot see). Run only when the user explicitly asks. Never commit, push or open the result.

## Safeguards — these override the generic steps below

1. **Output goes OUTSIDE the repo, always.** Use the session scratchpad directory if the environment names one (the Claude app can open it); otherwise `${TMPDIR:-/tmp}/claude-session-reports/`. Never write the JSON or HTML into the repo working tree — the Stop hook demands untracked repo files be committed and pushed, and a report is usage data. (`.gitignore` also blocks `session-report-*.html|json` as a backstop; do not rely on it.) Create the directory first: `mkdir -p "$OUT"`.
2. **Prompt text is redacted by default.** The raw analyzer JSON embeds the user's own prompts and the turns around them (`top_prompts[].text`, `top_prompts[].context[].text`, `cache_breaks[].context[].text`). Always run `redact-report.mjs` and embed only the redacted file. Refer to expensive turns by **rank, timestamp and token share**, never by quoting. Only if the user explicitly asks to include prompt text, skip redaction — and say plainly that the file now contains their prompt excerpts and must not be shared or committed.
3. **Offline report.** The template no longer loads Google Fonts; do not add any `<link>`, `<script src>`, image or font from the network.
4. **Scope honesty.** The analyzer reads `~/.claude/projects` of the machine it runs on. In a cloud session that is only this container's few, ephemeral sessions — say so in the report's first finding ("covers N sessions in this container, not your full history"). Full history lives on the user's desktop; there they can pass `--dir <copied-projects-dir>`.
5. **Read-only analysis.** The script only reads transcripts. Do not edit, move or delete anything under `~/.claude`.

## Steps

1. **Set paths and get data** (default window last 7 days; honor `24h`, `30d`, `all`; for all-time omit `--since`). `<skill-dir>` is this file's directory:
   ```sh
   OUT="<scratchpad dir, or ${TMPDIR:-/tmp}/claude-session-reports>"; mkdir -p "$OUT"
   node <skill-dir>/analyze-sessions.mjs --json --since 7d > "$OUT/session-report-raw.json"
   node <skill-dir>/redact-report.mjs "$OUT/session-report-raw.json" "$OUT/session-report.json"
   rm -f "$OUT/session-report-raw.json"      # drop the unredacted copy unless the user asked for prompt text
   ```
2. **Read** `$OUT/session-report.json`. Skim `overall`, `by_project`, `by_subagent_type`, `by_skill`, `cache_breaks`, `top_prompts`, `by_day`.
3. **Copy the template** to the output dir:
   ```sh
   cp <skill-dir>/template.html "$OUT/session-report-$(date +%Y%m%d-%H%M).html"
   ```
4. **Edit the output file** (use Edit, not Write — preserve the template's JS/CSS):
   - Replace the contents of `<script id="report-data" type="application/json">` with the full redacted JSON. The page's JS renders the hero total, tables, bars and drill-downs from it.
   - Fill the `<!-- AGENT: anomalies -->` block with **3–5 one-line findings**, figures as a **% of total tokens** where possible (total = `overall.input_tokens.total + overall.output_tokens`). Exact markup:
     ```html
     <div class="take bad"><div class="fig">41.2%</div><div class="txt"><b>project-name</b> consumed 41% of the window across just 3 sessions</div></div>
     ```
     Classes: `.take bad` waste/anomalies, `.take good` healthy signals, `.take info` neutral facts. `.fig` is one short number; `.txt` is one plain sentence naming the project/skill/subagent type (never a quoted prompt). Look for: a project, skill or subagent type eating a disproportionate share; cache hit <85%; one turn >2% of total; subagent types averaging >1M tokens per call; cache breaks clustering; and — specific to this repo — long skill/tool listings re-sent every turn inflating input tokens.
   - Fill the `<!-- AGENT: optimizations -->` block (bottom of page) with 1–4 `<div class="callout">` suggestions tied to specific rows (e.g. "subagent type X averaged 1.4M tokens per call — scope it narrower").
   - Do not restructure existing sections.
5. **Report** the saved file path (and that it is outside the repo, prompt text redacted). Do not open or render it. Confirm `git status` shows no new files in the repo.

## Notes

- The template provides the interactivity (sorting, expand/collapse, block-char bars). Your job is data + narrative.
- Keep commentary terse and specific — real project names, numbers and timestamps from the JSON.
- `top_prompts` already includes subagent tokens and rolls task-notification continuations into the originating prompt.
- If the JSON is >2MB, trim `top_prompts` and `cache_breaks` to 100 entries each before embedding.
