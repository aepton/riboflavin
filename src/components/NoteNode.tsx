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
      (edge.source === focusedNode.id && edge.target === id) ||
      (edge.source === id && edge.target === focusedNode.id)
    );
  }, [nodes, edges, id]);

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

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const nextId = addNote(data.columnId);
      setTimeout(() => {
        const nextTextarea = document.querySelector(`[data-id="${nextId}"] textarea`) as HTMLTextAreaElement;
        if (nextTextarea) {
          nextTextarea.focus();
        }
      }, 0);
    }
  }, [addNote, data.columnId]);

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

  return (
    <NoteContainer 
      isFocused={isFocused} 
      isLinked={isLinked()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Handle 
        id="top" 
        type="target" 
        position={Position.Top} 
        style={{ opacity: showHandles ? 0.8 : 0, transition: 'opacity 0.2s ease' }} 
      />
      <Handle 
        id="right" 
        type="source" 
        position={Position.Right} 
        style={{ opacity: showHandles ? 0.8 : 0, transition: 'opacity 0.2s ease' }} 
      />
      <Handle 
        id="bottom" 
        type="target" 
        position={Position.Bottom} 
        style={{ opacity: showHandles ? 0.8 : 0, transition: 'opacity 0.2s ease' }} 
      />
      <Handle 
        id="left" 
        type="source" 
        position={Position.Left} 
        style={{ opacity: showHandles ? 0.8 : 0, transition: 'opacity 0.2s ease' }} 
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
    </NoteContainer>
  );
});

NoteNode.displayName = 'NoteNode';

export default NoteNode; 