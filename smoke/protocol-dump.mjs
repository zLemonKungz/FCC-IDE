// protocol-dump.mjs — spawn the `claude` CLI exactly like the app's
// cli-runner does (stream-json in/out, verbose, acceptEdits,
// --forward-subagent-text) and dump every event it emits.
//
//   node smoke/protocol-dump.mjs [BINARY] [TURN1 PROMPT] [TURN2 PROMPT]
//
// Writes two outputs next to this script:
//   smoke/protocol-dump.log.jsonl     — every raw event, one JSON line each (the real contract)
//   smoke/protocol-dump.stdout.log    — the raw CLI stdout byte stream as received
// script stdout is the compact per-event digest + count table.
//
// Requires a running FCC proxy at FCC_BASE_URL (default http://127.0.0.1:8082).

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { appendFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const LOG = resolve(here, 'protocol-dump.log.jsonl');
const RAW = resolve(here, 'protocol-dump.stdout.raw');

const bundled = resolve(here, '..', 'node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe');
const BINARY = process.env.CLI_PATH ?? (process.platform === 'win32' && existsSync(bundled) ? bundled : 'claude');

const BASE_URL = process.env.FCC_BASE_URL ?? 'http://127.0.0.1:8082';
const AUTH_TOKEN = process.env.FCC_AUTH_TOKEN ?? 'freecc';
const MODEL = process.env.FCC_CHAT_MODEL ?? 'claude-haiku-4-5-20251001';

const turn1 = process.argv[3] ?? 'Run a Bash tool with the command `node -e "console.log(41+1)"`, then reply with the exact output.';
const turn2 = process.argv[4] ?? 'Now reply with the single word: OK';

writeFileSync(RAW, `# spawn: ${BINARY}\n# model: ${MODEL}\n# base: ${BASE_URL}\n`);
writeFileSync(LOG, '');

const args = [
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--verbose',
  '--model', MODEL,
  '--max-turns', '15',
  '--permission-mode', 'acceptEdits',
  '--forward-subagent-text',
];

console.log(`binary : ${BINARY}`);
console.log(`model  : ${MODEL}\n`);

const child = spawn(BINARY, args, {
  windowsHide: true,
  cwd: process.cwd(),
  env: {
    ...process.env,
    ANTHROPIC_BASE_URL: BASE_URL,
    ANTHROPIC_AUTH_TOKEN: AUTH_TOKEN,
    CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: '256000',
  },
});

let line = '';
let count = 0;
const tally = new Map();
let stderrTail = '';
let sawResult = false;
const seenFields = new Set();

/** One-line digest of a message event (not the full payload). */
function digest(m) {
  const out = [];
  if (m.type === 'assistant') {
    for (const b of m.message?.content ?? []) {
      if (b.type === 'text') out.push(`text(${b.text.length}ch)`);
      else if (b.type === 'thinking') out.push(`thinking(${(b.thinking ?? '').length}ch)${b.signature ? '+sig' : ''}`);
      else if (b.type === 'tool_use') out.push(`tool_use{${b.name} ${JSON.stringify(b.input)?.slice(0, 80)}}`);
      else out.push(b.type);
    }
    if (m.message?.model) out.push(`model=${m.message.model}`);
  } else if (m.type === 'user') {
    for (const b of m.message?.content ?? []) {
      if (b.type === 'text') out.push(`text(${b.text.length}ch)`);
      else if (b.type === 'tool_result') out.push(`tool_result{${b.tool_use_id} ${(b.content?.length ?? 0)}blk}${b.is_error ? ' ERR' : ''}`);
      else out.push(b.type);
    }
  } else if (m.type === 'system') {
    if (m.subtype === 'init') out.push(`slash=${m.slash_commands?.length ?? 0} cwd_keys=${Object.keys(m.cwd ?? {}).length}`);
    if (m.notice) out.push(`notice=${JSON.stringify(m.notice).slice(0, 80)}`);
    if (m.state) out.push(`state_keys=${Object.keys(m.state).join(',')}`);
    if (m.session_id) out.push(`session_id=${m.session_id}`);
    if (m.mcp_servers) out.push(`mcp_servers=${m.mcp_servers.length}`);
  } else if (m.type === 'control') {
    out.push(`subtype=${m.subtype ?? '?'}`);
  } else if (m.type === 'result') {
    out.push(`session_id=${m.session_id ?? ''} duration_ms=${m.duration_ms ?? '?'}`);
    for (const k of ['total_cost_usd', 'usage', 'modelUsage', 'is_error', 'is_image_gen', 'num_turns', 'num_tool_uses', 'model', 'isCompact', 'cost', 'duration_ms'])
      if (m[k] !== undefined) out.push(`${k}=${JSON.stringify(m[k]).slice(0, 60)}`);
  }
  return out.join(' ').slice(0, 220);
}

child.stdout.on('data', (d) => {
  appendFileSync(RAW, d.toString());
  line += d.toString();
  let idx;
  while ((idx = line.indexOf('\n')) >= 0) {
    const raw = line.slice(0, idx);
    line = line.slice(idx + 1);
    const t = raw.trim();
    if (!t) continue;
    let m;
    try { m = JSON.parse(t); } catch { console.log(`[!!!] non-JSON line: ${t.slice(0, 160)}`); continue; }
    count++;
    tally.set(m.type, (tally.get(m.type) ?? 0) + 1);
    if (m.type === 'result') sawResult = true;
    appendFileSync(LOG, `${t}\n`);
    const tag = `${m.type}${m.subtype ? `/${m.subtype}` : ''}`;
    const sid = m.session_id ? ` [${m.session_id}]` : '';
    console.log(`[${String(count).padStart(3)}] ${tag.padEnd(15)}${sid} ${digest(m)}`);
  }
});
child.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-2048); });
child.on('error', (e) => { console.error('spawn error:', e.message); process.exit(1); });
child.on('exit', (code) => {
  if (!sawResult) console.log(`\n[exit code ${code}]` + (stderrTail ? ` stderr tail:\n${stderrTail}` : ''));
});
child.stdin.on('error', () => {});

const send = (text) => {
  if (child.stdin.destroyed || child.stdin.writableEnded) return false;
  child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n');
  return true;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitResult() {
  const until = Date.now() + 120000;
  while (!sawResult && Date.now() < until) await sleep(200);
}

console.log(`>>> T1  ${JSON.stringify(turn1)}`);
send(turn1);
await waitResult();

if (sawResult) {
  console.log('\n=== turn 1 done — same process, sending turn 2 ===');
  sawResult = false;
  console.log(`>>> T2  ${JSON.stringify(turn2)}`);
  send(turn2);
  await waitResult();
}

console.log(`\n=== event tally (${count}) ===`);
for (const [k, v] of [...tally.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${String(v).padStart(4)}`);
console.log(`\nraw events   -> smoke/protocol-dump.log.jsonl`);
console.log(`stdout bytes -> smoke/protocol-dump.stdout.raw`);
child.kill();
process.exit(0);