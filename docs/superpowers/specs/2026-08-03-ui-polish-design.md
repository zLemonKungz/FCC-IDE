# FCC Studio — Soft/Premium UI Polish (dual theme)

Date: 2026-08-03

## Goal

Make the UI feel soft, clean, smooth, lightweight and premium ("เหมือนแอปแพงๆ"):
- **Two switchable themes** — a refined warm-dark (kept as the default) and a new soft warm-light. Toggle persisted.
- **Softer/smoother feel** — smoother panel toggling, softer easing, rounder corners, refined hover/focus feedback. Applied to both themes.

Confirmed with user: keep **terracotta** accent; default theme on first launch is **dark**; both themes switchable at any time.

## Approach

CSS-variable theming via a `data-theme` attribute. `styles.css` is already 100% var-based (`--bg-0..4`, `--text-1..4`, `--border-*`, `--accent*`, `--green/red/yellow/blue`, `--radius-*`, `--shadow-*`, `--transition`), so a light theme is one palette-override block plus a small number of component tweaks. No stylesheet duplication, no build-pipeline change.

## 1. Theme system

- **Store** (`src/renderer/src/stores/layout-store.ts`): add `theme: 'dark' | 'light'` (default `'dark'`), actions `setTheme(t)` and `toggleTheme()`. Persisted under the existing `fcc-layout` key (zustand `persist` already configured).
- **App** (`src/renderer/src/App.tsx`): effect writes `document.documentElement.dataset.theme = theme` whenever it changes (initial mount included, so a persisted light choice applies immediately).
- **styles.css**: `:root` keeps the current warm-dark values (default). Add `[data-theme='light'] { ... }` overriding every color/radius/shadow/transition var with the light palette. All existing component rules keep working unchanged since they reference vars.
- **Monaco** (`src/renderer/src/monaco-setup.ts`): register a new `fcc-light` theme (base `vs`, tokens remapped to light warm palette). Components pass the active theme name from the store instead of hardcoding `"fcc-dark"`:
  - `Editor.tsx` — `theme` prop on `<Editor>` and the diff view.
  - `DiffView.tsx` — verify the monaco diff instance theme follows (shared via the store).
- **xterm** (`src/renderer/src/components/Terminal.tsx`): move the hardcoded xterm `theme` object into a `TERM_COLORS` map keyed by dark/light. Apply via `term.options.theme = TERM_COLORS[theme]` in an effect that watches `theme` (the terminal instance is created once; theme is re-applied live).

## 2. Toggle UI

- **Activity bar** (`src/renderer/src/components/ActivityBar.tsx`): bottom-most button, sun icon when dark (click → light) / moon icon when light (click → dark), `title` explains the shortcut. Uses existing icon set (add `IconSun`/`IconMoon` to `icons.tsx`).
- **Keyboard**: `Ctrl+K` then `Ctrl+T` (VS Code color-theme convention). Implemented in `App.tsx` as a chord: remember pending `Ctrl+K`, complete on `T` within a short window; a second `Ctrl+K` resets the chord.

## 3. Palettes

### Dark (default — unchanged values, current `:root`)
Current warm-dark terracotta set; no changes.

### Light (new `[data-theme='light']`)

Warm paper + deepened terracotta for contrast on light:

| var | value | | var | value |
|---|---|---|---|---|
| `--bg-0` | `#faf8f6` | | `--text-1` | `#2c2621` |
| `--bg-1` | `#f4f0ec` | | `--text-2` | `#6f665d` |
| `--bg-2` | `#ebe6e1` | | `--text-3` | `#a1968b` |
| `--bg-3` | `#e1dad3` | | `--text-4` | `#cfc6bb` |
| `--bg-4` | `#d4cbc2` | | | |
| `--border-0` | `#eae4de` | | `--accent` | `#c9643c` |
| `--border-1` | `#ddd4cb` | | `--accent-hover` | `#da7a52` |
| | | | `--accent-dim` | `rgba(201,100,60,0.12)` |
| | | | `--accent-border` | `rgba(201,100,60,0.30)` |
| `--green` | `#3d9a6f` | | `--red` | `#d85c48` |
| `--yellow` | `#b98a2e` | | `--blue` | `#4f6fdd` |

Soft shadows: `--shadow-1: 0 1px 3px rgba(60,45,30,0.10)`, `--shadow-2: 0 8px 24px rgba(60,45,30,0.14)`.

