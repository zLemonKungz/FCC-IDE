import { useSettingsStore } from '../stores/settings-store';
import { useLayoutStore, type SettingsTab } from '../stores/layout-store';
import { useExplorerStore } from '../stores/explorer-store';
import { useModalFocus } from '../hooks/useModal';
import { ChatTab, HistoryTab, McpTab, AgentsTab, PluginsTab } from './ChatSettingsTabs';
import ClaudeConfigTab from './ClaudeConfigTab';
import UpdatesSection from './UpdatesSection';
import SettingsPanel from './SettingsPanel';
import Switch from './Switch';
import {
  IconChat,
  IconClaude,
  IconClose,
  IconHistory,
  IconMoon,
  IconPlug,
  IconPuzzle,
  IconSettings,
  IconSparkles,
  IconSun
} from './icons';

// The unified full-page settings view (opened from the activity-bar gear, the
// menu bar, or the command palette). Both old modals — program settings and
// chat settings — live here as nav items; the page overlays the editor (which
// stays mounted underneath), closes with Escape or the X. The activity bar stays
// visible to the left so its gear keeps its active highlight.
const NAV: { id: SettingsTab; label: string; Icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }[] = [
  { id: 'general', label: 'General', Icon: IconSettings },
  { id: 'chat', label: 'Chat', Icon: IconChat },
  { id: 'history', label: 'History', Icon: IconHistory },
  { id: 'mcp', label: 'MCP', Icon: IconPlug },
  { id: 'agents', label: 'Agents', Icon: IconSparkles },
  { id: 'plugins', label: 'Plugins', Icon: IconPuzzle },
  { id: 'config', label: 'Claude Code', Icon: IconClaude }
];

// The active tab lives in the layout store so any entry point (activity-bar
// gear, menu, palette) can open the page straight to a specific tab.
export default function SettingsPage() {
  const tab = useLayoutStore((s) => s.settingsTab ?? 'general');
  const openSettings = useLayoutStore((s) => s.openSettings);
  const closeSettings = useLayoutStore((s) => s.closeSettings);
  const root = useExplorerStore((s) => s.root);
  const rootRef = useModalFocus(true, closeSettings);

  return (
    <div ref={rootRef} tabIndex={-1} className="settings-page" role="dialog" aria-modal="true" aria-labelledby="settings-page-title">
      <div className="settings-page-head">
        <div className="st-left">
          <span id="settings-page-title" className="st-title">Settings</span>
          <span className="st-sub">Program · chat · tooling for FCC Studio</span>
        </div>
        <button className="icon-btn" onClick={closeSettings} title="Close (Esc)" aria-label="Close settings">
          <IconClose width={14} height={14} />
        </button>
      </div>

      <div className="settings-page-body">
        <nav className="settings-nav" aria-label="Settings sections">
          {NAV.map((it) => (
            <button
              key={it.id}
              className={`settings-nav-item${tab === it.id ? ' active' : ''}`}
              onClick={() => openSettings(it.id)}
            >
              <it.Icon width={15} height={15} />
              <span>{it.label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-content cs-body">
          {tab === 'general' && <GeneralTab />}
          {tab === 'chat' && <ChatTab />}
          {tab === 'history' && <HistoryTab onClose={closeSettings} />}
          {tab === 'mcp' && <McpTab root={root} />}
          {tab === 'agents' && <AgentsTab root={root} />}
          {tab === 'plugins' && <PluginsTab />}
          {tab === 'config' && <ClaudeConfigTab />}
        </div>
      </div>
    </div>
  );
}

// Program settings: appearance, editor, files, updates (formerly SettingsModal).
function GeneralTab() {
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

  return (
    <>
      <SettingsPanel title="Appearance">
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
      </SettingsPanel>

      <SettingsPanel title="Editor">
        <div className="cs-settings-grid">
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
        </div>
        <div className="settings-note">Editor settings apply to the next opened file.</div>
      </SettingsPanel>

      <SettingsPanel title="Files">
        <div className="cs-settings-grid">
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
        </div>
      </SettingsPanel>

      <UpdatesSection />
    </>
  );
}