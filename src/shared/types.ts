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
  /** true while this app's spawn is booting (before the first healthy /health). */
  starting?: boolean;
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
  /** auto-compact threshold in thousands of tokens (CLAUDE_CODE_AUTO_COMPACT_WINDOW
   *  / 1000); 0 = auto — follow the model's own context window (env left unset). */
  autoCompactWindow?: number;
  /** model effort level passed as --effort at spawn: 'auto' (model default, unset) or
   *  low|medium|high|xhigh|max. Only models that support effort honor it. */
  effort?: string;
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
  /** 'app' (own sessions) vs 'claude-code' (imported from the CLI's ~/.claude). */
  source?: 'app' | 'claude-code';
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

/** Everything the MCP tab shows, per scope. The user/global + plugin scopes are
 *  surfaced read-only (the app only edits the project scope and plugin enabled
 *  state). */
export interface McpOverview {
  project: Record<string, McpServerDef>;
  user: { claudeJson: Record<string, McpServerDef>; settingsJson: Record<string, McpServerDef> };
  /** MCP servers contributed by ENABLED plugins (from each plugin manifest). */
  plugins: Record<string, McpServerDef>;
}

/** A Claude Code plugin installed for the running environment. */
export interface PluginInfo {
  /** "name@marketplace" — the enabledPlugins key in ~/.claude/settings.json. */
  id: string;
  name: string;
  marketplace: string;
  enabled: boolean;
  description?: string;
  version?: string;
  /** MCP servers this plugin declares (from its .claude-plugin/plugin.json). */
  mcp: Record<string, McpServerDef>;
}

/** A model the FCC gateway can route (from GET /v1/models). */
export interface GatewayModel {
  id: string;
  display_name?: string;
}

/** A custom subagent definition in .claude/agents/<name>.md. */
export interface AgentSummary {
  /** filename stem, e.g. "code-reviewer" (the frontmatter name field). */
  name: string;
  /** absolute path inside the open folder. */
  path: string;
}

/** One changed file from `git status --porcelain`. */
export interface GitChange {
  path: string;
  staged: boolean;
  kind: string;
  untracked: boolean;
  conflict: boolean;
}

export interface GitStatus {
  branch: string;
  remote: string | null;
  changes: GitChange[];
  ahead: number;
  behind: number;
}

export interface GitBranch {
  name: string;
  current: boolean;
}

/** One commit for the history graph (short 7-char hash, parents likewise). */
export interface GitCommit {
  hash: string;
  parents: string[];
  refs: string;
  subject: string;
}

/** The editable subset of Claude Code's settings.json (user + project). The
 *  main process preserves any fields the UI doesn't render (hooks, statusLine,
 *  …) when saving. */
export interface ClaudePermissions {
  defaultMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';
  allow?: string[];
  deny?: string[];
  ask?: string[];
  additionalDirectories?: string[];
  disableBypassPermissionsMode?: boolean;
}

export interface ClaudeSettingsFile {
  permissions?: ClaudePermissions;
  env?: Record<string, string>;
  model?: string;
  includeCoAuthoredBy?: boolean;
  theme?: 'dark' | 'light';
  verbose?: boolean;
  hooks?: Record<string, unknown>;
}

/** One match from the find-in-files content search. */
export interface SearchHit {
  /** absolute path (editor tabs/explorer key on absolute paths) */
  path: string;
  /** forward-slash relative path for display */
  relative: string;
  /** 1-based line number */
  line: number;
  /** trimmed matching line, capped for display */
  text: string;
}

/** Auto-update status pushed from main (electron-updater) to the renderer. */
export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; notes?: string }
  | { status: 'none' }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };
