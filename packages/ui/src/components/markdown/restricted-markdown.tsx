import * as React from 'react';

import { cn } from '@booking/ui/lib/utils';

/**
 * Renders a deliberately restricted subset of Markdown as React elements —
 * never `dangerouslySetInnerHTML`. Injection is impossible by construction:
 * every character that isn't recognized as one of the supported constructs
 * below is emitted as a plain React text node (auto-escaped by React), and
 * links are only ever emitted for `http`/`https` URLs.
 *
 * Supported syntax, exactly this and nothing more:
 * - ATX headings `#`, `##`, `###` — rendered as `<h2>`/`<h3>`/`<h4>`, one level
 *   below their `#` count. Every page that embeds this renderer already owns
 *   its own `<h1>` for the document/entity title (see
 *   `legal-document-page.tsx`), so an authored body must not introduce a
 *   second one.
 * - paragraphs, separated by blank lines
 * - unordered lists (`- item`)
 * - ordered lists (`1. item`)
 * - `**bold**`, `*italic*`
 * - `[text](url)`, only when `url` starts with `http://` or `https://`
 *
 * Everything else — raw HTML tags, image syntax (`![alt](url)`), unsupported
 * link schemes (`javascript:`, `data:`, protocol-relative `//…`), unbalanced
 * `*`/`**` markers — degrades to literal text. There is no dependency here on
 * purpose: no markdown/sanitizer library is importable from this package (see
 * `packages/ui/CLAUDE.md`), and this renderer sidesteps the need for one.
 */

type RestrictedMarkdownBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'unordered-list'; items: string[] }
  | { kind: 'ordered-list'; items: string[] };

const HEADING_PATTERN = /^(#{1,3})\s+(.*)$/;
const UNORDERED_ITEM_PATTERN = /^-\s+(.*)$/;
const ORDERED_ITEM_PATTERN = /^\d+\.\s+(.*)$/;

/** Whether a line opens/continues one of the recognized block types. */
function isBlockBoundaryLine(line: string): boolean {
  return (
    line === '' ||
    HEADING_PATTERN.test(line) ||
    UNORDERED_ITEM_PATTERN.test(line) ||
    ORDERED_ITEM_PATTERN.test(line)
  );
}

/**
 * Splits source text into blocks on blank lines, ATX heading lines, and runs
 * of `-`/`1.` list items. Every line is trimmed first — leading/trailing
 * whitespace carries no meaning in this restricted grammar.
 */
function parseBlocks(source: string): RestrictedMarkdownBlock[] {
  const lines = source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim());
  const blocks: RestrictedMarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line === '') {
      i++;
      continue;
    }

    const heading = HEADING_PATTERN.exec(line);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length as 1 | 2 | 3,
        text: heading[2]!.trim(),
      });
      i++;
      continue;
    }

    if (UNORDERED_ITEM_PATTERN.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const match = UNORDERED_ITEM_PATTERN.exec(lines[i]!);
        if (!match) break;
        items.push(match[1]!.trim());
        i++;
      }
      blocks.push({ kind: 'unordered-list', items });
      continue;
    }

    if (ORDERED_ITEM_PATTERN.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const match = ORDERED_ITEM_PATTERN.exec(lines[i]!);
        if (!match) break;
        items.push(match[1]!.trim());
        i++;
      }
      blocks.push({ kind: 'ordered-list', items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length && !isBlockBoundaryLine(lines[i]!)) {
      paragraphLines.push(lines[i]!);
      i++;
    }
    blocks.push({ kind: 'paragraph', text: paragraphLines.join(' ') });
  }

  return blocks;
}

const SAFE_URL_PATTERN = /^https?:\/\//i;

/** Only `http://`/`https://` (case-insensitive) count as a link target. */
function isSafeHref(url: string): boolean {
  return SAFE_URL_PATTERN.test(url.trim());
}

/**
 * Inline scanner for `**bold**`, `*italic*`, and `[text](url)`. A single
 * alternation regex is used so the earliest-starting, first-listed-wins match
 * is picked at every position — that is what gives bold priority over italic
 * when both could start at the same `*`. The link alternative excludes a
 * leading `!` (negative lookbehind) so `![alt](url)` image syntax — which
 * this renderer does not support — is left untouched as literal text instead
 * of collapsing into a plain link.
 *
 * Every alternative requires a minimum of 3+ literal characters to match, so
 * no zero-length match (and therefore no infinite loop) is possible.
 */
function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|(?<!!)\[([^\]]*)\]\(([^)]*)\)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let matchCount = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const fullMatch = match[0]!;
    const boldText = match[1];
    const italicText = match[2];
    const linkText = match[3];
    const linkUrl = match[4];

    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (boldText !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-${matchCount}`}>{boldText}</strong>);
    } else if (italicText !== undefined) {
      nodes.push(<em key={`${keyPrefix}-${matchCount}`}>{italicText}</em>);
    } else if (linkText !== undefined && linkUrl !== undefined && isSafeHref(linkUrl)) {
      nodes.push(
        <a
          key={`${keyPrefix}-${matchCount}`}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {linkText}
        </a>,
      );
    } else {
      // Link pattern matched but the scheme isn't http/https — render the
      // original markdown source verbatim as text, not as a link.
      nodes.push(fullMatch);
    }

    lastIndex = pattern.lastIndex;
    matchCount++;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderBlock(block: RestrictedMarkdownBlock, index: number): React.ReactNode {
  switch (block.kind) {
    case 'heading': {
      // Shifted one level below the `#` count (h1 is never emitted here): the
      // pages that embed this renderer already carry their own `<h1>` title,
      // so a `#` in the authored body must not collide with it.
      const key = `heading-${index}`;
      const content = parseInline(block.text, key);
      if (block.level === 1) {
        return (
          <h2 key={key} className="text-2xl font-semibold tracking-tight">
            {content}
          </h2>
        );
      }
      if (block.level === 2) {
        return (
          <h3 key={key} className="text-xl font-semibold tracking-tight">
            {content}
          </h3>
        );
      }
      return (
        <h4 key={key} className="text-lg font-semibold tracking-tight">
          {content}
        </h4>
      );
    }
    case 'paragraph': {
      const key = `paragraph-${index}`;
      return (
        <p key={key} className="text-sm leading-relaxed">
          {parseInline(block.text, key)}
        </p>
      );
    }
    case 'unordered-list': {
      const key = `ul-${index}`;
      return (
        <ul key={key} className="list-disc space-y-1 pl-6 text-sm leading-relaxed">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{parseInline(item, `${key}-${itemIndex}`)}</li>
          ))}
        </ul>
      );
    }
    case 'ordered-list': {
      const key = `ol-${index}`;
      return (
        <ol key={key} className="list-decimal space-y-1 pl-6 text-sm leading-relaxed">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{parseInline(item, `${key}-${itemIndex}`)}</li>
          ))}
        </ol>
      );
    }
  }
}

export interface RestrictedMarkdownProps {
  /** The raw Markdown-like source. Unsupported syntax renders as literal text. */
  source: string;
  className?: string;
}

/**
 * Renders `source` through the restricted grammar described above. Used by
 * both the dashboard's tenant legal-document author preview and the
 * storefront's public legal-document page, so both surfaces render the exact
 * same markup for the exact same source text.
 */
export function RestrictedMarkdown({
  source,
  className,
}: RestrictedMarkdownProps): React.JSX.Element {
  const blocks = React.useMemo(() => parseBlocks(source), [source]);

  return (
    <div className={cn('space-y-4', className)}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}
