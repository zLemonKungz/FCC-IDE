import { describe, it, expect, afterEach } from 'vitest';
import { parseJsonLines, resolveCliBinary } from '../src/main/cli/cli-runner';

describe('cli-runner parseJsonLines', () => {
  it('parses a single complete JSON line', () => {
    const { events, rest } = parseJsonLines('{"type":"result","stop_reason":"end_turn"}\n', '');
    expect(events).toHaveLength(1);
    expect((events[0] as { type: string }).type).toBe('result');
    expect(rest).toBe('');
  });

  it('assembles an event split across chunks', () => {
    let state = parseJsonLines('{"type":"assis', '');
    expect(state.events).toHaveLength(0);
    expect(state.rest).toBe('{"type":"assis');
    state = parseJsonLines('tant","message":{"content":[]}}\n', state.rest);
    expect(state.events).toHaveLength(1);
    expect((state.events[0] as { type: string }).type).toBe('assistant');
    expect(state.rest).toBe('');
  });

  it('parses multiple lines from one chunk in order', () => {
    const { events } = parseJsonLines(
      '{"type":"system","subtype":"init"}\n{"type":"result"}\n{"type":"user"}\n',
      ''
    );
    expect(events.map((e) => (e as { type: string }).type)).toEqual(['system', 'result', 'user']);
  });

  it('skips empty and malformed lines without breaking the stream', () => {
    const { events, rest } = parseJsonLines('not json\n\n{"type":"result"}\n{"partial', '');
    expect(events).toHaveLength(1);
    expect((events[0] as { type: string }).type).toBe('result');
    expect(rest).toBe('{"partial');
  });

  it('handles an embedded escaped newline inside a single JSON event', () => {
    // A text block with "\n" is a single physical line (escaped), not a split.
    const { events, rest } = parseJsonLines('{"type":"assistant","text":"line1\\nline2"}\n', '');
    expect(events).toHaveLength(1);
    expect(rest).toBe('');
  });
});

describe('cli-runner resolveCliBinary', () => {
  const original = process.env.CLI_PATH;

  afterEach(() => {
    if (original === undefined) delete process.env.CLI_PATH;
    else process.env.CLI_PATH = original;
  });

  it('returns a non-empty binary path string', () => {
    expect(resolveCliBinary().length).toBeGreaterThan(0);
  });

  it('honors the CLI_PATH override', () => {
    process.env.CLI_PATH = 'C:\\tools\\claude.exe';
    expect(resolveCliBinary()).toBe('C:\\tools\\claude.exe');
  });
});
