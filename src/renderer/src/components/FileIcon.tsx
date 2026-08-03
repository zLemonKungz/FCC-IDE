import type { SVGProps } from 'react';

// Per-extension spine colors, Material-Icon-Theme style but tuned to the warm-dark palette.
const EXT_COLORS: Record<string, string> = {
  ts: '#4f9fdc', tsx: '#4f9fdc', mts: '#4f9fdc', cts: '#4f9fdc',
  js: '#d9c26b', jsx: '#d9c26b', mjs: '#d9c26b', cjs: '#d9c26b',
  json: '#d9a44e',
  css: '#8a7ff0', scss: '#c26db0', less: '#5aa7c9',
  html: '#e06c5a', htm: '#e06c5a',
  md: '#9fb0c8', txt: '#9fb0c8',
  py: '#4caf7d',
  rs: '#d97a55',
  go: '#3db6d9',
  java: '#d9a44e',
  c: '#6b93b8', h: '#6b93b8', cpp: '#6b93b8', hpp: '#6b93b8',
  sh: '#9fce8e', bat: '#9fce8e', ps1: '#9fce8e', cmd: '#9fce8e',
  yml: '#d9a44e', yaml: '#d9a44e', toml: '#d9a44e', ini: '#d9a44e',
  svg: '#e2b86b', png: '#e2b86b', jpg: '#e2b86b', jpeg: '#e2b86b', ico: '#e2b86b', gif: '#e2b86b', webp: '#e2b86b',
  lock: '#67707d', gitignore: '#67707d', env: '#67707d', npmrc: '#67707d'
};

function extOf(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
}

// Document glyph with a colored left spine — reads as a typed file in the tree and tabs.
export default function FileIcon({
  name,
  width = 13,
  height = 15,
  ...rest
}: { name: string; width?: number; height?: number } & SVGProps<SVGSVGElement>) {
  const color = EXT_COLORS[extOf(name)] ?? 'var(--text-3)';
  return (
    <svg width={width} height={height} viewBox="0 0 16 20" aria-hidden="true" {...rest}>
      <path
        d="M3 1.5h6.5l4 4V17.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z"
        style={{ fill: 'var(--bg-2)', stroke: 'var(--text-4)' }}
        strokeWidth="1"
      />
      <path d="M9.5 1.5v4h4z" style={{ fill: 'var(--bg-0)', stroke: 'var(--text-4)' }} strokeWidth="1" />
      <rect x="2.2" y="3" width="1.8" height="14" rx="0.9" style={{ fill: color }} />
    </svg>
  );
}
