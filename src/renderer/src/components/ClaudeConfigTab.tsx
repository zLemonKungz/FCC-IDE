import { useEffect, useState } from 'react';
import { useExplorerStore } from '../stores/explorer-store';
import SettingsPanel from './SettingsPanel';
import Switch from './Switch';
import type { ClaudePermissions, ClaudeSettingsFile } from '@shared/types';

const MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions'] as const;

function RuleList({ label, rules, onChange }: { label: string; rules: string[]; onChange: (r: string[]) => void }) {
  const [input, setInput] = useState('');
  const add = (): void => {
    const v = input.trim();
    if (!v) return;
    onChange([...rules, v]);
    setInput('');
  };
  return (
    <div className="cs-rule-block">
      <span className="cs-rule-label">{label}</span>
      <div className="cs-rules">
        {rules.map((r, i) => (
          <span key={`${i}-${r}`} className="cs-rule" title={r}>
            {r}
            <button className="icon-btn" onClick={() => onChange(rules.filter((_, j) => j !== i))} title="Remove" aria-label="Remove">
              ✕
            </button>
          </span>
        ))}
        <div className="cs-rule-add">
          <input
            value={input}
            placeholder={`e.g. ${label === 'Allow' ? 'Bash(npm run *)' : 'Edit'}`}
            spellCheck={false}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <button className="ghost" onClick={add}>
            + Add
          </button>
        </div>
      </div>
    </div>
  );
}

