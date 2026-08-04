import { DiffEditor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useEffect, useState } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { useLayoutStore } from '../stores/layout-store';
import { langFor } from './Editor';
import { IconCheck, IconClose } from './icons';

loader.config({ monaco });

export default function DiffView({ path, onClose }: { path: string; onClose: () => void }) {
  const base = useEditorStore((s) => s.getBase(path)) ?? '';
  const accept = useEditorStore((s) => s.acceptAgentChange);
  const revert = useEditorStore((s) => s.revertAgentChange);
  const theme = useLayoutStore((s) => s.theme);
  const [modified, setModified] = useState('');

  useEffect(() => {
    window.fcc.fsRead(path).then(setModified).catch(() => setModified(base));
  }, [path, base]);

  // After accept/revert the file on disk changes; re-read it so the diff
  // empties out instead of showing stale / inverted content.
  const apply = async (fn: (p: string) => Promise<void>): Promise<void> => {
    await fn(path);
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
        <button onClick={() => void apply(revert)}>Revert</button>
        <button className="icon-btn" onClick={onClose} title="Close diff">
          <IconClose width={14} height={14} />
        </button>
      </div>
      <DiffEditor
        original={base}
        modified={modified}
        language={langFor(path)}
        theme={theme === 'dark' ? 'fcc-dark' : 'fcc-light'}
        options={{ readOnly: true, minimap: { enabled: false }, fontFamily: 'var(--font-mono)', fontSize: 13 }}
      />
    </div>
  );
}
