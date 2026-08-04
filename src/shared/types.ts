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
