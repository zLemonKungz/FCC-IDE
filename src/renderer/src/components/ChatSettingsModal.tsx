import { useEffect, useState } from 'react';
import { useSettingsStore, CURATED_CLAUDE_MODELS, claudeLabel } from '../stores/settings-store';
import { useChatStore } from '../stores/chat-store';
import { useExplorerStore } from '../stores/explorer-store';
import { useModalFocus } from '../hooks/useModal';
import ClaudeConfigTab from './ClaudeConfigTab';
import type { GatewayModel, HistorySummary, McpServerDef } from '@shared/types';
import { IconTrash, IconPlus, IconClose } from './icons';

type Tab = 'settings' | 'history' | 'mcp' | 'config';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// The chat settings plus the not-yet-surfaced features: session history
// (persist/resume/delete) and an MCP-server manager for the open folder's
// .mcp.json. History/MCP data load via IPC into local state — never a zustand
// selector returning a fresh object (that re-renders forever).
export default function ChatSettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('settings');
  // Call the hook unconditionally — a hook inside a `tab === 'mcp' &&` JSX
  // expression would change the hook count between renders and crash React.
  const root = useExplorerStore((s) => s.root);
  const modalRef = useModalFocus(true, onClose);

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div ref={modalRef} tabIndex={-1} className="chat-settings-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="settings-title">
          <span>Chat settings</span>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IconClose width={13} height={13} />
          </button>
        </div>
        <div className="cs-tabs">
          {(['settings', 'history', 'mcp', 'config'] as Tab[]).map((t) => (
            <button key={t} className={`cs-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="cs-body">
          {tab === 'settings' && <SettingsTab />}
          {tab === 'history' && <HistoryTab onClose={onClose} />}
          {tab === 'mcp' && <McpTab root={root} />}
          {tab === 'config' && <ClaudeConfigTab />}
        </div>
      </div>
    </div>
  );
}

function SettingsTab() {
  const chatModel = useSettingsStore((s) => s.chatModel);
  const chatMaxTurns = useSettingsStore((s) => s.chatMaxTurns);
  const autoCompactWindow = useSettingsStore((s) => s.autoCompactWindow);
  const setChatModel = useSettingsStore((s) => s.setChatModel);
  const setChatMaxTurns = useSettingsStore((s) => s.setChatMaxTurns);
  const setAutoCompactWindow = useSettingsStore((s) => s.setAutoCompactWindow);
  const sessionUsage = useChatStore((s) => s.sessionUsage);
  // Models the connected FCC gateway serves — fetched from /v1/models, filtered
  // to claude-related entries and de-duplicated against the curated list.
  const [discovered, setDiscovered] = useState<GatewayModel[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.fcc
      .chatModels()
      .then((m) => {
        if (!cancelled) setDiscovered(m);
      })
      .catch(() => {
        if (!cancelled) setDiscovered(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const curatedLabels = new Set(CURATED_CLAUDE_MODELS.map((m) => m.label));
  // Gateway models: claude-related, excluding the curated ones (by id AND by
  // friendly label, so aliases like anthropic/opencode/claude-fable-5 don't
  // duplicate "Fable 5") and the noisy "no thinking" prefix. De-duped by label.
  const available = Array.from(
    new Map(
      (discovered ?? [])
        .filter((m) => {
          const label = claudeLabel(m.id);
          return (
            /claude/i.test(m.id) &&
            !m.id.startsWith('claude-3-freecc-no-thinking/') &&
            !CURATED_CLAUDE_MODELS.some((c) => c.id === m.id) &&
            !curatedLabels.has(label)
          );
        })
        .map((m) => [claudeLabel(m.id), m])
    ).values()
  ).sort((a, b) => claudeLabel(a.id).localeCompare(claudeLabel(b.id)));

  return (
    <>
      <div className="cs-usage">
        <span className="cs-usage-label">Context usage (this session)</span>
        <span className="cs-usage-nums">
          {sessionUsage.input.toLocaleString()} in · {sessionUsage.output.toLocaleString()} out · $
          {sessionUsage.cost.toFixed(4)}
        </span>
      </div>
      <label className="settings-row">
        <span>Model</span>
        <select value={chatModel} onChange={(e) => setChatModel(e.target.value)} className="settings-select">
          <optgroup label="Claude">
            {CURATED_CLAUDE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </optgroup>
          {available.length > 0 && (
            <optgroup label="Available on gateway">
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {claudeLabel(m.id)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {discovered === null && (
        <div className="cs-note">Couldn’t reach the gateway — showing the main Claude models.</div>
      )}
      <label className="settings-row">
        <span>Max turns</span>
        <input
          type="number"
          min={1}
          max={500}
          value={chatMaxTurns}
          onChange={(e) => setChatMaxTurns(Number(e.target.value) || 50)}
        />
      </label>
      <label className="settings-row">
        <span>Auto-compact (k tokens)</span>
        <input
          type="number"
          min={10}
          max={1000}
          step={10}
          value={autoCompactWindow}
          onChange={(e) => setAutoCompactWindow(Number(e.target.value) || 190)}
        />
      </label>
      <div className="settings-note">Settings apply to the next conversation.</div>
    </>
  );
}

function HistoryTab({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<HistorySummary[] | null>(null);

  const load = (): void => {
    void window.fcc.historyList().then(setItems).catch(() => setItems([]));
  };
  useEffect(load, []);

  const open = async (id: string): Promise<void> => {
    const rec = await window.fcc.historyOpen(id).catch(() => null);
    if (rec) {
      useChatStore.getState().openHistory(rec);
      onClose();
    }
  };
  const del = async (id: string): Promise<void> => {
    await window.fcc.historyDelete(id).catch(() => undefined);
    load();
  };

  if (items === null)
    return (
      <div className="cs-empty">
        <span className="spinner" /> Loading…
      </div>
    );
  if (items.length === 0) return <div className="cs-empty">No saved conversations yet.</div>;
  return (
    <>
      {items.map((h) => (
        <div key={h.id} className="cs-hist-row">
          <div className="cs-hist-main">
            <div className="cs-hist-title">{h.title || 'Untitled'}</div>
            <div className="cs-hist-meta">
              {h.folder?.split(/[\\/]/).filter(Boolean).pop() ?? '—'} · {fmtTime(h.updatedAt)}
            </div>
          </div>
          <button className="ghost" onClick={() => void open(h.id)}>
            Open
          </button>
          <button className="icon-btn" onClick={() => void del(h.id)} title="Delete">
            <IconTrash width={13} height={13} />
          </button>
        </div>
      ))}
    </>
  );
}

function McpTab({ root }: { root: string | null }) {
  const [servers, setServers] = useState<Record<string, McpServerDef> | null>(null);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');

  const load = (): void => {
    void window.fcc.mcpGet().then((c) => setServers(c.mcpServers)).catch(() => setServers({}));
  };
  // Refresh on mount and whenever the open folder changes.
  useEffect(() => {
    setServers(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const save = async (next: Record<string, McpServerDef>): Promise<void> => {
    await window.fcc.mcpSet(next).catch(() => undefined);
    setServers(next);
  };
  const add = async (): Promise<void> => {
    const n = name.trim();
    const c = command.trim();
    if (!n || !c) return;
    const parsedArgs = args.trim() ? args.trim().split(/\s+/) : undefined;
    const next = { ...(servers ?? {}), [n]: { command: c, ...(parsedArgs ? { args: parsedArgs } : {}) } };
    await save(next);
    setName('');
    setCommand('');
    setArgs('');
  };
  const remove = async (n: string): Promise<void> => {
    const next = { ...(servers ?? {}) };
    delete next[n];
    await save(next);
  };

  if (servers === null)
    return (
      <div className="cs-empty">
        <span className="spinner" /> Loading…
      </div>
    );

  return (
    <>
      {!root && <div className="cs-note">Open a folder to manage MCP servers (.mcp.json).</div>}
      {Object.entries(servers).map(([n, def]) => (
        <div key={n} className="cs-mcp-row">
          <div className="cs-hist-main">
            <div className="cs-hist-title">{n}</div>
            <div className="cs-hist-meta">
              {def.command} {def.args?.join(' ') ?? ''}
            </div>
          </div>
          <button className="icon-btn" onClick={() => void remove(n)} title="Remove">
            <IconTrash width={13} height={13} />
          </button>
        </div>
      ))}
      {Object.keys(servers).length === 0 && root && <div className="cs-empty">No MCP servers configured.</div>}
      <div className="cs-mcp-add">
        <input placeholder="name" value={name} onChange={(e) => setName(e.target.value)} disabled={!root} />
        <input placeholder="command (e.g. npx)" value={command} onChange={(e) => setCommand(e.target.value)} disabled={!root} />
        <input placeholder="args" value={args} onChange={(e) => setArgs(e.target.value)} disabled={!root} />
        <button
          className="icon-btn"
          onClick={() => void add()}
          disabled={!root || !name.trim() || !command.trim()}
          title="Add server"
        >
          <IconPlus width={13} height={13} />
        </button>
      </div>
      <div className="cs-note">MCP changes apply to new conversations.</div>
    </>
  );
}
