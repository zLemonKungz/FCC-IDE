// Chat defaults come from env; the settings UI overrides them at runtime
// via the settings:set IPC (see ipc.ts). Renderer is the source of truth.
let chatModel = process.env.FCC_CHAT_MODEL ?? 'claude-haiku-4-5-20251001';
let chatMaxTurns = Number(process.env.FCC_CHAT_MAX_TURNS ?? 50);
// Auto-compact threshold in thousands of tokens (maps to the CLI's
// CLAUDE_CODE_AUTO_COMPACT_WINDOW, which is in raw tokens).
let autoCompactWindow = Number(process.env.FCC_CHAT_AUTO_COMPACT ?? 190);

export interface ChatConfig {
  model: string;
  maxTurns: number;
  autoCompactWindow: number;
}

export function getChatConfig(): ChatConfig {
  return { model: chatModel, maxTurns: chatMaxTurns, autoCompactWindow };
}

export function setChatConfig(c: { model: string; maxTurns: number; autoCompactWindow?: number }): void {
  if (c.model) chatModel = c.model;
  if (Number.isFinite(c.maxTurns) && c.maxTurns > 0) chatMaxTurns = c.maxTurns;
  if (c.autoCompactWindow !== undefined && Number.isFinite(c.autoCompactWindow) && c.autoCompactWindow > 0) {
    autoCompactWindow = c.autoCompactWindow;
  }
}
