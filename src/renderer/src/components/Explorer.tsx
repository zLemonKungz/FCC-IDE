import { useEffect, useState, type ReactNode } from 'react';
import { useExplorerStore } from '../stores/explorer-store';
import FileIcon from './FileIcon';
import {
  IconChevronRight,
  IconFolder,
  IconPlus,
  IconTrash,
  IconCheck,
  IconClose,
  IconPencil,
  IconCopy,
  IconFiles,
  IconScissors,
  IconClipboard,
  IconFile
} from './icons';

type Entry = { name: string; path: string; isDir: boolean };
type EditState = { path: string; kind: 'rename' | 'new-file' | 'new-folder' };
type MenuState = { x: number; y: number; target: Entry | null };

const MENU_W = 200;
const MENU_H = 280;
const menuAt = (x: number, y: number, target: Entry | null): MenuState => ({
  x: Math.max(0, Math.min(x, window.innerWidth - MENU_W)),
  y: Math.max(0, Math.min(y, window.innerHeight - MENU_H)),
  target
});
const dirOf = (p: string): string => {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return i >= 0 ? p.slice(0, i) : p;
};

/** Inline name editor shared by rename and new-file/new-folder rows. Enter
 *  commits, Esc cancels; empty input cancels. */
function TreeInput({ initial, placeholder, onCommit, onCancel }: {
  initial: string;
  placeholder?: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const commit = () => {
    const v = value.trim();
    if (v) onCommit(v);
    else onCancel();
  };
  return (
    <input
      className="tree-edit"
      value={value}
      placeholder={placeholder}
      autoFocus
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') onCancel();
      }}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** The inline "new file/folder" row shown inside a dir's children (or at the
 *  root, which is not itself a Node). */
function NewRow({ kind, onCommit, onCancel }: {
  kind: 'new-file' | 'new-folder';
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="tree-row new-row" onClick={(e) => e.stopPropagation()}>
      <span className="chev" />
      <span className="type-icon" style={{ color: kind === 'new-folder' ? 'var(--yellow)' : undefined }}>
        {kind === 'new-file' ? <IconFile width={14} height={16} /> : <IconFolder width={15} height={15} />}
      </span>
      <TreeInput
        initial=""
        placeholder={kind === 'new-file' ? 'file.ext' : 'folder'}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    </div>
  );
}

interface NodeProps {
  entry: Entry;
  editing: EditState | null;
  confirming: string | null;
  onRowContext: (e: React.MouseEvent, entry: Entry) => void;
  onStartRename: (entry: Entry) => void;
  onStartNew: (dir: string, kind: 'new-file' | 'new-folder') => void;
  onCommitRename: (entry: Entry, name: string) => void;
  onCommitNew: (dir: string, name: string, isDir: boolean) => void;
  onCancelEdit: () => void;
  onAskDelete: (path: string) => void;
  onCancelConfirm: () => void;
}

