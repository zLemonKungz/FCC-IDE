"""fcc-server-cache.py — sidecar launcher for the free-claude-code proxy.

Runs the installed fcc-server with a monkey-patch that relays generic
OpenAI-chat prompt-cache usage fields (cached_tokens / created_cache_tokens,
and the DeepSeek-style prompt_cache_hit/miss aliases) into the Claude
`cache_read_input_tokens` / `cache_creation_input_tokens` the app displays.
This copy lives in FCC-IDE (git-tracked), so `uv tool upgrade` of
free-claude-code can never wipe it.

Usage (from this repo):
  PORT=8084 FCC_OPEN_BROWSER=0 \
    "C:/Users/Administrator/AppData/Roaming/uv/tools/free-claude-code/Scripts/python.exe" \
    scripts/fcc-server-cache.py

Point the app at it via `FCC_SERVER_BIN` (see src/main/fcc-manager.ts).
"""

from free_claude_code.cli.entrypoints import serve
from free_claude_code.providers.openai_chat.provider import OpenAIChatProvider
from free_claude_code.providers.openai_chat.usage import usage_int


def _nested_int(usage, *path):
    cur = usage
    for f in path:
        if isinstance(cur, dict):
            cur = cur.get(f)
        else:
            cur = getattr(cur, f, None)
        if cur is None:
            return None
    return cur if isinstance(cur, int) and not isinstance(cur, bool) else None


def relayed_cache_fields(usage_info):
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


def _patched(self, usage_info):
    return relayed_cache_fields(usage_info)


OpenAIChatProvider._anthropic_usage_fields = _patched

serve()
