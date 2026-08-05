import { memo, useEffect, useMemo, useState, type MouseEvent } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeHighlight from 'rehype-highlight';
import { useExplorerStore } from '../stores/explorer-store';
import { resolveHref } from '../markdown/resolve';

// Full GFM/math markdown renderer (react-markdown). Shared by the .md file
// preview, chat messages, subagent output, and help — the plan is "as complete
// as VSCode". `highlight` is preview-only (chat streams text chunk-by-chunk and
// doesn't need per-token colors). Links/images are resolved against the current
// file's directory (basePath) or the open-folder root (chat).

/** Load a relative repo image from disk as a data URI via IPC — the sandboxed
 *  renderer can't read file:// under the http dev scheme. Cached per path. */
const assetCache = new Map<string, string>();

function AssetImage({ path, alt }: { path: string; alt?: string }) {
  const [src, setSrc] = useState<string | null>(() => assetCache.get(path) ?? null);
  useEffect(() => {
    if (assetCache.has(path)) {
      setSrc(assetCache.get(path)!);
      return;
    }
    let cancelled = false;
    void window.fcc.readAsset(path).then((d) => {
      if (cancelled || !d) return;
      assetCache.set(path, d);
      setSrc(d);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (!src) return null; // loading or missing — nothing until the bytes arrive
  return <img src={src} alt={alt ?? ''} />;
}

const HTTP_SCHEME = /^(https?):/i;

export default memo(function Markdown({
  text,
  basePath,
  highlight
}: {
  text: string;
  basePath?: string;
  /** syntax-highlight fenced code (preview only — off for streaming chat). */
  highlight?: boolean;
}): React.ReactElement {
  const root = useExplorerStore((s) => s.root);

  const components = useMemo<Components>(() => {
    const openRepo = (absPath: string): void =>
      void window.dispatchEvent(new CustomEvent('fcc:open-file', { detail: absPath }));
    return {
      a({ href, children, node: _node, ...rest }) {
        const action = href ? resolveHref(href, { basePath, root }) : null;
        const onClick = (e: MouseEvent<HTMLAnchorElement>): void => {
          if (!action) return;
          e.preventDefault();
          if (action.kind === 'external') void window.fcc.openExternal(action.url);
          else if (action.kind === 'anchor') {
            document.getElementById(action.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else if (action.kind === 'repo') {
            openRepo(action.absPath);
          }
        };
        return (
          <a {...rest} href={href} onClick={onClick}>
            {children}
          </a>
        );
      },
      img({ src, alt, node: _node, ...rest }) {
        const action = src ? resolveHref(src, { basePath, root }) : null;
        if (action?.kind === 'repo') return <AssetImage path={action.absPath} alt={alt} />;
        // http(s) images and embedded data: URIs render directly.
        if (action?.kind === 'data' || (action?.kind === 'external' && !!src && HTTP_SCHEME.test(src))) {
          return <img {...rest} src={src} alt={alt ?? ''} />;
        }
        return <span className="md-img-missing">🖼 {alt ?? src ?? 'image'}</span>;
      }
    };
  }, [basePath, root]);

  const html = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeSlug, rehypeAutolinkHeadings, ...(highlight ? [rehypeHighlight] : [])]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    ),
    [text, components, highlight]
  );

  return <div className="fcc-md">{html}</div>;
});