function Node({ entry, editing, confirming, onRowContext, onStartRename, onStartNew, onCommitRename, onCommitNew, onCancelEdit, onAskDelete, onCancelConfirm }: NodeProps) {
  const toggle = useExplorerStore((s) => s.toggle);
  const expanded = useExplorerStore((s) => s.expanded[entry.path]);
  const children = useExplorerStore((s) => s.children[entry.path]);
  const deleteEntry = useExplorerStore((s) => s.deleteEntry);
  const openFile = useExplorerStore((s) => s.openFile);
  const selectedPath = useExplorerStore((s) => s.selectedPath);

  const renaming = editing?.kind === 'rename' && editing.path === entry.path;
  const showingNew = editing?.kind !== 'rename' && editing?.path === entry.path;
  const isConfirming = confirming === entry.path;

  const confirm = () => { deleteEntry(entry.path); onCancelConfirm(); };

  const rowProps = {
    className: entry.isDir
      ? 'tree-row dir'
      : `tree-row file${selectedPath === entry.path ? ' selected' : ''}`,
    onClick: () => (entry.isDir ? toggle(entry.path) : openFile(entry.path)),
    onContextMenu: (e: React.MouseEvent) => onRowContext(e, entry)
  };

  const label = renaming ? (
    <TreeInput initial={entry.name} onCommit={(n) => onCommitRename(entry, n)} onCancel={onCancelEdit} />
  ) : (
    <span className="label">{entry.name}</span>
  );

  const actions = (
    <span className="row-actions">
      {isConfirming ? (
        <span className="confirm">
          <button className="yes icon-btn" title="Confirm delete" onClick={(e) => { e.stopPropagation(); confirm(); }}>
            <IconCheck width={13} height={13} />
          </button>
          <button className="icon-btn" title="Cancel" onClick={(e) => { e.stopPropagation(); onCancelConfirm(); }}>
            <IconClose width={13} height={13} />
          </button>
        </span>
      ) : (
        <button className="icon-btn" title="Delete" onClick={(e) => { e.stopPropagation(); onAskDelete(entry.path); }}>
          <IconTrash width={13} height={13} />
        </button>
      )}
    </span>
  );

  if (entry.isDir) {
    return (
      <div>
        <div {...rowProps}>
          <span className={`chev${expanded ? ' expanded' : ''}`}>
            <IconChevronRight width={14} height={14} />
          </span>
          <span className="type-icon"><IconFolder width={15} height={15} /></span>
          {label}
          {actions}
        </div>
        {expanded && (
          <div className="tree-children">
            {(children ?? []).map((c) => (
              <Node key={c.path} entry={c} editing={editing} confirming={confirming} onRowContext={onRowContext}
                onStartRename={onStartRename} onStartNew={onStartNew} onCommitRename={onCommitRename}
                onCommitNew={onCommitNew} onCancelEdit={onCancelEdit} onAskDelete={onAskDelete}
                onCancelConfirm={onCancelConfirm} />
            ))}
            {showingNew && (
              <NewRow
                kind={editing.kind === 'new-folder' ? 'new-folder' : 'new-file'}
                onCommit={(name) => onCommitNew(entry.path, name, editing.kind === 'new-folder')}
                onCancel={onCancelEdit}
              />
            )}
          </div>
        )}
      </div>
    );
  }
  return (
    <div {...rowProps}>
      <span className="chev" />
      <span className="type-icon"><FileIcon name={entry.name} width={14} height={16} /></span>
      {label}
      {actions}
    </div>
  );
}

type MenuItem =
  | { sep: true }
  | { label: string; icon: ReactNode; danger?: boolean; disabled?: boolean; onPick: () => void };

const EMPTY_CHILDREN: Entry[] = [];

