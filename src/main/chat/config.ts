// Chat defaults come from env; the settings UI overrides them at runtime
// via the settings:set IPC (see ipc.ts). Renderer is the source of truth.
import { modelContextWindow } from '@shared/model-context';
let chatModel = process.env.FCC_CHAT_MODEL ?? 'claude-haiku-4-5-20251001';
let chatMaxTurns = Number(process.env.FCC_CHAT_MAX_TURNS ?? 50);
// Auto-compact threshold in thousands of tokens (maps to the CLI's
// CLAUDE_CODE_AUTO_COMPACT_WINDOW, which is in raw tokens). 0 = follow the
// model's own context window — the env var is left unset so the CLI compacts
// at the model's native limit instead of a fixed cap.
let autoCompactWindow = Number(process.env.FCC_CHAT_AUTO_COMPACT ?? 0);
// Model effort level for the spawned session ('auto' = unset → model default).
// Drawn from the chat settings UI (+ FCC_CHAT_EFFORT env for a headless default).
let effort = process.env.FCC_CHAT_EFFORT ?? 'auto';

export interface ChatConfig {
  model: string;
  maxTurns: number;
  autoCompactWindow: number;
  effort: string;
}

export function getChatConfig(): ChatConfig {
  return { model: chatModel, maxTurns: chatMaxTurns, autoCompactWindow, effort };
}

/** The compaction window to send to the CLI (raw tokens). An explicit value is
 *  used as-is; 0 = auto resolves the model's real window (so a true 1M model
 *  compacts at 1M, not the CLI's 200k table default); null = unknown model →
 *  leave the env unset. Beats the old `autoCompactWindowFor` alias that just
 *  forwarded to `modelContextWindow`. */
export function effectiveAutoCompactTokens(): number | null {
  if (autoCompactWindow > 0) return autoCompactWindow * 1000;
  return modelContextWindow(chatModel);
}

export function setChatConfig(c: { model: string; maxTurns: number; autoCompactWindow?: number; effort?: string }): void {
  if (c.model) chatModel = c.model;
  if (Number.isFinite(c.maxTurns) && c.maxTurns > 0) chatMaxTurns = c.maxTurns;
  // 0 is a real value: it means "auto — follow the model's context window".
  if (c.autoCompactWindow !== undefined && Number.isFinite(c.autoCompactWindow) && c.autoCompactWindow >= 0) {
    autoCompactWindow = c.autoCompactWindow;
  }
  if (typeof c.effort === 'string') effort = c.effort;
}
