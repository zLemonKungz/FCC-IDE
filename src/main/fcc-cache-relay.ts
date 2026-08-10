// fcc-cache-relay.ts — boots the installed free-claude-code proxy with a small
// runtime monkey-patch that relays generic OpenAI-chat prompt-cache usage
// (cached_tokens / created_cache_tokens / prompt_cache_*) into the Anthropic
// cache fields the app surfaces. The INSTALLED package is never edited, so a
// `uv tool upgrade` can't wipe it; the patch lives in this repo.
//
// The Python side is kept in sync with scripts/fcc-server-cache.py (the
// human-run manual copy). Edit BOTH when touching the patch.

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/** The cache-relay launcher, embedded so the packaged app (asar) can always
 *  materialize it to disk even if the repo copy is not bundled. */
export const CACHE_RELAY_PY = `"""fcc-server-cache.py — sidecar cache relay for free-claude-code.

Monkey-patches the generic OpenAI-chat usage mapping so providers that DO report
prompt-cache fields (Moonshot/Kimi via tokenrouter, etc.) surface them to Claude
Code clients as cache_read_input_tokens / cache_creation_input_tokens.
Synced with src/main/fcc-cache-relay.ts (edit BOTH).
"""
from free_claude_code.cli.entrypoints import serve
from free_claude_code.providers.openai_chat.provider import OpenAIChatProvider
from free_claude_code.providers.openai_chat.usage import usage_int


def _nested_int(usage, *path):
    cur = usage
    for f in path:
        cur = cur.get(f) if isinstance(cur, dict) else getattr(cur, f, None)
        if cur is None:
            return None
    return cur if isinstance(cur, int) and not isinstance(cur, bool) else None


def _relay(usage_info):
    out = {}
    hit = usage_int(usage_info, "cached_tokens")
    if hit is None:
        hit = _nested_int(usage_info, "prompt_tokens_details", "cached_tokens")
    if hit is None:
        hit = usage_int(usage_info, "prompt_cache_hit_tokens")
    if hit:
        out["cache_read_input_tokens"] = hit
    created = usage_int(usage_info, "created_cache_tokens")
    if created is None:
        created = usage_int(usage_info, "prompt_cache_miss_tokens")
    if created:
        out["cache_creation_input_tokens"] = created
    return out


# Patch the generic base only. DeepSeek overrides the method on its own subclass
# (MRO keeps DeepSeek's native mapping); every other OpenAI-chat provider now
# relays whatever cache fields its upstream reports (none = identical to before).
OpenAIChatProvider._anthropic_usage_fields = lambda self, usage_info: _relay(usage_info)

serve()
`;

/** Every place a uv-managed free-claude-code venv python could live (win32). */
function pythonCandidates(): string[] {
  const out: string[] = [];
  if (process.env.FCC_RELAY_PYTHON) out.push(process.env.FCC_RELAY_PYTHON);
  const base =
    process.env.UV_TOOL_DIR ?? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'uv', 'tools');
  out.push(join(base, 'free-claude-code', 'Scripts', 'python.exe'));
  out.push(join(base, 'free-claude-code', 'bin', 'python'));
  out.push(join(homedir(), '.local', 'share', 'uv', 'tools', 'free-claude-code', 'Scripts', 'python.exe'));
  return out;
}

/** First candidate path that exists, else null. Pure + injectable for tests. */
export function firstExisting(paths: string[]): string | null {
  return paths.find((p) => existsSync(p)) ?? null;
}

/** Locate the venv python that can import the installed free-claude-code. */
export function resolveVenvPython(): string | null {
  return firstExisting(pythonCandidates());
}

/** Materialize the relay script under userData so spawn sees a real on-disk
 *  file (works in dev and packaged/asar alike). Pass the app's userData dir;
 *  null when unavailable. Returns the script path or null. */
export function ensureRelayScript(userDataDir: string | null): string | null {
  try {
    if (!userDataDir) return null;
    const dir = join(userDataDir, 'cache-relay');
    mkdirSync(dir, { recursive: true });
    const target = join(dir, 'fcc-server-cache.py');
    writeFileSync(target, CACHE_RELAY_PY, 'utf8');
    return target;
  } catch {
    return null;
  }
}