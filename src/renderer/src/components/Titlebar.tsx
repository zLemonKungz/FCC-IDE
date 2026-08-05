import { useEffect, useState } from 'react';
import Logo from './Logo';
import MenuBar from './MenuBar';
import SettingsModal from './SettingsModal';
import { IconSettings } from './icons';

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
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Command palette "Program Settings" opens this modal; the menu bar's
  // Help -> Keyboard Shortcuts opens the same popover as the ? button.
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
          className={`shortcuts-btn${open ? ' active' : ''}`}
          onClick={() => setOpen((v) => !v)}
          title="Keyboard shortcuts"
        >
          ?
        </button>
        {open && (
          <div className="shortcuts-popover">
            <div className="shortcuts-title">Keyboard shortcuts</div>
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
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
