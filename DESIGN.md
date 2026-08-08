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
Warning surfaces use `--warn-bg` / `--warn-border` — translucent tints of the theme
`--yellow`, so the context-full banner/meter share the hue without hardcoding a color
(dark `rgba(217,164,78,.08/.35)`, light `rgba(185,138,46,.10/.35)`).

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
| `--fs-xs` | `13px` | list rows, buttons, inputs |
| `--fs-sm` | `14px` | default body |
| `--fs-md` | `15px` | emphasised text |
| `--fs-lg` | `16px` | <body emphasis> |

- **Readability baseline**: body runs `15px / 600`. Comic Neue ships only the 400/700
  weights, so mid weights (500/600) are browser-synthesized — the UI uses **600** for
  body/secondary and the size floor is **11px** (the smallest metadata/carets), up
  from 9–10px. The whole `styles.css` was bumped a step (11→12, 12→13, 13→14, 14→15,
  weights 500→600) so no text reads thin or cramped.
- Micro **labels** (panel headers, "Running", "Thinking") are uppercase, `11–12px`,
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
  Its bottom block holds the **theme toggle**, with the **settings gear** just below
  it (falls to the very bottom via `margin-top:auto`, active while the Settings page
  is open).
- **Sidebar**: Explorer / Find-in-files / Subagents / Activity (agent telemetry:
  timeline + file influence + tool flow) (width persisted via `layout-store`).
  Panels take the full height.
- **Center**: the editor (`<Editor />` stays mounted so Monaco buffers survive).
  A centered chat overlays it `position:absolute; inset:0`.
- **Right column** (`.right-col`): chat + optional right-docked terminal.
- **Chat panel = a column strip**: the header (`.chat-header`) holds the title,
  an **Add** button, and move/hide; below it `.chat-col-strip` (horizontal
  scroll, mirrors the terminal-tabs pattern) renders one `.chat-column` per
  conversation. Each column has its own `.chat-col-header` (label, Plan/Act,
  Stop, New, ✕ close), its own message scroll + input, equal `flex:1` widths
  with `min-width:300px` and a `--border-0` divider. Column resize deferred.
- **Chat input = one framed field** (`.chat-field` inside `.chat-input`): the
  textarea + a bottom control row (Plan/Act pill, **model selector dropdown**,
  a **context-fill dot + %**, ~tokens, a **Compact** pill, gear, send↔stop) live
  in a single thin-framed box with a `focus-within` glow. The model chip opens a
  dropdown (`.chat-model-dd`) to pick any model. The context meter (`.cbf-context`,
  `.ctx-dot`) shows how full the conversation is vs **the model's own context
  window** (reported by the CLI per turn; fallback: the user's auto-compact
  window, then 200k) — green → amber `>window` → red `>120%`: the
  `.warn`/`.full` `.ctx-dot` colors. The **Compact** pill (`.cbf-compact`) sends
  `/compact` to the CLI. The footer model dropdown and the Chat-settings model
  select both resolve through the shared `curatedModelOptions()` filter, so the
  two pickers always offer the same deduped set.
- **Resumed/saved transcripts** render message bubbles with `restored:true` so a
  live assistant reply opens its own bubble instead of merging into the imported
  conversation's last bubble (prevents "stacked answers" on resume).
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
  pre, `<details>` collapsed by default). **User bubbles are editable**: a hover
  pencil opens `.msg-edit` (mono textarea) + Re-send/Cancel, re-submitting the
  edited prompt as a new turn. Local commands `/review` (git diff) and
  `/terminal <q>` (recent terminal output) compose context; the terminal's red
  **⚡ Fix** chip (`term-fix`, appears on error output) opens the error in chat.
  **Checkpoints**: hovering an assistant bubble shows a **⟲** (`rewind-btn`) that
  restores the open files to their state just before that message.
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
  **Raw HTML** in markdown is enabled via `rehype-raw` but every raw node is
  sanitized with **DOMPurify** (`sanitizeRawHtml` in `markdown.tsx`) before
  rendering — the chat/subagent/.md text is untrusted, so HTML is never injected
  verbatim (scripts/event handlers/javascript: are stripped).
- **Language coverage** — `langFor()` (`src/renderer/src/lang/highlight.ts`) starts
  from a curated `EXT_LANG` map then folds in **every** grammar Monaco registers at
  runtime (`monaco.languages.getLanguages()` → extensions + filenames), so any
  language Monaco ships highlights by extension (`.sql`/`.rb`/`.php`/`.kt`/
  `Dockerfile`, …) instead of plaintext; curated entries win on ambiguity (`.h` → c).
  The preview merges lowlight's 37 common grammars + a few
  highlight.js extras (powershell, dos, dockerfile, julia, dart). Gotchas:
  rehype-highlight's `languages` option **replaces** common rather than extending
  (spread `{...common, …}`); highlight.js ships **no batch or TOML grammar** (DOS is
  `dos`, and the grammar modules have no TS declarations — ambient `hljs-grammars.d.ts`).
