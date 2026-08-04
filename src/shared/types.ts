export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface FccStatus {
  online: boolean;
  port: number;
  version?: string;
  /** true when the fcc-server was spawned by this app (eligible for Stop). */
  managed?: boolean;
}

/** Result of probing whether free-claude-code (fcc-server) is usable on this machine. */
export interface FccInstallStatus {
  installed: boolean;
  /** Resolved server path when installed (override / ~/.local/bin / PATH hit). */
  serverPath: string | null;
  /** Why installed is false, or whether the app can still start the server. */
  reason: 'installed' | 'missing' | 'path-missing';
  /** Parsed `python --version` (e.g. "3.14.6"), null when Python isn't reachable. */
  pythonVersion: string | null;
  /** Whether `uv` is reachable. */
  hasUv: boolean;
}

export interface ChatEventPayload {
  sessionId: string;
  message: unknown;
}

export interface ChatSettings {
  model: string;
  maxTurns: number;
}

/** Base64 image attached to a chat turn (sent as an image content block). */
export interface ChatImage {
  media_type: string;
  data: string;
}

/** CLI --permission-mode: 'acceptEdits' (auto-accept agent edits, the default)
 *  or 'plan' (analyze + propose before acting). */
export type PermissionMode = 'acceptEdits' | 'plan';

/** One turn in a persisted chat transcript (display + resume, not tool detail). */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** A saved conversation, persisted by main to userData/sessions/<id>.json. */
export interface HistoryRecord {
  /** renderer sessionId ("s-...") — doubles as the history file id. */
  id: string;
  /** first user message, truncated to 80 chars; fallback "Untitled". */
  title: string;
  folder: string;
  /** the CLI agent session id, used for --resume; null if never produced. */
  cliSessionId: string | null;
  messages: HistoryMessage[];
  createdAt: number;
  updatedAt: number;
}

/** History list row (no full transcript). */
export interface HistorySummary {
  id: string;
  title: string;
  folder: string;
  createdAt: number;
  updatedAt: number;
}

/** A server definition inside .mcp.json (Claude Code schema). */
export interface McpServerDef {
  command: string;
  args?: string[];
}

/** The .mcp.json shape the app reads/writes. */
export interface McpConfig {
  mcpServers: Record<string, McpServerDef>;
}
