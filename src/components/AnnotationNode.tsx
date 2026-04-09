import { memo, useRef, useState, useCallback, useEffect, useMemo } from "react";
import { Handle, Position } from "reactflow";
import { useDocumentStore, THREAD_COLORS, estimateAnnotationHeight, type AnnotationType, type HighlightRange } from "../store/documentStore";
import { absOffset, HighlightedContent } from "./textUtils";
import { NodeFrame } from "./NodeChrome";
import { ReactionBar } from "./EmojiReactions";
import Markdown from "react-markdown";

const TYPE_COLORS: Record<
  AnnotationType,
  { nodeBg: string; border: string }
> = {
  highlight: { nodeBg: "#fffbeb", border: "#fde047" },
  reply:     { nodeBg: "#f9fafb", border: "#e5e7eb" },
};

const PLACEHOLDERS: Record<AnnotationType, string> = {
  highlight: "Add notes about this highlight…",
  reply:     "Type your reply…",
};

interface AnnotationNodeProps {
  data: {
    content: string;
    annotationType: AnnotationType;
    sourceText?: string;
    tags: string[];
    isNew?: boolean;
    depth: number;
    colorIndex?: number;
    highlights?: HighlightRange[];
    dimmed?: boolean;
    threadFocused?: boolean;
    reactions?: Record<string, number>;
    highlighted?: boolean;
    author?: string;
  };
  id: string;
}

