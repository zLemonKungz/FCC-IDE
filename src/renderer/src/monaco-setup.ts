import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Wire Monaco web workers through Vite's ?worker imports so language services
// (autocomplete, diagnostics) run off the main thread.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        return new editorWorker();
    }
  }
};

// Warm-dark theme that matches the app palette (instead of vs-dark's blue tint).
monaco.editor.defineTheme('fcc-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '67707d', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'd97a55' },
    { token: 'string', foreground: '9fce8e' },
    { token: 'number', foreground: 'e2b86b' },
    { token: 'type', foreground: '7fb3d5' },
    { token: 'identifier', foreground: 'e4e7ec' },
    { token: 'delimiter', foreground: 'a0a8b4' },
    { token: 'tag', foreground: 'd97a55' },
    { token: 'attribute.name', foreground: '7fb3d5' },
    { token: 'attribute.value', foreground: '9fce8e' },
    { token: 'metatag', foreground: 'd97a55' }
  ],
  colors: {
    'editor.background': '#0e1013',
    'editor.foreground': '#e4e7ec',
    'editor.lineHighlightBackground': '#161a1f',
    'editor.selectionBackground': 'rgba(108, 140, 255, 0.28)',
    'editor.inactiveSelectionBackground': 'rgba(108, 140, 255, 0.12)',
    'editorCursor.foreground': '#d97a55',
    'editorLineNumber.foreground': '#3d444f',
    'editorLineNumber.activeForeground': '#a0a8b4',
    'editorIndentGuide.background1': '#1e2229',
    'editorIndentGuide.activeBackground1': '#3d444f',
    'editorBracketMatch.border': '#d97a55',
    'editorBracketMatch.background': 'rgba(217, 122, 85, 0.15)',
    'editorWidget.background': '#14171c',
    'editorWidget.border': '#262b34',
    'editorSuggestWidget.background': '#14171c',
    'editorSuggestWidget.border': '#262b34',
    'editorSuggestWidget.selectedBackground': '#22262e',
    'editorHoverWidget.background': '#14171c',
    'editorHoverWidget.border': '#262b34',
    'editorError.foreground': '#e06c5a',
    'editorWarning.foreground': '#d9a44e',
    'editorGutter.background': '#0e1013',
    'scrollbarSlider.background': 'rgba(255, 255, 255, 0.10)',
    'scrollbarSlider.hoverBackground': 'rgba(255, 255, 255, 0.18)',
    'scrollbarSlider.activeBackground': 'rgba(255, 255, 255, 0.25)'
  }
});

monaco.editor.defineTheme('fcc-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: 'a1968b', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c9643c' },
    { token: 'string', foreground: '3d9a6f' },
    { token: 'number', foreground: 'b98a2e' },
    { token: 'type', foreground: '4f6fdd' },
    { token: 'identifier', foreground: '2c2621' },
    { token: 'delimiter', foreground: '6f665d' },
    { token: 'tag', foreground: 'c9643c' },
    { token: 'attribute.name', foreground: '4f6fdd' },
    { token: 'attribute.value', foreground: '3d9a6f' },
    { token: 'metatag', foreground: 'c9643c' }
  ],
  colors: {
    'editor.background': '#faf8f6',
    'editor.foreground': '#2c2621',
    'editor.lineHighlightBackground': '#f4f0ec',
    'editor.selectionBackground': 'rgba(79, 111, 221, 0.18)',
    'editor.inactiveSelectionBackground': 'rgba(79, 111, 221, 0.08)',
    'editorCursor.foreground': '#c9643c',
    'editorLineNumber.foreground': '#cfc6bb',
    'editorLineNumber.activeForeground': '#6f665d',
    'editorIndentGuide.background1': '#eae4de',
    'editorIndentGuide.activeBackground1': '#a1968b',
    'editorBracketMatch.border': '#c9643c',
    'editorBracketMatch.background': 'rgba(201, 100, 60, 0.15)',
    'editorWidget.background': '#f4f0ec',
    'editorWidget.border': '#ddd4cb',
    'editorSuggestWidget.background': '#f4f0ec',
    'editorSuggestWidget.border': '#ddd4cb',
    'editorSuggestWidget.selectedBackground': '#e1dad3',
    'editorHoverWidget.background': '#f4f0ec',
    'editorHoverWidget.border': '#ddd4cb',
    'editorError.foreground': '#d85c48',
    'editorWarning.foreground': '#b98a2e',
    'editorGutter.background': '#faf8f6',
    'scrollbarSlider.background': 'rgba(60, 45, 30, 0.18)',
    'scrollbarSlider.hoverBackground': 'rgba(60, 45, 30, 0.30)',
    'scrollbarSlider.activeBackground': 'rgba(60, 45, 30, 0.42)'
  }
});
