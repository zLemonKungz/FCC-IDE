import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../src/renderer/src/stores/editor-store';

function seed(): void {
  useEditorStore.setState({
    tabs: [
      { path: '/a.ts', name: 'a.ts', content: 'x', baseContent: 'x', dirty: false },
      { path: '/b.ts', name: 'b.ts', content: 'y2', baseContent: 'y', dirty: true },
      { path: '/c.ts', name: 'c.ts', content: 'z', baseContent: 'z', dirty: false }
    ],
    activePath: '/a.ts',
    closingPath: null,
    diffPath: null,
    cursor: { line: 1, col: 1 }
  });
}

const paths = () => useEditorStore.getState().tabs.map((t) => t.path);

describe('editor store — dirty close guard', () => {
  beforeEach(seed);

  it('closes a clean tab immediately', () => {
    useEditorStore.getState().close('/a.ts');
    expect(paths()).toEqual(['/b.ts', '/c.ts']);
  });

  it('arms a dirty tab on first close, discards on second', () => {
    useEditorStore.getState().close('/b.ts');
    expect(useEditorStore.getState().closingPath).toBe('/b.ts');
    expect(paths()).toEqual(['/a.ts', '/b.ts', '/c.ts']);

    useEditorStore.getState().close('/b.ts');
    expect(paths()).toEqual(['/a.ts', '/c.ts']);
    expect(useEditorStore.getState().closingPath).toBeNull();
  });

  it('refuses closeAll while any tab is dirty', () => {
    useEditorStore.getState().closeAll();
    expect(useEditorStore.getState().closingPath).toBe('/b.ts');
    expect(paths()).toHaveLength(3);
  });

  it('refuses closeOthers while another tab is dirty', () => {
    useEditorStore.getState().closeOthers('/a.ts');
    expect(useEditorStore.getState().closingPath).toBe('/b.ts');
    expect(paths()).toHaveLength(3);
  });

  it('other interactions cancel the armed state', () => {
    useEditorStore.getState().close('/b.ts');
    useEditorStore.getState().setActive('/c.ts');
    expect(useEditorStore.getState().closingPath).toBeNull();
  });
});
