import { useEffect, useRef } from 'react';

/** Modal accessibility: focus the dialog on open, close on Escape, and
 *  restore focus to the triggering element on close. Returns the ref to attach
 *  to the dialog panel (which needs tabIndex={-1} to be focusable). */
export function useModalFocus(open: boolean, onClose: () => void): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  return ref;
}