- **Inline edit** — select a block in Monaco, hit the ✨ chip (or Ctrl+K), describe
  the change in the `.inline-edit` popover, and the chat rewrites it; the result
  flows through the normal agent-modified diff review (accept/revert).
- **Slash `/` picker** + **`@` file picker**: `--bg-2` floating card, `--shadow-3`,
  items are `mono command | flex:1 description | dim arg-hint(right)`, active row
  `--bg-3` + accent command.
- **Subagents panel**: a **"Running"** section (accent left rail + `--accent-dim`
  fill + accent title with the pulsing accent dot) above grouped per-subagent
  `.subagent-card`s (card language, caret-expand; detail shows thinking + Markdown
  text + tool cards).
- **Source control panel** (`sidebarView:'source'`, git activity-bar icon): a
  compact **top row** holds the remote chip (`.sc-remote-chip`, click → URL/Cancel
  connect form with a "sign in via browser on first push" hint) next to the
  branch selector. The commit area is one frame: message textarea with a small
  **✨** (ask Claude) inside, plus a single **full-width state-driven button**
  (changes → Commit, committed → Push, behind → Pull, else Synced). File
  rows `.sc-row` with a mono status letter (`.sc-kind`, yellow / red for conflicts); clicking a row
  opens a **HEAD-vs-working diff** (`GitDiffView.tsx`, Monaco DiffEditor) in the editor
  area via `fcc:git-diff`, per-file stage/unstage/discard revealed on hover (`.sc-actions`), section titles
  `.sc-section-title` (Staged / Changes / Untracked / Conflicts), a `.sc-commit`
  box with the ✨ commit-message helper, a `.sc-branch-bar` on top (switch/create +
  ahead/behind), and a bottom-pinned collapsible **History** (`CommitGraph.tsx`)
  that draws a real SVG commit graph (`.scg`): vertical backbones down first-parent
  chains and horizontal merge joins to branch lanes, dots (HEAD accent), ref chips,
  and the subject — no raw hash. Empty states: "Not a git repository" / "No changes".
- **Settings is a full page** (`SettingsPage.tsx`), opened from an activity-bar
  gear at the bottom-left (below the theme toggle). It overlays the window below
  the titlebar while keeping the activity bar visible (starts at `left: 46px`);
  a left nav rail (`.settings-nav-item`, icon + label, accent-dim + accent on
  active) selects the section, and a content column (`.settings-content`,
  max-width 820px, `overflow-y: auto`) scrolls on tall tabs. Closes with
  **Escape** or the ×.
- Each section groups rows into **card panels** (`SettingsPanel.tsx`,
  `.settings-panel`): header (`.settings-panel-head`, `--bg-2` + `--border-0`,
  uppercase micro title `.settings-panel-title`) over `.settings-panel-body`;
  height: full window height constrained with `overflow-y:auto` and panels
  `flex-shrink:0` so long lists (History/MCP/Agents/Plugins) scroll inside the
  column instead of growing the page. The **Updates** section (`.settings-section`
  in General) shows installed version, check/download/install states, progress
  bar, and an auto-check-on-launch toggle — wired to `electron-updater` in main.
- **Chat tab** uses rows `.settings-row` in a 2-column `.cs-settings-grid` +
  notes `.cs-note`; list bodies load via IPC into **local state** (never a
  zustand selector that returns a fresh array); empty state `.cs-empty`. The MCP
  tab groups servers by scope with `.cs-scope-label`/`.cs-scope-chip`
  ("global"/"plugin" read-only chips); the Plugins tab shows a list with
  `.cs-plugin-toggle` + an accent `.cs-plugin-mcp` badge. History lists the app's
  `userData/sessions` plus **imported Claude Code CLI sessions**
  (`~/.claude/projects`, tagged "Claude Code"). Editors reuse the app input
  style: `--bg-1` + 1px `--border-1` + `--radius-sm`, focus → `--accent`.
- **Inputs**: `background: var(--bg-1); border: 1px solid var(--border-1);
  border-radius: var(--radius-sm); color: var(--text-1); font-size: 13px;`
  focus → `border-color: var(--accent)`.
- **Status bar**: 12px `--text-3`; mode label is accent-600, model `--text-2`,
  effort a rounded pill (`--bg-2` chip). FCC online/offline dots use
  `--green`/`--red` with a soft glow.
- **Empty states** (`.empty-state`): centered column, an icon, `.empty-title`
  (`--text-2`), `.empty-hint` (13px `--text-3`).

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
- Icon-only controls need `aria-label` / `title`. **Every ActivityBar nav button
  carries an `aria-label`** (Explorer/Search/Subagents/Source/Activity/Chat/
  Terminal/theme — Settings already had one); the chat textarea and Send button
  are labelled (`aria-label`), and Stop/Chat-settings use it too.
