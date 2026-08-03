import { describe, it, expect } from 'vitest';
import { emptyChatState, applyChatEvent, type ChatEvent } from '../src/renderer/src/chat/chat-reducer';

describe('applyChatEvent', () => {
  it('appends assistant text to the last assistant message', () => {
    let s = emptyChatState();
    s = applyChatEvent(s, { type: 'assistant', message: { content: [{ type: 'text', text: 'Hel' }] } }).state;
    s = applyChatEvent(s, { type: 'assistant', message: { content: [{ type: 'text', text: 'lo' }] } }).state;
    expect(s.messages[0].text).toBe('Hello');
  });

  it('tracks tool_use embedded in assistant content and marks success on tool_result', () => {
    let s = emptyChatState();
    s = applyChatEvent(s, {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'C:/proj/a.ts' } }] }
    }).state;
    expect(s.messages[0].tools[0].state).toBe('running');
    const r = applyChatEvent(s, {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: false }] }
    });
    expect(r.state.messages[0].tools[0].state).toBe('success');
    expect(r.fileEvents).toEqual([{ path: 'C:/proj/a.ts' }]);
  });

  it('marks failed tool_result as error without a file event', () => {
    let s = emptyChatState();
    s = applyChatEvent(s, {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 't2', name: 'Write', input: { file_path: 'C:/proj/b.ts' } }] }
    }).state;
    const r = applyChatEvent(s, {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't2', is_error: true }] }
    });
    expect(r.state.messages[0].tools[0].state).toBe('error');
    expect(r.fileEvents).toEqual([]);
  });

  it('captures session id and clears error on start', () => {
    let s = emptyChatState();
    s = applyChatEvent(s, { type: 'started' }).state;
    expect(s.running).toBe(true);
    expect(s.error).toBeNull();
  });

  it('ignores system messages', () => {
    const s = applyChatEvent(emptyChatState(), { type: 'system' } as ChatEvent).state;
    expect(s.messages).toHaveLength(0);
  });

  it('captures token usage from the result message', () => {
    const s = applyChatEvent(emptyChatState(), {
      type: 'result',
      usage: { input_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 2, output_tokens: 7 },
      total_cost_usd: 0.0012
    }).state;
    expect(s.running).toBe(false);
    expect(s.lastUsage).toEqual({ input: 17, output: 7, cost: 0.0012 });
  });

  it('keeps lastUsage null when the result has no usage', () => {
    const s = applyChatEvent(emptyChatState(), { type: 'result' }).state;
    expect(s.lastUsage).toBeNull();
  });

  it('stores discovered slash commands from the CLI init message', () => {
    const s = applyChatEvent(emptyChatState(), {
      type: 'slash-commands',
      commands: ['help', 'compact', 'design-taste-frontend']
    }).state;
    expect(s.slashCommands).toEqual(['help', 'compact', 'design-taste-frontend']);
  });

  it('starts with an empty slash command list', () => {
    expect(emptyChatState().slashCommands).toEqual([]);
  });
});