const AnnotationNode = memo(({ data, id }: AnnotationNodeProps) => {
  const { updateNode, removeTag, toggleReaction, deleteNode } = useDocumentStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const color =
    data.colorIndex !== undefined
      ? THREAD_COLORS[data.colorIndex % THREAD_COLORS.length]
      : TYPE_COLORS[data.annotationType] ?? TYPE_COLORS.reply;

  const placeholder = PLACEHOLDERS[data.annotationType] ?? "Type here…";

  // Compute per-highlight handle positions
  const highlightHandles = useMemo(() => {
    const highlights = data.highlights ?? [];
    if (highlights.length === 0) return [];
    const totalH = estimateAnnotationHeight(data.content);
    const charsPerLine = 36;
    const lineH = 26;
    const padTop = 12 + (data.sourceText ? 40 : 0); // padding + quoted text height

    return highlights.map((hl, i) => {
      const midChar = (hl.startIdx + hl.endIdx) / 2;
      const midLine = midChar / charsPerLine;
      const yPx = padTop + midLine * lineH;
      const topPct = Math.min(Math.max((yPx / totalH) * 100, 5), 95);
      return { id: `hl-${i}`, topPct };
    });
  }, [data.highlights, data.content, data.sourceText]);

  // Snapshot current content into local draft when editing begins
  useEffect(() => {
    if (isEditing) setDraft(data.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // Auto-focus new nodes
  useEffect(() => {
    if (data.isNew) {
      const t = setTimeout(() => setIsEditing(true), 150);
      return () => clearTimeout(t);
    }
  }, [data.isNew]);

  // Focus the textarea after the render that enables editing
  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  useEffect(() => { adjustHeight(); }, [draft, isEditing, adjustHeight]);

  const saveEdit = useCallback(() => {
    updateNode(id, draft);
    setIsEditing(false);
  }, [id, draft, updateNode]);

  const handleDoubleClick = useCallback(() => setIsEditing(true), []);
  const handleBlur = useCallback(() => saveEdit(), [saveEdit]);

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

  // Single-click → open reply modal (via custom event to DocumentFlow)
  const handleNodeClick = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) return;
      if ((e.target as HTMLElement).closest("[data-no-reply]")) return;
      if (!window.getSelection()?.toString().trim()) {
        document.dispatchEvent(
          new CustomEvent("docAnnotationAction", {
            detail: { nodeId: id, depth: data.depth },
          }),
        );
      }
    },
    [isEditing, id, data.depth],
  );

  const handleTagClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      document.dispatchEvent(
        new CustomEvent("docTagAction", { detail: { nodeId: id } }),
      );
    },
    [id],
  );

  const handleFocusClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      document.dispatchEvent(
        new CustomEvent("docFocusThread", { detail: { nodeId: id } }),
      );
    },
    [id],
  );

  // Text selection → emit event so DocumentFlow can show the highlight button
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

  const footerBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    borderTop: `1px solid ${color.border}`,
    borderRight: `1px solid ${color.border}`,
    borderRadius: 0,
    cursor: "pointer",
    padding: "1px 6px",
    fontSize: "10px",
    color: "#64748b",
    fontFamily: "inherit",
    fontWeight: 500,
  };

  return (
    <NodeFrame
      borderColor={data.highlighted ? "#3b82f6" : color.border}
      bracketColor={data.highlighted ? "#2563eb" : color.border}
      background={color.nodeBg}
      innerRuleColor={data.highlighted ? "#93c5fd" : color.border}
      width={340}
      opacity={data.dimmed ? 0.18 : 1}
      style={{ cursor: isEditing ? "text" : "pointer" }}
    >
      <div
        onDoubleClick={handleDoubleClick}
        onClick={handleNodeClick}
        onMouseUp={handleMouseUp}
        style={{
          padding: "12px 14px",
          position: "relative",
          fontFamily: "inherit",
          fontSize: "15px",
          lineHeight: "1.65",
          color: "#1e293b",
          userSelect: isEditing ? "text" : "none",
        }}
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
      <Handle id="right" type="source" position={Position.Right}
        style={{ opacity: 0, pointerEvents: "none", right: -4 }} />
      <Handle id="left" type="target" position={Position.Left}
        style={{ opacity: 0, pointerEvents: "none", left: -4 }} />

      {/* Author */}
      {data.author && (
        <div style={{
          fontSize: "10px",
          color: "#64748b",
          fontWeight: 600,
          letterSpacing: "0.03em",
          marginBottom: "4px",
        }}>
          {data.author}
        </div>
      )}

      {/* Quoted source text (highlights only) */}
      {data.annotationType === "highlight" && data.sourceText && (
        <div style={{
          borderLeft: `2.5px solid ${color.border}`,
          paddingLeft: "8px",
          marginBottom: "8px",
          color: "#64748b",
          fontSize: "13px",
          fontStyle: "italic",
          lineHeight: "1.5",
        }}>
          {data.sourceText.length > 100
            ? data.sourceText.slice(0, 100) + "\u2026"
            : data.sourceText}
        </div>
      )}

      {/* Content — editable textarea or rendered text with highlights */}
      {isEditing ? (
        <textarea
          ref={textareaRef}
          className="nodrag"
          value={draft}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            width: "100%",
            minHeight: "56px",
            border: "none",
            resize: "none",
            outline: "none",
            fontFamily: "inherit",
            fontSize: "15px",
            lineHeight: "1.65",
            color: "#1e293b",
            background: "transparent",
            overflow: "hidden",
            display: "block",
            boxSizing: "border-box",
            userSelect: "text",
            WebkitUserSelect: "text",
          }}
        />
      ) : (
        <div
          ref={contentRef}
          className="nodrag"
          style={{ minHeight: "36px", userSelect: "text", WebkitUserSelect: "text" }}
          onDoubleClick={handleDoubleClick}
        >
          {data.content ? (
            data.highlights && data.highlights.length > 0 ? (
              <HighlightedContent
                content={data.content}
                highlights={data.highlights}
              />
            ) : (
              <Markdown
                components={{
                  p: ({ children }) => <p style={{ margin: "0 0 8px" }}>{children}</p>,
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6", textDecoration: "underline" }}>
                      {children}
                    </a>
                  ),
                  ul: ({ children }) => <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ margin: "4px 0", paddingLeft: "20px" }}>{children}</ol>,
                  code: ({ children }) => (
                    <code style={{ background: "#f1f5f9", padding: "1px 4px", fontSize: "13px", borderRadius: "2px" }}>
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre style={{ background: "#f1f5f9", padding: "8px", overflow: "auto", fontSize: "13px", margin: "4px 0" }}>
                      {children}
                    </pre>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote style={{ borderLeft: "3px solid #cbd5e1", paddingLeft: "10px", margin: "4px 0", color: "#64748b" }}>
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {data.content}
              </Markdown>
            )
          ) : (
            <span style={{ color: "#94a3b8", fontStyle: "italic" }}>
              Double-click to add notes…
            </span>
          )}
        </div>
      )}

      {/* Tags */}
      {data.tags && data.tags.length > 0 && (
        <div
          data-no-reply
          style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "8px" }}
        >
          {data.tags.map((tag: string) => (
            <span key={tag} style={{
              background: "none",
              color: "#475569",
              padding: "2px 6px",
              borderRadius: 0,
              fontSize: "11px",
              border: "none",
              borderTop: `1px solid ${color.border}`,
              borderRight: `1px solid ${color.border}`,
              display: "flex", alignItems: "center", gap: "3px",
            }}>
              #{tag}
              <button
                data-no-reply
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
        <div className="nodrag" data-no-reply style={{ paddingTop: "4px" }}>
          <ReactionBar
            reactions={data.reactions ?? {}}
            onToggle={(emoji) => toggleReaction(id, emoji)}
            accentColor={color.border}
          />
        </div>
      )}

      {/* Footer */}
      {!isEditing && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "4px",
          paddingTop: "6px",
          borderTop: `1px solid ${color.border}`,
          fontSize: "10px",
          color: "#94a3b8",
        }}>
          <span>click to reply · double-click to edit</span>
          <div data-no-reply style={{ display: "flex", gap: "4px" }}>
            <button
              data-no-reply
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleTagClick}
              style={footerBtnStyle}
            >
              # tag
            </button>
            <button
              data-no-reply
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
              style={{ ...footerBtnStyle, color: "#dc2626" }}
            >
              delete
            </button>
            <button
              data-no-reply
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleFocusClick}
              style={{
                ...footerBtnStyle,
                color: data.threadFocused ? "#1e293b" : "#94a3b8",
                background: data.threadFocused ? "rgba(0,0,0,0.06)" : "none",
              }}
            >
              {data.threadFocused ? "unfocus" : "focus"}
            </button>
          </div>
        </div>
      )}
      </div>
    </NodeFrame>
  );
});

AnnotationNode.displayName = "AnnotationNode";
export default AnnotationNode;