- **Live regions**: the chat message scroll (`.chat-messages`) is
  `role="log" aria-live="polite" aria-label="Conversation"`, so a screen reader
  announces streamed replies instead of silence. The running indicator is
  announced via that live region.
- **Focus management**: the full-page **Settings** view is a real dialog
  (`role="dialog" aria-modal="true" aria-labelledby="settings-page-title"`) and
  reuses `useModalFocus` (`src/renderer/src/hooks/useModal.ts`): focus moves in
  on open and returns to the trigger on Escape/close. The hook's Escape skips
  when an input/textarea/select is focused, so editing a settings field doesn't
  close the page.
- **Streaming perf**: `ChatColumn` and `ChatMessage` are `React.memo`-wrapped;
  the three per-message callbacks (edit/rewind/regenerate) are `useCallback`-
  stable, so unchanged transcript rows skip re-render while a turn streams.
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
- The shared `.ctx-menu` is used by tab menus and the **Explorer right-click menu**
  (New File/Folder, Rename/Duplicate/Copy/Cut/Paste/Delete). Menu rows: icon + label,
  `:disabled` greyed, `.danger` (Delete) in `--red`; clamps to the viewport. Rename
  and new-file/folder names edit **inline** in the tree (`.tree-edit` mono input,
  Enter commits, Esc cancels). Copy/Cut/Paste and Duplicate live in `explorer-store`
  (a renderer-local clipboard), and Delete reuses the existing inline ✓/✗ confirm.
- The titlebar brand shows **`FCC Studio` + a muted mono version** (`.brand-ver`)
  from `app:info`. The old "?" is an **About (ⓘ)** button opening an `.about-popover`
  (logo, name, version, description, repo link). Keyboard shortcuts open from the
  Help menu as a **centered `.shortcuts-modal`** — all three (menu, About, keyboard
  modal) close on Escape / outside click (`.shortcuts-backdrop`).

## 11. Icons & branding

- **Logo**: a solid rounded **"F"** (three bars + a terminal cursor block, one
  smooth `userSpaceOnUse` terracotta→amber gradient, no overlapping elements).
  Two sources: **`resources/icon.svg`** is the app-icon badge (warm-gradient
  rounded square + cream F) rasterized by `npm run icons` to `build/icon-*.png` +
  `icon.ico`; **`resources/mark.svg`** is the transparent gradient mark for
  in-app uses. The in-app logomark (`Logo.tsx`, `currentColor`) and the splash
  (`splash.ts` `LOGO_SVG`, gradient) mirror the same F. Changing icons needs a
  dev restart (HMR won't pick them up).
- **`IconClaude`** (`icons.tsx`) is the official filled Claude mark — it takes
  `currentColor` and renders orange in accent-tinted containers, so **don't** route
  it through the stroked `Svg` wrapper. Used in chat empty state, agent banner,
  changes strip.

## 12. Quick checklist for new UI

1. Colors only via `var(--…)`; dark + light both get a sane look (same role tokens).
2. Cards: `--bg-0` + `--border-1`, **no shadow**. Floating: `--shadow-3`.
3. Mono only for technical/mechanical content; body stays `--font-ui`.
4. Hover = `--bg-2` on rows/cards, `--bg-4` on buttons; active panel = `--accent`.
5. Micro labels uppercase 11–12px `600` `.06em`.
6. Use `--space-*` for rhythm; `--radius-sm/md/lg` for corners.
7. Respect `@media (prefers-reduced-motion: reduce)`; gate color/status not only on
   color.
8. If it's a new list in a settings modal, load via IPC into local state — never a
   fresh-array selector.
## Monaco chrome
- **Scrollbar & selection are gray** (not red): Monaco themes (`fcc-dark`/`fcc-light`)
  set `scrollbarSlider`/`diffEditorOverview` to gray and `scrollbar` to 8px;
  `styles.css` force-overrides them (`!important`) plus hides native webkit
  scrollbars inside `.monaco-editor` so only one gray bar shows. The diff view
  stays **side-by-side** with normal red-added/green-removed lines.
- **Git diff per file**: clicking a changed row in Source Control dispatches
  `fcc:git-diff` → `GitDiffView.tsx` (Monaco DiffEditor, original=`HEAD` blob
  via `git:show` normalized to forward-slash pathspecs, modified=disk).
- **Image preview**: opening a `png/jpg/gif/webp/svg/bmp/ico` file renders it
  centered (`.image-preview`, `ImagePreview` in `Editor.tsx`) via the sandboxed
  `readAsset` data-URI IPC instead of raw Monaco text.
