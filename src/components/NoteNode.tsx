import { useCallback, useEffect, useRef, useState, memo } from 'react';
import { Handle, Position } from 'reactflow';
import styled from '@emotion/styled';
import { useNoteStore } from '../store/noteStore';

const NoteContainer = styled.div<{ isFocused: boolean; isLinked: boolean }>`
  background: ${props => props.isLinked ? '#f5f5f5' : 'white'};
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  width: 280px;
  min-height: 80px;
  box-shadow: ${props => props.isFocused ? '0 0 0 2px #000000' : '0 2px 4px rgba(0,0,0,0.05)'};
  transition: all 0.2s ease;
  position: relative;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 60px;
  border: none;
  resize: none;
  outline: none;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
  background: transparent;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  overflow: hidden;

  &:focus {
    outline: none;
  }
`;

const HandleContainer = styled.div<{ isVisible: boolean; position: string }>`
  position: absolute;
  opacity: ${props => props.isVisible ? 1 : 0};
  transition: opacity 0.2s ease;
  pointer-events: ${props => props.isVisible ? 'auto' : 'none'};
  
  ${props => {
    switch (props.position) {
      case 'top':
        return `
          top: 0;
          left: 50%;
          transform: translateX(-50%);
        `;
      case 'right':
        return `
          top: 50%;
          right: 0;
          transform: translateY(-50%);
        `;
      case 'bottom':
        return `
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
        `;
      case 'left':
        return `
          top: 50%;
          left: 0;
          transform: translateY(-50%);
        `;
      default:
        return '';
    }
  }}
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
  const { updateNote, addNote, nodes, columns, edges } = useNoteStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [showHandles, setShowHandles] = useState(false);

  // Auto-resize textarea based on content
  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  // Check if this note is linked to the currently focused note
  const isLinked = useCallback(() => {
    const focusedNode = nodes.find(node => 
      document.activeElement === document.querySelector(`[data-id="${node.id}"] textarea`)
    );
    
    if (!focusedNode) return false;

    return edges.some(edge => 
      (edge.source === id && edge.target === focusedNode.id) ||
      (edge.source === focusedNode.id && edge.target === id)
    );
  }, [nodes, edges, id]);

  // Check which handles should be visible based on connections
  const getHandleVisibility = useCallback(() => {
    const connectedEdges = edges.filter(edge => 
      edge.source === id || edge.target === id
    );
    
    const hasIncomingEdges = connectedEdges.some(edge => edge.target === id);
    const hasOutgoingEdges = connectedEdges.some(edge => edge.source === id);
    
    return {
      top: hasIncomingEdges,
      right: hasOutgoingEdges,
      bottom: hasIncomingEdges,
      left: hasOutgoingEdges
    };
  }, [edges, id]);

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

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNote(id, e.target.value);
    adjustHeight();
  }, [id, updateNote, adjustHeight]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setShowHandles(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowHandles(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const currentColumn = columns.find(col => col.id === data.columnId);
      if (currentColumn) {
        addNote(currentColumn.id);
      }
      textareaRef.current?.blur();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const currentColumn = columns.find(col => col.id === data.columnId);
      if (currentColumn) {
        addNote(currentColumn.id);
      }
      textareaRef.current?.blur();
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const currentColumn = columns.find(col => col.id === data.columnId);
      if (!currentColumn) return;

      const columnNodes = nodes.filter(node => node.data.columnId === currentColumn.id);
      const currentIndex = columnNodes.findIndex(node => node.id === id);
      let targetNode;

      switch (e.key) {
        case 'ArrowUp':
          if (currentIndex > 0) {
            targetNode = columnNodes[currentIndex - 1];
          }
          break;
        case 'ArrowDown':
          if (currentIndex < columnNodes.length - 1) {
            targetNode = columnNodes[currentIndex + 1];
          }
          break;
        case 'ArrowLeft':
          const prevColumn = columns[columns.indexOf(currentColumn) - 1];
          if (prevColumn) {
            const prevColumnNodes = nodes.filter(node => node.data.columnId === prevColumn.id);
            targetNode = prevColumnNodes.reduce((closest, current) => {
              if (!closest) return current;
              const currentDiff = Math.abs(current.position.y - columnNodes[currentIndex].position.y);
              const closestDiff = Math.abs(closest.position.y - columnNodes[currentIndex].position.y);
              return currentDiff < closestDiff ? current : closest;
            });
          }
          break;
        case 'ArrowRight':
          const nextColumn = columns[columns.indexOf(currentColumn) + 1];
          if (nextColumn) {
            const nextColumnNodes = nodes.filter(node => node.data.columnId === nextColumn.id);
            targetNode = nextColumnNodes.reduce((closest, current) => {
              if (!closest) return current;
              const currentDiff = Math.abs(current.position.y - columnNodes[currentIndex].position.y);
              const closestDiff = Math.abs(closest.position.y - columnNodes[currentIndex].position.y);
              return currentDiff < closestDiff ? current : closest;
            });
          }
          break;
      }

      if (targetNode) {
        const targetTextarea = document.querySelector(`[data-id="${targetNode.id}"] textarea`) as HTMLTextAreaElement;
        if (targetTextarea) {
          targetTextarea.focus();
        }
      }
    }
  }, [id, data.columnId, addNote, columns, nodes]);

  const handleVisibility = getHandleVisibility();

  return (
    <NoteContainer 
      isFocused={isFocused} 
      isLinked={isLinked()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <HandleContainer isVisible={showHandles && handleVisibility.top} position="top">
        <Handle type="target" position={Position.Top} />
      </HandleContainer>
      <HandleContainer isVisible={showHandles && handleVisibility.right} position="right">
        <Handle type="source" position={Position.Right} />
      </HandleContainer>
      <HandleContainer isVisible={showHandles && handleVisibility.bottom} position="bottom">
        <Handle type="target" position={Position.Bottom} />
      </HandleContainer>
      <HandleContainer isVisible={showHandles && handleVisibility.left} position="left">
        <Handle type="source" position={Position.Left} />
      </HandleContainer>
      <TextArea
        ref={textareaRef}
        value={data.content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="Type your note here..."
      />
    </NoteContainer>
  );
});

NoteNode.displayName = 'NoteNode';

export default NoteNode; 