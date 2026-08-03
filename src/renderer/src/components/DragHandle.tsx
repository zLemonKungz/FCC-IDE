import type { PointerEvent as ReactPointerEvent } from 'react';

interface Props {
  orientation: 'vertical' | 'horizontal';
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (v: number) => void;
}

// Slim divider that doubles as a resize handle. Drag = resize, double-click = reset.
export default function DragHandle({ orientation, value, min, max, defaultValue, onChange }: Props) {
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const startPos = orientation === 'vertical' ? e.clientX : e.clientY;
    const startVal = value;
    const isVertical = orientation === 'vertical';
    const move = (ev: PointerEvent) => {
      const d = (isVertical ? ev.clientX : ev.clientY) - startPos;
      onChange(Math.min(max, Math.max(min, startVal + d)));
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
