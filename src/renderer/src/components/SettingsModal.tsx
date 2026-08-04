import { useSettingsStore } from '../stores/settings-store';
import { IconClose } from './icons';

// Program (app) settings only — editor font size, auto-save. Chat settings
// (model, max turns, plan mode) live in the chat settings modal, opened from
// the gear at the bottom-left of the chat panel.
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const autoSave = useSettingsStore((s) => s.autoSave);
  const setEditorFontSize = useSettingsStore((s) => s.setEditorFontSize);
  const setAutoSave = useSettingsStore((s) => s.setAutoSave);

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="settings-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="settings-title">
          <span>Program settings</span>
          <button className="icon-btn" onClick={onClose} title="Close">
            <IconClose width={13} height={13} />
          </button>
        </div>
        <label className="settings-row">
          <span>Editor font size</span>
          <input
            type="number"
            min={10}
            max={24}
            value={editorFontSize}
            onChange={(e) => setEditorFontSize(Number(e.target.value) || 14)}
          />
        </label>
        <label className="settings-row">
          <span>Auto save</span>
          <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
        </label>
      </div>
    </div>
  );
}
