// claude-compat.ts — self-check that the app talks to a Claude Code CLI that
// actually supports what we spawn with. Resolves the same binary the chat uses
// and verifies the flags we rely on exist in `--help`, so a version drift (new
// CLI dropping/renaming a flag) surfaces instead of failing silently at spawn.
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { resolveCliBinary } from './cli/cli-runner';

export interface CliCompat {
  /** binary used (`claude` env or a resolved absolute path) */
  command: string;
  /** true when the resolved command actually exists on disk (ters-path only) */
  exists: boolean;
  /** CLI version string, or null when --version failed */
  version: string | null;
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 8000, windowsHide: true }, (_err, stdout) => {
      resolve(stdout || '');
    });
  });
}

/** Binary health + version. Flag-parity is intentionally NOT derived from
 *  `--help`: Claude Code's help omits the internal flags we use, so absence
 *  there is not a real compatibility signal. */
export async function cliCompatibility(): Promise<CliCompat> {
  const command = resolveCliBinary();
  const exists = existsSync(command);
  if (!exists) return { command, exists, version: null };
  const version = (await run(command, ['--version']).catch(() => '')).trim() || null;
  return { command, exists, version };
}