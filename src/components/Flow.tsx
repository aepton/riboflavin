import { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from 'reactflow';
import type { Connection, Node } from 'reactflow';
import 'reactflow/dist/style.css';
import styled from '@emotion/styled';
import { useNoteStore } from '../store/noteStore';
import NoteNode from './NoteNode';

// Import constants from store
const COLUMN_WIDTH = 300;

// Custom edge component for article-generated links
const ArticleEdge = ({ sourceX, sourceY, targetX, targetY, style = {} }: any) => {
  const [edgePath, setEdgePath] = useState('');

  useEffect(() => {
    const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
    setEdgePath(path);
  }, [sourceX, sourceY, targetX, targetY]);

  return (
    <g>
      <path
        d={edgePath}
        stroke="#3b82f6"
        strokeWidth={2}
        fill="none"
        style={{ ...style }}
      />
      <path
        d={edgePath}
        stroke="#3b82f6"
        strokeWidth={6}
        fill="none"
        opacity={0.2}
        style={{ ...style }}
      />
    </g>
  );
};

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

const FloatingButton = styled.button`
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 1000;
  padding: 8px 16px;
  background: #ffffff;
  color: #666;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);

  &:hover {
    background: #f8f8f8;
    color: #333;
  }

  &:disabled {
    background: #f0f0f0;
    color: #999;
  }
`;

const FlowArea = styled.div`
  flex: 1;
  padding: 40px;
  background: #fafafa;
  width: 100%;
  height: 100%;
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;

  /* Prevent ReactFlow's default wheel behavior */
  .react-flow {
    pointer-events: none;
  }
  
  .react-flow__pane {
    pointer-events: auto;
  }
  
  .react-flow__node {
    pointer-events: auto;
  }
  
  .react-flow__edge {
    pointer-events: auto;
  }
  
  .react-flow__controls {
    pointer-events: auto;
  }
`;

const ColumnHeader = styled.div`
  position: absolute;
  top: 20px;
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #333;
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  display: flex;
  align-items: center;
  gap: 8px;
`;

const AddButton = styled.button`
  background: #ffffff;
  color: #666;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  width: 20px;
  height: 20px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;

  &:hover {
    background: #f8f8f8;
    color: #333;
  }
`;

const nodeTypes = {
  note: NoteNode,
};

const edgeTypes = {
  articleLink: ArticleEdge,
};

const Flow = () => {
  const { nodes: initialNodes, edges: initialEdges, addNote, connectNotes, columns, addColumn, loadArticle, parseManualContent } = useNoteStore();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const reactFlowInstance = useReactFlow();
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualContent, setManualContent] = useState('');
  const [viewportX, setViewportX] = useState(0);

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

  // Handle mouse wheel for scrolling
  const onWheel = useCallback((event: Event) => {
    const wheelEvent = event as WheelEvent;
    event.preventDefault();
    const { deltaX, deltaY } = wheelEvent;
    const { x, y } = reactFlowInstance.getViewport();
    const newX = x + deltaX;
    const newY = y - deltaY;
    reactFlowInstance.setViewport({
      x: newX,
      y: newY,
      zoom: 1,
    });
    // Update our viewport tracking
    setViewportX(newX);
  }, [reactFlowInstance]);

  // Track ReactFlow viewport changes
  useEffect(() => {
    if (reactFlowInstance) {
      // Get initial viewport
      const viewport = reactFlowInstance.getViewport();
      setViewportX(viewport.x);
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

  // Add wheel event listener to the entire flow area
  useEffect(() => {
    const flowArea = document.querySelector('.flow-area');
    if (flowArea) {
      flowArea.addEventListener('wheel', onWheel, { passive: false });
      return () => {
        flowArea.removeEventListener('wheel', onWheel);
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
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedColumnId(node.data.columnId);
  }, []);

  const handleLoadArticle = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await loadArticle();
    } catch (error) {
      console.error('Failed to load article:', error);
      setError('Failed to load article. Try manual input instead.');
      setShowManualInput(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualParse = () => {
    if (manualContent.trim()) {
      parseManualContent(manualContent);
      setShowManualInput(false);
      setManualContent('');
      setError(null);
    }
  };

  return (
    <FlowContainer>
      <FloatingButton 
        onClick={handleLoadArticle}
        disabled={isLoading}
      >
        {isLoading ? 'Loading...' : 'Load Article'}
      </FloatingButton>
      <FloatingButton 
        onClick={() => {
          addColumn();
          if (columns.length > 0) {
            addNote(columns[columns.length - 1].id);
          }
        }}
        style={{ top: '60px' }}
      >
        + Column
      </FloatingButton>
      <FlowArea className="flow-area">
        {columns.map((column) => (
          <ColumnHeader
            key={`header-${column.id}`}
            style={{
              left: column.x + (COLUMN_WIDTH - 150) / 2 + viewportX,
            }}
          >
            {column.title}
            <AddButton onClick={() => {
              setSelectedColumnId(column.id);
              addNote(column.id);
            }}>+</AddButton>
          </ColumnHeader>
        ))}
        {error && (
          <div style={{
            position: 'fixed',
            top: '60px',
            left: '20px',
            color: '#e74c3c',
            fontSize: '12px',
            background: '#fff',
            padding: '8px 12px',
            border: '1px solid #e74c3c',
            borderRadius: '4px',
            zIndex: 1000,
          }}>
            {error}
            {showManualInput && (
              <button 
                onClick={() => setShowManualInput(true)}
                style={{ 
                  marginLeft: '10px',
                  fontSize: '11px',
                  padding: '4px 8px',
                  background: '#fff',
                  border: '1px solid #e74c3c',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Manual Input
              </button>
            )}
          </div>
        )}
        {showManualInput && (
          <div style={{
            position: 'fixed',
            top: '100px',
            left: '20px',
            right: '20px',
            maxWidth: '400px',
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: '6px',
            padding: '15px',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <div style={{ marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>
              Paste article content manually:
            </div>
            <textarea
              value={manualContent}
              onChange={(e) => setManualContent(e.target.value)}
              placeholder="Paste the article content here... (Look for dialogue with speaker names like 'TONYA MOSLEY:' or 'DEL TORO:')"
              style={{
                width: '100%',
                height: '100px',
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
                padding: '8px',
                fontSize: '12px',
                resize: 'vertical'
              }}
            />
            <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
              <button onClick={handleManualParse} disabled={!manualContent.trim()}>
                Parse Content
              </button>
              <button onClick={() => {
                setShowManualInput(false);
                setManualContent('');
                setError(null);
              }}>
                Cancel
              </button>
            </div>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
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