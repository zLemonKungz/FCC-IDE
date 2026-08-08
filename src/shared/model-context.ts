// model-context.ts — real context-window (tokens) logic shared by BOTH sides:
// the renderer's context meters (ChatColumn, Chat settings) and the main
// process's CLAUDE_CODE_AUTO_COMPACT_WINDOW. The CLI's
// result.modelUsage[model].contextWindow can report 200000 as a bundled-table
// fallback for newer ids (fable-5, opus-5, …) whose true window is 1M — so the
// app keeps its own family map and prefers it over that field.

/** Normalize a model id (gateway aliases incl.) to a lowercase family stem,
 *  e.g. "anthropic/opencode_zen/claude-fable-5" → "fable-5". Single home — the
 *  renderer's `effortFamily`/`claudeLabel` delegate here. */
export function modelFamilyStem(model: string): string {
  return (model.split('/').pop() ?? model).toLowerCase().replace(/^claude-/, '').replace(/-\d{6,8}$/, '');
}

/** True context window in tokens for a model id; null when unknown (callers
 *  then fall back to the CLI's report / a default). */
export function modelContextWindow(model: string): number | null {
  const fam = modelFamilyStem(model);
  // The current-gen 1M line: no separate id, the plain id IS the 1M model.
  if (/^(fable|mythos)(-\d.*)?$/.test(fam) || /^(opus|sonnet)-4-6/.test(fam) || /^(opus|sonnet)-5\b/.test(fam)) {
    return 1_000_000;
  }
  // Opus 4.7 / 4.8 are also 1M (the plain opus-4.x range after 4.5).
  if (/^opus-(4-7|4-8)\b/.test(fam)) return 1_000_000;
  // Everything else the app curates is 200k (haiku, legacy 4/4.5 line).
  if (/^(haiku|sonnet|opus|3\b)/.test(fam)) return 200_000;
  return null;
}

/** Resolve the effective context window (raw tokens) to display / compact at:
 *  the app's known window for the selected model first (correct even when the
 *  CLI's table under-reports a true-1M model), else the CLI's own report, else
 *  the user's auto-compact window (k→tokens), else 200k. Used by both the
 *  renderer meters and the main spawn — one definition, no drift. */
export function effectiveContextWindow(model: string, sessionWindow: number, autoCompactK: number): number {
  return modelContextWindow(model) ?? (sessionWindow > 0 ? sessionWindow : autoCompactK > 0 ? autoCompactK * 1000 : 200_000);
}