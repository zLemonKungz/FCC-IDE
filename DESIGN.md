# FCC Studio — Design System

The UI spec. Every token value below is the **actual** value in
`src/renderer/src/styles.css` — keep new work in sync with these, never invent a
parallel system. If a new element needs a look, reuse these tokens before adding
anything.

Related: [ARCHITECTURE.md](ARCHITECTURE.md) (technical), [CLAUDE.md](CLAUDE.md)
(entry point).

---

## 1. Design vision

Warm-dark **terracotta** on a near-black base — expensive-product feel, deliberately
**not** VS Code's blue-grey. Chrome (tools, panels, status bar) recedes quietly;
content and the accent do the talking.

- **Fonts**: UI is **Comic Neue** (400, wide set → sizes run a step bigger than
  Geist), mono is **JetBrains Mono**. Both bundled via `@fontsource`, imported in
  `main.tsx`.
- **Accent** is terracotta `#d97a55` (dark) / `#c9643c` (light). Used sparingly:
  active state, primary action, "live" signals (running dot, live progress rail).
- **Depth is geometric, not ambiguous**: flat panels held by 1px borders; floating
  surfaces (modals, palette, menus) get the deep shadow.

## 2. Themes

- Two themes, **dark** (default) and **light**, switched via `data-theme` on
  `<html>` + CSS variables in `styles.css`. Store the choice in `layout-store`
  (zustand-persist, key `fcc-layout`). Toggle: `Ctrl+K Ctrl+T`.
- **Never hardcode a theme color in a component** — always `var(--…)`. SVG
  presentation attributes reject `var()`, so color those via inline `style`.

### Dark (default)

| Token | Value | Used for |
|---|---|---|
| `--bg-0` | `#0e1013` | app background, deepest surface |
| `--bg-1` | `#14171c` | raised panels, code blocks |
| `--bg-2` | `#1a1e24` | hover fills, cards |
| `--bg-3` | `#22262e` | pressed / active fills, buttons |
| `--bg-4` | `#2a2f38` | button hover |
| `--border-0` | `#1e2229` | subtle separators |
| `--border-1` | `#262b34` | visible card/control borders |
| `--text-1` | `#e4e7ec` | primary text |
| `--text-2` | `#a0a8b4` | secondary text / icons |
| `--text-3` | `#67707d` | muted (meta, hints), uppercase labels |
| `--text-4` | `#3d444f` | dimmest (carets, placeholders, dividers) |
| `--accent` | `#d97a55` | active / primary / live signal |
| `--accent-hover` | `#e28a66` | accent hover |
| `--accent-dim` | `rgba(217,122,85,0.12)` | accent-tinted fill (selected, running) |
| `--accent-border` | `rgba(217,122,85,0.35)` | accent-tinted border (focus ring, live card) |

Semantic status: `--green #4caf7d` (success/online), `--red #e06c5a` (error/offline),
`--yellow #d9a44e` (warning/output), `--blue #6c8cff` (info/running tool).

### Light

`--bg-0 #faf8f6` · `--bg-1 #f4f0ec` · `--bg-2 #ebe6e1` · `--bg-3 #e1dad3` ·
`--bg-4 #d4cbc2` · `--border-0 #eae4de` · `--border-1 #ddd4cb` ·
`--text-1 #2c2621` · `--text-2 #6f665d` · `--text-3 #8a7f74` · `--text-4 #c6bcb0` ·
`--accent #c9643c` · `--accent-hover #da7a52` · `--green #3d9a6f` ·
`--red #d85c48` · `--yellow #b98a2e` · `--blue #4f6fdd`.

Same *roles* as dark; only the accent is tuned for the warm paper bg.

## 3. Typography

- `--font-ui: 'Comic Neue', 'Segoe UI', system-ui, sans-serif` — body + UI.
- `--font-mono: 'JetBrains Mono', Consolas, 'Courier New', monospace` — code,
  token counts, paths, "technical" metadata (status chips, usage numbers, arg hints).
- Type scale (Comic Neue is wide → sizes run a step bigger than Geist):

| Token | Size | Typical |
|---|---|---|
| `--fs-xs` | `12px` | list rows, buttons, inputs |
| `--fs-sm` | `13px` | default body |
| `--fs-md` | `14px` | emphasised text |
| `--fs-lg` | `15px` | <body emphasis> |

- Micro **labels** (panel headers, "Running", "Thinking") are uppercase, `10–11px`,
  `600`, `.06em` letter-spacing, `--text-3` (or `--accent` for live).
- Use `font-family: var(--font-mono)` deliberately — mono is a *visual* signal for
  "machine/technical" content, not the default.

## 4. Spacing & radius

