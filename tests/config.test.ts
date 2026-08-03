import { describe, it, expect } from 'vitest';
import { getChatConfig, setChatConfig } from '../src/main/chat/config';

describe('chat config', () => {
  it('defaults to the env values when unset', () => {
    const c = getChatConfig();
    expect(c.model).toBe('claude-haiku-4-5-20251001');
    expect(c.maxTurns).toBe(50);
  });

  it('applies overrides from the settings IPC', () => {
    setChatConfig({ model: 'claude-opus-5', maxTurns: 80 });
    expect(getChatConfig()).toEqual({ model: 'claude-opus-5', maxTurns: 80 });
  });

  it('ignores an empty model and non-positive turns', () => {
    setChatConfig({ model: 'claude-opus-5', maxTurns: 80 });
    setChatConfig({ model: '', maxTurns: 0 });
    expect(getChatConfig()).toEqual({ model: 'claude-opus-5', maxTurns: 80 });
  });
});
