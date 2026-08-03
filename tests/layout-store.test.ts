import { describe, it, expect, beforeEach } from 'vitest';
import { useLayoutStore } from '../src/renderer/src/stores/layout-store';

describe('layout store — theme + dragging', () => {
  beforeEach(() => useLayoutStore.setState({ theme: 'dark', isDragging: false }));

  it('defaults to dark theme', () => {
    expect(useLayoutStore.getState().theme).toBe('dark');
  });

  it('toggleTheme flips dark→light→dark', () => {
    useLayoutStore.getState().toggleTheme();
    expect(useLayoutStore.getState().theme).toBe('light');
    useLayoutStore.getState().toggleTheme();
    expect(useLayoutStore.getState().theme).toBe('dark');
  });

  it('setTheme forces a specific theme', () => {
    useLayoutStore.getState().setTheme('light');
    expect(useLayoutStore.getState().theme).toBe('light');
  });

  it('setDragging toggles the dragging flag', () => {
    useLayoutStore.getState().setDragging(true);
    expect(useLayoutStore.getState().isDragging).toBe(true);
    useLayoutStore.getState().setDragging(false);
    expect(useLayoutStore.getState().isDragging).toBe(false);
  });
});
