// Language mapping for the Monaco editor. Pure module (no monaco/react imports)
// so the extension→language logic is unit-testable in vitest. The curated
// EXT_LANG list is the source of truth for ambiguous extensions; monaco's own
// registry (see mergeMonacoLanguages) fills in every other grammar Monaco ships.

export interface MonacoLangInfo {
  id: string;
  extensions?: string[];
  filenames?: string[];
}

export const EXT_LANG: Record<string, string> = {
  // web
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  html: 'html',
  htm: 'html',
  vue: 'vue',
  svelte: 'svelte',
  svg: 'html',
  xml: 'xml',
  xhtml: 'xml',
  xslt: 'xml',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  styl: 'css',
  // scripting
  py: 'python',
  pyw: 'python',
  rb: 'ruby',
  php: 'php',
  phtml: 'php',
  pl: 'perl',
  pm: 'perl',
  lua: 'lua',
  r: 'r',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ksh: 'shell',
  ps1: 'powershell',
  psm1: 'powershell',
  psd1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  // compiled / system
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  go: 'go',
  rs: 'rust',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  cs: 'csharp',
  csx: 'csharp',
  m: 'objective-c',
  mm: 'objective-c',
  dart: 'dart',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hrl: 'erlang',
  hs: 'haskell',
  lhs: 'haskell',
  clj: 'clojure',
  cljs: 'clojure',
  scala: 'scala',
  groovy: 'groovy',
  vb: 'vb',
  fs: 'fsharp',
  fsx: 'fsharp',
  // data / config
  sql: 'sql',
  mysql: 'mysql',
  pgsql: 'pgsql',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  conf: 'ini',
  proto: 'protobuf',
  graphql: 'graphql',
  gql: 'graphql',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'mdx',
  twig: 'twig',
  liquid: 'liquid',
  handlebars: 'handlebars',
  hbs: 'handlebars',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  tex: 'latex',
  rst: 'plaintext',
  txt: 'plaintext',
  log: 'plaintext',
  csv: 'plaintext'
};

/** Fold Monaco's own language registry into the curated map: for every language
 *  that isn't already pinned by EXT_LANG, add its extensions and filenames. The
 *  curated entries win on ambiguity (e.g. `.h` → c, `.pl` → perl). */
export function mergeMonacoLanguages(base: Record<string, string>, langs: MonacoLangInfo[]): Record<string, string> {
  const map: Record<string, string> = { ...base };
  for (const lang of langs) {
    for (const ext of lang.extensions ?? []) {
      const key = ext.replace(/^\./, '').toLowerCase();
      if (key && !(key in map)) map[key] = lang.id;
    }
    for (const name of lang.filenames ?? []) {
      const key = name.toLowerCase();
      if (key && !(key in map)) map[key] = lang.id;
    }
  }
  return map;
}

/** Monaco language id for a file path given an extension→id map (falls back to
 *  the curated map). Files like "Dockerfile"/"Makefile" (no dot) split to their
 *  full lowercase name as the "extension". Unknown → plaintext. */
export function langFor(p: string, map: Record<string, string> = EXT_LANG): string {
  const ext = p.split('.').pop()?.toLowerCase() ?? '';
  return map[ext] ?? 'plaintext';
}