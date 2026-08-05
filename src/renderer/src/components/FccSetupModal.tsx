import { useState } from 'react';
import { useFccStore } from '../stores/fcc-store';
import { useModalFocus } from '../hooks/useModal';
import { IconCheck, IconClose, IconCopy } from './icons';

// Official free-claude-code bootstrap, per platform (see the repo README).
// Runs `fcc-server` afterwards; on Windows it also installs the tray app.
const IS_WIN = window.fcc.platform === 'win32';
const INSTALL_CMD = IS_WIN
  ? '& ([scriptblock]::Create((irm "https://raw.githubusercontent.com/Alishahryar1/free-claude-code/main/scripts/install.ps1")))'
  : 'curl -fsSL "https://raw.githubusercontent.com/Alishahryar1/free-claude-code/main/scripts/install.sh" | sh';

export default function FccSetupModal({ onClose }: { onClose: () => void }) {
  const install = useFccStore((s) => s.install);
  const status = useFccStore((s) => s.status);
  const detect = useFccStore((s) => s.detect);
  const start = useFccStore((s) => s.start);
  const [copied, setCopied] = useState(false);
  const modalRef = useModalFocus(true, onClose);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  };

  const pythonOk = install?.pythonVersion?.startsWith('3.14') ?? false;
  const checks = [
    { label: 'Python 3.14', ok: pythonOk, detail: install?.pythonVersion ? `found ${install.pythonVersion}` : undefined },
    { label: 'uv', ok: install?.hasUv },
    { label: 'fcc-server', ok: install?.installed, detail: install?.serverPath ?? undefined }
  ];

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div ref={modalRef} tabIndex={-1} className="fcc-setup-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="settings-title">
          <span>Free Claude Code setup</span>
          <button className="icon-btn" onClick={onClose} title="Close" aria-label="Close">
            <IconClose width={13} height={13} />
          </button>
        </div>

        <div className={`setup-status ${install?.installed ? 'ok' : 'bad'}`}>
          {install?.installed
            ? 'FCC is installed on this machine'
            : install?.reason === 'path-missing'
              ? 'FCC is installed but not on your PATH'
              : 'FCC isn’t installed yet'}
        </div>

        <div className="setup-check-grid">
          {checks.map((c) => (
            <div key={c.label} className={`setup-check${c.ok ? ' ok' : ''}`}>
              <span className="check-icon">{c.ok ? <IconCheck width={12} height={12} /> : '✕'}</span>
              <span className="check-label">{c.label}</span>
              {c.detail && <span className="check-detail">{c.detail}</span>}
            </div>
          ))}
        </div>

        {!install?.installed && (
          <>
            <p className="setup-note">
              Free Claude Code is a Python tool managed by <code>uv</code>. Run the command below in
              PowerShell (Windows) or your terminal, then click <em>Check again</em>.
            </p>
            <div className="setup-cmd">
              <code>{INSTALL_CMD}</code>
              <button className="icon-btn" onClick={copy} title="Copy install command" aria-label="Copy install command">
                {copied ? <IconCheck width={13} height={13} /> : <IconCopy width={13} height={13} />}
              </button>
            </div>
          </>
        )}

        {install?.reason === 'path-missing' && (
          <p className="setup-note amber">
            Found FCC at <code>{install.serverPath}</code> — FCC Studio can still start it. To use{' '}
            <code>fcc-claude</code> in your own terminal too, add{' '}
            <code>{IS_WIN ? '%USERPROFILE%\\.local\\bin' : '~/.local/bin'}</code> to PATH.
          </p>
        )}

        {install?.installed && status?.online && <p className="setup-note ok">FCC server is online.</p>}

        <div className="setup-actions">
          <button className="ghost" onClick={() => void detect()}>
            Check again
          </button>
          {install?.installed && !status?.online && (
            <button className="primary" onClick={() => void start()}>
              Start server
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
