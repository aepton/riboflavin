import { useCallback, useEffect, useRef, useState, memo, useMemo } from "react";
import { Handle, Position } from "reactflow";
import styled from "@emotion/styled";
import { useNoteStore } from "../store/noteStore";

// Design System Colors
const colors = {
  // Edge colors - cohesive palette
  edgeYes: "#10b981", // Emerald green
  edgeNo: "#ef4444", // Red
  edgeEllipsis: "#8b5cf6", // Purple
  edgeDefault: "#6b7280", // Gray
  
  // Neutral colors
  white: "#ffffff",
  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray300: "#d1d5db",
  gray400: "#9ca3af",
  gray500: "#6b7280",
  gray600: "#4b5563",
  gray700: "#374151",
  gray800: "#1f2937",
  gray900: "#111827",
  
  // Background colors
  background: "#ffffff",
  surface: "#f9fafb",
  
  // Text colors
  textPrimary: "#111827",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
  
  // Border colors
  border: "#e5e7eb",
  borderFocus: "#3b82f6",
  
  // Shadow
  shadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
  shadowMd: "0 4px 6px rgba(0, 0, 0, 0.05)",
  shadowLg: "0 10px 15px rgba(0, 0, 0, 0.1)",
};

const NoteContainer = styled.div<{
  isFocused: boolean;
  isLinked: boolean;
  hasYesEdge: boolean;
  hasNoEdge: boolean;
  isClickable?: boolean;
  "data-id"?: string;
}>`
  background: ${(props) => (props.isLinked ? colors.gray50 : colors.white)};
  border: 1px solid
    ${(props) => {
      if (props.hasYesEdge) return colors.edgeYes;
      if (props.hasNoEdge) return colors.edgeNo;
      return colors.border;
    }};
  border-width: ${(props) => {
    if (props.hasYesEdge || props.hasNoEdge) return "2px";
    return "1px";
  }};
  border-radius: 12px;
  padding: 1rem;
  width: 280px;
  min-height: 80px;
  box-shadow: ${(props) =>
    props.isFocused ? `0 0 0 3px rgba(59, 130, 246, 0.1), ${colors.shadowMd}` : colors.shadow};
  transition: all 0.2s ease;
  position: relative;
  cursor: ${(props) => (props.isClickable ? "pointer" : "default")};
  
  &:hover {
    ${(props) => props.isClickable && `
      transform: translateY(-1px);
      box-shadow: ${colors.shadowLg};
    `}
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 60px;
  border: none;
  resize: none;
  outline: none;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  color: ${colors.textPrimary};
  background: transparent;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
    Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
  overflow: hidden;

  &:focus {
    outline: none;
  }
  
  &::placeholder {
    color: ${colors.textMuted};
  }
`;

interface NoteNodeProps {
  data: {
    content: string;
    columnId: string;
    isNew?: boolean;
  };
  id: string;
}

const NoteNode = memo(({ data, id }: NoteNodeProps) => {
  const { updateNote, addNote, edges } = useNoteStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Check if this note is from one of the first three speakers (columns 1-3)
  const isFromFirstThreeSpeakers =
    data.columnId === "column-1" ||
    data.columnId === "column-2" ||
    data.columnId === "column-3";

  // Determine edge types for border coloring - only consider incoming edges (target)
  const edgeTypes = useMemo(() => {
    const incomingEdges = edges.filter(
      (edge: any) => edge.target === id
    );
    return incomingEdges.map((edge: any) => edge.type);
  }, [edges, id]);

  const hasYesEdge = edgeTypes.includes("yes");
  const hasNoEdge = edgeTypes.includes("no");
  const hasEllipsisEdge = edgeTypes.includes("ellipsis");
  const isLinked = edgeTypes.length > 0;



  // Auto-resize textarea based on content
  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);





  useEffect(() => {
    if (data.isNew && textareaRef.current) {
      const timeoutId = setTimeout(() => {
        textareaRef.current?.focus();
        setIsFocused(true);
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [data.isNew]);

  // Adjust height when content changes
  useEffect(() => {
    adjustHeight();
  }, [data.content, adjustHeight]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNote(id, e.target.value);
      adjustHeight();
    },
    [id, updateNote, adjustHeight]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const nextId = addNote(data.columnId);
        setTimeout(() => {
          const nextTextarea = document.querySelector(
            `[data-id="${nextId}"] textarea`
          ) as HTMLTextAreaElement;
          if (nextTextarea) {
            nextTextarea.focus();
          }
        }, 0);
      }
    },
    [addNote, data.columnId]
  );

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const handleNoteClick = useCallback(() => {
    if (isFromFirstThreeSpeakers) {
      const event = new CustomEvent("noteClick", {
        detail: {
          nodeId: id,
          content: data.content,
          columnId: data.columnId,
        },
      });
      document.dispatchEvent(event);
    }
  }, [isFromFirstThreeSpeakers, id, data.content, data.columnId]);

    // Determine border color based on edge types
  const getBorderColor = () => {
    if (hasYesEdge) return colors.edgeYes;
    if (hasNoEdge) return colors.edgeNo;
    if (hasEllipsisEdge) return colors.edgeEllipsis;
    return colors.border;
  };

  const getBorderWidth = () => {
    if (hasYesEdge || hasNoEdge || hasEllipsisEdge) return "2px";
    return "1px";
  };

  return (
    <div
      data-id={id}
      onClick={handleNoteClick}
      style={{
        background: isLinked ? colors.gray50 : colors.white,
        border: `${getBorderWidth()} solid ${getBorderColor()}`,
        borderRadius: "12px",
        padding: "1rem",
        width: "280px",
        minHeight: "80px",
        boxShadow: isFocused 
          ? `0 0 0 3px rgba(59, 130, 246, 0.1), ${colors.shadowMd}` 
          : colors.shadow,
        transition: "all 0.2s ease",
        position: "relative",
        cursor: isFromFirstThreeSpeakers ? "pointer" : "default",
      }}
    >
        <Handle
          id="top"
          type="target"
          position={Position.Top}
          style={{ 
            width: "8px", 
            height: "8px",
            background: "transparent",
            border: "none",
            top: "-4px",
            opacity: 0,
            pointerEvents: "none"
          }}
        />
        <Handle
          id="right"
          type="source"
          position={Position.Right}
          style={{ 
            width: "8px", 
            height: "8px",
            background: "transparent",
            border: "none",
            right: "-4px",
            opacity: 0,
            pointerEvents: "none"
          }}
        />
        <Handle
          id="bottom"
          type="source"
          position={Position.Bottom}
          style={{ 
            width: "8px", 
            height: "8px",
            background: "transparent",
            border: "none",
            bottom: "-4px",
            opacity: 0,
            pointerEvents: "none"
          }}
        />
        <Handle
          id="left"
          type="target"
          position={Position.Left}
          style={{ 
            width: "8px", 
            height: "8px",
            background: "transparent",
            border: "none",
            left: "-4px",
            opacity: 0,
            pointerEvents: "none"
          }}
        />
        <TextArea
        ref={textareaRef}
        value={data.content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="Type your note here..."
      />
    </div>
  );
});

NoteNode.displayName = "NoteNode";

export default NoteNode;
