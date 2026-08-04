import { useEffect, useState } from 'react';
import { useExplorerStore } from '../stores/explorer-store';
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
            <button className="icon-btn" onClick={() => onChange(rules.filter((_, j) => j !== i))} title="Remove">
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

      <div className="settings-section">General</div>
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

      <div className="settings-section">Permissions</div>
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

      <div className="settings-section">Environment</div>
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
