import { memo, useRef, useCallback, useMemo, useEffect, useState } from "react";
import { Handle, Position } from "reactflow";
import { type HighlightRange, TEXT_ENTRY_WIDTH, PR_REVIEW_WIDTH, estimateTextEntryHeight } from "../store/documentStore";
import { absOffset, HighlightedContent } from "./textUtils";
import { NodeFrame } from "./NodeChrome";
import hljs, { SUPPORTED_LANGUAGES, ensureHljsTheme } from "./hljs";

export { SUPPORTED_LANGUAGES };

interface TextEntryNodeProps {
  data: {
    content: string;
    highlights?: HighlightRange[];
    dimmed?: boolean;
    currentNav?: boolean;
    author?: string;
    language?: string;
  };
  id: string;
}

const TextEntryNode = memo(({ data, id }: TextEntryNodeProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const isPRReview = !!data.language;

  // Compute per-highlight handle positions (pixel offsets from the padding div's top edge)
  const highlightHandles = useMemo(() => {
    const highlights = data.highlights ?? [];
    if (highlights.length === 0) return [];

    if (isPRReview) {
      // Exact: the code area starts at padTop=32, each line is 20px tall.
      const padTop = 32;
      return highlights.map((hl, i) => {
        const textBefore = data.content.slice(0, Math.floor((hl.startIdx + hl.endIdx) / 2));
        const line = textBefore.split("\n").length - 1;
        const topPx = padTop + line * 20 + 10; // vertical center of the highlighted line
        return { id: `hl-${i}`, topPx };
      });
    }

    // Document mode: wrap at ~64 chars/line, 30px line height, 32px top padding
    const charsPerLine = 64;
    const lineH = 30;
    const padTop = 32;
    const totalH = estimateTextEntryHeight(data.content, false);

    return highlights.map((hl, i) => {
      const midChar = (hl.startIdx + hl.endIdx) / 2;
      const midLine = midChar / charsPerLine;
      const topPx = Math.min(Math.max(padTop + midLine * lineH, 10), totalH - 10);
      return { id: `hl-${i}`, topPx };
    });
  }, [data.highlights, data.content, isPRReview]);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (
      selection &&
      selection.toString().trim().length > 0 &&
      selection.rangeCount > 0 &&
      contentRef.current
    ) {
      const range = selection.getRangeAt(0);
      if (contentRef.current.contains(range.commonAncestorContainer)) {
        const startIdx = absOffset(contentRef.current, range.startContainer, range.startOffset);
        const endIdx = absOffset(contentRef.current, range.endContainer, range.endOffset);
        const rect = range.getBoundingClientRect();
        document.dispatchEvent(
          new CustomEvent("docTextSelected", {
            detail: {
              text: selection.toString().trim(),
              sourceNodeId: id,
              startIdx,
              endIdx,
              rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
              isTextEntry: true,
            },
          }),
        );
        return;
      }
    }
    document.dispatchEvent(new CustomEvent("docTextSelected", { detail: null }));
  }, [id]);

  // Line number click handler for PR review mode
  const handleLineClick = useCallback(
    (lineNumber: number) => {
      document.dispatchEvent(
        new CustomEvent("docLineComment", {
          detail: { lineNumber, sourceNodeId: id },
        }),
      );
    },
    [id],
  );

  // Syntax highlighting for PR review mode
  const highlightedLines = useMemo(() => {
    if (!isPRReview || !data.content) return [];
    const lang = data.language!;
    try {
      const result = hljs.getLanguage(lang)
        ? hljs.highlight(data.content, { language: lang })
        : hljs.highlightAuto(data.content);
      // Split highlighted HTML into lines
      return splitHighlightedHTML(result.value);
    } catch {
      return data.content.split("\n").map((line) => escapeHtml(line) || "&nbsp;");
    }
  }, [data.content, data.language, isPRReview]);

  // Build a set of highlighted line numbers from highlight ranges
  const highlightedLineSet = useMemo(() => {
    const set = new Set<number>();
    if (!data.highlights || !data.content) return set;
    const lines = data.content.split("\n");
    for (const hl of data.highlights) {
      // Find which lines this highlight spans
      let charCount = 0;
      for (let i = 0; i < lines.length; i++) {
        const lineEnd = charCount + lines[i].length;
        if (charCount <= hl.endIdx && lineEnd >= hl.startIdx) {
          set.add(i);
        }
        charCount = lineEnd + 1; // +1 for \n
      }
    }
    return set;
  }, [data.highlights, data.content]);

  // Hovering line number state
  const [hoverLine, setHoverLine] = useState<number | null>(null);

  useEffect(() => {
    if (isPRReview) ensureHljsTheme();
  }, [isPRReview]);

  const nodeWidth = isPRReview ? PR_REVIEW_WIDTH : TEXT_ENTRY_WIDTH;

  return (
    <NodeFrame
      borderColor={data.currentNav ? "#94a3b8" : "#cbd5e1"}
      bracketColor={data.currentNav ? "#64748b" : "#475569"}
      background="#fff"
      innerRuleColor={data.currentNav ? "#cbd5e1" : "#e2e8f0"}
      width={nodeWidth}
      opacity={data.dimmed ? 0.18 : 1}
      style={{ cursor: "text" }}
    >
      <div
        onMouseUp={isPRReview ? undefined : handleMouseUp}
        style={{ padding: isPRReview ? "32px 16px" : "32px", position: "relative" }}
      >
        {/* Per-highlight source handles */}
        {highlightHandles.map((h) => (
          <Handle
            key={h.id}
            id={h.id}
            type="source"
            position={Position.Right}
            style={{ opacity: 0, pointerEvents: "none", right: -4, top: h.topPx, transform: "translateY(-50%)" }}
          />
        ))}
        <Handle
          id="right"
          type="source"
          position={Position.Right}
          style={{ opacity: 0, pointerEvents: "none", right: -4 }}
        />

        {/* Document label */}
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 14,
            fontSize: "10px",
            color: "#94a3b8",
            fontFamily: "inherit",
            lineHeight: 1,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          {isPRReview ? "code" : "source"}
        </div>

        {/* Hint text */}
        {(!data.highlights || data.highlights.length === 0) && (
          <div
            style={{
              fontSize: "12px",
              color: "#94a3b8",
              marginBottom: "16px",
              fontStyle: "italic",
              fontFamily: isPRReview ? "'SF Mono', 'Fira Code', 'Cascadia Code', monospace" : "inherit",
            }}
          >
            {isPRReview
              ? "Click a line number or select text to add a comment"
              : "Select text to create paragraph nodes"}
          </div>
        )}

        {/* Content */}
        {isPRReview ? (
          <div
            className="nodrag nopan"
            onMouseUp={handleMouseUp}
            style={{
              fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
              fontSize: "13px",
              lineHeight: "20px",
              color: "#1e293b",
              display: "flex",
              overflow: "hidden",
            }}
          >
            {/* Line numbers — outside contentRef so absOffset ignores them */}
            <div
              style={{
                width: "44px",
                minWidth: "44px",
                flexShrink: 0,
                borderRight: "1px solid #e2e8f0",
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            >
              {highlightedLines.map((_, i) => {
                const isHighlighted = highlightedLineSet.has(i);
                return (
                  <div
                    key={i}
                    data-no-reply
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLineClick(i);
                    }}
                    onMouseEnter={() => setHoverLine(i)}
                    onMouseLeave={() => setHoverLine(null)}
                    style={{
                      height: "20px",
                      textAlign: "right",
                      paddingRight: "12px",
                      color: hoverLine === i ? "#3b82f6" : "#94a3b8",
                      cursor: "pointer",
                      fontSize: "12px",
                      lineHeight: "20px",
                      background: isHighlighted
                        ? "#fef9c3"
                        : hoverLine === i
                          ? "#f8fafc"
                          : "transparent",
                    }}
                  >
                    {i + 1}
                  </div>
                );
              })}
            </div>
            {/* Code content — contentRef wraps only this so absOffset works correctly */}
            <div
              ref={contentRef}
              style={{
                flex: 1,
                paddingLeft: "12px",
                userSelect: "text",
                WebkitUserSelect: "text",
                overflow: "visible",
              }}
            >
              {highlightedLines.map((lineHtml, i) => {
                const isHighlighted = highlightedLineSet.has(i);
                return (
                  <div
                    key={i}
                    style={{
                      height: "20px",
                      whiteSpace: "pre",
                      overflow: "visible",
                      background: isHighlighted
                        ? "#fef9c3"
                        : hoverLine === i
                          ? "#f8fafc"
                          : "transparent",
                    }}
                    onMouseEnter={() => setHoverLine(i)}
                    onMouseLeave={() => setHoverLine(null)}
                    dangerouslySetInnerHTML={{ __html: lineHtml || "&nbsp;" }}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div
            ref={contentRef}
            className="nodrag nopan"
            style={{
              fontFamily: "inherit",
              fontSize: "15px",
              lineHeight: "1.8",
              color: "#1e293b",
              whiteSpace: "pre-wrap",
              userSelect: "text",
              WebkitUserSelect: "text",
            }}
          >
            <HighlightedContent
              content={data.content}
              highlights={data.highlights ?? []}
            />
          </div>
        )}

        {data.author && (
          <div
            style={{
              fontSize: "10px",
              color: "#94a3b8",
              fontStyle: "italic",
              marginTop: "16px",
              paddingTop: "8px",
              borderTop: "1px solid #f1f5f9",
            }}
          >
            {data.author}
          </div>
        )}
      </div>
    </NodeFrame>
  );
});

TextEntryNode.displayName = "TextEntryNode";
export default TextEntryNode;

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Split highlight.js HTML output into per-line HTML strings,
 * carrying open <span> tags across line boundaries.
 */
function splitHighlightedHTML(html: string): string[] {
  const lines: string[] = [];
  let current = "";
  let openSpans: string[] = [];
  let i = 0;

  while (i < html.length) {
    if (html[i] === "\n") {
      // Close any open spans for this line, then start next line reopening them
      for (let j = openSpans.length - 1; j >= 0; j--) {
        current += "</span>";
      }
      lines.push(current);
      current = openSpans.join("");
      i++;
    } else if (html.startsWith("<span", i)) {
      // Find end of opening tag
      const end = html.indexOf(">", i);
      if (end === -1) { current += html[i]; i++; continue; }
      const tag = html.slice(i, end + 1);
      openSpans.push(tag);
      current += tag;
      i = end + 1;
    } else if (html.startsWith("</span>", i)) {
      openSpans.pop();
      current += "</span>";
      i += 7;
    } else {
      current += html[i];
      i++;
    }
  }
  lines.push(current);
  return lines;
}
