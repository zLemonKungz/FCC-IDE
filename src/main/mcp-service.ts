// mcp-service.ts — read/write MCP server config across the scopes Claude Code
// itself reads. The project scope (`.mcp.json` in the open folder) is edited by
// the app via the sandboxed file-service; the user/global scopes
// (`~/.claude.json` + `~/.claude/settings.json`) are surfaced read-only (we must
// never write ~/.claude.json — it's CLI-managed runtime state).
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import * as files from './file-service';
import { listPlugins } from './claude-plugins';
import type { McpConfig, McpOverview, McpServerDef } from '@shared/types';

function parseJson(p: string): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null; // ENOENT / malformed
  }
}

/** Project-scoped servers from `<root>/.mcp.json`. */
export async function getMcpConfig(): Promise<McpConfig> {
  const root = files.getRoot();
  if (!root) return { mcpServers: {} };
  try {
    const raw = await files.readFile(join(root, '.mcp.json'));
    const parsed = JSON.parse(raw) as { mcpServers?: unknown };
    if (parsed && parsed.mcpServers && typeof parsed.mcpServers === 'object') {
      return { mcpServers: parsed.mcpServers as Record<string, McpServerDef> };
    }
  } catch {
    // ENOENT or malformed JSON — treat as an empty config
  }
  return { mcpServers: {} };
}

/** User/global servers: `~/.claude.json` (top-level `mcpServers`, what the CLI's
 *  `/mcp` writes) and `~/.claude/settings.json` (mcpServers). Read-only here. */
export function getUserMcpServers(): { claudeJson: Record<string, McpServerDef>; settingsJson: Record<string, McpServerDef> } {
  const claudeJson: Record<string, McpServerDef> = {};
  const settingsJson: Record<string, McpServerDef> = {};
  const cj = parseJson(join(homedir(), '.claude.json'));
  if (cj && cj.mcpServers && typeof cj.mcpServers === 'object') {
    Object.assign(claudeJson, cj.mcpServers);
  }
  const st = parseJson(join(homedir(), '.claude', 'settings.json'));
  if (st && st.mcpServers && typeof st.mcpServers === 'object') {
    Object.assign(settingsJson, st.mcpServers);
  }
  return { claudeJson, settingsJson };
}

/** Everything the MCP tab shows, per scope — including MCP servers contributed
 *  by ENABLED plugins (read-only; the plugin's manifest is the source). */
export async function getMcpOverview(): Promise<McpOverview> {
  const plugins: Record<string, McpServerDef> = {};
  for (const p of listPlugins()) {
    if (p.enabled) Object.assign(plugins, p.mcp);
  }
  return {
    project: (await getMcpConfig()).mcpServers,
    user: getUserMcpServers(),
    plugins
  };
}

/** Write the project scope only (`<root>/.mcp.json`). */
export async function setMcpConfig(servers: Record<string, McpServerDef>): Promise<void> {
  const root = files.getRoot();
  if (!root) throw new Error('No folder open');
  await files.writeFile(join(root, '.mcp.json'), JSON.stringify({ mcpServers: servers }, null, 2) + '\n');
}