import { useMemo, useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useTelemetryStore } from '../stores/telemetry-store';
import { useChatStore } from '../stores/chat-store';
import { langFor } from '../lang/highlight';
import { IconActivity, IconCheck, IconClose, IconPencil } from './icons';

type Tab = 'timeline' | 'files' | 'agent';

const TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const base = (p: string): string => p.split(/[\\/]/).pop() ?? p;
const fmt = (n: number): string => n.toLocaleString();

function sessionLabel(sessionId: string): string {
  const i = useChatStore.getState().sessions.findIndex((s) => s.id === sessionId);
  return i >= 0 ? `Chat ${i + 1}` : 'Chat';
}

/** Small snapshot (read-only Monaco) overlay for a Time Machine point. */
function SnapshotPreview({ files, onClose }: { files: Record<string, string>; onClose: () => void }) {
  const paths = Object.keys(files).sort();
  const [sel, setSel] = useState(paths[0] ?? '');
  return (
    <div className="snapshot-backdrop" onPointerDown={onClose}>
      <div className="snapshot-panel" onPointerDown={(e) => e.stopPropagation()}>
        <div className="snapshot-head">
          <span className="sp-title">Snapshot — {paths.length} file{paths.length === 1 ? '' : 's'}, read-only</span>
          <button className="icon-btn" onClick={onClose} title="Close" aria-label="Close snapshot preview">
            <IconClose width={12} height={12} />
          </button>
        </div>
        {paths.length === 0 ? (
          <div className="sp-empty">This turn captured no open tabs.</div>
        ) : (
          <div className="snapshot-body">
            <ul className="sp-files">
              {paths.map((p) => (
                <li key={p} className={sel === p ? 'active' : ''} onClick={() => setSel(p)}>
                  {base(p)}
                </li>
              ))}
            </ul>
            <div className="sp-editor">
              <MonacoEditor
                height="100%"
                language={langFor(sel)}
                value={files[sel] ?? ''}
                theme="vs-dark"
                options={{ readOnly: true, automaticLayout: true, minimap: { enabled: false }, fontSize: 12, wordWrap: 'on', scrollBeyondLastLine: false }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ActivityPanel() {
  const turns = useTelemetryStore((s) => s.turns);
  const checkpoints = useChatStore((s) => s.checkpoints);
  const [tab, setTab] = useState<Tab>('timeline');
  const [sel, setSel] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  // Newest first.
  const ordered = useMemo(() => [...turns].sort((a, b) => b.at - a.at), [turns]);
  const selected = ordered.find((t) => t.id === sel) ?? null;
  const snapshot = selected ? checkpoints[selected.id] : undefined;

  // Influence: total + per-chat count per file.
  const influence = useMemo(() => {
    const files = new Map<string, { total: number; bySession: Record<string, number> }>();
    for (const t of turns) {
      for (const [path, n] of Object.entries(t.touched)) {
        const e = files.get(path) ?? { total: 0, bySession: {} };
        e.total += n;
        e.bySession[t.sessionId] = (e.bySession[t.sessionId] ?? 0) + n;
        files.set(path, e);
      }
    }
    return [...files.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [turns]);
  const maxInfluence = influence[0]?.[1].total ?? 1;

  const empty = (
    <div className="empty-state">
      <IconActivity />
      <div className="empty-title">No agent activity yet</div>
      <div className="empty-hint">Run a chat turn — each finished turn lands here.</div>
    </div>
  );

  return (
    <div className="activity-panel">
      <div className="ap-tabs">
        {(['timeline', 'files', 'agent'] as Tab[]).map((t) => (
          <button key={t} className={`ap-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {turns.length === 0 && empty}

      {turns.length > 0 && tab === 'timeline' && (
        <div className="ap-list">
          {ordered.map((t) => (
            <button key={t.id} className={`ap-turn${sel === t.id ? ' active' : ''}`} onClick={() => { setSel(t.id); setPreview(false); }}>
              <span className="ap-turn-head">
                <span className="ap-chat">{sessionLabel(t.sessionId)}</span>
                <span className="ap-time">{TIME.format(t.at)}</span>
              </span>
              <span className="ap-summary">{t.summary || '…'}</span>
              <span className="ap-meta">
                {Object.keys(t.touched).length > 0 && <span className="ap-file-chip">✎ {Object.keys(t.touched).length} file</span>}
                {t.usage && <span className="ap-usage">{fmt(t.usage.input)} → {fmt(t.usage.output)} tok</span>}
                {t.hasSnapshot && <span className="ap-snap">⏎ snapshot</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {turns.length > 0 && tab === 'files' && (
        <div className="ap-list">
          {influence.map(([path, { total, bySession }]) => (
            <div key={path} className="ap-file">
              <div className="ap-file-top">
                <span className="ap-file-name" title={path}>{base(path)}</span>
                <span className="ap-file-count">{fmt(total)}</span>
              </div>
              <div className="ap-file-bar">
                <div className="ap-file-fill" style={{ width: `${(total / maxInfluence) * 100}%` }} />
              </div>
              <div className="ap-file-sub">
                {Object.entries(bySession).map(([sid, n]) => (
                  <span key={sid} className="ap-file-chat">{sessionLabel(sid)} {n}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {turns.length > 0 && tab === 'agent' && (
        <div className="ap-list">
          {[...turns].sort((a, b) => b.at - a.at).slice(0, 8).map((t) => (
            <div key={t.id} className="ap-agentturn">
              <div className="ap-agent-head">
                <span className="ap-chat">{sessionLabel(t.sessionId)}</span>
                <span className="ap-summary">{t.summary || '…'}</span>
              </div>
              <ol className="ap-tools">
                {t.tools.map((tl, i) => (
                  <li key={i} className={`ap-tool ${tl.state === 'error' ? 'err' : tl.state === 'running' ? 'run' : ''}`}>
                    <span className={`ap-tool-dot ${tl.state}`} />
                    <span className="ap-tool-name">{tl.name}</span>
                    {tl.file && <span className="ap-tool-file">{base(tl.file)}</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="ap-detail">
          {selected.hasSnapshot && snapshot && (
            <div className="ap-detail-actions">
              <button className="icon-btn" onClick={() => setPreview(true)} title="Preview snapshot">
                <IconPencil width={12} height={12} />
              </button>
              <button
                className="ghost"
                onClick={() => useChatStore.getState().rewindTo(selected.id)}
                title="Restore the workspace to before this turn"
              >
                <IconCheck width={11} height={11} /> Restore
              </button>
            </div>
          )}
          {Object.keys(selected.touched).length > 0 && (
            <div className="ap-detail-files">
              {Object.entries(selected.touched).map(([p, n]) => (
                <span key={p} className="ap-detail-file">{base(p)} <b>{n}</b></span>
              ))}
            </div>
          )}
          {selected.usage && (
            <div className="ap-detail-usage">{fmt(selected.usage.input)} in · {fmt(selected.usage.output)} out{selected.usage.cost != null && ` · $${selected.usage.cost.toFixed(4)}`}</div>
          )}
        </div>
      )}

      {preview && selected && snapshot && (
        <SnapshotPreview files={snapshot} onClose={() => setPreview(false)} />
      )}
    </div>
  );
}