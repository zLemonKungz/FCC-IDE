import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useExplorerStore } from '../stores/explorer-store';
import { useLayoutStore, LAYOUT } from '../stores/layout-store';
import DragHandle from './DragHandle';
import { IconChevronDown, IconChevronRight, IconClose, IconPlay, IconTrash } from './icons';

type TermPalette = NonNullable<ConstructorParameters<typeof XTerm>[0]>['theme'];

// Rough error indicators — when the recent output matches, the tab offers a
// "Fix" button that sends the captured output to the chat.
const ERROR_RE = /\b(error|failed|failure|exception|Traceback|fatal|SyntaxError|TypeError|ReferenceError|command not found)\b/i;

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

interface TermTab {
  id: number; // = the pty id from termCreate
  title: string;
}

// One terminal session, owned by its XTerm instance. Always mounted (the pane
// CSS hides inactive/collapsed bodies) so sessions survive tab switches.
function TerminalTab({
  id,
  cwd,
  theme,
  active,
  visible,
  register
}: {
  id: number;
  cwd: string;
  theme: 'dark' | 'light';
  active: boolean;
  /** the whole pane is visible — refit when it comes back from display:none */
  visible: boolean;
  register: (id: number, term: XTerm | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyRef = useRef<number | null>(null);
  const offRef = useRef<() => void>(() => {});
  const [errorDetected, setErrorDetected] = useState(false);
  const errorShownRef = useRef(false);
  const tailRef = useRef('');

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
    fitRef.current = fit;
    term.loadAddon(fit);
    term.open(ref.current);
    try {
      fit.fit();
    } catch {
      // fit can throw if the element has zero size during layout — ignore, next resize fixes it
    }
    register(id, term);

    // cwd is captured at creation — each tab keeps the folder it was opened in.
    void window.fcc
      .termCreate(cwd)
      .then((tid) => {
        ptyRef.current = tid;
        offRef.current = window.fcc.onTermData(tid, (data) => {
          term.write(data);
          tailRef.current = (tailRef.current + data).slice(-2000);
          if (!errorShownRef.current && ERROR_RE.test(tailRef.current)) {
            errorShownRef.current = true;
            setErrorDetected(true);
          }
        });
      })
      .catch((err: Error) => {
        term.write(`\r\n[terminal error] ${err.message}\r\n`);
      });

    const offInput = term.onData((data) => {
      if (ptyRef.current !== null) window.fcc.termData(ptyRef.current, data);
    });

    const fitNow = () => {
      try {
        fit.fit();
      } catch {
        return;
      }
      if (ptyRef.current !== null) window.fcc.termResize(ptyRef.current, term.cols, term.rows);
    };
    window.addEventListener('resize', fitNow);
    const ro = new ResizeObserver(fitNow);
    ro.observe(ref.current);

    return () => {
      offInput.dispose();
      offRef.current();
      ro.disconnect();
      window.removeEventListener('resize', fitNow);
      if (ptyRef.current !== null) window.fcc.termDispose(ptyRef.current);
      register(id, null);
      termRef.current = null;
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = TERM_COLORS[theme];
  }, [theme]);

  // Becoming visible (tab switch / pane re-opened) — refit since the box was
  // hidden (display:none gives a zero-size element that fit() can't use).
  useEffect(() => {
    if (!active || !visible) return;
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch {
        return;
      }
      if (ptyRef.current !== null && termRef.current) {
        window.fcc.termResize(ptyRef.current, termRef.current.cols, termRef.current.rows);
      }
    });
  }, [active, visible]);

  const onFix = async (): Promise<void> => {
    errorShownRef.current = false;
    setErrorDetected(false);
    const out = await window.fcc.termRecent(id).catch(() => '');
    window.dispatchEvent(new CustomEvent('fcc:ai-fix', { detail: { output: out } }));
  };

  return (
    <div className="term-slot">
      <div ref={ref} className={`term-body${active ? '' : ' tab-inactive'}`} />
      {errorDetected && (
        <button
          className="term-fix"
          onClick={() => void onFix()}
          title="Review this error in chat"
          aria-label="Review this error in chat"
        >
          ⚡ Fix
        </button>
      )}
    </div>
  );
}

