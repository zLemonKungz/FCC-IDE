import { useEffect, useState } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import type { UpdateState } from '@shared/types';
import Switch from './Switch';

// In-app auto-update UI (Program settings → Updates). Main pushes UpdateState
// over window.fcc.onUpdate; check/download/install round-trip over IPC. The feed
// is empty until a GitHub publish repo exists, so errors surface politely.
export default function UpdatesSection() {
  const autoUpdate = useSettingsStore((s) => s.autoUpdate);
  const setAutoUpdate = useSettingsStore((s) => s.setAutoUpdate);
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const [packaged, setPackaged] = useState(false);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    window.fcc.onUpdate((s) => setState(s as UpdateState));
    void window.fcc
      .appInfo()
      .then((i) => {
        setPackaged(i.packaged);
        setVersion(i.version);
      })
      .catch(() => undefined);
  }, []);

  const check = (): void => {
    setState({ status: 'checking' });
    void window.fcc.updatesCheck();
  };

  return (
    <>
      <div className="settings-section">Updates</div>
      {!packaged ? (
        <div className="settings-note">Updates are available in the installed app (dev builds skip them).</div>
      ) : (
        <>
          <label className="settings-row">
            <span>Check for updates on launch</span>
            <Switch checked={autoUpdate} onChange={setAutoUpdate} />
          </label>
          <div className="settings-row">
            <span>Installed version</span>
            <b>{version ?? '…'}</b>
          </div>
          <div className="settings-row">
            <span>Status</span>
            <span className="upd-status">
              {state.status === 'checking' && 'Checking for updates…'}
              {state.status === 'none' && "You're up to date"}
              {state.status === 'available' && `Update v${state.version} is available`}
              {state.status === 'downloading' && `Downloading… ${state.percent}%`}
              {state.status === 'downloaded' && `v${state.version} downloaded`}
              {state.status === 'error' && (state.message || "Couldn't check for updates (feed not configured yet)")}
            </span>
          </div>
          {state.status === 'downloading' && (
            <div className="upd-bar">
              <div style={{ width: `${state.percent}%` }} />
            </div>
          )}
          {state.status === 'available' && (
            <button className="primary" onClick={() => void window.fcc.updatesDownload()}>
              Download update
            </button>
          )}
          {state.status === 'downloaded' && (
            <button className="primary" onClick={() => void window.fcc.updatesInstall()}>
              Restart &amp; install
            </button>
          )}
          <div className="settings-row">
            <button className="ghost" onClick={check}>
              Check for updates
            </button>
          </div>
        </>
      )}
    </>
  );
}