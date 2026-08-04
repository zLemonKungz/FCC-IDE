import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// User preferences, persisted so they survive restarts. Chat settings are
// pushed to main (which replaces the env defaults) on change — see App.tsx.
const FONT_MIN = 10;
const FONT_MAX = 24;
const TURNS_MIN = 1;
const TURNS_MAX = 500;

// A few sensible model suggestions; the field is free-text because which
// models are reachable depends on the FCC gateway.
export const MODEL_SUGGESTIONS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-5',
  'claude-opus-5',
  'claude-fable-5'
];

interface SettingsState {
  editorFontSize: number;
  autoSave: boolean;
  chatModel: string;
  chatMaxTurns: number;
  setEditorFontSize: (v: number) => void;
  setAutoSave: (v: boolean) => void;
  setChatModel: (v: string) => void;
  setChatMaxTurns: (v: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      editorFontSize: 14,
      autoSave: false,
      chatModel: 'claude-haiku-4-5-20251001',
      chatMaxTurns: 50,
      setEditorFontSize: (v) => set({ editorFontSize: clamp(v, FONT_MIN, FONT_MAX) }),
      setAutoSave: (v) => set({ autoSave: v }),
      setChatModel: (v) => set({ chatModel: v }),
      setChatMaxTurns: (v) => set({ chatMaxTurns: clamp(v, TURNS_MIN, TURNS_MAX) })
    }),
    { name: 'fcc-settings' }
  )
);

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}
