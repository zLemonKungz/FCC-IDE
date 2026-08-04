import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// User preferences, persisted so they survive restarts. Chat settings are
// pushed to main (which replaces the env defaults) on change — see App.tsx.
const FONT_MIN = 10;
const FONT_MAX = 24;
const TURNS_MIN = 1;
const TURNS_MAX = 500;
const TAB_MIN = 1;
const TAB_MAX = 8;
const DELAY_MIN = 0.5;
const DELAY_MAX = 60;

// The latest Claude models, always offered at the top of the chat model
// picker with friendly names. The gateway's /v1/models list is appended below
// as "Available on gateway".
export interface CuratedModel {
  id: string;
  label: string;
}

export const CURATED_CLAUDE_MODELS: CuratedModel[] = [
  { id: 'claude-opus-5', label: 'Opus 5' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-fable-5', label: 'Fable 5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' }
];

/** Human-friendly label for any claude model id (e.g. gateway aliases like
 *  "anthropic/opencode/claude-opus-5" → "Opus 5"). Falls back to the raw id
 *  for shapes it can't parse. */
export function claudeLabel(id: string): string {
  const seg = (id.split('/').pop() ?? id).replace(/^claude-/, '');
  if (seg.startsWith('3-5-sonnet')) return 'Sonnet 3.5';
  if (seg.startsWith('3-5-haiku')) return 'Haiku 3.5';
  if (seg.startsWith('3-opus')) return 'Opus 3';
  if (seg.startsWith('3-haiku')) return 'Haiku 3';
  if (seg.startsWith('3-sonnet')) return 'Sonnet 3';
  const m = seg.match(/^([a-z]+)-?([0-9][0-9.-]*)?(?:-\d{6,8})?$/);
  if (!m || !/^(opus|sonnet|haiku|fable)$/.test(m[1])) return id;
  const family = m[1][0].toUpperCase() + m[1].slice(1);
  const ver = (m[2] ?? '').replace(/-/g, '.').replace(/\.\d{6,8}$/, '');
  return ver ? `${family} ${ver}` : family;
}

interface SettingsState {
  editorFontSize: number;
  autoSave: boolean;
  autoSaveDelay: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  chatModel: string;
  chatMaxTurns: number;
  autoCompactWindow: number;
  setEditorFontSize: (v: number) => void;
  setAutoSave: (v: boolean) => void;
  setAutoSaveDelay: (v: number) => void;
  setTabSize: (v: number) => void;
  setWordWrap: (v: boolean) => void;
  setMinimap: (v: boolean) => void;
  setLineNumbers: (v: boolean) => void;
  setChatModel: (v: string) => void;
  setChatMaxTurns: (v: number) => void;
  setAutoCompactWindow: (v: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      editorFontSize: 14,
      autoSave: false,
      autoSaveDelay: 1,
      tabSize: 4,
      wordWrap: false,
      minimap: false,
      lineNumbers: true,
      chatModel: 'claude-haiku-4-5-20251001',
      chatMaxTurns: 50,
      autoCompactWindow: 190,
      setEditorFontSize: (v) => set({ editorFontSize: clamp(v, FONT_MIN, FONT_MAX) }),
      setAutoSave: (v) => set({ autoSave: v }),
      setAutoSaveDelay: (v) => set({ autoSaveDelay: clamp(v, DELAY_MIN, DELAY_MAX) }),
      setTabSize: (v) => set({ tabSize: clamp(v, TAB_MIN, TAB_MAX) }),
      setWordWrap: (v) => set({ wordWrap: v }),
      setMinimap: (v) => set({ minimap: v }),
      setLineNumbers: (v) => set({ lineNumbers: v }),
      setChatModel: (v) => set({ chatModel: v }),
      setChatMaxTurns: (v) => set({ chatMaxTurns: clamp(v, TURNS_MIN, TURNS_MAX) }),
      setAutoCompactWindow: (v) => set({ autoCompactWindow: clamp(v, 10, 1000) })
    }),
    { name: 'fcc-settings' }
  )
);

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}
