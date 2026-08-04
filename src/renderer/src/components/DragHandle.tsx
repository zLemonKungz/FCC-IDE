import type { PointerEvent as ReactPointerEvent } from 'react';

interface Props {
  orientation: 'vertical' | 'horizontal';
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (v: number) => void;
  /**
   * Panel is docked against the right/bottom window edge, so its free edge is
   * on the inside. Dragging that edge toward the center must grow the panel —
   * the opposite of a left/top-docked panel — which flips the drag delta.
   * Left-docked (sidebar) and top-docked panels leave this unset.
   */
  invert?: boolean;
}

// Slim divider that doubles as a resize handle. Drag = resize, double-click = reset.
export default function DragHandle({ orientation, value, min, max, defaultValue, onChange, invert = false }: Props) {
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const startPos = orientation === 'vertical' ? e.clientX : e.clientY;
    const startVal = value;
    const isVertical = orientation === 'vertical';
    const move = (ev: PointerEvent) => {
      const d = (isVertical ? ev.clientX : ev.clientY) - startPos;
      onChange(Math.min(max, Math.max(min, startVal + (invert ? -d : d))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div
      className={`drag-handle ${orientation}`}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={() => onChange(defaultValue)}
    />
  );
}
