import { useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position } from 'reactflow';
import styled from '@emotion/styled';
import { useNoteStore } from '../store/noteStore';

const NoteContainer = styled.div<{ isFocused: boolean }>`
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  min-width: 200px;
  box-shadow: ${props => props.isFocused ? '0 0 0 2px #000000' : '0 2px 4px rgba(0,0,0,0.05)'};
  transition: all 0.2s ease;
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

const NoteNode = ({ data, id }: NoteNodeProps) => {
  const { updateNote, addNote, nodes, columns } = useNoteStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (data.isNew && textareaRef.current) {
      const timeoutId = setTimeout(() => {
        textareaRef.current?.focus();
        setIsFocused(true);
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [data.isNew]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNote(id, e.target.value);
  }, [id, updateNote]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
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

  return (
    <NoteContainer isFocused={isFocused}>
      <Handle type="target" position={Position.Left} />
      <TextArea
        ref={textareaRef}
        value={data.content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="Type your note here..."
      />
      <Handle type="source" position={Position.Right} />
    </NoteContainer>
  );
};

export default NoteNode; 