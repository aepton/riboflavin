import { memo, useRef, useState, useCallback, useEffect } from "react";
import { Handle, Position } from "reactflow";
import { useDocumentStore, THREAD_COLORS, type AnnotationType, type HighlightRange } from "../store/documentStore";
import { absOffset, HighlightedContent } from "./textUtils";

const TYPE_FALLBACK: Record<
  AnnotationType,
  { nodeBg: string; border: string; badge: string }
> = {
  highlight: { nodeBg: "#fffbeb", border: "#fde047", badge: "#d97706" },
  simplify:  { nodeBg: "#eff6ff", border: "#93c5fd", badge: "#2563eb" },
  rephrase:  { nodeBg: "#f5f3ff", border: "#c4b5fd", badge: "#7c3aed" },
  summarize: { nodeBg: "#ecfdf5", border: "#86efac", badge: "#16a34a" },
  reply:     { nodeBg: "#f9fafb", border: "#e5e7eb", badge: "#6b7280" },
};

const PLACEHOLDERS: Record<AnnotationType, string> = {
  highlight: "Add notes about this highlight…",
  simplify:  "Write a simplified version…",
  rephrase:  "Write a rephrased version…",
  summarize: "Write a summary…",
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
  };
  id: string;
}

const AnnotationNode = memo(({ data, id }: AnnotationNodeProps) => {
  const { updateNode, removeTag } = useDocumentStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const color =
    data.colorIndex !== undefined
      ? THREAD_COLORS[data.colorIndex % THREAD_COLORS.length]
      : TYPE_FALLBACK[data.annotationType] ?? TYPE_FALLBACK.reply;

  const placeholder = PLACEHOLDERS[data.annotationType] ?? "Type here…";

  // When entering edit mode, snapshot current content into local draft
  useEffect(() => {
    if (isEditing) {
      setDraft(data.content);
    }
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
    if (isEditing) {
      textareaRef.current?.focus();
    }
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
    [adjustHeight]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        saveEdit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setIsEditing(false); // discard
      }
    },
    [saveEdit]
  );

  const handleNodeClick = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) return;
      if ((e.target as HTMLElement).closest("[data-no-reply]")) return;
      if (!window.getSelection()?.toString().trim()) {
        document.dispatchEvent(
          new CustomEvent("docAnnotationAction", {
            detail: { nodeId: id, depth: data.depth },
          })
        );
      }
    },
    [isEditing, id, data.depth]
  );

  const handleTagClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      document.dispatchEvent(
        new CustomEvent("docTagAction", { detail: { nodeId: id } })
      );
    },
    [id]
  );

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
          })
        );
        return;
      }
    }
    document.dispatchEvent(new CustomEvent("docTextSelected", { detail: null }));
  }, [id, isEditing]);

  return (
    <div
      onDoubleClick={handleDoubleClick}
      onClick={handleNodeClick}
      onMouseUp={handleMouseUp}
      style={{
        background: color.nodeBg,
        border: `1.5px solid ${color.border}`,
        borderRadius: "10px",
        padding: "12px 14px",
        width: "300px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
        position: "relative",
        cursor: isEditing ? "text" : "pointer",
        fontFamily: "inherit",
        fontSize: "15px",
        lineHeight: "1.65",
        color: "#1e293b",
        userSelect: isEditing ? "text" : "none",
      }}
    >
      <Handle id="right" type="source" position={Position.Right}
        style={{ opacity: 0, pointerEvents: "none", right: -4 }} />
      <Handle id="left" type="target" position={Position.Left}
        style={{ opacity: 0, pointerEvents: "none", left: -4 }} />

      {/* Source text snippet (highlights only) */}
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
            ? data.sourceText.slice(0, 100) + "…"
            : data.sourceText}
        </div>
      )}

      {/* Editable content */}
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
            <HighlightedContent
              content={data.content}
              highlights={data.highlights ?? []}
            />
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
              background: "rgba(255,255,255,0.65)",
              color: "#475569",
              padding: "2px 6px",
              borderRadius: "9999px",
              fontSize: "11px",
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

      {/* Footer */}
      {!isEditing && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "8px",
          paddingTop: "6px",
          borderTop: `1px solid ${color.border}`,
          fontSize: "10px",
          color: "#94a3b8",
        }}>
          <span>click to reply · double-click to edit</span>
          <button
            data-no-reply
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleTagClick}
            style={{
              background: "none",
              border: `1px solid ${color.border}`,
              borderRadius: "5px",
              cursor: "pointer",
              padding: "1px 6px",
              fontSize: "10px",
              color: "#64748b",
              fontFamily: "inherit",
              fontWeight: 500,
            }}
          >
            # tag
          </button>
        </div>
      )}
    </div>
  );
});

AnnotationNode.displayName = "AnnotationNode";
export default AnnotationNode;
