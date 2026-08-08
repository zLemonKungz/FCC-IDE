// error-log.ts — forwards renderer-side errors to the main-process log file.
// Uncaught errors / unhandled rejections land in userData/logs/app.log via the
// log:error IPC. Best-effort: if the bridge is missing, silently no-op.

function send(type: string, message: string, stack?: string): void {
  void window.fcc
    .logError({ type, message, stack, source: 'renderer' })
    .catch(() => undefined);
}

/** Install global error listeners. Call once at startup (main.tsx). */
export function initRendererErrorLog(): void {
  window.addEventListener('error', (e) => {
    send('uncaught-error', e.message ?? String(e.error), e.error?.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    send('unhandled-rejection', (r as Error)?.message ?? String(r), (r as Error)?.stack);
  });
}
