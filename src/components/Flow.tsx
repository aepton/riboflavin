import { useCallback, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
} from 'reactflow';
import type { Connection } from 'reactflow';
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
`;

const nodeTypes = {
  note: NoteNode,
};

const Flow = () => {
  const { nodes: initialNodes, edges: initialEdges, addNote, connectNotes, columns, addColumn } = useNoteStore();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const reactFlowInstance = useReactFlow();

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        connectNotes(connection.source, connection.target);
      }
    },
    [connectNotes]
  );

  return (
    <FlowContainer>
      <Toolbar>
        {columns.map((column) => (
          <Button
            key={column.id}
            onClick={() => addNote(column.id)}
          >
            + Note
          </Button>
        ))}
        <Button onClick={addColumn}>+ Column</Button>
      </Toolbar>
      <FlowArea>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.5}
          maxZoom={1.5}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        >
          <Controls showInteractive={false} />
        </ReactFlow>
      </FlowArea>
    </FlowContainer>
  );
};

export default Flow; 