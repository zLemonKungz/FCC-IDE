import { useCallback, useEffect, useState } from 'react';
import { useExplorerStore } from '../stores/explorer-store';
import type { GitBranch, GitCommit, GitStatus } from '@shared/types';
import CommitGraph from './CommitGraph';
import { IconCheck, IconClose, IconPlus } from './icons';

// Source Control sidebar: git status (staged / unstaged / untracked), per-file
// stage/unstage/discard, a commit box on top, branch switch/create, and an "✨"
// helper that asks Claude to write the commit message from the staged diff.
export default function SourceControlPanel() {
  const root = useExplorerStore((s) => s.root);
  const [status, setStatus] = useState<GitStatus | null | undefined>(undefined); // undefined = loading
  const [message, setMessage] = useState('');
  const [branches, setBranches] = useState<GitBranch[] | null>(null);
  const [newBranch, setNewBranch] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [history, setHistory] = useState<GitCommit[] | null>(null);

  const load = useCallback(() => {
    if (!root) {
      setStatus(null);
      return;
    }
    void window.fcc.gitStatus().then(setStatus).catch(() => setStatus(null));
    void window.fcc.gitBranch('list').then((b) => setBranches(Array.isArray(b) ? b : [])).catch(() => setBranches([]));
    void window.fcc.gitHistory().then(setHistory).catch(() => setHistory(null));
  }, [root]);

  useEffect(() => {
    load();
    const onMod = () => load();
    window.addEventListener('fcc:file-modified', onMod);
    const id = setInterval(load, 8000);
    return () => {
      window.removeEventListener('fcc:file-modified', onMod);
      clearInterval(id);
    };
  }, [load]);

  const openFile = (rel: string): void => {
    if (!root) return;
    window.dispatchEvent(new CustomEvent('fcc:open-file', { detail: `${root}\\${rel.replace(/\//g, '\\')}` }));
  };

  const act = async (action: 'stage' | 'unstage' | 'discard', paths: string[]): Promise<void> => {
    if (!root || paths.length === 0) return;
    setBusy(true);
    await window.fcc.gitAction(action, paths);
    setBusy(false);
    load();
  };

  const commit = async (): Promise<void> => {
    if (!message.trim()) return;
    setBusy(true);
    const r = await window.fcc.gitCommit(message).catch(() => ({ ok: false, err: 'commit failed' }));
    setBusy(false);
    if (r.ok) {
      setMessage('');
      setFeedback('Committed ✓');
    } else {
      setFeedback(r.err ?? 'commit failed');
    }
    load();
  };

  const suggest = (): void => {
    if (!root) return;
    void window.fcc.gitStagedDiff().then((diff) => {
      if (!diff) {
        setFeedback('Stage some changes first, then ask Claude for a message.');
        return;
      }
      const prompt = `Write a concise, conventional commit message (subject + short body) for this staged diff. Reply with the message only:\n\n\`\`\`diff\n${diff}\n\`\`\``;
      window.dispatchEvent(new CustomEvent('fcc:chat-input', { detail: prompt }));
      setFeedback('Prompt sent to chat — press Enter there to have Claude write it.');
    });
  };

  const switchBranch = async (name: string): Promise<void> => {
    if (!name) return;
    const r = await window.fcc.gitBranch('switch', name);
    if (r && !Array.isArray(r) && r.ok) setFeedback(`Switched to ${name} ✓`);
    load();
  };
  const createBranch = async (): Promise<void> => {
    const n = newBranch.trim();
    if (!n) return;
    const r = await window.fcc.gitBranch('create', n);
    if (r && !Array.isArray(r) && r.ok) {
      setNewBranch('');
      setFeedback(`Created ${n} ✓`);
    }
    load();
  };

  if (!root) {
    return (
      <div className="empty-state">
        <div className="empty-title">No folder open</div>
        <div className="empty-hint">Open a folder to see its git status.</div>
      </div>
    );
  }
  if (status === undefined) {
    return (
      <div className="empty-state">
        <span className="spinner" /> Loading…
      </div>
    );
  }
  if (status === null) {
    return (
      <div className="empty-state">
        <div className="empty-title">Not a git repository</div>
        <div className="empty-hint">This folder has no .git — git features are unavailable.</div>
      </div>
    );
  }

  const staged = status.changes.filter((c) => c.staged && !c.untracked);
  const unstaged = status.changes.filter((c) => !c.staged && !c.untracked);
  const untracked = status.changes.filter((c) => c.untracked);
  const conflicts = status.changes.filter((c) => c.conflict);
  const count = status.changes.length;
  const stagedPaths = staged.map((c) => c.path);
  const workingPaths = [...unstaged, ...untracked].map((c) => c.path);

  const renderRow = (c: { path: string; kind: string; conflict?: boolean; staged?: boolean }) => (
    <div key={c.path} className="sc-row" onClick={() => openFile(c.path)} title={c.path}>
      <span className={`sc-kind${c.conflict ? ' conflict' : ''}`}>{c.conflict ? '!' : c.kind}</span>
      <span className="sc-name">{c.path.split(/[\\/]/).pop()}</span>
      <span className="sc-actions" onClick={(e) => e.stopPropagation()}>
        {c.conflict ? (
          <button className="icon-btn" onClick={() => void openFile(c.path)} title="Open conflict">
            <IconClose width={12} height={12} />
          </button>
        ) : (
          <>
            {c.staged ? (
              <button className="icon-btn" onClick={() => void act('unstage', [c.path])} title="Unstage">
                <IconCheck width={12} height={12} />
              </button>
            ) : (
              <button className="icon-btn" onClick={() => void act('stage', [c.path])} title="Stage">
                <IconPlus width={12} height={12} />
              </button>
            )}
            <button className="icon-btn" onClick={() => void act('discard', [c.path])} title="Discard changes">
              <IconClose width={12} height={12} />
            </button>
          </>
        )}
      </span>
    </div>
  );

  return (
    <div className="explorer">
      <div className="explorer-header">
        <span className="title">Source control</span>
        <button className="icon-btn" onClick={load} title="Refresh" aria-label="Refresh git status">
          ⟳
        </button>
      </div>
      <div className="sc-branch-bar">
        <div className="sc-branch-row1">
          <span className="sc-branch-label">⎇ Branch</span>
          <select
            className="sc-branch-select"
            value={status.branch}
            onChange={(e) => void switchBranch(e.target.value)}
            title="Switch branch"
          >
            {(branches ?? []).map((b) => (
              <option key={b.name} value={b.name}>
                {b.current ? '● ' : ''} {b.name}
              </option>
            ))}
          </select>
          {status.ahead + status.behind > 0 && (
            <span className="sc-aheadchip" title="commits ahead / behind the upstream">
              ↑{status.ahead} ↓{status.behind}
            </span>
          )}
        </div>
        <div className="sc-branch-row2">
          <input
            className="sc-branch-new"
            placeholder="Create a branch…"
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
          />
          <button className="ghost" onClick={() => void createBranch()} disabled={!newBranch.trim()}>
            Create
          </button>
        </div>
      </div>
      <div className="sc-commit">
        <textarea
          className="sc-commit-input"
          placeholder="Commit message…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="sc-commit-actions">
          <button className="primary" onClick={() => void commit()} disabled={!message.trim() || busy}>
            <IconCheck width={12} height={12} /> Commit
          </button>
          <button onClick={suggest} title="Ask Claude to write the commit message from the staged diff">
            ✨ Message
          </button>
        </div>
      </div>
      <div className="sc-body">
        {conflicts.length > 0 && (
          <>
            <div className="sc-section-title conflict">Conflicts ({conflicts.length})</div>
            {conflicts.map((c) => renderRow({ ...c, conflict: true }))}
          </>
        )}
        {staged.length > 0 && (
          <>
            <div className="sc-section-title">
              Staged ({staged.length})
              <button className="ghost" onClick={() => void act('unstage', stagedPaths)} title="Unstage all">
                Unstage all
              </button>
            </div>
            {staged.map((c) => renderRow({ ...c, conflict: false }))}
          </>
        )}
        {workingPaths.length > 0 && (
          <>
            <div className="sc-section-title">
              Changes ({workingPaths.length})
              <button className="ghost" onClick={() => void act('stage', workingPaths)} title="Stage all">
                Stage all
              </button>
            </div>
            {[...unstaged, ...untracked].map((c) => renderRow({ ...c, conflict: false }))}
          </>
        )}
        {count === 0 && (
          <div className="empty-state">
            <div className="empty-title">No changes</div>
            <div className="empty-hint">Working tree clean.</div>
          </div>
        )}
        {feedback && <div className="sc-feedback">{feedback}</div>}
      </div>
      <details className="sc-history" open={false}>
        <summary>History · commit graph</summary>
        {history && history.length > 0 ? (
          <CommitGraph commits={history} />
        ) : (
          <div className="sc-graph-empty">No commits yet.</div>
        )}
      </details>
    </div>
  );
}