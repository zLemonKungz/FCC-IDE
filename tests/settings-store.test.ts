import { describe, it, expect } from 'vitest';
import { useSettingsStore } from '../src/renderer/src/stores/settings-store';

describe('settings store', () => {
  it('has sensible defaults', () => {
    const s = useSettingsStore.getState();
    expect(s.editorFontSize).toBe(14);
    expect(s.chatModel).toBe('claude-haiku-4-5-20251001');
    expect(s.chatMaxTurns).toBe(50);
  });

  it('sets font size', () => {
    useSettingsStore.getState().setEditorFontSize(18);
    expect(useSettingsStore.getState().editorFontSize).toBe(18);
  });

  it('clamps font size to the allowed range', () => {
    useSettingsStore.getState().setEditorFontSize(99);
    expect(useSettingsStore.getState().editorFontSize).toBe(24);
    useSettingsStore.getState().setEditorFontSize(1);
    expect(useSettingsStore.getState().editorFontSize).toBe(10);
    useSettingsStore.getState().setEditorFontSize(Number.NaN);
    expect(useSettingsStore.getState().editorFontSize).toBe(10);
  });

  it('sets chat model and max turns', () => {
    useSettingsStore.getState().setChatModel('claude-sonnet-5');
    useSettingsStore.getState().setChatMaxTurns(100);
    expect(useSettingsStore.getState().chatModel).toBe('claude-sonnet-5');
    expect(useSettingsStore.getState().chatMaxTurns).toBe(100);
  });
});
