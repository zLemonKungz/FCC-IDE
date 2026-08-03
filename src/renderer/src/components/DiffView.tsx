import { DiffEditor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useEffect, useState } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { IconCheck, IconClose } from './icons';

loader.config({ monaco });

export default function DiffView({ path, onClose }: { path: string; onClose: () => void }) {
  const base = useEditorStore((s) => s.getBase(path)) ?? '';
  const accept = useEditorStore((s) => s.acceptAgentChange);
  const revert = useEditorStore((s) => s.revertAgentChange);
  const [modified, setModified] = useState('');

  useEffect(() => {
    window.fcc.fsRead(path).then(setModified).catch(() => setModified(base));
  }, [path, base]);

  return (
    <div className="diff-view">
      <div className="diff-header">
        <span className="diff-path">{path}</span>
        <button className="primary" onClick={() => accept(path)}>
          <IconCheck width={12} height={12} />
          Accept
        </button>
        <button onClick={() => revert(path)}>Revert</button>
        <button className="icon-btn" onClick={onClose} title="Close diff">
          <IconClose width={14} height={14} />
        </button>
      </div>
      <DiffEditor
        original={base}
        modified={modified}
        language="plaintext"
        theme="fcc-dark"
        options={{ readOnly: true, minimap: { enabled: false }, fontFamily: 'var(--font-mono)', fontSize: 13 }}
      />
    </div>
  );
}
