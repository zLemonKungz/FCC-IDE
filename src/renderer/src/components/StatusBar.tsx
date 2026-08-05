import { useEffect } from 'react';
import { useFccStore } from '../stores/fcc-store';
import { useExplorerStore } from '../stores/explorer-store';
import { useEditorStore } from '../stores/editor-store';
import { useChatStore } from '../stores/chat-store';
import { useSettingsStore, claudeLabel, effectiveEffort } from '../stores/settings-store';
import FccSetupModal from './FccSetupModal';
import { IconFolder } from './icons';

export default function StatusBar() {
  const status = useFccStore((s) => s.status);
  const install = useFccStore((s) => s.install);
  const setupOpen = useFccStore((s) => s.setupOpen);
  const setSetupOpen = useFccStore((s) => s.setSetupOpen);
  const refresh = useFccStore((s) => s.refresh);
  const detect = useFccStore((s) => s.detect);
  const start = useFccStore((s) => s.start);
  const stop = useFccStore((s) => s.stop);
  const root = useExplorerStore((s) => s.root);
  const activePath = useEditorStore((s) => s.activePath);
  const cursor = useEditorStore((s) => s.cursor);
  const sessionId = useChatStore((s) => s.sessionId);
  const liveStatus = useChatStore((s) => s.liveStatus);
  const chatModel = useSettingsStore((s) => s.chatModel);
  const chatEffort = useSettingsStore((s) => s.chatEffort);

  // Live session state for the status bar: mode/model reflect realtime
  // set_permission_mode / set_model (from system/status events); effort is the
  // model-snapped setting currently in force.
  const liveModel = liveStatus.model ?? chatModel;
  const modeLabel = liveStatus.permissionMode === 'plan' ? '⏸ Plan' : liveStatus.permissionMode === 'acceptEdits' ? '⏵⏵ Act' : null;
  const effortNow = effectiveEffort(liveModel, chatEffort);
  const effortLabel = effortNow !== 'auto' ? effortNow : null;

  useEffect(() => {
    refresh();
    void detect();
    window.fcc.onFccStatus((s) => useFccStore.setState({ status: s }));
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh, detect]);

  return (
    <div className="statusbar">
      <span className="folder">
        <IconFolder width={12} height={12} />
        {root ?? 'No folder open'}
      </span>
      <span className="spacer" />
      {sessionId && (
        <span
          className="status-chat"
          title={`Mode · ${modeLabel ?? '—'}   Model · ${claudeLabel(liveModel)}${effortLabel ? `   Effort · ${effortLabel}` : ''}`}
        >
          {modeLabel && <span className="sc-mode">{modeLabel}</span>}
          <span className="sc-model">{claudeLabel(liveModel)}</span>
          {effortLabel && <span className="sc-effort">{effortLabel}</span>}
        </span>
      )}
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
        <>
          <span className="fcc ok">
            <span className="dot" />
            FCC online
          </span>
          {status.managed && (
            <button onClick={stop} className="ghost">
              Stop server
            </button>
          )}
        </>
      ) : status?.starting ? (
        <span className="fcc starting">
          <span className="dot" />
          Starting FCC server…
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
