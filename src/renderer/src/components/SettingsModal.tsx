import { useSettingsStore } from '../stores/settings-store';

// A few sensible model suggestions; the field is free-text because which
// models are reachable depends on the FCC gateway.
export const MODEL_SUGGESTIONS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-5',
  'claude-opus-5',
  'claude-fable-5'
];

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const chatModel = useSettingsStore((s) => s.chatModel);
  const chatMaxTurns = useSettingsStore((s) => s.chatMaxTurns);
  const setEditorFontSize = useSettingsStore((s) => s.setEditorFontSize);
  const setChatModel = useSettingsStore((s) => s.setChatModel);
  const setChatMaxTurns = useSettingsStore((s) => s.setChatMaxTurns);

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="settings-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="settings-title">Settings</div>
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
          <span>Chat model</span>
          <input
            list="settings-models"
            value={chatModel}
            spellCheck={false}
            onChange={(e) => setChatModel(e.target.value)}
          />
          <datalist id="settings-models">
            {MODEL_SUGGESTIONS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label className="settings-row">
          <span>Max turns</span>
          <input
            type="number"
            min={1}
            max={500}
            value={chatMaxTurns}
            onChange={(e) => setChatMaxTurns(Number(e.target.value) || 50)}
          />
        </label>
        <div className="settings-note">Chat settings apply to the next conversation.</div>
      </div>
    </div>
  );
}
