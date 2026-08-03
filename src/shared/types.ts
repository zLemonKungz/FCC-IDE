export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface FccStatus {
  online: boolean;
  port: number;
  version?: string;
}

export interface ChatEventPayload {
  sessionId: string;
  message: unknown;
}
