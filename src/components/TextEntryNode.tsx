import { memo, useRef, useCallback, useMemo } from "react";
import { Handle, Position } from "reactflow";
import { type HighlightRange, TEXT_ENTRY_WIDTH, estimateTextEntryHeight } from "../store/documentStore";
import { absOffset, HighlightedContent } from "./textUtils";
import { NodeFrame } from "./NodeChrome";

interface TextEntryNodeProps {
  data: {
    content: string;
    highlights?: HighlightRange[];
    dimmed?: boolean;
    author?: string;
  };
  id: string;
}

const TextEntryNode = memo(({ data, id }: TextEntryNodeProps) => {
  const contentRef = useRef<HTMLDivElement>(null);

  // Compute per-highlight handle positions
  const highlightHandles = useMemo(() => {
    const highlights = data.highlights ?? [];
    if (highlights.length === 0) return [];
    const totalH = estimateTextEntryHeight(data.content);
    const charsPerLine = 64;
    const lineH = 30;
    const padTop = 32; // top padding

    return highlights.map((hl, i) => {
      const midChar = (hl.startIdx + hl.endIdx) / 2;
      const midLine = midChar / charsPerLine;
      const yPx = padTop + midLine * lineH;
      const topPct = Math.min(Math.max((yPx / totalH) * 100, 5), 95);
      return { id: `hl-${i}`, topPct };
    });
  }, [data.highlights, data.content]);

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

  return (
    <NodeFrame
      borderColor="#cbd5e1"
      bracketColor="#475569"
      background="#fff"
      innerRuleColor="#e2e8f0"
      width={TEXT_ENTRY_WIDTH}
      opacity={data.dimmed ? 0.18 : 1}
      style={{ cursor: "text" }}
    >
      <div
        onMouseUp={handleMouseUp}
        style={{ padding: "32px", position: "relative" }}
      >
        {/* Per-highlight source handles */}
        {highlightHandles.map((h) => (
          <Handle
            key={h.id}
            id={h.id}
            type="source"
            position={Position.Right}
            style={{ opacity: 0, pointerEvents: "none", right: -4, top: `${h.topPct}%` }}
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
          source
        </div>

        {/* Hint text when no highlights yet */}
        {(!data.highlights || data.highlights.length === 0) && (
          <div
            style={{
              fontSize: "12px",
              color: "#94a3b8",
              marginBottom: "16px",
              fontStyle: "italic",
              fontFamily: "inherit",
            }}
          >
            Select text to create paragraph nodes
          </div>
        )}

        {/* Content with highlights */}
        <div
          ref={contentRef}
          className="nodrag"
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