export default function Explorer() {
  const root = useExplorerStore((s) => s.root);
  const rootChildren = useExplorerStore((s) => (s.root ? s.children[s.root] ?? EMPTY_CHILDREN : EMPTY_CHILDREN));
  const clipboard = useExplorerStore((s) => s.clipboard);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  // File > New File (MenuBar) opens the same inline name editor as the header "+".
  useEffect(() => {
    const onNew = () => {
      const r = useExplorerStore.getState().root;
      if (r) onStartNew(r, 'new-file');
    };
    window.addEventListener('fcc:new-file', onNew);
    return () => window.removeEventListener('fcc:new-file', onNew);
  }, []);

  const onRowContext = (e: React.MouseEvent, entry: Entry) => {
    e.preventDefault();
    e.stopPropagation();
    useExplorerStore.getState().select(entry.path);
    setMenu(menuAt(e.clientX, e.clientY, entry));
  };

  const onStartNew = (dir: string, kind: 'new-file' | 'new-folder') => {
    const st = useExplorerStore.getState();
    if (dir && !st.expanded[dir]) st.toggle(dir);
    setEditing({ path: dir, kind });
    setMenu(null);
  };
  const onStartRename = (entry: Entry) => {
    setEditing({ path: entry.path, kind: 'rename' });
    setMenu(null);
  };
  const onCommitRename = (entry: Entry, name: string) => {
    setEditing(null);
    if (name !== entry.name) useExplorerStore.getState().rename(entry.path, name).catch(console.error);
  };
  const onCommitNew = (dir: string, name: string, isDir: boolean) => {
    setEditing(null);
    useExplorerStore.getState().create(dir, name, isDir).catch(console.error);
  };
  const onAskDelete = (path: string) => {
    setConfirming(path);
    setMenu(null);
  };

  let items: MenuItem[] = [];
  if (menu) {
    const t = menu.target;
    const hasClip = !!clipboard;
    if (!t || t.isDir) {
      const d = t ? t.path : root ?? '';
      items.push(
        { label: 'New File', icon: <IconFile width={14} height={14} />, onPick: () => onStartNew(d, 'new-file') },
        { label: 'New Folder', icon: <IconFolder width={14} height={14} />, onPick: () => onStartNew(d, 'new-folder') }
      );
    }
    if (t) {
      if (items.length) items.push({ sep: true });
      items.push(
        { label: 'Rename', icon: <IconPencil width={14} height={14} />, onPick: () => onStartRename(t) },
        { label: 'Duplicate', icon: <IconFiles width={14} height={14} />, onPick: () => { useExplorerStore.getState().duplicate(t.path).catch(console.error); setMenu(null); } },
        { label: 'Copy', icon: <IconCopy width={14} height={14} />, onPick: () => { useExplorerStore.getState().copy(t.path); setMenu(null); } },
        { label: 'Cut', icon: <IconScissors width={14} height={14} />, onPick: () => { useExplorerStore.getState().cut(t.path); setMenu(null); } },
        { label: 'Paste', icon: <IconClipboard width={14} height={14} />, disabled: !clipboard, onPick: () => { useExplorerStore.getState().paste(t.isDir ? t.path : dirOf(t.path)).catch(console.error); setMenu(null); } }
      );
    }
    if (items.length) items.push({ sep: true });
    items.push(t
      ? { label: 'Delete', icon: <IconTrash width={14} height={14} />, danger: true, onPick: () => onAskDelete(t.path) }
      : { label: 'Paste', icon: <IconClipboard width={14} height={14} />, disabled: !clipboard, onPick: () => { useExplorerStore.getState().paste(root ?? '').catch(console.error); setMenu(null); } });
  }

  return (
    <div className="explorer">
      <div className="explorer-header">
        <span className="title">
          <IconFolder width={13} height={13} />
          Explorer
        </span>
        {root && (
          <button className="icon-btn" title="New file" onClick={() => onStartNew(root, 'new-file')}>
            <IconPlus width={13} height={13} />
          </button>
        )}
      </div>
      <div className="explorer-body" onContextMenu={(e) => {
        if (!root) return;
        e.preventDefault();
        setMenu(menuAt(e.clientX, e.clientY, null));
      }}>
        {root ? (
          <div className="tree">
            {rootChildren.map((c) => (
              <Node key={c.path} entry={c} editing={editing} confirming={confirming} onRowContext={onRowContext}
                onStartRename={onStartRename} onStartNew={onStartNew} onCommitRename={onCommitRename}
                onCommitNew={onCommitNew} onCancelEdit={() => setEditing(null)} onAskDelete={onAskDelete}
                onCancelConfirm={() => setConfirming(null)} />
            ))}
            {editing && editing.path === root && editing.kind !== 'rename' && (
              <NewRow
                kind={editing.kind === 'new-folder' ? 'new-folder' : 'new-file'}
                onCommit={(name) => onCommitNew(root, name, editing.kind === 'new-folder')}
                onCancel={() => setEditing(null)}
              />
            )}
          </div>
        ) : (
          <div className="empty-state">
            <IconFolder />
            <div className="empty-title">No folder open</div>
            <div className="empty-hint">Open a project folder to start working with Claude</div>
            <button className="primary" onClick={() => void useExplorerStore.getState().openRoot()} style={{ marginTop: 6 }}>
              Open folder
            </button>
          </div>
        )}
      </div>
      {menu && (
        <div className="ctx-backdrop" onPointerDown={() => setMenu(null)} onContextMenu={(e) => e.preventDefault()}>
          <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
            {items.map((it, i) =>
              'sep' in it ? (
                <div key={i} className="ctx-sep" />
              ) : (
                <button key={i} className={it.danger ? 'danger' : ''} disabled={it.disabled} onClick={it.onPick}>
                  {it.icon}
                  <span>{it.label}</span>
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}