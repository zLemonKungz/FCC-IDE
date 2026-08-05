import { useEffect, useState } from 'react';
import { DiffEditor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useLayoutStore } from '../stores/layout-store';
import { langFor } from './Editor';
import { IconClose } from './icons';

loader.config({ monaco });

// Git diff for one changed file: original = HEAD blob (in the repo), modified =
// the working tree on disk. Untracked files have no HEAD blob → original is empty,
// so the whole file shows as added.
export default function GitDiffView({ path, onClose }: { path: string; onClose: () => void }) {
  const theme = useLayoutStore((s) => s.theme);
  const [original, setOriginal] = useState('');
  const [modified, setModified] = useState('');

  useEffect(() => {
    void window.fcc.gitShow(path).then((v) => setOriginal(v ?? '')).catch(() => setOriginal(''));
    void window.fcc.fsRead(path).then(setModified).catch(() => setModified(''));
  }, [path]);

  return (
    <div className="diff-view">
      <div className="diff-header">
        <span className="diff-path">{path}</span>
        <button className="icon-btn" onClick={onClose} title="Close diff" aria-label="Close diff">
          <IconClose width={14} height={14} />
        </button>
      </div>
      <DiffEditor
        original={original}
        modified={modified}
        language={langFor(path)}
        theme={theme === 'dark' ? 'fcc-dark' : 'fcc-light'}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 }
        }}
      />
    </div>
  );
}