- **Spacing**: `--space-1 4px` · `--space-2 8px` · `--space-3 12px` · `--space-4 16px`
  · `--space-5 24px`. Compose padding/gaps from these; don't freeform.
- **Radius**: `--radius-sm 5px` (inputs, chips, small cards) · `--radius-md 9px`
  (cards, panels, pickers) · `--radius-lg 14px` (modals). Rounded "pill" uses `9999px`
  only for tiny status chips.
- Rhythm: list rows `7px` vertical padding with `--border-0` bottom separators
  (`.cs-*`, `.tree-row`); cards `8px` padding.

## 5. Depth / shadows

- `--shadow-1`: `0 1px 2px rgba(0,0,0,0.3)` — subtle (disused; cards are now
  border-held).
- `--shadow-2`: `0 4px 14px rgba(0,0,0,0.4)` — raised.
- `--shadow-3`: `0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px var(--border-0)` —
  **floating surfaces** (modals, command palette, context/menu).
- `--surface-highlight`: `inset 0 1px 0 rgba(255,255,255,0.03)` — 1px lit top edge
  on panels/status bar/buttons.
- Rule: **resting elements are held by a border (`--border-1`), not a shadow.**
  Shadows are for surfaces that float above the chrome.

## 6. Layout grid

The `.app` is a CSS grid:

```
rows: 34px  minmax(0,1fr)  auto  auto
cols: auto  auto  auto  minmax(0,1fr)
```

→ **titlebar / activity-bar + sidebar + center / terminal / statusbar**.

- **Titlebar**: 34px, frameless drag region, `padding-right: 150px` reserves the
  native caption buttons (see §10).
- **Activity bar**: the leftmost icon rail; the active highlight shows what's open.
- **Sidebar**: Explorer / Find-in-files / Subagents (width persisted via
  `layout-store`). Panels take the full height.
- **Center**: the editor (`<Editor />` stays mounted so Monaco buffers survive).
  A centered chat overlays it `position:absolute; inset:0`.
- **Right column** (`.right-col`): chat + optional right-docked terminal.
- **Terminal** (bottom or right): hides via `display:none` but stays mounted.
- **Statusbar**: 28px, folder | spacer | chat-status | cursor | FCC server.

Drag handles: `DragHandle` with `invert` for right/bottom-docked panels (drag toward
the window center grows the panel); the left sidebar is **not** inverted.

## 7. Component patterns (reuse these before writing new)

- **Buttons**: base = `--bg-3` + 1px `--border-1` + inset lit top edge; hover `--bg-4`
  + lift; active `scale(0.97)`. Variants: `.primary` (accent border, warm glow on
  hover), `.ghost` (transparent, hover `--bg-3`), `.icon-btn` (no border, small).
  Disabled `opacity .45`.
- **Cards** (the card language): `background: var(--bg-0); border: 1px solid
  var(--border-1); border-radius: var(--radius-md); overflow: hidden;` — **no
  shadow**. Header row is a clickable flex line: icon + `--text-1` name + flex:1
  ellipsis label + right meta; hover `--bg-2`, caret turns accent. Body opens with
  `border-top: var(--border-0)`. (See `.tool-card`, `.subagent-card`.)
- **List rows** (settings/history/mcp/agents): flat, `padding: 7px 0`, 1px
  `--border-0` bottom separator, title `--text-1` + meta `--text-3` mono. Actions
  are `.ghost`/`.icon-btn` on the right. **No** per-row card borders.
- **Panel headers** (`.explorer-header`, `.search-*`): uppercase micro label,
  `.06em` tracking, `--text-3`, bottom border, subtle gradient top.
- **Chat message** (`.msg`): user/assistant bubbles in the chat stream; tool calls
  render as `.tool-card` (status-colored border: running=blue, success=green,
  error=red). Extended thinking folds as `.msg-thinking` (accent left rail + mono
  pre, `<details>` collapsed by default).
- **Markdown** renders through a single shared component (`src/renderer/src/chat/
  markdown.tsx`, react-markdown + GFM + math/katex + slug/autolink headings)
  wrapping its output in **`.fcc-md`** — style markdown via `.fcc-md` element
  selectors (everything adopted the class-based `.md-*` system at one point; that's
  gone). Syntax highlighting (`rehype-highlight`) is **preview-only** (streaming
  chat skips it; token colors are the `.hljs-*` set tuned to the warm-dark palette).
  Links/images resolve via `src/renderer/src/markdown/resolve.ts`: repo-relative
  → open the file (`fcc:open-file`) / load via `readAsset`; `#` → anchor scroll;
  http(s)/mailto → `openExternal`. The `.md` file preview adds `basePath` so links
  resolve from the file's own directory; chat resolves from the open-folder root.
