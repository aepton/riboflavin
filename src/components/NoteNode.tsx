import { memo, useCallback, useRef, useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Handle, Position } from 'reactflow';
import styled from '@emotion/styled';
import { useNoteStore } from '../store/noteStore';

const NoteContainer = styled.div`
  padding: 16px;
  border-radius: 8px;
  background: #ffffff;
  border: 1px solid #f0f0f0;
  min-width: 200px;
  transition: all 0.2s ease;

  &:hover {
    border-color: #e0e0e0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }
`;

const NoteTextarea = styled.textarea`
  width: 100%;
  min-height: 60px;
  border: none;
  resize: none;
  outline: none;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  background: transparent;
  padding: 0;
  color: #333;
  caret-color: #666;

  &::placeholder {
    color: #999;
  }
`;

const HandleWrapper = styled.div<{ visible: boolean }>`
  opacity: ${props => props.visible ? 1 : 0};
  transition: opacity 0.2s ease;
`;

interface NoteNodeProps {
  id: string;
  data: {
    content: string;
  };
}

const NoteNode = memo(({ id, data }: NoteNodeProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const updateNote = useNoteStore((state) => state.updateNote);
  const isNewNote = useRef(true);
  const [isHovered, setIsHovered] = useState(false);

  // Auto-focus when the node is created
  useEffect(() => {
    if (textareaRef.current && isNewNote.current) {
      textareaRef.current.focus();
      // Set cursor at the end of any existing content
      const length = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(length, length);
      isNewNote.current = false;
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.metaKey) {
      // Create new note on Cmd/Ctrl + Enter
      const columnId = useNoteStore.getState().nodes.find(n => n.id === id)?.data.columnId;
      if (columnId) {
        useNoteStore.getState().addNote(columnId);
      }
    }
  }, [id]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    updateNote(id, newContent);
  }, [id, updateNote]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  return (
    <NoteContainer 
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <HandleWrapper visible={isHovered}>
        <Handle type="target" position={Position.Top} style={{ background: '#e0e0e0' }} />
      </HandleWrapper>
      <NoteTextarea
        ref={textareaRef}
        value={data.content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Type your note here..."
        spellCheck={false}
      />
      <HandleWrapper visible={isHovered}>
        <Handle type="source" position={Position.Bottom} style={{ background: '#e0e0e0' }} />
      </HandleWrapper>
    </NoteContainer>
  );
});

NoteNode.displayName = 'NoteNode';

export default NoteNode; 