// Chat defaults come from env; the settings UI overrides them at runtime
// via the settings:set IPC (see ipc.ts). Renderer is the source of truth.
let chatModel = process.env.FCC_CHAT_MODEL ?? 'claude-haiku-4-5-20251001';
let chatMaxTurns = Number(process.env.FCC_CHAT_MAX_TURNS ?? 50);

export function getChatConfig(): { model: string; maxTurns: number } {
  return { model: chatModel, maxTurns: chatMaxTurns };
}

export function setChatConfig(c: { model: string; maxTurns: number }): void {
  if (c.model) chatModel = c.model;
  if (Number.isFinite(c.maxTurns) && c.maxTurns > 0) chatMaxTurns = c.maxTurns;
}