- **Slash `/` picker** + **`@` file picker**: `--bg-2` floating card, `--shadow-3`,
  items are `mono command | flex:1 description | dim arg-hint(right)`, active row
  `--bg-3` + accent command.
- **Subagents panel**: a **"Running"** section (accent left rail + `--accent-dim`
  fill + accent title with the pulsing accent dot) above grouped per-subagent
  `.subagent-card`s (card language, caret-expand; detail shows thinking + Markdown
  text + tool cards).
- **Settings modal** (`ChatSettingsModal`): tab bar `.cs-tabs` (accent underline on
  active), body load via IPC into **local state** (never a zustand selector that
  returns a fresh array), rows `.settings-row`, notes `.cs-note`, empty `.cs-empty`.
  Editors reuse the app input style: `--bg-1` + 1px `--border-1` + `--radius-sm`,
  focus → `--accent`.
- **Inputs**: `background: var(--bg-1); border: 1px solid var(--border-1);
  border-radius: var(--radius-sm); color: var(--text-1); font-size: 12px;`
  focus → `border-color: var(--accent)`.
- **Status bar**: 11px `--text-3`; mode label is accent-600, model `--text-2`,
  effort a rounded pill (`--bg-2` chip). FCC online/offline dots use
  `--green`/`--red` with a soft glow.
- **Empty states** (`.empty-state`): centered column, an icon, `.empty-title`
  (`--text-2`), `.empty-hint` (12px `--text-3`).

## 8. Motion

- **Interactive state changes** use the single transition token:
  `--transition: 220ms cubic-bezier(0.32, 0.72, 0, 1)` (background, color,
  border-color, transform).
- **Entrance animations** live as keyframes in `styles.css`: `modal-in`,
  `backdrop-in`, `fade-up` (modals / backdrops / bars). Elements animate **in** and
  return to base (use `backwards`, never `both` — a lingering transform on an
  ancestor turns `position:fixed` descendants into that ancestor's containing block,
  which shoved the settings modal off-screen).
- **Kill switch**: everything respects the global
  `@media (prefers-reduced-motion: reduce)` — disable animations there.

## 9. Accessibility

- `:focus-visible` gets a 3px `--accent-dim` ring (buttons override their inset
  highlight so the ring stays visible).
- Icon-only controls need `aria-label` / `title`.
- Status is inferred from more than color (dot + text for FCC online/offline);
  running tool `· tool-state` labels.
- Contrast: `--text-3`/`--text-4` are used only for non-critical meta; primary text
  is `--text-1`.

## 10. Titlebar & window chrome

- Frameless (`titleBarStyle: 'hidden'` + `titleBarOverlay` height 34). The HTML
  `.titlebar` keeps `padding-right: 150px` to reserve the native caption overlay.
- The caption buttons are re-tinted per theme via the `setTitleBarOverlay` IPC,
  fired from the App theme effect with **hardcoded hex pairs** that must track the
  CSS theme: dark `#0e1013`/`#a0a8b4`, light `#faf8f6`/`#6f665d`.
- `MenuBar.tsx` dropdowns are `-webkit-app-region: no-drag`, `position: fixed` at
  z-1001 over `.ctx-backdrop` (z-1000), inside the titlebar stacking context; close
  on outside click or Escape.

## 11. Icons & branding

- **`resources/icon.svg` is the single source**; `npm run icons` rasterizes it (in a
  hidden Electron, transparent-background window) to `build/icon-*.png` + `icon.ico`
  for the BrowserWindow and NSIS installer. Changing it needs a dev restart (HMR
  won't pick icons up). The mark color `#d97a55` reads on both themes.
- **`IconClaude`** (`icons.tsx`) is the official filled Claude mark — it takes
  `currentColor` and renders orange in accent-tinted containers, so **don't** route
  it through the stroked `Svg` wrapper. Used in chat empty state, agent banner,
  changes strip.

## 12. Quick checklist for new UI

1. Colors only via `var(--…)`; dark + light both get a sane look (same role tokens).
2. Cards: `--bg-0` + `--border-1`, **no shadow**. Floating: `--shadow-3`.
3. Mono only for technical/mechanical content; body stays `--font-ui`.
4. Hover = `--bg-2` on rows/cards, `--bg-4` on buttons; active panel = `--accent`.
5. Micro labels uppercase 10–11px `600` `.06em`.
6. Use `--space-*` for rhythm; `--radius-sm/md/lg` for corners.
7. Respect `@media (prefers-reduced-motion: reduce)`; gate color/status not only on
   color.
8. If it's a new list in a settings modal, load via IPC into local state — never a
   fresh-array selector.