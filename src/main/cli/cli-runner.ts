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
import type { ChatImage, PermissionMode } from '@shared/types';

export interface CliSessionOptions {
  binary: string;
  cwd: string;
  model: string;
  maxTurns: number;
  baseUrl: string;
  authToken: string;
  resume?: string;
  permissionMode?: PermissionMode;
  /** auto-compact threshold in raw tokens (0 = leave unset → CLI model default). */
  autoCompactWindow?: number;
  /** model effort level (low|medium|high|xhigh|max) — omitted when 'auto'/'unset. */
  effort?: string;
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
    // The real binary ships unpacked (build.asarUnpack); inside app.asar there
    // is only a stub that existsSync() reports as present but spawn cannot
    // execute — so the unpacked copy must be checked first.
    if (process.resourcesPath) bases.push(resolve(process.resourcesPath, 'app.asar.unpacked'));
    bases.push(appPath);
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

/** Model effort levels accepted by the CLI's --effort flag. */
const EFFORT_LEVELS_ARG = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultracode']);

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
  /** Request-id → resolver for host-initiated control queries (get_session_cost,
   *  get_context_usage, …): the CLI answers asynchronously on stdout with a
   *  control_response using the same request_id. */
  private pendingQueries = new Map<string, (payload: unknown) => void>();
  private queryTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private opts: CliSessionOptions) {}

  start(): void {
    const args = [
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', this.opts.model,
      '--max-turns', String(this.opts.maxTurns),
      '--permission-mode', this.opts.permissionMode ?? 'acceptEdits'
    ];
    if (this.opts.resume) args.push('--resume', this.opts.resume);
    // Model effort level. 'auto' (or any falsy) leaves it to the model default;
    // only effort-capable models honor the flag, so it's harmless on the rest.
    // The renderer snaps the level to the model's ceiling; this guard is a
    // backstop so an invalid/legacy value never reaches the CLI.
    if (this.opts.effort && EFFORT_LEVELS_ARG.has(this.opts.effort)) args.push('--effort', this.opts.effort);
    // Surface subagent text/thinking as assistant/user events tagged with
    // parent_tool_use_id so the renderer can show what subagents are doing
    // (otherwise subagent output is invisible over stream-json).
    args.push('--forward-subagent-text');

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
        ...(this.opts.autoCompactWindow
          ? { CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(this.opts.autoCompactWindow) }
          : {})
      }
    });
    this.child = child;
    child.stdout.on('data', (d) => {
      const { events, rest } = parseJsonLines(d.toString(), this.buffer);
      this.buffer = rest;
      for (const ev of events) {
        // A control_response answering this process's own query completes the
        // pending promise (never forwarded — the host initiated it).
        const msg = ev as { type?: string; response?: { request_id?: string } };
        const rid = msg.response?.request_id;
        if (msg.type === 'control_response' && rid && this.pendingQueries.has(rid)) {
          const resolve = this.pendingQueries.get(rid)!;
          this.pendingQueries.delete(rid);
          const t = this.queryTimers.get(rid);
          if (t) clearTimeout(t);
          this.queryTimers.delete(rid);
          resolve(msg);
          continue;
        }
        this.opts.onEvent(ev);
      }
    });
    child.stderr.on('data', (d) => {
      // Keep a bounded tail; the CLI writes non-JSON diagnostics (node
      // stack traces, env errors) here that are the first clue on a crash.
      this.stderrTail = (this.stderrTail + d.toString()).slice(-4096);
    });
    child.on('error', (err) => this.opts.onError(err));
    child.on('exit', (code) => this.opts.onExit(code));
    // Swallow stdin EPIPE (writing to a child that just died must not crash the
    // main process — an unhandled 'error' on the stream does).
    child.stdin.on('error', () => {});
    // Host handshake: declare this process is a UI host that can render dialog
    // kinds (AskUserQuestion / refusal fallback). Without it the CLI treats the
    // consumer as renderless ("fails closed") and the model is never offered the
    // AskUserQuestion tool — so the choice UI the interactive CLI shows would be
    // absent here. Write it before the first user message; order on stdin wins.
    this.sendControl('initialize', {
      supportedDialogKinds: ['ask_user_question', 'ask_user', 'refusal_fallback_prompt']
    });
  }

  /** Send a live SDK control_request over stdin (e.g. subtype 'set_permission_mode'
   *  for an immediate mode switch, or 'apply_flag_settings' for next-turn effort).
   *  These are handled locally by the CLI and never reach the model/proxy. */
  sendControl(subtype: string, request: Record<string, unknown>): void {
    if (!this.child || this.stopped) return;
    const stdin = this.child.stdin;
    if (stdin.destroyed || stdin.writableEnded) return;
    stdin.write(
      JSON.stringify({
        type: 'control_request',
        request_id: `ctl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        request: { subtype, ...request }
      }) + '\n'
    );
  }

  /** Answer a CLI-initiated control_request (can_use_tool incl. AskUserQuestion).
   *  The response echoes the request_id so the CLI can match it to the parked
   *  tool call and resume the turn. `response` is the control body, e.g.
   *  { behavior:'allow', updatedInput:{ questions, answers } }. */
  sendControlResponse(requestId: string, response: Record<string, unknown>): void {
    if (!this.child || this.stopped) return;
    const stdin = this.child.stdin;
    if (stdin.destroyed || stdin.writableEnded) return;
    stdin.write(
      JSON.stringify({
        type: 'control_response',
        response: { subtype: 'success', request_id: requestId, response }
      }) + '\n'
    );
  }

  /** Round-trip a host-initiated control_request and resolve with its
   *  control_response payload (e.g. `get_session_cost`, `get_context_usage`).
   *  Resolves null on timeout/stop so the caller never hangs. */
  query<T = unknown>(subtype: string, request: Record<string, unknown> = {}): Promise<T | null> {
    if (!this.child || this.stopped) return Promise.resolve(null);
    const stdin = this.child.stdin;
    if (stdin.destroyed || stdin.writableEnded) return Promise.resolve(null);
    return new Promise((resolve) => {
      const requestId = `qry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const finish = (payload: unknown): void => {
        this.queryTimers.delete(requestId);
        resolve(payload as T | null);
      };
      const timer = setTimeout(() => {
        if (this.pendingQueries.delete(requestId)) finish(null);
      }, 15000);
      this.queryTimers.set(requestId, timer);
      this.pendingQueries.set(requestId, (payload) => finish(payload));
      stdin.write(JSON.stringify({ type: 'control_request', request_id: requestId, request: { subtype, ...request } }) + '\n');
    });
  }

  /** Send a user turn over stdin. Safe to call repeatedly on one process.
   *  Images ride along as base64 content blocks alongside the text prompt. */
  send(prompt: string, images?: ChatImage[]): void {
    if (!this.child || this.stopped) return;
    const stdin = this.child.stdin;
    if (stdin.destroyed || stdin.writableEnded) return;
    const content =
      images && images.length > 0
        ? [
            ...(prompt ? [{ type: 'text', text: prompt }] : []),
            ...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.media_type, data: i.data } }))
          ]
        : prompt;
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
