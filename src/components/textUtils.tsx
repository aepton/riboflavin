import { THREAD_COLORS, type HighlightRange } from "../store/documentStore";

/**
 * Walk the text nodes inside a container to get the absolute character offset
 * for a given (node, offset) pair from the Selection API.
 */
export function absOffset(
  container: HTMLElement,
  node: Node,
  nodeOffset: number
): number {
  let pos = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let cur: Node | null;
  while ((cur = walker.nextNode()) !== null) {
    if (cur === node) return pos + nodeOffset;
    pos += cur.textContent?.length ?? 0;
  }
  return pos;
}

/**
 * Render text with colored <mark> spans over persisted highlight ranges.
 */
export function HighlightedContent({
  content,
  highlights,
}: {
  content: string;
  highlights: HighlightRange[];
}) {
  if (!highlights || highlights.length === 0) return <>{content}</>;

  const sorted = [...highlights].sort((a, b) => a.startIdx - b.startIdx);
  const parts: React.ReactNode[] = [];
  let pos = 0;

  for (const h of sorted) {
    if (h.startIdx > pos) {
      parts.push(<span key={`t-${pos}`}>{content.slice(pos, h.startIdx)}</span>);
    }
    const color = THREAD_COLORS[h.colorIndex % THREAD_COLORS.length];
    parts.push(
      <mark
        key={`h-${h.startIdx}`}
        style={{
          background: color.light,
          color: "inherit",
          borderRadius: "2px",
          padding: "1px 0",
          borderBottom: `2px solid ${color.border}`,
        }}
      >
        {content.slice(h.startIdx, h.endIdx)}
      </mark>
    );
    pos = Math.max(pos, h.endIdx);
  }

  if (pos < content.length) {
    parts.push(<span key={`t-${pos}`}>{content.slice(pos)}</span>);
  }

  return <>{parts}</>;
}
