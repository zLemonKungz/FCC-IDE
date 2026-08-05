import { useSettingsStore } from '../stores/settings-store';
import { useLayoutStore } from '../stores/layout-store';
import { useModalFocus } from '../hooks/useModal';
import Switch from './Switch';
import { IconClose, IconMoon, IconSun } from './icons';

// Program (app) settings only — appearance + editor + file-save behavior. Chat
// settings (model, max turns, plan mode) live in the chat settings modal,
// opened from the gear at the bottom-left of the chat panel.
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const theme = useLayoutStore((s) => s.theme);
  const setTheme = useLayoutStore((s) => s.setTheme);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const setEditorFontSize = useSettingsStore((s) => s.setEditorFontSize);
  const tabSize = useSettingsStore((s) => s.tabSize);
  const setTabSize = useSettingsStore((s) => s.setTabSize);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const setWordWrap = useSettingsStore((s) => s.setWordWrap);
  const minimap = useSettingsStore((s) => s.minimap);
  const setMinimap = useSettingsStore((s) => s.setMinimap);
  const lineNumbers = useSettingsStore((s) => s.lineNumbers);
  const setLineNumbers = useSettingsStore((s) => s.setLineNumbers);
  const autoSave = useSettingsStore((s) => s.autoSave);
  const setAutoSave = useSettingsStore((s) => s.setAutoSave);
  const autoSaveDelay = useSettingsStore((s) => s.autoSaveDelay);
  const setAutoSaveDelay = useSettingsStore((s) => s.setAutoSaveDelay);
  const modalRef = useModalFocus(true, onClose);

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div ref={modalRef} tabIndex={-1} className="settings-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="settings-title">
          <span>Program settings</span>
          <button className="icon-btn" onClick={onClose} title="Close" aria-label="Close">
            <IconClose width={13} height={13} />
          </button>
        </div>

        <div className="settings-section">Appearance</div>
        <div className="settings-row">
          <span>Theme</span>
          <div className="settings-theme">
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
              <IconMoon width={12} height={12} />
              Dark
            </button>
            <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
              <IconSun width={12} height={12} />
              Light
            </button>
          </div>
        </div>

        <div className="settings-section">Editor</div>
        <label className="settings-row">
          <span>Font size</span>
          <input
            type="number"
            min={10}
            max={24}
            value={editorFontSize}
            onChange={(e) => setEditorFontSize(Number(e.target.value) || 14)}
          />
        </label>
        <label className="settings-row">
          <span>Tab size</span>
          <input
            type="number"
            min={1}
            max={8}
            value={tabSize}
            onChange={(e) => setTabSize(Number(e.target.value) || 4)}
          />
        </label>
        <label className="settings-row">
          <span>Word wrap</span>
          <Switch checked={wordWrap} onChange={setWordWrap} />
        </label>
        <label className="settings-row">
          <span>Minimap</span>
          <Switch checked={minimap} onChange={setMinimap} />
        </label>
        <label className="settings-row">
          <span>Line numbers</span>
          <Switch checked={lineNumbers} onChange={setLineNumbers} />
        </label>

        <div className="settings-section">Files</div>
        <label className="settings-row">
          <span>Auto save</span>
          <Switch checked={autoSave} onChange={setAutoSave} />
        </label>
        <label className="settings-row">
          <span>Auto save delay (s)</span>
          <input
            type="number"
            min={0.5}
            max={60}
            step={0.5}
            value={autoSaveDelay}
            disabled={!autoSave}
            onChange={(e) => setAutoSaveDelay(Number(e.target.value) || 1)}
          />
        </label>
        <div className="settings-note">Editor settings apply to the next opened file.</div>
      </div>
    </div>
  );
}
