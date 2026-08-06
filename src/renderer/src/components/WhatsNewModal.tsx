import { useMemo } from 'react';
import Markdown from '../chat/markdown';
import { IconClose } from './icons';

// The bundled changelog (repo root) — this is the in-app release-notes surface
// now, and the target the future auto-update flow will point at too.
import changelogRaw from '../../../../CHANGELOG.md?raw';

export default function WhatsNewModal({ onClose }: { onClose: () => void }) {
  const text = useMemo(() => changelogRaw, []);
  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="whatsnew-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="whatsnew-head">
          <span className="wn-title">What's new</span>
          <button className="icon-btn" onClick={onClose} title="Close" aria-label="Close what's new">
            <IconClose width={12} height={12} />
          </button>
        </div>
        <div className="whatsnew-body">
          <Markdown text={text} />
        </div>
      </div>
    </div>
  );
}