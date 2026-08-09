import { useEffect, useState } from 'react';
import { useSettingsStore, CURATED_CLAUDE_MODELS, claudeLabel, curatedModelOptions, EFFORT_LEVELS, effortCapLabel, effectiveEffort, effortControlSettings } from '../stores/settings-store';
import { useChatStore, useActiveChat } from '../stores/chat-store';
import { useExplorerStore } from '../stores/explorer-store';
import SettingsPanel from './SettingsPanel';
import Switch from './Switch';
import { modelContextWindow, effectiveContextWindow } from '@shared/model-context';
import type { AgentSummary, GatewayModel, HistorySummary, McpOverview, McpServerDef, PluginInfo } from '@shared/types';
import { IconTrash, IconPlus } from './icons';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Best-effort currency from a get_session_cost control_response body. */
function fmtLiveCost(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number') return `$${(v as number).toFixed(4)}`;
  const o = (v ?? {}) as Record<string, unknown>;
  const c = o.totalCostUSD ?? o.costUSD ?? o.total_cost_usd ?? o.cost;
  return typeof c === 'number' ? `$${c.toFixed(4)}` : '—';
}

/** Best-effort context summary from a get_context_usage control_response body. */
function fmtLiveCtx(v: unknown): string {
  if (v == null) return '—';
  const o = (v ?? {}) as Record<string, unknown>;
  if (typeof o.totalTokens === 'number') {
    const max = typeof o.maxTokens === 'number' ? o.maxTokens : 0;
    const pct =
      typeof o.percentage === 'number'
        ? o.percentage
        : max > 0
          ? Math.round(((o.totalTokens as number) / max) * 100)
          : 0;
    return `${(o.totalTokens as number).toLocaleString()} / ${max.toLocaleString()} (${pct}%)`;
  }
  return '—';
}

// Module-scope pure helpers (no component state/props captured).
function liveSessionId(): string | null {
  return useChatStore.getState().activeId;
}

// Read-only rows for the user/global scopes (the app never renders these).
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

