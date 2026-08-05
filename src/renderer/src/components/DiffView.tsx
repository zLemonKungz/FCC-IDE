import { DiffEditor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useEffect, useRef, useState } from 'react';
import { useEditorStore, type HunkRange } from '../stores/editor-store';
import { useLayoutStore } from '../stores/layout-store';
import { langFor } from './Editor';
import { IconCheck, IconClose } from './icons';

loader.config({ monaco });

interface Hunk extends HunkRange {
  preview: string;
}

export default function DiffView({ path, onClose }: { path: string; onClose: () => void }) {
  const base = useEditorStore((s) => s.getBase(path)) ?? '';
  const accept = useEditorStore((s) => s.acceptAgentChange);
  const revert = useEditorStore((s) => s.revertAgentChange);
  const revertHunk = useEditorStore((s) => s.revertAgentHunk);
  const theme = useLayoutStore((s) => s.theme);
  const [modified, setModified] = useState('');
  const [hunks, setHunks] = useState<Hunk[]>([]);
  const diffRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

  useEffect(() => {
    window.fcc.fsRead(path).then(setModified).catch(() => setModified(base));
  }, [path, base]);

  // Read the hunk list from Monaco's diff model (ILineChange → our ranges),
  // refreshed whenever the diff recomputes.
  const refreshHunks = (): void => {
    const ed = diffRef.current;
    if (!ed) return;
    const lines = (modified || '').split('\n');
    setHunks(
      (ed.getLineChanges() ?? []).map((c) => ({
        originalStart: c.originalStartLineNumber,
        originalEnd: c.originalEndLineNumber,
        modifiedStart: c.modifiedStartLineNumber,
        modifiedEnd: c.modifiedEndLineNumber,
        preview: (lines[c.modifiedStartLineNumber - 1] ?? '…').trim().slice(0, 60)
      }))
    );
  };

  // After accept/revert the file on disk changes; re-read it so the diff
  // empties out instead of showing stale / inverted content.
  const apply = async (fn: (p: string) => Promise<void>): Promise<void> => {
    await fn(path);
    const fresh = await window.fcc.fsRead(path).catch(() => base);
    setModified(fresh);
  };

  const revertOne = async (h: Hunk): Promise<void> => {
    await revertHunk(path, h);
    const fresh = await window.fcc.fsRead(path).catch(() => base);
    setModified(fresh);
  };

  return (
    <div className="diff-view">
      <div className="diff-header">
        <span className="diff-path">{path}</span>
        <button className="primary" onClick={() => void apply(accept)}>
          <IconCheck width={12} height={12} />
          Accept
        </button>
        <button onClick={() => void apply(revert)}>Revert all</button>
        <button className="icon-btn" onClick={onClose} title="Close diff" aria-label="Close diff">
          <IconClose width={14} height={14} />
        </button>
      </div>
      <DiffEditor
        original={base}
        modified={modified}
        language={langFor(path)}
        theme={theme === 'dark' ? 'fcc-dark' : 'fcc-light'}
        options={{ readOnly: true, minimap: { enabled: false }, fontFamily: 'var(--font-mono)', fontSize: 13 }}
        onMount={(editor) => {
          diffRef.current = editor;
          refreshHunks();
          editor.onDidUpdateDiff(() => refreshHunks());
        }}
      />
      {hunks.length > 0 && (
        <div className="diff-hunks">
          <div className="diff-hunks-title">
            Changes ({hunks.length}) — revert one at a time
          </div>
          {hunks.map((h, i) => (
            <div key={`${h.originalStart}-${h.modifiedStart}-${i}`} className="diff-hunk">
              <span className="dh-range">
                L{h.originalStart}–{h.originalEnd}
              </span>
              <span className="dh-preview">{h.preview}</span>
              <button className="ghost" onClick={() => void revertOne(h)}>
                Revert
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
