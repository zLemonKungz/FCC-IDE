import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
    cursor: { line: 1, col: 1 },
    mdPreview: false
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

describe('editor store — markdown preview', () => {
  beforeEach(seed);

  it('toggles preview mode', () => {
    expect(useEditorStore.getState().mdPreview).toBe(false);
    useEditorStore.getState().setPreview(true);
    expect(useEditorStore.getState().mdPreview).toBe(true);
  });

  it('resets preview when switching tabs', () => {
    useEditorStore.getState().setPreview(true);
    useEditorStore.getState().setActive('/b.ts');
    expect(useEditorStore.getState().mdPreview).toBe(false);
  });
});

describe('editor store — agent change batch actions', () => {
  const origWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    // accept/revert read/write the real file via window.fcc — mock it.
    (globalThis as { window: unknown }).window = {
      fcc: {
        fsRead: async (p: string) => `disk-${p}`,
        fsWrite: async () => {}
      }
    };
    useEditorStore.setState({
      tabs: [
        { path: '/a.ts', name: 'a.ts', content: 'a1', baseContent: 'a0', dirty: false, agentModified: true },
        { path: '/b.ts', name: 'b.ts', content: 'b1', baseContent: 'b0', dirty: false, agentModified: true },
        { path: '/c.ts', name: 'c.ts', content: 'c0', baseContent: 'c0', dirty: false }
      ]
    });
  });

  afterEach(() => {
    if (origWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window: unknown }).window = origWindow;
  });

  it('acceptAll clears the flag and syncs base/content to disk', async () => {
    await useEditorStore.getState().acceptAllAgentChanges();
    const tabs = useEditorStore.getState().tabs;
    expect(tabs.filter((t) => t.agentModified)).toHaveLength(0);
    const a = tabs.find((t) => t.path === '/a.ts')!;
    expect(a.baseContent).toBe('disk-/a.ts');
    expect(a.content).toBe('disk-/a.ts');
    expect(a.dirty).toBe(false);
  });

  it('revertAll clears the flag and restores base content', async () => {
    await useEditorStore.getState().revertAllAgentChanges();
    const tabs = useEditorStore.getState().tabs;
    expect(tabs.filter((t) => t.agentModified)).toHaveLength(0);
    const a = tabs.find((t) => t.path === '/a.ts')!;
    expect(a.content).toBe('a0');
    expect(a.dirty).toBe(false);
    // untouched tab is unaffected
    expect(tabs.find((t) => t.path === '/c.ts')?.content).toBe('c0');
  });
});
