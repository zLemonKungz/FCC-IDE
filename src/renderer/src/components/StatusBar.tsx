import { useEffect } from 'react';
import { useFccStore } from '../stores/fcc-store';
import { useExplorerStore } from '../stores/explorer-store';
import { useEditorStore } from '../stores/editor-store';
import Logo from './Logo';
import { IconFolder } from './icons';

export default function StatusBar() {
  const status = useFccStore((s) => s.status);
  const refresh = useFccStore((s) => s.refresh);
  const start = useFccStore((s) => s.start);
  const root = useExplorerStore((s) => s.root);
  const activePath = useEditorStore((s) => s.activePath);
  const cursor = useEditorStore((s) => s.cursor);

  useEffect(() => {
    refresh();
    window.fcc.onFccStatus((s) => useFccStore.setState({ status: s }));
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="statusbar">
      <span className="brand">
        <Logo width={13} height={13} style={{ color: 'var(--accent)' }} />
        FCC Studio
      </span>
      <span className="folder">
        <IconFolder width={12} height={12} />
        {root ?? 'No folder open'}
      </span>
      <span className="spacer" />
      {activePath && (
        <span className="cursor">
          Ln {cursor.line}, Col {cursor.col}
        </span>
      )}
      <span className={`fcc ${status?.online ? 'ok' : 'down'}`}>
        <span className="dot" />
        {status?.online ? 'FCC online' : 'FCC offline'}
      </span>
      {!status?.online && (
        <button onClick={start} className="ghost">
          Start server
        </button>
      )}
    </div>
  );
}
