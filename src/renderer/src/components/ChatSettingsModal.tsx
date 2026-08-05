import { useEffect, useState } from 'react';
import { useSettingsStore, CURATED_CLAUDE_MODELS, claudeLabel, EFFORT_LEVELS, effortCapLabel, effectiveEffort, effortControlSettings } from '../stores/settings-store';
import { useChatStore } from '../stores/chat-store';
import { useExplorerStore } from '../stores/explorer-store';
import { useModalFocus } from '../hooks/useModal';
import ClaudeConfigTab from './ClaudeConfigTab';
import type { AgentSummary, GatewayModel, HistorySummary, McpOverview, McpServerDef, PluginInfo } from '@shared/types';
import { IconTrash, IconPlus, IconClose } from './icons';

type Tab = 'settings' | 'history' | 'mcp' | 'agents' | 'plugins' | 'config';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Last-turn token mix as a segmented bar (cache-write / cache-read / fresh
// input / output) so a huge cache-write or a cheap cache-read is visible.
function UsageBar({ usage }: { usage: { input: number; output: number; cacheRead?: number; cacheWrite?: number } }) {
  const cacheRead = usage.cacheRead ?? 0;
  const cacheWrite = usage.cacheWrite ?? 0;
  const fresh = Math.max(0, usage.input - cacheRead - cacheWrite);
  const total = usage.input + usage.output;
  const pct = (n: number): string => `${total > 0 ? Math.round((n / total) * 100) : 0}%`;
  const segs = [
    { label: 'write', value: cacheWrite, cls: 'write' },
    { label: 'cache-read', value: cacheRead, cls: 'read' },
    { label: 'input', value: fresh, cls: 'fresh' },
    { label: 'output', value: usage.output, cls: 'out' }
  ].filter((s) => s.value > 0);
  if (segs.length === 0) return null;
  return (
    <div className="cs-usagebar">
      <div className="cs-usagebar-track">
        {segs.map((s) => (
          <span key={s.cls} className={`cs-usagebar-seg seg-${s.cls}`} style={{ width: pct(s.value) }} />
        ))}
      </div>
      <div className="cs-usagebar-legend">
        {segs.map((s) => (
          <span key={s.cls} className={`cs-usagebar-lg lg-${s.cls}`}>
            <i /> {s.label} {s.value.toLocaleString()}
          </span>
        ))}
      </div>
    </div>
  );
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
          <div className="st-left">
            <span className="st-title">Chat settings</span>
            <span className="st-sub">Model · effort · turns · tooling for the Claude conversation</span>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close" aria-label="Close">
            <IconClose width={13} height={13} />
          </button>
        </div>
        <div className="cs-tabs">
          {(['settings', 'history', 'mcp', 'agents', 'plugins', 'config'] as Tab[]).map((t) => (
            <button key={t} className={`cs-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="cs-body">
          {tab === 'settings' && <SettingsTab />}
          {tab === 'history' && <HistoryTab onClose={onClose} />}
          {tab === 'mcp' && <McpTab root={root} />}
          {tab === 'agents' && <AgentsTab root={root} />}
          {tab === 'plugins' && <PluginsTab />}
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
  const chatEffort = useSettingsStore((s) => s.chatEffort);
  const setChatModel = useSettingsStore((s) => s.setChatModel);
  const setChatMaxTurns = useSettingsStore((s) => s.setChatMaxTurns);
  const setAutoCompactWindow = useSettingsStore((s) => s.setAutoCompactWindow);
  const setChatEffort = useSettingsStore((s) => s.setChatEffort);
  const sessionUsage = useChatStore((s) => s.sessionUsage);
  const lastUsage = useChatStore((s) => s.lastUsage);

  // Keep the stored effort snapped to what the current model supports: if the
  // model's ceiling drops below the chosen level (e.g. Sonnet 5 can't do
  // Max/UltraCode), fall back to its highest supported level. When a snap
  // happens (usually because the model changed), also push it live so the
  // current chat's next turn uses it. Idempotent: only fires on an actual snap.
  useEffect(() => {
    const eff = effectiveEffort(chatModel, chatEffort);
    if (eff !== chatEffort) {
      setChatEffort(eff);
      const sid = useChatStore.getState().activeSessionId;
      if (sid) void window.fcc.chatControl(sid, 'apply_flag_settings', { settings: effortControlSettings(eff) });
    }
  }, [chatModel, chatEffort]);
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

  const effNow = effectiveEffort(chatModel, chatEffort);
  const effSnapped = chatEffort !== 'auto' && effNow !== chatEffort;

  return (
    <>
      <div className="cs-usage">
        <div className="cs-usage-row">
          <span className="cs-usage-label">Context usage (this session)</span>
          <span className="cs-usage-nums">
            {sessionUsage.input.toLocaleString()} in · {sessionUsage.output.toLocaleString()} out · $
            {sessionUsage.cost.toFixed(4)}
          </span>
        </div>
        {lastUsage && <UsageBar usage={lastUsage} />}
      </div>
      {discovered === null && (
        <div className="cs-note">Couldn’t reach the gateway — showing the main Claude models.</div>
      )}
      <div className="cs-settings-grid">
        <label className="settings-row">
          <span>Model</span>
          <select
            value={chatModel}
            onChange={(e) => {
              const m = e.target.value;
              setChatModel(m); // persisted — the next conversation spawns with it
              // Realtime: switch the live conversation's model on its next turn
              const sid = useChatStore.getState().activeSessionId;
              if (sid) void window.fcc.chatControl(sid, 'set_model', { model: m });
            }}
            className="settings-select"
          >
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
          <span>Effort</span>
          <select
            value={effNow}
            onChange={(e) => {
              const eff = effectiveEffort(chatModel, e.target.value);
              setChatEffort(eff);
              // Realtime: push to the live conversation's next turn too.
              const sid = useChatStore.getState().activeSessionId;
              if (sid) void window.fcc.chatControl(sid, 'apply_flag_settings', { settings: effortControlSettings(eff) });
            }}
            className="settings-select"
          >
            <option value="auto">Auto (model default)</option>
            {EFFORT_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
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
      </div>
      <div className="cs-note">
        {claudeLabel(chatModel)} {effortCapLabel(chatModel)}
        {effSnapped && <> · {chatEffort} adjusted to {effNow}</>}.
      </div>
      <div className="settings-note">Model &amp; Effort apply to the current chat’s next turn — Max turns &amp; auto-compact apply to the next conversation.</div>
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
          <button className="icon-btn" onClick={() => void del(h.id)} title="Delete" aria-label="Delete">
            <IconTrash width={13} height={13} />
          </button>
        </div>
      ))}
    </>
  );
}

function McpTab({ root }: { root: string | null }) {
  const [overview, setOverview] = useState<McpOverview | null>(null);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  // Live enabled-state for the running session (absent = enabled by default).
  const [disabled, setDisabled] = useState<Record<string, boolean>>({});

  const liveSessionId = (): string | null => useChatStore.getState().activeSessionId;
  const toggleServer = (n: string): void => {
    const next = !disabled[n];
    setDisabled((d) => ({ ...d, [n]: next }));
    const sid = liveSessionId();
    if (sid) void window.fcc.chatControl(sid, 'mcp_toggle', { serverName: n, enabled: !next });
  };
  const reconnect = (n: string): void => {
    const sid = liveSessionId();
    if (sid) void window.fcc.chatControl(sid, 'mcp_reconnect', { serverName: n });
  };

  const load = (): void => {
    void window.fcc.mcpGet().then(setOverview).catch(() => setOverview(null));
  };
  // Refresh on mount and whenever the open folder changes.
  useEffect(() => {
    setOverview(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const servers = overview?.project ?? {};

  const save = async (next: Record<string, McpServerDef>): Promise<void> => {
    await window.fcc.mcpSet(next).catch(() => undefined);
    setOverview((o) => (o ? { ...o, project: next } : o));
  };
  const add = async (): Promise<void> => {
    const n = name.trim();
    const c = command.trim();
    if (!n || !c) return;
    const parsedArgs = args.trim() ? args.trim().split(/\s+/) : undefined;
    const next = { ...servers, [n]: { command: c, ...(parsedArgs ? { args: parsedArgs } : {}) } };
    await save(next);
    setName('');
    setCommand('');
    setArgs('');
  };
  const remove = async (n: string): Promise<void> => {
    const next = { ...servers };
    delete next[n];
    await save(next);
  };

  if (overview === null)
    return (
      <div className="cs-empty">
        <span className="spinner" /> Loading…
      </div>
    );

  // Read-only rows for the user/global scopes (the app never writes these).
  const globalRows = (rows: Record<string, McpServerDef>) => (
    <>
      {Object.entries(rows).map(([n, def]) => (
        <div key={n} className="cs-mcp-row">
          <div className="cs-hist-main">
            <div className="cs-hist-title">{n}</div>
            <div className="cs-hist-meta">{(def as { url?: string }).url ?? def.command ?? '…'}</div>
          </div>
          <span className="cs-scope-chip">global</span>
        </div>
      ))}
    </>
  );
  const hasGlobal =
    Object.keys(overview.user.claudeJson).length > 0 || Object.keys(overview.user.settingsJson).length > 0;

  return (
    <>
      {!root && <div className="cs-note">Open a folder to manage the project’s MCP servers (.mcp.json).</div>}
      <div className="settings-section">Project · .mcp.json</div>
      {Object.entries(servers).map(([n, def]) => (
        <div key={n} className="cs-mcp-row">
          <div className="cs-hist-main">
            <div className="cs-hist-title">{n}</div>
            <div className="cs-hist-meta">
              {def.command} {def.args?.join(' ') ?? ''}
            </div>
          </div>
          <button
            className="ghost"
            disabled={!liveSessionId()}
            onClick={() => toggleServer(n)}
            title={disabled[n] ? 'Enable for the running conversation' : 'Disable for the running conversation'}
          >
            {disabled[n] ? 'Off' : 'On'}
          </button>
          <button className="ghost" disabled={!liveSessionId()} onClick={() => reconnect(n)} title="Reconnect now">
            ↻
          </button>
          <button className="icon-btn" onClick={() => void remove(n)} title="Remove" aria-label="Remove">
            <IconTrash width={13} height={13} />
          </button>
        </div>
      ))}
      {Object.keys(servers).length === 0 && root && <div className="cs-empty">No project servers — add one below.</div>}
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
      <div className="settings-section">Global (read-only)</div>
      {!hasGlobal && (
        <div className="cs-note">
          No global MCP servers — configure them with Claude Code /mcp (writes ~/.claude.json) or the Config tab
          (settings.json).
        </div>
      )}
      {Object.keys(overview.user.claudeJson).length > 0 && (
        <>
          <div className="cs-scope-label">~/.claude.json</div>
          {globalRows(overview.user.claudeJson)}
        </>
      )}
      {Object.keys(overview.user.settingsJson).length > 0 && (
        <>
          <div className="cs-scope-label">settings.json</div>
          {globalRows(overview.user.settingsJson)}
        </>
      )}
      {Object.keys(overview.plugins).length > 0 && (
        <>
          <div className="settings-section">From plugins (read-only)</div>
          {Object.entries(overview.plugins).map(([n, def]) => (
            <div key={n} className="cs-mcp-row">
              <div className="cs-hist-main">
                <div className="cs-hist-title">{n}</div>
                <div className="cs-hist-meta">{(def as { url?: string }).url ?? def.command ?? '…'}</div>
              </div>
              <span className="cs-scope-chip">plugin</span>
            </div>
          ))}
        </>
      )}
      <div className="cs-note">
        Project edits apply to new conversations — On/Off &amp; ↻ apply live to the running one
        {liveSessionId() ? '' : ' (start a chat to use them)'}.
      </div>
    </>
  );
}

// ---- Custom subagents (.claude/agents/*.md) ----
// Lists the project's custom-agent files, with a plain-text frontmatter editor
// (the Claude Code MD format). Mirrors the MCP tab's list / add interactivity.
const AGENT_TEMPLATE = `---
name: my-agent
description: What this agent does
model: inherit
tools: Read, Grep, Bash
---
You are a focused assistant. Describe the task, style, and any constraints here.
`;

function AgentsTab({ root }: { root: string | null }) {
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [editing, setEditing] = useState<{ name: string; content: string; isNew: boolean } | null>(null);
  const [newName, setNewName] = useState('');

  const load = (): void => {
    void window.fcc.agentsList().then(setAgents).catch(() => setAgents([]));
  };
  useEffect(() => {
    setAgents(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const open = async (name: string): Promise<void> => {
    const content = await window.fcc.agentsRead(name).catch(() => '');
    setEditing({ name, content, isNew: false });
  };
  const startNew = (): void => {
    const stem = newName.trim() || 'my-agent';
    setNewName('');
    setEditing({ name: stem, content: AGENT_TEMPLATE.replace('name: my-agent', `name: ${stem}`), isNew: true });
  };
  const save = async (): Promise<void> => {
    if (!editing) return;
    const nm = editing.name.trim();
    if (!nm) return;
    // Keep the frontmatter `name:` in lockstep with the filename (Claude Code
    // keys agents by filename; the field is a fallback).
    const content = editing.content.replace(/^name:\s*[^\n]*/m, `name: ${nm}`);
    await window.fcc.agentsSave(nm, content).catch(() => undefined);
    setEditing(null);
    load();
  };
  const remove = async (name: string): Promise<void> => {
    await window.fcc.agentsDelete(name).catch(() => undefined);
    load();
  };

  if (agents === null)
    return (
      <div className="cs-empty">
        <span className="spinner" /> Loading…
      </div>
    );

  return (
    <>
      {!root && <div className="cs-note">Open a folder to manage custom subagents (.claude/agents).</div>}
      {editing ? (
        <div className="cs-agent-editor">
          <input
            className="cs-agent-name"
            value={editing.name}
            disabled={!editing.isNew}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="agent name"
            spellCheck={false}
          />
          <textarea
            className="cs-agent-body"
            value={editing.content}
            onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            spellCheck={false}
          />
          <div className="cs-mcp-add">
            <button className="primary" onClick={() => void save()} disabled={!editing.name.trim()}>
              Save
            </button>
            <button onClick={() => setEditing(null)}>Cancel</button>
          </div>
          <div className="cs-note">Agents live in .claude/agents/&lt;name&gt;.md and apply to new conversations.</div>
        </div>
      ) : (
        <>
          {agents.length === 0 && root && <div className="cs-empty">No custom subagents yet.</div>}
          {agents.map((a) => (
            <div key={a.name} className="cs-mcp-row">
              <div className="cs-hist-main">
                <div className="cs-hist-title">{a.name}</div>
                <div className="cs-hist-meta">.claude/agents/{a.name}.md</div>
              </div>
              <button className="ghost" onClick={() => void open(a.name)}>
                Edit
              </button>
              <button className="icon-btn" onClick={() => void remove(a.name)} title="Delete" aria-label="Delete">
                <IconTrash width={13} height={13} />
              </button>
            </div>
          ))}
          <div className="cs-mcp-add">
            <input
              placeholder="new agent name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={!root}
            />
            <button disabled={!root} onClick={startNew} title="Create a custom agent">
              <IconPlus width={13} height={13} />
            </button>
          </div>
        </>
      )}
    </>
  );
}

// ---- Claude Code plugins ----
// Lists installed plugins (name@marketplace) with their enabled state and the
// MCP servers each declares; toggling enable edits ~/.claude/settings.json's
// enabledPlugins map (preserving everything else). Reload after toggling.
function PluginsTab() {
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null);

  const load = (): void => {
    void window.fcc.pluginsList().then(setPlugins).catch(() => setPlugins([]));
  };
  useEffect(load, []);
  const toggle = async (p: PluginInfo): Promise<void> => {
    await window.fcc.pluginsSet(p.id, !p.enabled).catch(() => undefined);
    load();
  };

  if (plugins === null)
    return (
      <div className="cs-empty">
        <span className="spinner" /> Loading…
      </div>
    );
  if (plugins.length === 0) return <div className="cs-empty">No plugins installed (~/.claude/plugins).</div>;

  return (
    <>
      {plugins.map((p) => (
        <div key={p.id} className="cs-mcp-row">
          <div className="cs-hist-main">
            <div className="cs-hist-title">
              {p.name}
              {Object.keys(p.mcp).length > 0 && (
                <span className="cs-plugin-mcp" title={Object.keys(p.mcp).join(', ')}>
                  MCP · {Object.keys(p.mcp).length}
                </span>
              )}
            </div>
            <div className="cs-hist-meta">
              {p.description ?? p.id}
              {p.version ? ` · v${p.version}` : ''}
            </div>
          </div>
          <button
            className={`cs-plugin-toggle${p.enabled ? ' on' : ''}`}
            onClick={() => void toggle(p)}
            title={p.enabled ? 'Disable plugin' : 'Enable plugin'}
          >
            {p.enabled ? 'On' : 'Off'}
          </button>
        </div>
      ))}
      <div className="cs-note">Enabling/disabling edits ~/.claude/settings.json (enabledPlugins). It applies to new sessions.</div>
    </>
  );
}
