import { useEffect, useState } from 'react';
import Logo from './Logo';
import MenuBar from './MenuBar';
import SettingsModal from './SettingsModal';
import { IconClose, IconSettings } from './icons';

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'Ctrl+K Ctrl+T', label: 'Toggle dark/light theme' },
  { keys: 'Ctrl+Shift+P', label: 'Command palette' },
  { keys: 'Ctrl+Shift+F', label: 'Search files' },
  { keys: 'Ctrl+B', label: 'Toggle sidebar' },
  { keys: 'Ctrl+`', label: 'Toggle terminal' },
  { keys: 'Ctrl+Shift+`', label: 'Toggle chat panel' },
  { keys: 'Ctrl+S', label: 'Save active file' },
  { keys: 'Middle-click tab', label: 'Close tab' }
];

export default function Titlebar() {
  const [open, setOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [info, setInfo] = useState<{ name: string; version: string } | null>(null);

  const openAbout = (): void => {
    setAboutOpen((v) => !v);
  };

  // Fetch program info once so the titlebar version + About share it.
  useEffect(() => {
    void window.fcc.appInfo().then(setInfo).catch(() => undefined);
  }, []);

  // Command palette "Program Settings" opens this modal; the menu bar's
  // Help -> Keyboard Shortcuts opens the same popover as the ? button.
  // Escape closes the keyboard-shortcuts modal and the About popover.
  useEffect(() => {
    if (!open && !aboutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setAboutOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, aboutOpen]);

  useEffect(() => {
    const openSettings = () => setSettingsOpen(true);
    const openShortcuts = () => setOpen(true);
    window.addEventListener('fcc:open-settings', openSettings);
    window.addEventListener('fcc:open-shortcuts', openShortcuts);
    return () => {
      window.removeEventListener('fcc:open-settings', openSettings);
      window.removeEventListener('fcc:open-shortcuts', openShortcuts);
    };
  }, []);

  return (
    <div className="titlebar">
      <span className="titlebar-brand">
        <Logo width={13} height={13} style={{ color: 'var(--accent)' }} />
        FCC Studio
        {info?.version && <span className="brand-ver">v{info.version}</span>}
      </span>
      <MenuBar />
      <span className="titlebar-right">
        <button
          className={`titlebar-icon${settingsOpen ? ' active' : ''}`}
          onClick={() => setSettingsOpen((v) => !v)}
          title="Settings"
        >
          <IconSettings width={13} height={13} />
        </button>
        <button
          className={`shortcuts-btn${aboutOpen ? ' active' : ''}`}
          onClick={openAbout}
          title="About FCC Studio"
          aria-label="About FCC Studio"
        >
          ⓘ
        </button>
        {aboutOpen && (
          <div className="shortcuts-popover about-popover">
            <div className="about-logo">
              <Logo width={34} height={34} style={{ color: 'var(--accent)' }} />
            </div>
            <div className="about-name">
              FCC Studio <span className="about-ver">v{info?.version ?? '…'}</span>
            </div>
            <div className="about-desc">
              A warm, all-in-one AI code IDE — Claude Code, powered by free-claude-code.
            </div>
            <a
              className="about-link"
              href="https://github.com/Alishahryar1/free-claude-code"
              onClick={(e) => {
                e.preventDefault();
                void window.fcc.openExternal('https://github.com/Alishahryar1/free-claude-code');
              }}
            >
              free-claude-code on GitHub ↗
            </a>
          </div>
        )}
        {open && (
          <div className="shortcuts-popover shortcuts-modal">
            <div className="shortcuts-title">
              Keyboard shortcuts
              <button
                className="icon-btn"
                onClick={() => setOpen(false)}
                title="Close"
                aria-label="Close shortcuts"
              >
                <IconClose width={11} height={11} />
              </button>
            </div>
            {SHORTCUTS.map((s) => (
              <div className="shortcuts-row" key={s.keys}>
                <kbd>{s.keys}</kbd>
                <span className="shortcuts-label">{s.label}</span>
              </div>
            ))}
            <div className="shortcuts-hint">Right-click a tab for close options</div>
          </div>
        )}
      </span>
      {(open || aboutOpen) && (
        <div
          className="shortcuts-backdrop"
          onPointerDown={() => {
            setOpen(false);
            setAboutOpen(false);
          }}
        />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
