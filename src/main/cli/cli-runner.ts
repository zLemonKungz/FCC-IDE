// cli-runner.ts — drives the `claude` CLI as a subprocess over the
// stream-json input/output protocol (the same harness the Agent SDK wraps).
//
// Key empirical findings from the spike (see session notes):
//  - Write the first user message IMMEDIATELY after spawn. The CLI only emits
//    the `system/init` event once it has a prompt waiting to be processed.
//  - The process stays alive across turns, so multi-turn chat is one process.
//  - Each event is one `\n`-terminated JSON line (embedded newlines are escaped).
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

export interface CliSessionOptions {
  binary: string;
  cwd: string;
  model: string;
  maxTurns: number;
  baseUrl: string;
  authToken: string;
  resume?: string;
  onEvent: (msg: unknown) => void;
  onExit: (code: number | null) => void;
  onError: (err: Error) => void;
}

/** Resolve the claude CLI binary: CLI_PATH env > SDK-bundled platform binary > PATH. */
export function resolveCliBinary(): string {
  if (process.env.CLI_PATH) return process.env.CLI_PATH;
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    candidates.push(resolve(process.cwd(), 'node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe'));
  } else if (process.platform === 'darwin') {
    candidates.push(resolve(process.cwd(), 'node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude'));
  } else if (process.platform === 'linux') {
    candidates.push(resolve(process.cwd(), 'node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude'));
  }
  const found = candidates.find((p) => existsSync(p));
  return found ?? 'claude'; // fall back to whatever is on PATH
}

/**
 * Pure JSONL line splitter. Consumes a chunk plus any buffered partial line,
 * returns the parsed events and the remaining partial buffer.
 */
export function parseJsonLines(chunk: string, buffer: string): { events: unknown[]; rest: string } {
  let buf = buffer + chunk;
  const events: unknown[] = [];
  let idx: number;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // Skip malformed/partial garbage — never let one bad line kill the stream.
    }
  }
  return { events, rest: buf };
}

export class CliSession {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private stopped = false;

  constructor(private opts: CliSessionOptions) {}

  start(): void {
    const args = [
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', this.opts.model,
      '--max-turns', String(this.opts.maxTurns),
      '--permission-mode', 'acceptEdits'
    ];
    if (this.opts.resume) args.push('--resume', this.opts.resume);

    const child = spawn(this.opts.binary, args, {
      cwd: this.opts.cwd,
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL: this.opts.baseUrl,
        ANTHROPIC_AUTH_TOKEN: this.opts.authToken,
        CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
        CLAUDE_CODE_AUTO_COMPACT_WINDOW: '190000'
      }
    });
    this.child = child;
    child.stdout.on('data', (d) => {
      const { events, rest } = parseJsonLines(d.toString(), this.buffer);
      this.buffer = rest;
      for (const ev of events) this.opts.onEvent(ev);
    });
    child.stderr.on('data', () => {
      /* ignore — the CLI writes non-JSON diagnostics to stderr */
    });
    child.on('error', (err) => this.opts.onError(err));
    child.on('exit', (code) => this.opts.onExit(code));
  }

  /** Send a user turn over stdin. Safe to call repeatedly on one process. */
  send(content: string): void {
    if (!this.child || this.stopped) return;
    this.child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n');
  }

  /** Terminate the subprocess (Stop button / session teardown). */
  stop(): void {
    this.stopped = true;
    if (this.child) this.child.kill();
  }
}
