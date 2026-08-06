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

/** Model effort levels mapped to --effort, ascending. 'auto' (not listed here)
 *  leaves the model default. Which levels a model actually supports varies —
 *  see effortCap()/effectiveEffort() below. */
export const EFFORT_LEVELS: { value: string; label: string }[] = [
  { value: 'low', label: 'Low — faster, cheaper' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh — deep coding/agentic work' },
  { value: 'max', label: 'Max — max capability, unrestricted tokens' },
  { value: 'ultracode', label: 'UltraCode — max orchestration' }
];

/** Ascending rank per effort level, used to snap a choice to a model's ceiling. */
const EFFORT_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, xhigh: 3, max: 4, ultracode: 5 };

/** Highest level each curated model supports (lower levels are implied). From
 *  the effort docs: Opus 5 / Fable 5 take the full range (incl. ultracode);
 *  Sonnet 5 tops out at xhigh; Haiku 4.5 is excluded from effort entirely. */
const EFFORT_CAPS: Record<string, string> = {
  'claude-opus-5': 'ultracode',
  'claude-fable-5': 'ultracode',
  'claude-sonnet-5': 'xhigh',
  'claude-haiku-4-5-20251001': '' // no effort support
};

/** Resolve a (possibly gateway-aliased / version-embedded) model id down to its
 *  family stem so effort caps apply to aliases too. */
function effortFamily(model: string): string {
  return (model.split('/').pop() ?? model).toLowerCase().replace(/^claude-/, '').replace(/-\d{6,8}$/, '');
}

/** The highest effort level a model supports ('' = supports none).
 *  Unknown models default to everything short of the session-only ultracode. */
export function effortCap(model: string): string {
  const direct = EFFORT_CAPS[model];
  if (direct !== undefined) return direct;
  const fam = effortFamily(model);
  if (fam.startsWith('haiku-4-5')) return '';
  if (fam.startsWith('haiku')) return 'high';
  if (fam.startsWith('sonnet')) return 'xhigh';
  if (fam.startsWith('opus') || fam.startsWith('fable') || fam.startsWith('mythos')) return 'ultracode';
  return 'xhigh';
}

/** Snap a chosen effort level to what the model actually supports: a choice
 *  above the model's ceiling (or any choice on a non-effort model) falls back
 *  to the highest supported level; 'auto' stays the model default. */
export function effectiveEffort(model: string, chosen: string): string {
  if (chosen === 'auto') return 'auto';
  const cap = effortCap(model);
  if (!cap) return 'auto';
  const capRank = EFFORT_RANK[cap];
  const chosenRank = EFFORT_RANK[chosen] ?? -1;
  return chosenRank <= capRank ? chosen : cap;
}

/** The apply_flag_settings payload for a (already-snapped) effort value, sent
 *  live to a running session so it takes effect on the next turn. */
export function effortControlSettings(effort: string): Record<string, unknown> {
  if (effort === 'auto') return { effortLevel: null }; // reset to the model default
  if (effort === 'ultracode') return { ultracode: true };
  return { effortLevel: effort };
}

/** Short human label of a model's effort ceiling for the settings note. */
export function effortCapLabel(model: string): string {
  const cap = effortCap(model);
  if (!cap) return 'doesn’t support effort levels';
  const name: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'XHigh', max: 'Max', ultracode: 'UltraCode' };
  return cap === 'ultracode' ? 'supports all effort levels' : `supports up to ${name[cap]}`;
}

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
  /** model effort level ('auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'). */
  chatEffort: string;
  /** check for updates automatically on launch (renderer-driven). */
  autoUpdate: boolean;
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
  setChatEffort: (v: string) => void;
  setAutoUpdate: (v: boolean) => void;
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
      chatEffort: 'auto',
      autoUpdate: true,
      setEditorFontSize: (v) => set({ editorFontSize: clamp(v, FONT_MIN, FONT_MAX) }),
      setAutoSave: (v) => set({ autoSave: v }),
      setAutoSaveDelay: (v) => set({ autoSaveDelay: clamp(v, DELAY_MIN, DELAY_MAX) }),
      setTabSize: (v) => set({ tabSize: clamp(v, TAB_MIN, TAB_MAX) }),
      setWordWrap: (v) => set({ wordWrap: v }),
      setMinimap: (v) => set({ minimap: v }),
      setLineNumbers: (v) => set({ lineNumbers: v }),
      setChatModel: (v) => set({ chatModel: v }),
      setChatMaxTurns: (v) => set({ chatMaxTurns: clamp(v, TURNS_MIN, TURNS_MAX) }),
      setAutoCompactWindow: (v) => set({ autoCompactWindow: clamp(v, 10, 1000) }),
      setChatEffort: (v) => set({ chatEffort: v }),
      setAutoUpdate: (v) => set({ autoUpdate: v })
    }),
    { name: 'fcc-settings' }
  )
);

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}
