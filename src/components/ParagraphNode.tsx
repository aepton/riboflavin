import { memo, useRef, useState, useCallback, useEffect, useMemo } from "react";
import { Handle, Position } from "reactflow";
import { useDocumentStore, estimateHeight, type HighlightRange } from "../store/documentStore";
import { absOffset, HighlightedContent } from "./textUtils";
import { NodeFrame } from "./NodeChrome";
import { ReactionBar } from "./EmojiReactions";

interface ParagraphNodeProps {
  data: {
    content: string;
    tags: string[];
    depth: number;
    highlights?: HighlightRange[];
    dimmed?: boolean;
    threadFocused?: boolean;
    reactions?: Record<string, number>;
    highlighted?: boolean;
    author?: string;
    isNew?: boolean;
  };
  id: string;
}

const ParagraphNode = memo(({ data, id }: ParagraphNodeProps) => {
  const { removeTag, updateNode, toggleReaction, deleteNode } = useDocumentStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");

  // Compute per-highlight handle positions (as % of node height)
  const highlightHandles = useMemo(() => {
    const highlights = data.highlights ?? [];
    if (highlights.length === 0) return [];
    const totalH = estimateHeight(data.content);
    const charsPerLine = 32;
    const lineH = 30; // px per line (matches estimateHeight)
    const padTop = 16; // top padding inside the node

    return highlights.map((hl, i) => {
      const midChar = (hl.startIdx + hl.endIdx) / 2;
      const midLine = midChar / charsPerLine;
      const yPx = padTop + midLine * lineH;
      const topPct = Math.min(Math.max((yPx / totalH) * 100, 5), 95);
      return { id: `hl-${i}`, topPct };
    });
  }, [data.highlights, data.content]);

  // Auto-focus new nodes into editing mode
  useEffect(() => {
    if (data.isNew) {
      const t = setTimeout(() => setIsEditing(true), 150);
      return () => clearTimeout(t);
    }
  }, [data.isNew]);

  // Snapshot current content into local draft when editing begins
  useEffect(() => {
    if (isEditing) setDraft(data.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // Auto-size textarea to content
  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  useEffect(() => { adjustHeight(); }, [draft, isEditing, adjustHeight]);

  // Focus textarea after it enters the DOM
  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  const handleMouseUp = useCallback(() => {
    if (isEditing) return;
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
            },
          }),
        );
        return;
      }
    }
    document.dispatchEvent(new CustomEvent("docTextSelected", { detail: null }));
  }, [id, isEditing]);

  const saveEdit = useCallback(() => {
    updateNode(id, draft);
    setIsEditing(false);
  }, [id, draft, updateNode]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      adjustHeight();
    },
    [adjustHeight],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        saveEdit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setIsEditing(false);
      }
    },
    [saveEdit],
  );

  const dispatchTag = useCallback(() => {
    document.dispatchEvent(
      new CustomEvent("docParagraphAction", {
        detail: { nodeId: id, action: "tag" },
      }),
    );
  }, [id]);

  const handleFocus = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      document.dispatchEvent(
        new CustomEvent("docFocusThread", { detail: { nodeId: id } }),
      );
    },
    [id],
  );

  const actionBtnStyle: React.CSSProperties = {
    padding: "3px 10px",
    borderRadius: 0,
    border: "none",
    borderTop: "1px solid #d1d5db",
    borderRight: "1px solid #d1d5db",
    background: "none",
    color: "#374151",
    fontSize: "11px",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 500,
  };

  return (
    <NodeFrame
      borderColor={data.highlighted ? "#3b82f6" : isEditing ? "#94a3b8" : "#d1d5db"}
      bracketColor={data.highlighted ? "#2563eb" : isEditing ? "#475569" : "#64748b"}
      background="#fff"
      innerRuleColor={data.highlighted ? "#93c5fd" : isEditing ? "#cbd5e1" : "#e5e7eb"}
      width={360}
      opacity={data.dimmed ? 0.18 : 1}
      style={{ cursor: isEditing ? "text" : "default" }}
    >
      <div
        ref={containerRef}
        onMouseUp={handleMouseUp}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ padding: "16px", position: "relative" }}
      >
      {/* Per-highlight source handles positioned at the highlight's vertical midpoint */}
      {highlightHandles.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type="source"
          position={Position.Right}
          style={{ opacity: 0, pointerEvents: "none", right: -4, top: `${h.topPct}%` }}
        />
      ))}
      {/* Fallback source handle for edges without a specific highlight handle */}
      <Handle id="right" type="source" position={Position.Right}
        style={{ opacity: 0, pointerEvents: "none", right: -4 }} />
      <Handle id="left" type="target" position={Position.Left}
        style={{ opacity: 0, pointerEvents: "none", left: -4 }} />

      {/* Paragraph marker — hidden while editing */}
      {!isEditing && (
        <div style={{
          position: "absolute", top: 10, right: 14,
          fontSize: "13px", color: "#cbd5e1",
          fontFamily: "inherit", lineHeight: 1,
        }}>
          ¶
        </div>
      )}

      {/* Content: editable textarea or selectable rendered text */}
      {isEditing ? (
        <textarea
          ref={textareaRef}
          className="nodrag"
          value={draft}
          onChange={handleChange}
          onBlur={saveEdit}
          onKeyDown={handleKeyDown}
          style={{
            width: "100%",
            border: "none",
            resize: "none",
            outline: "none",
            fontFamily: "inherit",
            fontSize: "15px",
            lineHeight: "1.75",
            color: "#1e293b",
            background: "transparent",
            overflow: "hidden",
            display: "block",
            boxSizing: "border-box",
            userSelect: "text",
            WebkitUserSelect: "text",
            minHeight: "60px",
          }}
        />
      ) : (
        <div
          ref={contentRef}
          className="nodrag"
          style={{
            fontFamily: "inherit",
            fontSize: "15px",
            lineHeight: "1.75",
            color: "#1e293b",
            paddingRight: "16px",
            cursor: "text",
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

      {/* Tags */}
      {data.tags && data.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "10px" }}>
          {data.tags.map((tag: string) => (
            <span key={tag} style={{
              background: "none", color: "#475569",
              padding: "2px 8px", borderRadius: 0,
              fontSize: "11px", fontFamily: "inherit",
              border: "none",
              borderTop: "1px solid #e2e8f0",
              borderRight: "1px solid #e2e8f0",
              display: "flex", alignItems: "center", gap: "4px",
            }}>
              #{tag}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.stopPropagation(); removeTag(id, tag); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: 0, color: "#94a3b8", fontSize: "13px", lineHeight: 1,
                }}
              >×</button>
            </span>
          ))}
        </div>
      )}

      {/* Reactions */}
      {!isEditing && (
        <div className="nodrag" style={{ paddingTop: "4px" }}>
          <ReactionBar
            reactions={data.reactions ?? {}}
            onToggle={(emoji) => toggleReaction(id, emoji)}
            accentColor="#d1d5db"
          />
        </div>
      )}

      {/* Action bar */}
      {!isEditing && (
        <div
          className="nodrag"
          style={{
            display: "flex", gap: "4px",
            marginTop: "6px", paddingTop: "8px",
            borderTop: "1px solid #f1f5f9",
            opacity: isHovered ? 1 : 0,
            transition: "opacity 0.15s ease",
            pointerEvents: isHovered ? "auto" : "none",
          }}
        >
          {data.author && (
            <span style={{
              fontSize: "10px",
              color: "#94a3b8",
              fontStyle: "italic",
              alignSelf: "center",
              marginRight: "4px",
            }}>
              {data.author}
            </span>
          )}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            style={actionBtnStyle}
          >
            edit
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => { e.stopPropagation(); dispatchTag(); }}
            style={{ ...actionBtnStyle, color: "#6366f1" }}
          >
            # tag
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
            style={{ ...actionBtnStyle, color: "#dc2626" }}
          >
            delete
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleFocus}
            style={{
              ...actionBtnStyle,
              marginLeft: "auto",
              color: data.threadFocused ? "#1e293b" : "#94a3b8",
              background: data.threadFocused ? "#e2e8f0" : "#f9fafb",
            }}
          >
            {data.threadFocused ? "unfocus" : "focus"}
          </button>
        </div>
      )}
      </div>
    </NodeFrame>
  );
});

ParagraphNode.displayName = "ParagraphNode";
export default ParagraphNode;
