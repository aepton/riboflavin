import { memo, useRef, useState, useCallback, useEffect } from "react";
import { Handle, Position } from "reactflow";
import { useDocumentStore, type AnnotationType } from "../store/documentStore";

const COLORS: Record<
  AnnotationType,
  { bg: string; border: string; badge: string; badgeText: string }
> = {
  highlight: {
    bg: "#fffbeb",
    border: "#fcd34d",
    badge: "#f59e0b",
    badgeText: "#fff",
  },
  simplify: {
    bg: "#eff6ff",
    border: "#93c5fd",
    badge: "#3b82f6",
    badgeText: "#fff",
  },
  rephrase: {
    bg: "#f5f3ff",
    border: "#c4b5fd",
    badge: "#8b5cf6",
    badgeText: "#fff",
  },
  summarize: {
    bg: "#ecfdf5",
    border: "#6ee7b7",
    badge: "#10b981",
    badgeText: "#fff",
  },
  reply: {
    bg: "#f9fafb",
    border: "#e5e7eb",
    badge: "#6b7280",
    badgeText: "#fff",
  },
};

const LABELS: Record<AnnotationType, string> = {
  highlight: "Highlight",
  simplify: "Simplified",
  rephrase: "Rephrased",
  summarize: "Summary",
  reply: "Reply",
};

const PLACEHOLDERS: Record<AnnotationType, string> = {
  highlight: "Add notes about this highlight…",
  simplify: "Write a simplified version…",
  rephrase: "Write a rephrased version…",
  summarize: "Write a summary…",
  reply: "Type your reply…",
};

interface AnnotationNodeProps {
  data: {
    content: string;
    annotationType: AnnotationType;
    sourceText?: string;
    tags: string[];
    isNew?: boolean;
    depth: number;
  };
  id: string;
}

const AnnotationNode = memo(({ data, id }: AnnotationNodeProps) => {
  const { updateNode, removeTag } = useDocumentStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isEditing, setIsEditing] = useState(false);

  const colors = COLORS[data.annotationType] || COLORS.reply;
  const label = LABELS[data.annotationType] || "Note";
  const placeholder = PLACEHOLDERS[data.annotationType] || "Type here…";

  useEffect(() => {
    if (data.isNew) {
      const t = setTimeout(() => {
        setIsEditing(true);
        textareaRef.current?.focus();
      }, 60);
      return () => clearTimeout(t);
    }
  }, [data.isNew]);

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [data.content, isEditing, adjustHeight]);

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNode(id, e.target.value);
      adjustHeight();
    },
    [id, updateNode, adjustHeight]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsEditing(false);
      }
    },
    []
  );

  const handleNodeClick = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) return;
      // Ignore clicks on the tag × buttons or the tag button
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
        new CustomEvent("docTagAction", {
          detail: { nodeId: id },
        })
      );
    },
    [id]
  );

  return (
    <div
      onDoubleClick={handleDoubleClick}
      onClick={handleNodeClick}
      style={{
        background: colors.bg,
        border: `1.5px solid ${colors.border}`,
        borderRadius: "10px",
        padding: "12px 14px",
        width: "300px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
        position: "relative",
        cursor: isEditing ? "text" : "pointer",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "14px",
        lineHeight: "1.6",
        color: "#1e293b",
        userSelect: isEditing ? "text" : "none",
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

      {/* Type badge */}
      <div
        style={{
          display: "inline-block",
          background: colors.badge,
          color: colors.badgeText,
          padding: "2px 8px",
          borderRadius: "9999px",
          fontSize: "10px",
          fontWeight: 700,
          marginBottom: "8px",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>

      {/* Source text snippet (highlights only) */}
      {data.annotationType === "highlight" && data.sourceText && (
        <div
          style={{
            borderLeft: `2.5px solid ${colors.border}`,
            paddingLeft: "8px",
            marginBottom: "8px",
            color: "#64748b",
            fontSize: "13px",
            fontStyle: "italic",
            lineHeight: "1.5",
          }}
        >
          {data.sourceText.length > 100
            ? data.sourceText.slice(0, 100) + "…"
            : data.sourceText}
        </div>
      )}

      {/* Editable content */}
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={data.content}
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
            fontSize: "14px",
            lineHeight: "1.6",
            color: "#1e293b",
            background: "transparent",
            overflow: "hidden",
            display: "block",
            boxSizing: "border-box",
          }}
        />
      ) : (
        <div
          style={{ minHeight: "36px" }}
          onDoubleClick={handleDoubleClick}
        >
          {data.content ? (
            data.content
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
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
            marginTop: "8px",
          }}
        >
          {data.tags.map((tag: string) => (
            <span
              key={tag}
              style={{
                background: "rgba(255,255,255,0.65)",
                color: "#475569",
                padding: "2px 6px",
                borderRadius: "9999px",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                gap: "3px",
              }}
            >
              #{tag}
              <button
                data-no-reply
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(id, tag);
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: "#94a3b8",
                  fontSize: "13px",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      {!isEditing && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "8px",
            paddingTop: "6px",
            borderTop: `1px solid ${colors.border}`,
            fontSize: "10px",
            color: "#94a3b8",
          }}
        >
          <span>click to reply · double-click to edit</span>
          <button
            data-no-reply
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleTagClick}
            style={{
              background: "none",
              border: "1px solid " + colors.border,
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
