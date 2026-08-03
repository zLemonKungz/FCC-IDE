import { useState } from 'react';
import { useExplorerStore } from '../stores/explorer-store';
import FileIcon from './FileIcon';
import {
  IconChevronDown,
  IconChevronRight,
  IconFolder,
  IconPlus,
  IconTrash,
  IconCheck,
  IconClose
} from './icons';

function Node({ entry }: { entry: { name: string; path: string; isDir: boolean } }) {
  const toggle = useExplorerStore((s) => s.toggle);
  const expanded = useExplorerStore((s) => s.expanded[entry.path]);
  const children = useExplorerStore((s) => s.children[entry.path]);
  const deleteEntry = useExplorerStore((s) => s.deleteEntry);
  const openFile = useExplorerStore((s) => s.openFile);
  const selectedPath = useExplorerStore((s) => s.selectedPath);
  const [confirming, setConfirming] = useState(false);

  if (entry.isDir) {
    return (
      <div>
        <div className="tree-row dir" onClick={() => toggle(entry.path)}>
          <span className="chev">{expanded ? <IconChevronDown width={14} height={14} /> : <IconChevronRight width={14} height={14} />}</span>
          <span className="type-icon"><IconFolder width={15} height={15} /></span>
          <span className="label">{entry.name}</span>
          <span className="row-actions">
            {confirming ? (
              <span className="confirm">
                <button className="yes icon-btn" title="Confirm delete" onClick={(e) => { e.stopPropagation(); deleteEntry(entry.path); setConfirming(false); }}>
                  <IconCheck width={13} height={13} />
                </button>
                <button className="icon-btn" title="Cancel" onClick={(e) => { e.stopPropagation(); setConfirming(false); }}>
                  <IconClose width={13} height={13} />
                </button>
              </span>
            ) : (
              <button className="icon-btn" title="Delete folder" onClick={(e) => { e.stopPropagation(); setConfirming(true); }}>
                <IconTrash width={13} height={13} />
              </button>
            )}
          </span>
        </div>
        {expanded && (
          <div className="tree-children">
            {(children ?? []).map((c) => <Node key={c.path} entry={c} />)}
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      className={`tree-row file ${selectedPath === entry.path ? 'selected' : ''}`}
      onClick={() => openFile(entry.path)}
    >
      <span className="chev" />
      <span className="type-icon"><FileIcon name={entry.name} width={14} height={16} /></span>
      <span className="label">{entry.name}</span>
      <span className="row-actions">
        {confirming ? (
          <span className="confirm">
            <button className="yes icon-btn" title="Confirm delete" onClick={(e) => { e.stopPropagation(); deleteEntry(entry.path); setConfirming(false); }}>
              <IconCheck width={13} height={13} />
            </button>
            <button className="icon-btn" title="Cancel" onClick={(e) => { e.stopPropagation(); setConfirming(false); }}>
              <IconClose width={13} height={13} />
            </button>
          </span>
        ) : (
          <button className="icon-btn" title="Delete file" onClick={(e) => { e.stopPropagation(); setConfirming(true); }}>
            <IconTrash width={13} height={13} />
          </button>
        )}
      </span>
    </div>
  );
}

const EMPTY_CHILDREN: { name: string; path: string; isDir: boolean }[] = [];

export default function Explorer() {
  const root = useExplorerStore((s) => s.root);
  const rootChildren = useExplorerStore((s) =>
    s.root ? s.children[s.root] ?? EMPTY_CHILDREN : EMPTY_CHILDREN
  );
  const openRoot = useExplorerStore((s) => s.openRoot);
  const createFile = useExplorerStore((s) => s.createFile);

  return (
    <div className="explorer">
      <div className="explorer-header">
        <span className="title">
          <IconFolder width={13} height={13} />
          Explorer
        </span>
        {root && (
          <button className="icon-btn" title="New file" onClick={() => createFile(root)}>
            <IconPlus width={13} height={13} />
          </button>
        )}
      </div>
      <div className="explorer-body">
        {root ? (
          <div className="tree">{rootChildren.map((c) => <Node key={c.path} entry={c} />)}</div>
        ) : (
          <div className="empty-state">
            <IconFolder />
            <div className="empty-title">No folder open</div>
            <div className="empty-hint">Open a project folder to start working with Claude</div>
            <button className="primary" onClick={openRoot} style={{ marginTop: 6 }}>
              Open folder
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
