// mcp-service.ts — read/write the project's .mcp.json (Claude Code MCP config).
//
// The claude CLI subprocess discovers MCP servers from `.mcp.json` in its cwd
// (the open project folder), so the app manages that file. All file access
// goes through the sandboxed file-service (assertInside keeps it in the root).
import { join } from 'path';
import * as files from './file-service';
import type { McpConfig, McpServerDef } from '@shared/types';

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

export async function setMcpConfig(servers: Record<string, McpServerDef>): Promise<void> {
  const root = files.getRoot();
  if (!root) throw new Error('No folder open');
  await files.writeFile(join(root, '.mcp.json'), JSON.stringify({ mcpServers: servers }, null, 2) + '\n');
}