`::selection` and Monaco selection become a soft blue `rgba(79,111,221,0.18)` (light) / keep current blue `rgba(108,140,255,0.28)` (dark).

**fcc-light Monaco**: background `#faf8f6`, foreground `#2c2621`, warm line highlight `#f4f0ec`, terracotta keywords/tags, green strings, amber numbers, soft-blue types, warm comments. Cursor terracotta. Widgets/line-numbers in the paper shades. Scrollbar sliders dark-on-light.

**xterm light**: background `#faf8f6`, foreground `#2c2621`, cursor terracotta, selection soft blue, ansi palette re-mapped to deep-warm tones that read on white.

## 4. Smoothness / soft feel (both themes)

- **Animated panel toggles**: `.sidebar`, `.chat-pane`, `.terminal-pane` get `transition: width/height 220ms` with a soft ease **only when not dragging**. Add `isDragging` to layout-store (set by `DragHandle.tsx` on pointerdown/up); `App.tsx` adds `dragging` class on `.app` → `.app.dragging .sidebar, .app.dragging .chat-pane, .app.dragging .terminal-pane { transition: none }`. This keeps drag tracking instant while toggle collapse animates.
- **Softer easing**: `--transition` → `220ms cubic-bezier(0.32, 0.72, 0, 1)`. Entrance animations (`shell-in`, `tab-in`, `msg-in`) slowed slightly (~280ms) with gentler travel.
- **Rounder corners**: `--radius-sm: 5px`, `--radius-md: 9px`, `--radius-lg: 14px`. Buttons, inputs, cards, tree rows, context menu, chat bubbles all pick this up automatically. Activity buttons 8px → 10px.
- **Refined feedback**:
  - Chat send button: soft terracotta→coral gradient (`linear-gradient(135deg, #d97a55, #e28a66)`) instead of flat; active tabs get a faint warm wash.
  - Focus ring becomes a soft accent shadow (`box-shadow: 0 0 0 3px var(--accent-dim)`) instead of a hard 2px outline; keyboard-visible focus preserved.
  - Hover lift: primary/ghost buttons subtle `translateY(-1px)`; keep the existing `scale(0.97)` press.
- **Scrollbars**: keep 8px pill; in light theme the thumb is `--bg-4`-derived dark tone (add light override so thumb ≠ bg).
- **Reduced motion**: existing `@media (prefers-reduced-motion)` block already zeroes animations/transitions — keep, and make sure the new toggling transitions fall under it.

## 5. Non-goals / explicitly skipped

- No changes to window background flash or splash (launch stays dark; consistent with the dark default theme).
- No restyling of Monaco syntax colors beyond the two theme definitions (tokens keep their current mapping).
- No build-pipeline or tooling changes.
- No new dependencies.

## 6. Files touched

- `src/renderer/src/styles.css` — light var block, smoothness rules, focus/button refinements.
- `src/renderer/src/stores/layout-store.ts` — `theme`, `toggleTheme`, `isDragging`.
- `src/renderer/src/App.tsx` — data-theme effect, chord shortcut, dragging class.
- `src/renderer/src/components/ActivityBar.tsx` — theme toggle button.
- `src/renderer/src/components/DragHandle.tsx` — sets/clears `isDragging`.
- `src/renderer/src/components/Editor.tsx` — dynamic Monaco theme (editor + banner + diff).
- `src/renderer/src/components/DiffView.tsx` — dynamic Monaco diff theme (verify).
- `src/renderer/src/components/Terminal.tsx` — xterm color map, live theme apply.
- `src/renderer/src/monaco-setup.ts` — register `fcc-light`.
- `src/renderer/src/components/icons.tsx` — add `IconSun` / `IconMoon`.
- `tests/layout-store.test.ts` — toggleTheme flips & persists; default dark; isDragging lifecycle.

## 7. Testing

- Extend `tests/layout-store.test.ts`: theme defaults to `'dark'`, `toggleTheme()` flips both ways, persisted value rehydrates.
- `npm run typecheck`, `npm run test` (existing 17 + new), `npm run build`.
- Visual verify with the existing `FCC_SHOT` harness: capture once in dark, once after toggling to light (via the harness or an injected `data-theme`), confirm both render correctly (Monaco, chat, terminal, activity bar).
