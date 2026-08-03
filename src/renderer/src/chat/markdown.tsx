import type { ReactNode } from 'react';

// Minimal, safe markdown renderer. Builds React elements only — no
// dangerouslySetInnerHTML — so untrusted model output can't inject HTML.
// Supports the common surface: paragraphs, # headers, **bold**, `code`,
// ``` fenced blocks ```, - / 1. lists, and [links](url). Everything else
// falls back to pre-wrap text.

// Token order matters: multi-char constructs first, then newline, then a
// plain run, then a single-char catch-all (so a lone `*`/`[` is kept, not
// swallowed or dropped).
const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]\n]+\]\([^)\s]+\)|\n|[^\n`*]+|.)/g;

function inline(text: string, key: number): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text)) !== null) {
    const tok = m[0];
    if (tok === '\n') {
      out.push(<br key={key + i} />);
      i++;
    } else if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 2) {
      out.push(
        <code className="md-code" key={key + i}>
          {tok.slice(1, -1)}
        </code>
      );
      i++;
    } else if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
      out.push(<strong key={key + i}>{tok.slice(2, -2)}</strong>);
      i++;
    } else if (tok.startsWith('[') && tok.includes('](')) {
      const close = tok.indexOf('](');
      const label = tok.slice(1, close);
      const url = tok.slice(close + 2, -1);
      out.push(
        <a key={key + i} href={url} target="_blank" rel="noreferrer">
          {label}
        </a>
      );
      i++;
    } else {
      out.push(tok);
    }
  }
  return out;
}

function block(text: string): ReactNode[] {
  const lines = text.split('\n');
  const nodes: ReactNode[] = [];
  let i = 0;
  let fence: string[] | null = null;
  let list: string[] | null = null;
  let ordered = false;

  const flushList = (key: number) => {
    if (!list) return;
    nodes.push(
      <div className="md-list" key={key}>
        {list.map((li, idx) => (
          <div className="md-li" key={idx}>
            <span className="md-bullet">{ordered ? `${idx + 1}.` : '•'}</span>
            <span className="md-li-text">{inline(li, idx * 1000)}</span>
          </div>
        ))}
      </div>
    );
    list = null;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (fence) {
      if (line.trim().startsWith('```')) {
        nodes.push(
          <pre className="md-pre" key={nodes.length}>
            <code>{fence.join('\n')}</code>
          </pre>
        );
        fence = null;
      } else {
        fence.push(line);
      }
      i++;
      continue;
    }

    if (line.trim().startsWith('```')) {
      flushList(nodes.length);
      fence = [];
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushList(nodes.length);
      const level = heading[1].length;
      const Tag = (['h1', 'h2', 'h3'] as const)[level - 1];
      nodes.push(
        <Tag className="md-heading" key={nodes.length}>
          {inline(heading[2], nodes.length)}
        </Tag>
      );
      i++;
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      if (!list) {
        list = [];
        ordered = !!ol;
      }
      list.push((ul ?? ol)![1]);
      i++;
      continue;
    }

    if (list) flushList(nodes.length);
    if (line.trim() === '') {
      i++;
      continue;
    }

    nodes.push(
      <p className="md-p" key={nodes.length}>
        {inline(line, nodes.length)}
      </p>
    );
    i++;
  }
  if (fence) {
    nodes.push(
      <pre className="md-pre" key={nodes.length}>
        <code>{fence.join('\n')}</code>
      </pre>
    );
  }
  flushList(nodes.length);
  return nodes;
}

export default function Markdown({ text }: { text: string }): ReactNode {
  return <>{block(text)}</>;
}
