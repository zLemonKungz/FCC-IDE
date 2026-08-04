import { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useEditorStore } from '../stores/editor-store';
import { useExplorerStore } from '../stores/explorer-store';
import { useLayoutStore } from '../stores/layout-store';
import { useSettingsStore } from '../stores/settings-store';
import DiffView from './DiffView';
import FileIcon from './FileIcon';
import Markdown from '../chat/markdown';
import { IconChevronRight, IconClose, IconFile, IconSparkles } from './icons';

loader.config({ monaco });

export default function EditorPane() {
  const tabs = useEditorStore((s) => s.tabs);
  const activePath = useEditorStore((s) => s.activePath);
  const diffPath = useEditorStore((s) => s.diffPath);
  const setDiff = useEditorStore((s) => s.setDiff);
  const setContent = useEditorStore((s) => s.setContent);
  const save = useEditorStore((s) => s.save);
  const close = useEditorStore((s) => s.close);
  const closeOthers = useEditorStore((s) => s.closeOthers);
  const closeSaved = useEditorStore((s) => s.closeSaved);
  const closeAll = useEditorStore((s) => s.closeAll);
  const setActive = useEditorStore((s) => s.setActive);
  const setCursor = useEditorStore((s) => s.setCursor);
  const open = useEditorStore((s) => s.open);
  const accept = useEditorStore((s) => s.acceptAgentChange);
  const revert = useEditorStore((s) => s.revertAgentChange);
  const markAgentModified = useEditorStore((s) => s.markAgentModified);
  const root = useExplorerStore((s) => s.root);
  const theme = useLayoutStore((s) => s.theme);
  const closingPath = useEditorStore((s) => s.closingPath);
  const mdPreview = useEditorStore((s) => s.mdPreview);
  const setPreview = useEditorStore((s) => s.setPreview);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const autoSave = useSettingsStore((s) => s.autoSave);
  const autoSaveDelay = useSettingsStore((s) => s.autoSaveDelay);
  const tabSize = useSettingsStore((s) => s.tabSize);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const minimap = useSettingsStore((s) => s.minimap);
  const lineNumbers = useSettingsStore((s) => s.lineNumbers);
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const saveTimer = useRef<number | null>(null);
  // Find-in-files "reveal line": set before open(), applied in onMount once the
  // editor for that file mounts (the <Editor> remounts per file via key).
  const pendingReveal = useRef<{ path: string; line: number } | null>(null);

  useEffect(() => {
    const reveal = (e: Event) => {
      const d = (e as CustomEvent).detail as { path: string; line: number };
      pendingReveal.current = { path: d.path, line: d.line };
      void open(d.path);
    };
    window.addEventListener('fcc:reveal', reveal);
    return () => window.removeEventListener('fcc:reveal', reveal);
  }, [open]);

  // Auto-save: debounce a save on each edit when enabled (saves the latest
  // content from the store, which setContent already wrote). Never auto-save a
  // file Claude modified — the user reviews/accepts that edit first, and
  // auto-saving would clobber the on-disk agent change and corrupt accept/revert.
  const onEdit = (path: string, v: string): void => {
    setContent(path, v);
    if (!autoSave) return;
    if (useEditorStore.getState().getTab(path)?.agentModified) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    const delayMs = Math.max(500, autoSaveDelay * 1000);
    saveTimer.current = window.setTimeout(() => void save(path), delayMs);
  };
  useEffect(
    () => () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    },
    []
  );

  useEffect(() => {
    const handler = (e: Event) => open((e as CustomEvent).detail as string);
    window.addEventListener('fcc:open-file', handler);
    return () => window.removeEventListener('fcc:open-file', handler);
  }, [open]);

  useEffect(() => {
    const modified = (e: Event) => {
      const p = (e as CustomEvent).detail as string;
      if (tabs.some((t) => t.path === p)) markAgentModified(p);
    };
    window.addEventListener('fcc:file-modified', modified);
    return () => window.removeEventListener('fcc:file-modified', modified);
  }, [tabs, markAgentModified]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && activePath) {
        e.preventDefault();
        void save(activePath);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePath, save]);

  const active = tabs.find((t) => t.path === activePath);
  const isMd = active ? langFor(active.path) === 'markdown' : false;

  return (
    <div className="editor-pane">
      <div className="tabs">
        {tabs.map((t) => (
          <span
            key={t.path}
            className={`tab ${t.path === activePath ? 'active' : ''}${t.path === closingPath ? ' closing' : ''}`}
            onClick={() => setActive(t.path)}
            onAuxClick={(e) => {
              if (e.button === 1) close(t.path);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({
                path: t.path,
                x: Math.min(e.clientX, window.innerWidth - 180),
                y: Math.min(e.clientY, window.innerHeight - 160)
              });
            }}
          >
            <span className="tab-name">
              <FileIcon name={t.name} width={12} height={14} />
              {t.name}
            </span>
            {t.dirty && <span className="dirty-dot" />}
            {t.agentModified && !t.dirty && <span className="agent-dot" title="Claude modified this file" />}
            <button
              className={`close${t.path === closingPath ? ' armed' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                close(t.path);
              }}
              title={t.path === closingPath ? 'Discard changes (click again)' : 'Close tab'}
            >
              <IconClose width={11} height={11} />
            </button>
          </span>
        ))}
        {active && isMd && !diffPath && (
          <div className="md-toggle" title="Switch between source and rendered preview">
            <button className={!mdPreview ? 'on' : ''} onClick={() => setPreview(false)}>
              Source
            </button>
            <button className={mdPreview ? 'on' : ''} onClick={() => setPreview(true)}>
              Preview
            </button>
          </div>
        )}
      </div>
      <ChangesStrip />
      {active && <Breadcrumbs path={active.path} root={root} />}
      {active && active.agentModified && !diffPath && (
        <div className="agent-banner">
          <span className="msg">
            <IconSparkles width={14} height={14} />
            Claude modified this file
          </span>
          <button onClick={() => setDiff(active.path)}>Review changes</button>
          <button className="accept" onClick={() => accept(active.path)}>
            Accept
          </button>
          <button onClick={() => revert(active.path)}>Revert</button>
        </div>
      )}
      {diffPath ? (
        <DiffView path={diffPath} onClose={() => setDiff(null)} />
      ) : active && mdPreview ? (
        <div className="md-preview">
          <div className="md-preview-inner">
            <Markdown text={active.content} />
          </div>
        </div>
      ) : active ? (
        <Editor
          key={active.path}
          path={active.path}
          defaultLanguage={langFor(active.path)}
          value={active.content}
          onChange={(v) => v !== undefined && onEdit(active.path, v)}
          theme={theme === 'dark' ? 'fcc-dark' : 'fcc-light'}
          onMount={(editor) => {
            editor.onDidChangeCursorPosition((e) =>
              setCursor({ line: e.position.lineNumber, col: e.position.column })
            );
            // Apply a pending find-in-files reveal for this file.
            const pr = pendingReveal.current;
            if (pr && pr.path === active.path) {
              pendingReveal.current = null;
              editor.revealLineInCenter(pr.line);
              editor.setPosition({ lineNumber: pr.line, column: 1 });
              editor.focus();
            }
          }}
          options={{
            minimap: { enabled: minimap },
            fontSize: editorFontSize,
            fontFamily: 'var(--font-mono)',
            tabSize,
            wordWrap: wordWrap ? 'on' : 'off',
            lineNumbers: lineNumbers ? 'on' : 'off'
          }}
        />
      ) : (
        <div className="empty-state">
          <IconFile />
          <div className="empty-title">No file open</div>
          <div className="empty-hint">Select a file from the explorer to start editing</div>
        </div>
      )}
      {menu && (
        <div className="ctx-backdrop" onPointerDown={() => setMenu(null)} onContextMenu={(e) => e.preventDefault()}>
          <div
            className="ctx-menu"
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button onClick={() => { close(menu.path); setMenu(null); }}>Close</button>
            <button onClick={() => { closeOthers(menu.path); setMenu(null); }}>Close Others</button>
            <button onClick={() => { closeSaved(); setMenu(null); }}>Close Saved</button>
            <button onClick={() => { closeAll(); setMenu(null); }}>Close All</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Aggregate view of every file Claude modified this session. Chips open the
// diff; the strip offers batch accept / revert (VS Code-style review surface).
function ChangesStrip() {
  // Select the stable `tabs` reference, not the filtered result — a selector
  // returning a fresh array every snapshot makes useSyncExternalStore re-render
  // forever ("Maximum update depth exceeded"). Memoize the filter instead.
  const tabs = useEditorStore((s) => s.tabs);
  const modified = useMemo(() => tabs.filter((t) => t.agentModified), [tabs]);
  const setDiff = useEditorStore((s) => s.setDiff);
  const setActive = useEditorStore((s) => s.setActive);
  const acceptAll = useEditorStore((s) => s.acceptAllAgentChanges);
  const revertAll = useEditorStore((s) => s.revertAllAgentChanges);

  if (modified.length === 0) return null;
  return (
    <div className="changes-strip">
      <span className="changes-label">
        <IconSparkles width={12} height={12} />
        Changed
      </span>
      {modified.map((t) => (
        <button
          key={t.path}
          className="changes-chip"
          title={t.path}
          onClick={() => {
            setActive(t.path);
            setDiff(t.path);
          }}
        >
          {t.name}
        </button>
      ))}
      <span className="spacer" />
      <button className="ghost" onClick={() => void acceptAll()}>
        Accept all
      </button>
      <button className="ghost" onClick={() => void revertAll()}>
        Revert all
      </button>
    </div>
  );
}

// Read-only path trail under the tab bar — file name last, root-relative.
function Breadcrumbs({ path, root }: { path: string; root: string | null }) {
  const rel =
    root && path.startsWith(root) ? path.slice(root.length).replace(/^[\\/]/, '') : path;
  const segs = rel.split(/[\\/]/).filter(Boolean);
  if (segs.length <= 1) return null;
  return (
    <div className="breadcrumbs" title={path}>
      {segs.map((seg, i) => (
        <span key={i} className={i === segs.length - 1 ? 'bc-file' : 'bc-seg'}>
          {i > 0 && <IconChevronRight width={10} height={10} />}
          {seg}
        </span>
      ))}
    </div>
  );
}

export function langFor(p: string): string {
  const ext = p.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    html: 'html',
    css: 'css',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    sh: 'shell',
    yml: 'yaml',
    yaml: 'yaml'
  };
  return map[ext] ?? 'plaintext';
}
