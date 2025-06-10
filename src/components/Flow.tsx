import { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
} from 'reactflow';
import type { Connection, Node } from 'reactflow';
import 'reactflow/dist/style.css';
import styled from '@emotion/styled';
import { useNoteStore } from '../store/noteStore';
import NoteNode from './NoteNode';

const FlowContainer = styled.div`
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  position: fixed;
  top: 0;
  left: 0;
`;

const Toolbar = styled.div`
  padding: 20px 40px;
  background: #ffffff;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  gap: 12px;
`;

const Button = styled.button`
  padding: 8px 16px;
  background: #ffffff;
  color: #666;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;

  &:hover {
    background: #f8f8f8;
    color: #333;
  }
`;

const FlowArea = styled.div`
  flex: 1;
  padding: 40px;
  background: #fafafa;
  width: 100%;
  height: 100%;
`;

const nodeTypes = {
  note: NoteNode,
};

const Flow = () => {
  const { nodes: initialNodes, edges: initialEdges, addNote, connectNotes, columns, addColumn } = useNoteStore();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const reactFlowInstance = useReactFlow();
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Set initial viewport position
  useEffect(() => {
    if (reactFlowInstance) {
      reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 });
    }
  }, [reactFlowInstance]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        connectNotes(connection.source, connection.target);
      }
    },
    [connectNotes]
  );

  // Handle mouse wheel for scrolling
  const onWheel = useCallback((event: Event) => {
    const wheelEvent = event as WheelEvent;
    event.preventDefault();
    const { deltaX, deltaY } = wheelEvent;
    const { x, y } = reactFlowInstance.getViewport();
    reactFlowInstance.setViewport({
      x: x - deltaX,
      y: y - deltaY,
      zoom: 1,
    });
  }, [reactFlowInstance]);

  // Add wheel event listener
  useEffect(() => {
    const flowElement = document.querySelector('.react-flow');
    if (flowElement) {
      flowElement.addEventListener('wheel', onWheel, { passive: false });
      return () => {
        flowElement.removeEventListener('wheel', onWheel);
      };
    }
  }, [onWheel]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Only handle shortcuts if no textarea is focused
    if (document.activeElement?.tagName === 'TEXTAREA') {
      return;
    }

    // Cmd/Ctrl + N for new note
    if ((event.metaKey || event.ctrlKey) && event.key === 'n') {
      event.preventDefault();
      if (selectedColumnId) {
        addNote(selectedColumnId);
      } else if (columns.length > 0) {
        addNote(columns[0].id);
      }
    }

    // Cmd/Ctrl + Shift + N for new column
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'n') {
      event.preventDefault();
      addColumn();
      // Add a note to the new column and ensure it gets focus
      if (columns.length > 0) {
        addNote(columns[columns.length - 1].id);
      }
    }
  }, [addNote, addColumn, columns, selectedColumnId]);

  // Add keyboard event listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Handle node selection
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedColumnId(node.data.columnId);
  }, []);

  return (
    <FlowContainer>
      <Toolbar>
        {columns.map((column) => (
          <Button
            key={column.id}
            onClick={() => {
              setSelectedColumnId(column.id);
              addNote(column.id);
            }}
          >
            + Note
          </Button>
        ))}
        <Button onClick={() => {
          addColumn();
          if (columns.length > 0) {
            addNote(columns[columns.length - 1].id);
          }
        }}>+ Column</Button>
      </Toolbar>
      <FlowArea>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView={false}
          minZoom={1}
          maxZoom={1}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Controls showInteractive={false} />
        </ReactFlow>
      </FlowArea>
    </FlowContainer>
  );
};

export default Flow; 