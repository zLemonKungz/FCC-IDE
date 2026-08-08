import { useEffect, useRef, useState } from 'react';
import { useExplorerStore } from '../stores/explorer-store';
import type { SearchHit } from '@shared/types';
import { IconSearch } from './icons';

// Find-in-files (Ctrl+Shift+F). Content search runs in main (fs:search-content,
// capped + binary-skipped); results load into local state and clicking a hit
// opens the file and reveals the line via the 'fcc:reveal' event.
function revealFile(path: string, line: number): void {
  window.dispatchEvent(new CustomEvent('fcc:reveal', { detail: { path, line } }));
}

export default function SearchPanel() {
  const root = useExplorerStore((s) => s.root);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced auto-search on typing.
  useEffect(() => {
    if (!root) return;
    const q = query.trim();
    if (!q) {
      setResults(null);
      setSearching(false);
      setError(false);
      return;
    }
    setSearching(true);
    setError(false);
    const t = window.setTimeout(() => {
      void window.fcc
        .fsSearchContent(q)
        .then((hits) => {
          setResults(hits);
          setSearching(false);
        })
        .catch(() => {
          // A failed search is an error, not "no matches".
          setResults(null);
          setSearching(false);
          setError(true);
        });
    }, 400);
    return () => window.clearTimeout(t);
  }, [query, root]);

  return (
    <div className="search-panel">
      <div className="search-input-row">
        <IconSearch width={14} height={14} />
        <input
          ref={inputRef}
          value={query}
          placeholder={root ? 'Search files…' : 'Open a folder first'}
          disabled={!root}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!root && <div className="search-hint">Open a project folder to search its files.</div>}
      {error && <div className="search-hint">Search failed — try again.</div>}
      {searching && (
        <div className="search-hint">
          <span className="spinner" />
          Searching…
        </div>
      )}
      {!error && results !== null && !searching && (
        <>
          <div className="search-summary">
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </div>
          <div className="search-results">
            {results.length === 0 && <div className="search-hint">No matches.</div>}
            {results.map((r, i) => (
              <button key={`${r.path}:${r.line}:${i}`} className="search-hit" onClick={() => revealFile(r.path, r.line)}>
                <span className="search-hit-path">
                  {r.relative}:{r.line}
                </span>
                <span className="search-hit-text">{r.text}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
