import React from 'react';

/**
 * Lightweight markdown renderer for chat messages.
 * Handles: paragraphs, headings, lists, bold/italic/code, links, code blocks.
 * No external deps. Output is React nodes, safe from raw HTML injection.
 */

type Block =
  | { type: 'h'; level: 1 | 2 | 3; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'pre'; code: string; lang?: string }
  | { type: 'p'; text: string };

function tokenize(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let currentPara: string[] = [];

  const flushPara = () => {
    if (currentPara.length === 0) return;
    blocks.push({ type: 'p', text: currentPara.join('\n').trim() });
    currentPara = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (/^```/.test(line)) {
      flushPara();
      const lang = line.slice(3).trim() || undefined;
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'pre', code: buf.join('\n'), lang });
      i++;
      continue;
    }

    // Heading
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      blocks.push({ type: 'h', level: h[1].length as 1 | 2 | 3, text: h[2].trim() });
      i++;
      continue;
    }

    // Bullet list
    if (/^\s*[-*+]\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Blank line = paragraph break
    if (line.trim() === '') {
      flushPara();
      i++;
      continue;
    }

    currentPara.push(line);
    i++;
  }
  flushPara();
  return blocks;
}

/** Inline-render bold, italic, code, links. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0;
  let buf = '';
  let counter = 0;
  const push = (node: React.ReactNode) => {
    if (buf) { out.push(buf); buf = ''; }
    out.push(node);
  };
  const flushBuf = () => { if (buf) { out.push(buf); buf = ''; } };

  while (i < text.length) {
    // Bold ** **
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      if (end > i) {
        push(<strong key={`${keyPrefix}-b-${counter++}`}>{renderInline(text.slice(i + 2, end), `${keyPrefix}-b-${counter}`)}</strong>);
        i = end + 2;
        continue;
      }
    }

    // Bold __ __
    if (text.startsWith('__', i)) {
      const end = text.indexOf('__', i + 2);
      if (end > i) {
        push(<strong key={`${keyPrefix}-B-${counter++}`}>{renderInline(text.slice(i + 2, end), `${keyPrefix}-B-${counter}`)}</strong>);
        i = end + 2;
        continue;
      }
    }

    // Inline code `
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) {
        push(<code key={`${keyPrefix}-c-${counter++}`} className="bg-canvas/60 text-brand px-1 py-px rounded text-[12px] font-mono">{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }

    // Italic single * (avoid matching list markers)
    if (text[i] === '*' && text[i - 1] !== '*' && text[i + 1] !== '*' && text[i + 1] !== ' ') {
      const end = text.indexOf('*', i + 1);
      if (end > i && text[end + 1] !== '*' && text[end - 1] !== ' ') {
        push(<em key={`${keyPrefix}-i-${counter++}`}>{text.slice(i + 1, end)}</em>);
        i = end + 1;
        continue;
      }
    }

    // Italic _ _
    if (text[i] === '_' && text[i - 1] !== '_' && text[i + 1] !== '_' && text[i + 1] !== ' ' &&
        (i === 0 || /\s|\W/.test(text[i - 1]))) {
      const end = text.indexOf('_', i + 1);
      if (end > i && text[end + 1] !== '_') {
        push(<em key={`${keyPrefix}-I-${counter++}`}>{text.slice(i + 1, end)}</em>);
        i = end + 1;
        continue;
      }
    }

    // Link [text](url)
    if (text[i] === '[') {
      const close = text.indexOf(']', i + 1);
      if (close > i && text[close + 1] === '(') {
        const urlEnd = text.indexOf(')', close + 2);
        if (urlEnd > close) {
          const label = text.slice(i + 1, close);
          const url = text.slice(close + 2, urlEnd);
          push(
            <a
              key={`${keyPrefix}-a-${counter++}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline"
            >
              {label}
            </a>,
          );
          i = urlEnd + 1;
          continue;
        }
      }
    }

    buf += text[i];
    i++;
  }
  flushBuf();
  return out;
}

export function renderMarkdownLite(src: string, opts?: { className?: string }): React.ReactNode {
  if (!src) return null;
  const blocks = tokenize(src);
  return (
    <div className={opts?.className || 'space-y-1.5'}>
      {blocks.map((b, idx) => {
        const k = `b${idx}`;
        switch (b.type) {
          case 'h':
            return React.createElement(
              `h${b.level}`,
              {
                key: k,
                className: b.level === 1
                  ? 'text-base font-bold text-fg mt-2'
                  : b.level === 2
                    ? 'text-sm font-bold text-fg mt-1.5'
                    : 'text-xs font-semibold text-fg mt-1',
              },
              renderInline(b.text, k),
            );
          case 'ul':
            return (
              <ul key={k} className="list-disc list-outside pl-5 space-y-0.5">
                {b.items.map((it, j) => (
                  <li key={`${k}-${j}`}>{renderInline(it, `${k}-${j}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={k} className="list-decimal list-outside pl-5 space-y-0.5">
                {b.items.map((it, j) => (
                  <li key={`${k}-${j}`}>{renderInline(it, `${k}-${j}`)}</li>
                ))}
              </ol>
            );
          case 'pre':
            return (
              <pre key={k} className="bg-canvas/60 border border-line/60 rounded px-2 py-1.5 text-[11px] font-mono overflow-x-auto">
                <code>{b.code}</code>
              </pre>
            );
          case 'p':
          default:
            return (
              <p key={k} className="whitespace-pre-wrap break-words leading-relaxed">
                {renderInline(b.text, k)}
              </p>
            );
        }
      })}
    </div>
  );
}
