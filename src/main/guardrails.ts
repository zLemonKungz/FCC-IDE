// guardrails.ts — per-project Claude Code hardening. Writes a PreToolUse hook
// into the project's .claude/settings.json that blocks Bash commands containing
// user-defined patterns. The hook command is a generated Node script (no shell
// quoting issues on Windows) that reads the PreToolUse stdin JSON, checks
// `tool_input.command`, and exits 2 (block) on a match.
import { promises as fs } from 'fs';
import { join } from 'path';
import * as files from './file-service';
import { getSettings, setSettings } from './claude-settings';

export interface GuardState {
  enabled: boolean;
  blocked: string[];
}

function dir(root: string): string {
  return join(root, '.claude', 'hooks');
}
const RULES = 'fcc-guard-rules.json';
const SCRIPT = 'fcc-guard.mjs';

/** The generated hook script. ESM, reads the rules file next to it. */
function guardScript(): string {
  return `import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const here = typeof import.meta.dirname === 'string' ? import.meta.dirname : dirname(fileURLToPath(import.meta.url));
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try {
    const ev = JSON.parse(input);
    if (ev?.tool_name !== 'Bash') process.exit(0);
    const cmd = String(ev?.tool_input?.command ?? '');
    const rules = JSON.parse(readFileSync(join(here, ${JSON.stringify(RULES)}), 'utf8') || '[]');
    const hit = (rules || []).find((r) => r && cmd.includes(r));
    if (hit) {
      process.stderr.write('Blocked by FCC Studio guardrail: command contains "' + hit + '"\\n');
      process.exit(2);
    }
    process.exit(0);
  } catch {
    process.exit(0); // never break the tool call on our own errors
  }
});
`;
}

export async function getGuardrails(): Promise<GuardState | null> {
  const root = files.getRoot();
  if (!root) return null;
  try {
    const rules = JSON.parse(await fs.readFile(join(dir(root), RULES), 'utf8'));
    return { enabled: true, blocked: Array.isArray(rules) ? rules : [] };
  } catch {
    return { enabled: false, blocked: [] };
  }
}

/** Enable (write hook + script + rules) or disable (remove the PreToolUse hook).
 *  Existing hooks of other events are preserved. */
export async function setGuardrails(enabled: boolean, blocked: string[]): Promise<GuardState> {
  const root = files.getRoot();
  if (!root) throw new Error('No folder open');
  const d = dir(root);
  await fs.mkdir(d, { recursive: true });
  await fs.writeFile(join(d, RULES), JSON.stringify(blocked.filter(Boolean)), 'utf8');
  await fs.writeFile(join(d, SCRIPT), guardScript(), 'utf8');

  const { project } = await getSettings();
  const existing = (project?.hooks as Record<string, unknown> | undefined) ?? {};
  const hooks: Record<string, unknown> = { ...existing };
  if (enabled) {
    hooks.PreToolUse = [
      { matcher: 'Bash', hooks: [{ type: 'command', command: join(d, SCRIPT).replace(/\\/g, '/'), args: [] }] }
    ];
  } else {
    delete hooks.PreToolUse;
  }
  await setSettings('project', { hooks: hooks as never });
  return { enabled, blocked };
}

/** Current hooks list (event name + matcher) for the viewer. */
export async function listHooks(): Promise<{ event: string; matcher: string }[]> {
  const { project, user } = await getSettings();
  const hooks = (project?.hooks ?? user?.hooks ?? {}) as Record<string, unknown>;
  const out: { event: string; matcher: string }[] = [];
  for (const [event, groups] of Object.entries(hooks)) {
    for (const g of Array.isArray(groups) ? groups : []) {
      out.push({ event, matcher: typeof (g as { matcher?: string })?.matcher === 'string' ? (g as { matcher: string }).matcher : '*' });
    }
  }
  return out;
}

/** Add a single custom hook (event + matcher + command) to project settings. */
export async function addHook(event: string, matcher: string, command: string): Promise<void> {
  const root = files.getRoot();
  if (!root) throw new Error('No folder open');
  const { project } = await getSettings();
  const hooks = (project?.hooks as Record<string, unknown> | undefined) ?? {};
  const groups = Array.isArray(hooks[event]) ? (hooks[event] as { matcher: string; hooks: unknown[] }[]) : [];
  groups.push({ matcher, hooks: [{ type: 'command', command }] });
  hooks[event] = groups;
  await setSettings('project', { hooks: hooks as never });
}