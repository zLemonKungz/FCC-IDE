// claude-plugins.ts — list installed Claude Code plugins and toggle their
// enabled state. The enabled set lives in `~/.claude/settings.json` under
// `enabledPlugins` ("name@marketplace" → bool); each plugin's manifest
// (`~/.claude/plugins/cache/<marketplace>/<plugin>/<ver>/.claude-plugin/plugin.json`)
// carries the MCP servers it contributes, which the MCP tab surfaces read-only.
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { McpServerDef, PluginInfo } from '@shared/types';

const HOME = homedir();
const SETTINGS = join(HOME, '.claude', 'settings.json');
const INSTALLED = join(HOME, '.claude', 'plugins', 'installed_plugins.json');

function readJson(p: string): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function enabledMap(): Record<string, boolean> {
  const s = readJson(SETTINGS);
  const e = s?.enabledPlugins;
  return e && typeof e === 'object' ? (e as Record<string, boolean>) : {};
}

/** Extract MCP server definitions from a plugin manifest (mcpServers map, or an
 *  `mcp` array/map). Normalized to Record<name, McpServerDef>. */
function manifestMcp(m: Record<string, any> | null): Record<string, McpServerDef> {
  const out: Record<string, McpServerDef> = {};
  if (!m) return out;
  const raw = m.mcpServers ?? m.mcp;
  if (!raw) return out;
  if (Array.isArray(raw)) {
    for (const s of raw) {
      if (s && typeof s === 'object' && s.name) out[String(s.name)] = s as McpServerDef;
    }
  } else if (typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v === 'object') out[k] = v as McpServerDef;
    }
  }
  return out;
}

/** All installed plugins, with enabled state + their declared MCP servers.
 *  The plugin install may be scoped to a project; we list it regardless (the
 *  enabledPlugins map is user-level). Sorted by name. */
export function listPlugins(): PluginInfo[] {
  const enabled = enabledMap();
  const inst = readJson(INSTALLED);
  const plugins = (inst?.plugins ?? {}) as Record<string, { installPath: string; version?: string }[]>;
  const out: PluginInfo[] = [];
  for (const [id, entries] of Object.entries(plugins)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const entry = entries[entries.length - 1]; // most recently recorded install
    const [name, marketplace] = id.includes('@') ? id.split('@') : [id, ''];
    const manifest = readJson(join(entry.installPath, '.claude-plugin', 'plugin.json'));
    out.push({
      id,
      name: name || id,
      marketplace: marketplace ?? '',
      enabled: enabled[id] === true,
      description: manifest?.description ?? undefined,
      version: entry.version ?? manifest?.version ?? undefined,
      mcp: manifestMcp(manifest)
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Toggle a plugin's enabled state by editing `enabledPlugins` in
 *  `~/.claude/settings.json` (preserving every other key). The CLI reloads
 *  plugins on its next launch/session — this is config, not live. */
export function setPluginEnabled(id: string, enabled: boolean): void {
  const s = readJson(SETTINGS) ?? {};
  const e = s.enabledPlugins && typeof s.enabledPlugins === 'object' ? s.enabledPlugins : {};
  e[id] = enabled;
  s.enabledPlugins = e;
  writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n');
}