// Tab-body components for the unified full-page Settings view (see
// SettingsPage.tsx). Each renders inside the page's cs-body — history/MCP data
// load via IPC into local state, never a zustand selector returning a fresh
// object (that re-renders forever).
export function ChatTab() {
  const thinking = useChatStore((s) => s.thinking);
  const chatModel = useSettingsStore((s) => s.chatModel);
  const chatMaxTurns = useSettingsStore((s) => s.chatMaxTurns);
  const autoCompactWindow = useSettingsStore((s) => s.autoCompactWindow);
  const chatEffort = useSettingsStore((s) => s.chatEffort);
  const setChatModel = useSettingsStore((s) => s.setChatModel);
  const setChatMaxTurns = useSettingsStore((s) => s.setChatMaxTurns);
  const setAutoCompactWindow = useSettingsStore((s) => s.setAutoCompactWindow);
  const setChatEffort = useSettingsStore((s) => s.setChatEffort);
  const active = useActiveChat();
  const sessionUsage = active?.sessionUsage ?? { input: 0, output: 0, cost: 0 };
  const lastUsage = active?.lastUsage ?? null;
  const ctxTokens = active?.contextTokens ?? 0;
  const [refreshing, setRefreshing] = useState(false);
  // Shared resolver: the app's known window for the selected model (correct even
  // when the CLI table says 200k for a true-1M model), else CLI report, else the
  // user's auto-compact window (k → tokens), else 200k.
  const modelKnown = modelContextWindow(chatModel) !== null;
  const ctxRef = effectiveContextWindow(chatModel, active?.modelContextWindow ?? 0, autoCompactWindow);
  const ctxPct = ctxRef > 0 ? Math.round((ctxTokens / ctxRef) * 100) : 0;

  // Keep the stored effort snapped to what the current model supports: if the
  // model's ceiling drops below the chosen level (e.g. Sonnet 5 can't do
  // Max/UltraCode), fall back to its highest supported level. When a snap
  // happens (usually because the model changed), also push it live so the
  // current chat's next turn uses it. Idempotent: only fires on an actual snap.
  useEffect(() => {
    const eff = effectiveEffort(chatModel, chatEffort);
    if (eff !== chatEffort) {
      setChatEffort(eff);
      const sid = useChatStore.getState().activeId;
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

  // Gateway models: deduped/filtered/sorted by the shared resolver, so the chat
  // footer dropdown and this select always offer the same set.
  const available = curatedModelOptions(discovered);

  const effNow = effectiveEffort(chatModel, chatEffort);
  const effSnapped = chatEffort !== 'auto' && effNow !== chatEffort;

  return (
    <>
      <SettingsPanel
        title="Context usage (this session)"
        actions={
          <button
            className="ghost gr-btn"
            disabled={!active || refreshing}
            onClick={() => {
              if (!active) return;
              setRefreshing(true);
              void useChatStore.getState().refreshMeta(active.id).finally(() => setRefreshing(false));
            }}
            title="Query the CLI's reported session cost / context usage"
          >
            {refreshing ? '…' : 'Refresh'}
          </button>
        }
      >
        <div className="cs-usage-row">
          <span className="cs-usage-label">Context window</span>
          <span className="cs-usage-nums" title={active?.contextEstimated ? 'Estimated from the loaded transcript — the CLI reports the exact value after the next turn.' : undefined}>
            {ctxTokens.toLocaleString()} / {ctxRef.toLocaleString()} tokens · {ctxPct}%
            {active?.contextEstimated && ' (estimate)'}
            {modelKnown ? '' : ' (fallback: auto-compact)'}
          </span>
        </div>
        {(ctxTokens > 0 || (lastUsage && (lastUsage?.input ?? 0) > 0)) && (
          <div className="cs-ctx-track">
            <div className={`cs-ctx-fill${ctxPct > 100 ? ' full' : ctxPct > 70 ? ' warn' : ''}`} style={{ width: `${Math.min(ctxPct, 100)}%` }} />
          </div>
        )}
        <div className="cs-usage-row" style={{ marginTop: 8 }}>
          <span className="cs-usage-label">Tokens (cumulative)</span>
          <span className="cs-usage-nums">
            {sessionUsage.input.toLocaleString()} in · {sessionUsage.output.toLocaleString()} out · $
            {sessionUsage.cost.toFixed(4)}
          </span>
        </div>
        {ctxPct > 100 && <div className="cs-note">Context is past the auto-compact window — compact to keep going (chat footer → Compact).</div>}
        {lastUsage && <UsageBar usage={lastUsage} />}
        {active?.liveCtx != null && (
          <div className="cs-usage-row" style={{ marginTop: 8 }}>
            <span className="cs-usage-label">Live context (CLI)</span>
            <span className="cs-usage-nums">{fmtLiveCtx(active.liveCtx)}</span>
          </div>
        )}
        {active?.liveCost != null && (
          <div className="cs-usage-row">
            <span className="cs-usage-label">Live cost (CLI)</span>
            <span className="cs-usage-nums">{fmtLiveCost(active.liveCost)}</span>
          </div>
        )}
        </SettingsPanel>
      <SettingsPanel title="Conversation">
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
              const sid = useChatStore.getState().activeId;
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
              const sid = useChatStore.getState().activeId;
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
          <span>Extended thinking</span>
          <Switch checked={thinking} onChange={() => useChatStore.getState().toggleThinking()} />
        </label>
        <label className="settings-row">
          <span>Auto-compact</span>
          <select
            className="settings-select"
            value={autoCompactWindow}
            onChange={(e) => setAutoCompactWindow(Number(e.target.value))}
            title="0 = auto: compact at the model's context window; otherwise a fixed k-token threshold"
          >
            <option value={0}>Auto — model window</option>
            {[100, 150, 190, 200, 300, 500].map((k) => (
              <option key={k} value={k}>
                {k}k tokens
              </option>
            ))}
            {/* A legacy persisted value (any step under the old number input)
                must stay selectable, or the control renders blank. */}
            {autoCompactWindow > 0 && ![100, 150, 190, 200, 300, 500].includes(autoCompactWindow) && (
              <option value={autoCompactWindow}>{autoCompactWindow}k tokens</option>
            )}
          </select>
        </label>
      </div>
        <div className="cs-note">
          {claudeLabel(chatModel)} {effortCapLabel(chatModel)}
          {effSnapped && <> · {chatEffort} adjusted to {effNow}</>}.
        </div>
        <div className="settings-note">
          Model &amp; Effort apply to the current chat’s next turn — Max turns apply to the next conversation.
          Auto-compact at <b>Auto</b> uses the model’s context window (shown once a turn runs); a fixed value
          caps it early.
        </div>
      </SettingsPanel>
    </>
  );
}

export function HistoryTab({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<HistorySummary[] | null>(null);

  const load = (): void => {
    void window.fcc
      .historyList()
      .then((app) => window.fcc.claudeHistoryList().then((cc) => setItems([...app, ...cc])))
      .catch(() => setItems([]));
  };
  useEffect(load, []);

  const open = async (h: HistorySummary): Promise<void> => {
    const rec =
      h.source === 'claude-code'
        ? await window.fcc.claudeHistoryRead(h.id).catch(() => null)
        : await window.fcc.historyOpen(h.id).catch(() => null);
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
    <SettingsPanel title="Saved conversations">
      {items.map((h) => (
        <div key={h.id} className="cs-hist-row">
          <div className="cs-hist-main">
            <div className="cs-hist-title">{h.title || 'Untitled'}</div>
            <div className="cs-hist-meta">
              {h.source === 'claude-code' && <span className="cs-hist-src">Claude Code</span>}
              {h.folder?.split(/[\\/]/).filter(Boolean).pop() ?? '—'} · {fmtTime(h.updatedAt)}
            </div>
          </div>
          <button className="ghost" onClick={() => void open(h)}>
            Open
          </button>
          {h.source !== 'claude-code' && (
            <button className="icon-btn" onClick={() => void del(h.id)} title="Delete" aria-label="Delete">
              <IconTrash width={13} height={13} />
            </button>
          )}
        </div>
      ))}
    </SettingsPanel>
  );
}

export function McpTab({ root }: { root: string | null }) {
  const [overview, setOverview] = useState<McpOverview | null>(null);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  // Live enabled-state for the running session (absent = enabled by default).
  const [disabled, setDisabled] = useState<Record<string, boolean>>({});

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

  const hasGlobal =
    Object.keys(overview.user.claudeJson).length > 0 || Object.keys(overview.user.settingsJson).length > 0;

  return (
    <>
      {!root && <div className="cs-note">Open a folder to manage the project’s MCP servers (.mcp.json).</div>}
      <SettingsPanel title="Project · .mcp.json">
        {Object.entries(servers).map(([n, def]) => (
          <div key={n} className="cs-mcp-row">
            <div className="cs-hist-main">
              <div className="cs-hist-title">
                <span className={`mcp-dot${disabled[n] ? ' off' : ''}`} />
                {n}
              </div>
              <div className="cs-hist-meta mcp-cmd">
                {def.command}
                {def.args ? <span className="mcp-args">{def.args.join(' ')}</span> : null}
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
        {Object.keys(servers).length === 0 && root && (
          <div className="cs-empty">No project servers — add one below.</div>
        )}
      </SettingsPanel>
      <SettingsPanel
        title="Add a server"
        actions={
          <button
            className="ghost gr-btn"
            onClick={() => void add()}
            disabled={!root || !name.trim() || !command.trim()}
          >
            + Add
          </button>
        }
      >
        <div className="cs-note">Claude Code starts it with this command on the next conversation.</div>
        <div className="cs-mcp-add">
          <label className="gr-field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="server-name" disabled={!root} />
          </label>
          <label className="gr-field">
            <span>Command</span>
            <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" disabled={!root} />
          </label>
          <label className="gr-field grow">
            <span>Args</span>
            <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="-y @server/package" disabled={!root} />
          </label>
        </div>
      </SettingsPanel>
      <SettingsPanel title="Global (read-only)">
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
            <div className="settings-section">From plugins</div>
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
      </SettingsPanel>
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

export function AgentsTab({ root }: { root: string | null }) {
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
          <SettingsPanel
            title="Custom subagents"
            actions={
              <button
                className="ghost gr-btn"
                disabled={!root}
                onClick={startNew}
                title="Create a custom agent"
              >
                <IconPlus width={12} height={12} /> New
              </button>
            }
          >
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
          </SettingsPanel>
          <SettingsPanel title="New agent">
            <div className="cs-mcp-add">
              <input
                placeholder="agent name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={!root}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    startNew();
                  }
                }}
              />
              <button className="ghost" disabled={!root} onClick={startNew} title="Create a custom agent">
                Create
              </button>
            </div>
            <div className="cs-note">Agents live in .claude/agents/&lt;name&gt;.md and apply to new conversations.</div>
          </SettingsPanel>
        </>
      )}
    </>
  );
}

// ---- Claude Code plugins ----
// Lists installed plugins (name@marketplace) with their enabled state and the
// MCP servers each declares; toggling enable edits ~/.claude/settings.json's
// enabledPlugins map (preserving everything else). Reload after toggling.
export function PluginsTab() {
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
    <SettingsPanel title="Installed plugins">
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
    </SettingsPanel>
  );
}
