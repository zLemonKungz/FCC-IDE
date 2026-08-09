// redact.ts — scrub secrets out of anything the app surfaces (chat events,
// transcripts, app.log). Conservative by design: only exact env-derived secret
// values and standard token shapes are replaced — never heuristic content.
//
// Callers: ChatHost.emit() (before history.record + IPC) and Logger.logLine().
// No heuristic scrubbing: a normal sentence is left untouched.

/** Env vars whose NAME marks them as secrets (value ≥ 8 chars, ≤ 200). */
const SECRET_ENV_NAME = /(?:API_KEY|AUTH_TOKEN|SECRET|PASSWORD|TOKEN|Bearer)$/i;

/** Value shapes that are tokens even when the env name isn't obviously one. */
const SECRET_VALUE_SHAPE = /^(sk-ant-|sk-|ghp_|gho_|github_pat_|AKIA|EAAC|xox[baprs]-)/;

/** Known token prefixes replaced regardless of whether they appeared in env. */
const REDACT_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /gho_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /Bearer\s+[A-Za-z0-9._-]{10,}/gi
];

const MASK = '[redacted]';

/** Gather exact secret values from process.env (the most reliable matches). */
export function collectSecrets(): string[] {
  const out = new Set<string>(['freecc']);
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || value.length < 8 || value.length > 200) continue;
    if (SECRET_ENV_NAME.test(name) || SECRET_VALUE_SHAPE.test(value)) out.add(value);
  }
  return [...out];
}

/** Replace exact secrets and known token shapes in one string. `secrets` are
 *  exact-match only (already filtered to token-shaped values by collectSecrets),
 *  so short seeds like the FCC auth token `freecc` are replaced too. */
export function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    out = out.split(secret).join(MASK);
  }
  for (const re of REDACT_PATTERNS) out = out.replace(re, MASK);
  return out;
}

/** Deep-scrub any JSON-shaped chat event before it is stored/shown. */
export function scrubEvent(message: unknown, secrets: string[]): unknown {
  if (typeof message === 'string') return redactSecrets(message, secrets);
  if (Array.isArray(message)) return message.map((x) => scrubEvent(x, secrets));
  if (message !== null && typeof message === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(message as Record<string, unknown>)) {
      out[k] = scrubEvent(v, secrets);
    }
    return out;
  }
  return message;
}