// Structured editor for Claude Code's settings.json (user + project). Rules are
// byte-exact strings (never re-formatted — the CLI matches them literally).
export default function ClaudeConfigTab() {
  const root = useExplorerStore((s) => s.root);
  const [scope, setScope] = useState<'user' | 'project'>('user');
  const [draft, setDraft] = useState<ClaudeSettingsFile>({});
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = (): void => {
    setLoaded(false);
    void window.fcc
      .claudeSettingsGet()
      .then((s) => {
        const file = scope === 'user' ? s.user : (s.project ?? {});
        setDraft(file);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  };
  useEffect(load, [scope]);

  const save = async (): Promise<void> => {
    await window.fcc.claudeSettingsSet(scope, draft).catch(() => undefined);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const set = (patch: Partial<ClaudeSettingsFile>): void => setDraft((d) => ({ ...d, ...patch }));
  const setPerm = (patch: Partial<ClaudePermissions>): void =>
    setDraft((d) => ({ ...d, permissions: { ...(d.permissions ?? {}), ...patch } }));

  const env = draft.env ?? {};
  const setEnv = (next: Record<string, string>): void => set({ env: next });

  // Hooks & Guardrails
  const [guard, setGuard] = useState<{ enabled: boolean; blocked: string[] } | null>(null);
  const [gText, setGText] = useState('');
  const [gMsg, setGMsg] = useState('');
  const [hooks, setHooks] = useState<{ event: string; matcher: string }[]>([]);
  const [hEvent, setHEvent] = useState('PostToolUse');
  const [hMatch, setHMatch] = useState('Edit');
  const [hCmd, setHCmd] = useState('');
  useEffect(() => {
    void window.fcc.guardrailsGet().then((g) => { setGuard(g ?? { enabled: false, blocked: [] }); setGText((g?.blocked ?? []).join('\n')); }).catch(() => undefined);
    void window.fcc.hooksList().then(setHooks).catch(() => undefined);
  }, []);

  const [compat, setCompat] = useState<{ command: string; exists: boolean; version: string | null } | null>(null);
  useEffect(() => {
    void window.fcc.cliCompatGet().then(setCompat).catch(() => undefined);
  }, []);

  const enableGuard = async (): Promise<void> => {
    const blocked = gText.split('\n').map((s) => s.trim()).filter(Boolean);
    const g = await window.fcc.guardrailsSet(true, blocked).catch(() => null);
    if (g) { setGuard(g); setGMsg('Guardrails on — Bash commands containing a pattern are blocked.'); }
  };
  const disableGuard = async (): Promise<void> => {
    await window.fcc.guardrailsSet(false, []).catch(() => undefined);
    setGuard({ enabled: false, blocked: [] });
    setGText('');
    setGMsg('Guardrails off.');
  };
  const addHook = async (): Promise<void> => {
    if (!hCmd.trim()) return;
    await window.fcc.hookAdd(hEvent, hMatch, hCmd).catch(() => undefined);
    await window.fcc.hooksList().then(setHooks).catch(() => undefined);
    setGMsg('Hook added.');
  };

  if (!loaded)
    return (
      <div className="cs-empty">
        <span className="spinner" /> Loading…
      </div>
    );

  return (
    <div className="cs-config">
      <div className="cs-config-scope">
        <button className={`cs-tab${scope === 'user' ? ' active' : ''}`} onClick={() => setScope('user')}>
          User
        </button>
        <button
          className={`cs-tab${scope === 'project' ? ' active' : ''}`}
          onClick={() => setScope('project')}
          disabled={!root}
          title={root ? 'Project settings' : 'Open a folder to edit project settings'}
        >
          Project
        </button>
      </div>

      {compat && (
        <div className="cs-compat">
          <span className="cs-compat-head">Claude Code CLI</span>
          <span className="cs-compat-line">
            <span className={`compat-badge${compat.exists && compat.version ? ' ok' : ' fail'}`}>
              {!compat.exists ? 'not found' : `v${compat.version ?? '?'}`}
            </span>
            <code className="cs-compat-cmd" title={compat.command}>{compat.command}</code>
          </span>
        </div>
      )}

      <SettingsPanel title="General">
        <label className="settings-row">
          <span>Model</span>
          <input value={draft.model ?? ''} spellCheck={false} onChange={(e) => set({ model: e.target.value })} />
        </label>
        <div className="settings-row">
          <span>Theme</span>
          <select
            value={draft.theme ?? 'dark'}
            className="settings-select"
            onChange={(e) => set({ theme: e.target.value as 'dark' | 'light' })}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
        <div className="settings-row">
          <span>Include Co-Authored-By</span>
          <Switch checked={draft.includeCoAuthoredBy ?? true} onChange={(v) => set({ includeCoAuthoredBy: v })} />
        </div>
        <div className="settings-row">
          <span>Verbose</span>
          <Switch checked={draft.verbose ?? false} onChange={(v) => set({ verbose: v })} />
        </div>
      </SettingsPanel>

      <SettingsPanel title="Permissions">
        <div className="settings-row">
          <span>Default mode</span>
          <select
            value={draft.permissions?.defaultMode ?? 'default'}
            className="settings-select"
            onChange={(e) => setPerm({ defaultMode: e.target.value as ClaudePermissions['defaultMode'] })}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <RuleList label="Allow" rules={draft.permissions?.allow ?? []} onChange={(allow) => setPerm({ allow })} />
        <RuleList label="Deny" rules={draft.permissions?.deny ?? []} onChange={(deny) => setPerm({ deny })} />
        <RuleList label="Ask" rules={draft.permissions?.ask ?? []} onChange={(ask) => setPerm({ ask })} />
        <RuleList
          label="Additional directories"
          rules={draft.permissions?.additionalDirectories ?? []}
          onChange={(additionalDirectories) => setPerm({ additionalDirectories })}
        />
        <div className="settings-row">
          <span>Disable bypass permissions mode</span>
          <Switch
            checked={draft.permissions?.disableBypassPermissionsMode ?? false}
            onChange={(v) => setPerm({ disableBypassPermissionsMode: v })}
          />
        </div>
      </SettingsPanel>

      <SettingsPanel title="Environment">
        <div className="cs-env">
          {Object.entries(env).map(([k, v]) => (
            <div key={k} className="cs-env-row">
              <input
                value={k}
                spellCheck={false}
                onChange={(e) => {
                  const next = { ...env };
                  delete next[k];
                  next[e.target.value] = v;
                  setEnv(next);
                }}
              />
              <input value={v} spellCheck={false} onChange={(e) => setEnv({ ...env, [k]: e.target.value })} />
              <button
                className="icon-btn"
                onClick={() => {
                  const next = { ...env };
                  delete next[k];
                  setEnv(next);
                }}
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
          <button className="ghost" onClick={() => setEnv({ ...env, '': '' })}>
            + Add variable
          </button>
        </div>
      </SettingsPanel>

      <SettingsPanel title="Hooks &amp; Guardrails">
        <div className="gr-head">
          <span className="gr-title">Guardrails</span>
          <span className={`gr-badge${guard?.enabled ? ' on' : ''}`}>{guard?.enabled ? 'ON' : 'OFF'}</span>
        </div>
        <div className="settings-note">
          Blocks Bash commands containing any pattern below, via a generated <b>PreToolUse</b> hook.
        </div>
        <textarea
          className="gr-input"
          rows={4}
          placeholder={"rm -rf\nsudo\n--force"}
          value={gText}
          onChange={(e) => setGText(e.target.value)}
          spellCheck={false}
        />
        <div className="cs-guard-actions">
          <button className={`ghost gr-btn${guard?.enabled ? ' on' : ''}`} onClick={() => void enableGuard()}>
            {guard?.enabled ? 'Update guardrails' : 'Enable guardrails'}
          </button>
          {guard?.enabled && (
            <button className="ghost gr-btn" onClick={() => void disableGuard()}>
              Disable
            </button>
          )}
        </div>
        {gMsg && <div className="settings-note">{gMsg}</div>}

        <div className="gr-sub-title">Active hooks</div>
        <div className="cs-hooks">
          {hooks.length === 0 ? (
            <span className="settings-note">— none —</span>
          ) : (
            hooks.map((h, i) => (
              <span key={i} className="gr-hook">
                {h.event} · {h.matcher}
              </span>
            ))
          )}
        </div>
        <div className="gr-sub-title">Add a hook</div>
        <div className="cs-hook-add">
          <label className="gr-field">
            <span>Event</span>
            <select value={hEvent} onChange={(e) => setHEvent(e.target.value)}>
              {['PreToolUse', 'PostToolUse', 'PermissionRequest', 'Notification', 'Stop', 'SessionStart', 'UserPromptSubmit'].map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </label>
          <label className="gr-field">
            <span>Tool</span>
            <input value={hMatch} onChange={(e) => setHMatch(e.target.value)} placeholder="Bash, Edit…" spellCheck={false} />
          </label>
          <label className="gr-field grow">
            <span>Command</span>
            <input value={hCmd} onChange={(e) => setHCmd(e.target.value)} placeholder="script path or one-liner" spellCheck={false} />
          </label>
          <button className="ghost gr-btn gr-add" onClick={() => void addHook()}>
            + Add
          </button>
        </div>
      </SettingsPanel>

      <div className="cs-config-actions">
        <button className="primary" onClick={() => void save()}>
          Save
        </button>
        {saved && <span className="cs-config-saved">Saved ✓</span>}
      </div>
      <div className="settings-note">
        Changes apply to the next conversation. Fields the editor doesn't show (hooks, statusLine, …) are preserved.
      </div>
    </div>
  );
}
