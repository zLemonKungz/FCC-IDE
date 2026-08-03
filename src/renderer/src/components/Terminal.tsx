import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useExplorerStore } from '../stores/explorer-store';
import { useLayoutStore, LAYOUT } from '../stores/layout-store';
import DragHandle from './DragHandle';
import { IconClose, IconPlay, IconTerminal } from './icons';

type TermPalette = NonNullable<ConstructorParameters<typeof XTerm>[0]>['theme'];

const TERM_COLORS: Record<'dark' | 'light', TermPalette> = {
  dark: {
    background: '#0e1013',
    foreground: '#e4e7ec',
    cursor: '#d97a55',
    cursorAccent: '#0e1013',
    selectionBackground: 'rgba(108, 140, 255, 0.3)',
    black: '#262b34',
    red: '#e06c5a',
    green: '#9fce8e',
    yellow: '#e2b86b',
    blue: '#7fb3d5',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#a0a8b4',
    brightBlack: '#3d444f',
    brightRed: '#e06c5a',
    brightGreen: '#9fce8e',
    brightYellow: '#e2b86b',
    brightBlue: '#7fb3d5',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#e4e7ec'
  },
  light: {
    background: '#faf8f6',
    foreground: '#2c2621',
    cursor: '#c9643c',
    cursorAccent: '#faf8f6',
    selectionBackground: 'rgba(79, 111, 221, 0.3)',
    black: '#cfc6bb',
    red: '#d85c48',
    green: '#3d9a6f',
    yellow: '#b98a2e',
    blue: '#4f6fdd',
    magenta: '#a55db8',
    cyan: '#3d8f9c',
    white: '#6f665d',
    brightBlack: '#a1968b',
    brightRed: '#d85c48',
    brightGreen: '#3d9a6f',
    brightYellow: '#b98a2e',
    brightBlue: '#4f6fdd',
    brightMagenta: '#a55db8',
    brightCyan: '#3d8f9c',
    brightWhite: '#2c2621'
  }
};

export default function TerminalPane({
  height,
  onResize
}: {
  height: number;
  onResize: (px: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const idRef = useRef<number | null>(null);
  const root = useExplorerStore((s) => s.root);
  const visible = useLayoutStore((s) => s.terminalVisible);
  const toggleTerminal = useLayoutStore((s) => s.toggleTerminal);
  const theme = useLayoutStore((s) => s.theme);

  useEffect(() => {
    if (!ref.current) return;
    const term = new XTerm({
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      theme: TERM_COLORS[theme]
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(ref.current);
    try {
      fit.fit();
    } catch {
      // fit can throw if the element has zero size during layout — ignore, next resize fixes it
    }

    const cwd = root ?? '';
    window.fcc
      .termCreate(cwd)
      .then((id) => {
        idRef.current = id;
        window.fcc.onTermData(id, (data) => term.write(data));
      })
      .catch((err: Error) => {
        term.write(`\r\n[terminal error] ${err.message}\r\n`);
      });

    term.onData((data) => {
      if (idRef.current !== null) window.fcc.termData(idRef.current, data);
    });

    const onResize = () => {
      try {
        fit.fit();
      } catch {
        return;
      }
      if (idRef.current !== null) window.fcc.termResize(idRef.current, term.cols, term.rows);
    };
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      if (idRef.current !== null) window.fcc.termDispose(idRef.current);
      termRef.current = null;
      term.dispose();
    };
  }, [root]);

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = TERM_COLORS[theme];
  }, [theme]);

  return (
    <div
      className={`terminal-pane ${visible ? '' : 'collapsed'}`}
      style={{ height: visible ? height : 30 }}
    >
      <div className="term-strip" onClick={toggleTerminal} title="Show terminal (Ctrl+`)">
        <IconTerminal width={13} height={13} />
        Terminal
      </div>
      {visible && (
        <>
          <DragHandle
            orientation="horizontal"
            value={height}
            min={LAYOUT.TERM_MIN}
            max={LAYOUT.TERM_MAX}
            defaultValue={LAYOUT.TERM_DEFAULT}
            onChange={onResize}
          />
          <div className="term-header">
            <span className="title">
              <IconTerminal width={13} height={13} />
              Terminal
            </span>
            <span className="term-actions">
              <button title="Clear terminal" onClick={() => termRef.current?.clear()}>
                <IconClose width={12} height={12} />
              </button>
              <button
                onClick={() => {
                  if (idRef.current !== null) window.fcc.termData(idRef.current, 'fcc-claude\r');
                }}
              >
                <IconPlay width={12} height={12} />
                Run fcc-claude
              </button>
            </span>
          </div>
        </>
      )}
      {/* Always mounted so toggling visibility preserves the session; CSS hides it when collapsed */}
      <div ref={ref} className="term-body" />
    </div>
  );
}