export default function TerminalPane({ position }: { position: 'bottom' | 'right' }) {
  const root = useExplorerStore((s) => s.root);
  const visible = useLayoutStore((s) => s.terminalVisible);
  const height = useLayoutStore((s) => s.terminalHeight);
  const toggleTerminal = useLayoutStore((s) => s.toggleTerminal);
  const setTerminalPosition = useLayoutStore((s) => s.setTerminalPosition);
  const setHeight = useLayoutStore((s) => s.setTerminalHeight);
  const theme = useLayoutStore((s) => s.theme);
  const [tabs, setTabs] = useState<TermTab[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const seqRef = useRef(1);
  const termMap = useRef(new Map<number, XTerm>());

  const addTerminal = (cwd = root ?? ''): void => {
    void window.fcc
      .termCreate(cwd)
      .then((id) => {
        setTabs((t) => [...t, { id, title: `Terminal ${seqRef.current++}` }]);
        setActiveId(id);
      })
      .catch(() => undefined);
  };

  // Start with one terminal, matching the pre-multi-terminal behavior.
  useEffect(() => {
    if (tabs.length === 0) addTerminal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The titlebar menu bar's Terminal menu drives these (New/Clear/Run).
  useEffect(() => {
    const onNew = () => addTerminal();
    const onClear = () => termMap.current.get(activeId ?? -1)?.clear();
    const onRun = () => {
      if (activeId !== null) window.fcc.termData(activeId, 'fcc-claude\r');
    };
    window.addEventListener('fcc:term-new', onNew);
    window.addEventListener('fcc:term-clear', onClear);
    window.addEventListener('fcc:term-run', onRun);
    return () => {
      window.removeEventListener('fcc:term-new', onNew);
      window.removeEventListener('fcc:term-clear', onClear);
      window.removeEventListener('fcc:term-run', onRun);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const closeTab = (id: number): void => {
    setTabs((t) => {
      if (t.length === 1) return t; // never close the last terminal
      void window.fcc.termDispose(id);
      const next = t.filter((x) => x.id !== id);
      if (activeId === id) setActiveId(next[next.length - 1].id);
      return next;
    });
  };

  const register = (id: number, term: XTerm | null): void => {
    if (term) termMap.current.set(id, term);
    else termMap.current.delete(id);
  };

  return (
    <div className={`terminal-pane ${position}${visible ? '' : ' hidden'}`} style={{ height }}>
      {visible && (
        <>
          <DragHandle
            orientation="horizontal"
            value={height}
            min={LAYOUT.TERM_MIN}
            max={LAYOUT.TERM_MAX}
            defaultValue={LAYOUT.TERM_DEFAULT}
            onChange={setHeight}
            invert
          />
          <div className="term-header">
            <div className="term-tabs">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  className={`term-tab${t.id === activeId ? ' active' : ''}`}
                  onClick={() => setActiveId(t.id)}
                  title={t.title}
                >
                  {t.title}
                  {tabs.length > 1 && (
                    <span
                      className="term-tab-x"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(t.id);
                      }}
                      title="Close terminal"
                    >
                      ✕
                    </span>
                  )}
                </button>
              ))}
              <button className="term-tab add" onClick={() => addTerminal()} title="New terminal">
                +
              </button>
            </div>
            <span className="term-actions">
              <button
                title={
                  position === 'bottom' ? 'Move terminal to the right side' : 'Move terminal to the bottom'
                }
                onClick={() => setTerminalPosition(position === 'bottom' ? 'right' : 'bottom')}
              >
                {position === 'bottom' ? (
                  <IconChevronRight width={12} height={12} />
                ) : (
                  <IconChevronDown width={12} height={12} />
                )}
              </button>
              <button title="Clear terminal" onClick={() => termMap.current.get(activeId ?? -1)?.clear()}>
                <IconTrash width={12} height={12} />
              </button>
              <button onClick={() => activeId !== null && window.fcc.termData(activeId, 'fcc-claude\r')}>
                <IconPlay width={12} height={12} />
                Run fcc-claude
              </button>
              <button title="Hide terminal (Ctrl+`)" onClick={toggleTerminal}>
                <IconClose width={12} height={12} />
              </button>
            </span>
          </div>
        </>
      )}
      {tabs.map((t) => (
        <TerminalTab
          key={t.id}
          id={t.id}
          cwd={root ?? ''}
          theme={theme}
          active={t.id === activeId}
          visible={visible}
          register={register}
        />
      ))}
    </div>
  );
}
