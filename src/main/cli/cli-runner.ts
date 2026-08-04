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
// `app` is only available in the main process; importing it in a plain-node
// (vitest) context yields undefined, which resolveCliBinary guards against.
import { app } from 'electron';

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
  const rel = cliBinaryRelPath();
  if (!rel) return 'claude';
  // Dev / test: the project root carries node_modules. Packaged app:
  // app.getAppPath() is the asar, and electron-builder unpacks the native
  // exe to resources/app.asar.unpacked (see the build.asarUnpack config).
  const bases = [process.cwd()];
  const appPath = typeof app?.getAppPath === 'function' ? app.getAppPath() : null;
  if (appPath) {
    bases.push(appPath);
    if (process.resourcesPath) bases.push(resolve(process.resourcesPath, 'app.asar.unpacked'));
  }
  for (const base of bases) {
    const p = resolve(base, rel);
    if (existsSync(p)) return p;
  }
  return 'claude'; // fall back to whatever is on PATH
}

function cliBinaryRelPath(): string | null {
  if (process.platform === 'win32') return 'node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe';
  if (process.platform === 'darwin') return 'node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude';
  if (process.platform === 'linux') return 'node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude';
  return null;
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
  /** Tail of stderr, kept so a crash produces a diagnosable error message. */
  private stderrTail = '';

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
      // windowsHide: without it the console-subsystem claude.exe pops a cmd
      // window on every chat turn in the packaged GUI app.
      windowsHide: true,
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
    child.stderr.on('data', (d) => {
      // Keep a bounded tail; the CLI writes non-JSON diagnostics (node
      // stack traces, env errors) here that are the first clue on a crash.
      this.stderrTail = (this.stderrTail + d.toString()).slice(-4096);
    });
    child.on('error', (err) => this.opts.onError(err));
    child.on('exit', (code) => this.opts.onExit(code));
    // Swallow stdin EPIPE — writing to a child that just died must not crash
    // the main process (an unhandled 'error' on the stream does).
    child.stdin.on('error', () => {});
  }

  /** Send a user turn over stdin. Safe to call repeatedly on one process. */
  send(content: string): void {
    if (!this.child || this.stopped) return;
    const stdin = this.child.stdin;
    if (stdin.destroyed || stdin.writableEnded) return;
    stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n');
  }

  /** Terminate the subprocess and, on Windows, its whole process tree.
   *  child.kill() on win32 only targets the direct child — the claude CLI can
   *  have grandchildren (Bash tool, MCP-server node children) that would
   *  otherwise leak. taskkill /T /F tears the tree down. */
  stop(): void {
    this.stopped = true;
    if (!this.child || this.child.pid === undefined) return;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(this.child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      this.child.kill();
    }
  }

  /** Last ~4KB the CLI wrote to stderr (empty if it was clean). */
  stderrTrace(): string {
    return this.stderrTail;
  }
}
