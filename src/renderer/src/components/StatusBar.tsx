import { useEffect } from 'react';
import { useFccStore } from '../stores/fcc-store';
import { useExplorerStore } from '../stores/explorer-store';
import { useEditorStore } from '../stores/editor-store';
import FccSetupModal from './FccSetupModal';
import Logo from './Logo';
import { IconFolder } from './icons';

export default function StatusBar() {
  const status = useFccStore((s) => s.status);
  const install = useFccStore((s) => s.install);
  const setupOpen = useFccStore((s) => s.setupOpen);
  const setSetupOpen = useFccStore((s) => s.setSetupOpen);
  const refresh = useFccStore((s) => s.refresh);
  const detect = useFccStore((s) => s.detect);
  const start = useFccStore((s) => s.start);
  const root = useExplorerStore((s) => s.root);
  const activePath = useEditorStore((s) => s.activePath);
  const cursor = useEditorStore((s) => s.cursor);

  useEffect(() => {
    refresh();
    void detect();
    window.fcc.onFccStatus((s) => useFccStore.setState({ status: s }));
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh, detect]);

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
      {install && !install.installed ? (
        <>
          <span className="fcc down">
            <span className="dot" />
            FCC not installed
          </span>
          <button onClick={() => setSetupOpen(true)} className="ghost">
            Set up FCC
          </button>
        </>
      ) : status?.online ? (
        <span className="fcc ok">
          <span className="dot" />
          FCC online
        </span>
      ) : (
        <>
          <span className="fcc down">
            <span className="dot" />
            FCC offline
          </span>
          <button onClick={start} className="ghost">
            Start server
          </button>
        </>
      )}
      {setupOpen && <FccSetupModal onClose={() => setSetupOpen(false)} />}
    </div>
  );
}
