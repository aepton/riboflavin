import { memo, useRef, useState, useCallback } from "react";
import { Handle, Position } from "reactflow";
import { useDocumentStore } from "../store/documentStore";

interface ParagraphNodeProps {
  data: {
    content: string;
    tags: string[];
    depth: number;
  };
  id: string;
}

const actionButtonStyle = {
  padding: "3px 10px",
  borderRadius: "6px",
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  color: "#374151",
  fontSize: "11px",
  cursor: "pointer",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontWeight: 500 as const,
  letterSpacing: "0.01em",
};

const ParagraphNode = memo(({ data, id }: ParagraphNodeProps) => {
  const { removeTag } = useDocumentStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0 && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (containerRef.current?.contains(range.commonAncestorContainer)) {
        const rect = range.getBoundingClientRect();
        // Dispatch to DocumentFlow, which lives outside ReactFlow's transform layer
        document.dispatchEvent(
          new CustomEvent("docTextSelected", {
            detail: {
              text: selection.toString().trim(),
              sourceNodeId: id,
              // Plain object — DOMRect isn't cloneable across event boundary
              rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
            },
          })
        );
        return;
      }
    }
    // No selection — clear any existing highlight button
    document.dispatchEvent(new CustomEvent("docTextSelected", { detail: null }));
  }, [id]);

  const dispatchAction = useCallback(
    (action: string) => {
      document.dispatchEvent(
        new CustomEvent("docParagraphAction", {
          detail: { nodeId: id, content: data.content, action },
        })
      );
    },
    [id, data.content]
  );

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "16px",
        width: "320px",
        boxShadow: isHovered
          ? "0 4px 12px rgba(0,0,0,0.1)"
          : "0 1px 4px rgba(0,0,0,0.06)",
        position: "relative",
        transition: "box-shadow 0.15s ease",
      }}
    >
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        style={{ opacity: 0, pointerEvents: "none", right: -4 }}
      />
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        style={{ opacity: 0, pointerEvents: "none", left: -4 }}
      />

      {/* Paragraph marker */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 14,
          fontSize: "13px",
          color: "#cbd5e1",
          fontFamily: "Georgia, serif",
          lineHeight: 1,
        }}
      >
        ¶
      </div>

      {/* Content — nodrag lets ReactFlow skip drag handling so text is selectable */}
      <div
        className="nodrag"
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: "15px",
          lineHeight: "1.75",
          color: "#1e293b",
          paddingRight: "16px",
          cursor: "text",
          userSelect: "text",
          WebkitUserSelect: "text",
        }}
      >
        {data.content}
      </div>

      {/* Tags */}
      {data.tags && data.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "10px" }}>
          {data.tags.map((tag: string) => (
            <span
              key={tag}
              style={{
                background: "#f1f5f9",
                color: "#475569",
                padding: "2px 8px",
                borderRadius: "9999px",
                fontSize: "11px",
                fontFamily: "system-ui, sans-serif",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              #{tag}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.stopPropagation(); removeTag(id, tag); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: 0, color: "#94a3b8", fontSize: "13px", lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Action bar — visible on hover */}
      <div
        className="nodrag"
        style={{
          display: "flex",
          gap: "4px",
          flexWrap: "wrap",
          marginTop: "10px",
          paddingTop: "8px",
          borderTop: "1px solid #f1f5f9",
          opacity: isHovered ? 1 : 0,
          transition: "opacity 0.15s ease",
          pointerEvents: isHovered ? "auto" : "none",
        }}
      >
        {(["simplify", "rephrase", "summarize"] as const).map((action) => (
          <button
            key={action}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => { e.stopPropagation(); dispatchAction(action); }}
            style={actionButtonStyle}
          >
            {action}
          </button>
        ))}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); dispatchAction("tag"); }}
          style={{ ...actionButtonStyle, color: "#6366f1" }}
        >
          # tag
        </button>
      </div>
    </div>
  );
});

ParagraphNode.displayName = "ParagraphNode";
export default ParagraphNode;
