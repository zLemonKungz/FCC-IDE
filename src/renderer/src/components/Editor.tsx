import { useEffect, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useEditorStore } from '../stores/editor-store';
import { useExplorerStore } from '../stores/explorer-store';
import { useLayoutStore } from '../stores/layout-store';
import DiffView from './DiffView';
import FileIcon from './FileIcon';
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
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null);

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
      </div>
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
      ) : active ? (
        <Editor
          key={active.path}
          path={active.path}
          defaultLanguage={langFor(active.path)}
          value={active.content}
          onChange={(v) => v !== undefined && setContent(active.path, v)}
          theme={theme === 'dark' ? 'fcc-dark' : 'fcc-light'}
          onMount={(editor) => {
            editor.onDidChangeCursorPosition((e) =>
              setCursor({ line: e.position.lineNumber, col: e.position.column })
            );
          }}
          options={{ minimap: { enabled: false }, fontSize: 14, fontFamily: 'var(--font-mono)' }}
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

function langFor(p: string): string {
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
