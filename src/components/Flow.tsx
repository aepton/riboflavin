import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import ReactFlow, {
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  ReactFlowProvider,
  Position,
  MarkerType,
} from 'reactflow';
import type { Connection, Node as ReactFlowNode, NodeTypes } from 'reactflow';
import 'reactflow/dist/style.css';
import styled from '@emotion/styled';
import { useNoteStore } from '../store/noteStore';
import NoteNode from './NoteNode';

// Import constants from store
const COLUMN_WIDTH = 300;
const COLUMN_GAP = 100;
const NODE_HEIGHT = 120;
const NODE_GAP = 20;

// Custom edge component that connects to the closest handles
const CustomEdge = ({ sourceX, sourceY, targetX, targetY, source, target }: any) => {
  console.log('CustomEdge rendering:', { sourceX, sourceY, targetX, targetY, source, target });
  
  // Use ReactFlow's provided coordinates - they're already correct
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  
  return (
    <path
      d={path}
      stroke="#3b82f6"
      strokeWidth={2}
      fill="none"
    />
  );
};

// Custom edge component with ellipsis overlay
const EllipsisEdge = ({ sourceX, sourceY, targetX, targetY, source, target }: any) => {
  console.log('EllipsisEdge rendering:', { sourceX, sourceY, targetX, targetY, source, target });
  
  // Calculate center point of the edge
  const centerX = (sourceX + targetX) / 2;
  const centerY = (sourceY + targetY) / 2;
  
  // Use ReactFlow's provided coordinates - they're already correct
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  
  return (
    <g>
      <path
        d={path}
        stroke="#3b82f6"
        strokeWidth={2}
        fill="none"
      />
      {/* White background circle */}
      <circle
        cx={centerX}
        cy={centerY}
        r="12"
        fill="white"
        stroke="#ef4444"
        strokeWidth="1"
      />
      <text
        x={centerX}
        y={centerY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="16"
        fill="#ef4444"
        fontWeight="bold"
        style={{ userSelect: 'none' }}
      >
        ...
      </text>
    </g>
  );
};

// Simplified edge component for better performance
const SimpleEdge = ({ sourceX, sourceY, targetX, targetY }: any) => {
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  
  return (
    <path
      d={path}
      stroke="#3b82f6"
      strokeWidth={2}
      fill="none"
    />
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
  height: 100vh;
  width: 100vw;
  background: #fafafa;
  position: relative;
  overflow: hidden; /* Prevent all scrolling */

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
  transform: translateX(-50%); /* Center the header */
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
  articleLink: CustomEdge,
  smoothstep: CustomEdge,
  ellipsis: EllipsisEdge,
  default: CustomEdge, // Fallback for any unmapped types
};

// Debug function to log edge types
const logEdgeTypes = (edges: any[]) => {
  const typeCounts = edges.reduce((acc, edge) => {
    acc[edge.type] = (acc[edge.type] || 0) + 1;
    return acc;
  }, {});
  console.log('Edge type counts:', typeCounts);
  console.log('Available edge types:', Object.keys(edgeTypes));
};

interface TextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (content: string) => void;
}

const TextModal: React.FC<TextModalProps> = ({ isOpen, onClose, onSave }) => {
  const [content, setContent] = useState('');

  if (!isOpen) return null;

  const handleSave = () => {
    if (content.trim()) {
      onSave(content);
      setContent('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
        <h2 className="text-xl font-bold mb-4">Paste Article Text</h2>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste your article text here... (Format: SPEAKER: dialogue)"
          className="flex-1 border border-gray-300 rounded p-3 resize-none focus:outline-none focus:ring-2 focus:ring-black"
          style={{ minHeight: '300px' }}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Save & Parse
          </button>
        </div>
      </div>
    </div>
  );
};

const FlowComponent: React.FC = () => {
  const { nodes: initialNodes, edges: initialEdges, addNote, connectNotes, columns, addColumn, loadArticle, parseManualContent, loadParsedTranscript } = useNoteStore();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const reactFlowInstance = useReactFlow();
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualContent, setManualContent] = useState('');
  const [viewportX, setViewportX] = useState(0);
  const viewportTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    console.log('Edges loaded:', initialEdges);
    console.log('Edge types:', initialEdges.map(edge => edge.type));
    logEdgeTypes(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Load parsed transcript immediately on mount
  useEffect(() => {
    const loadData = async () => {
      setIsInitialLoading(true);
      try {
        await loadParsedTranscript();
      } catch (error) {
        console.error('Failed to load initial data:', error);
        setError('Failed to load initial data. Using fallback content.');
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadData();
  }, [loadParsedTranscript]);

  // Set initial viewport position to center the columns
  useEffect(() => {
    if (reactFlowInstance && columns.length > 0) {
      // Calculate the center of all columns
      const totalWidth = columns.length * COLUMN_WIDTH + (columns.length - 1) * COLUMN_GAP;
      const centerX = (window.innerWidth - totalWidth) / 2;
      const viewportX = centerX; // Positive value to move viewport right, centering columns
      
      reactFlowInstance.setViewport({ x: viewportX, y: 0, zoom: 1 });
      setViewportX(viewportX); // Update our tracking immediately
    }
  }, [reactFlowInstance, columns]);

  // Track ReactFlow viewport changes with debouncing
  useEffect(() => {
    if (reactFlowInstance) {
      // Get initial viewport
      const viewport = reactFlowInstance.getViewport();
      setViewportX(viewport.x);
    }
  }, [reactFlowInstance]);

  // Debounced viewport update function
  const updateViewportX = useCallback((newX: number) => {
    if (viewportTimeoutRef.current) {
      clearTimeout(viewportTimeoutRef.current);
    }
    viewportTimeoutRef.current = setTimeout(() => {
      setViewportX(newX);
    }, 16); // ~60fps
  }, []);

  // Handle mouse wheel for vertical scrolling only
  const onWheel = useCallback((event: Event) => {
    const wheelEvent = event as WheelEvent;
    event.preventDefault();
    event.stopPropagation();
    
    const { deltaY } = wheelEvent;
    
    // Only respond to vertical scrolling, completely ignore horizontal scrolling
    if (Math.abs(deltaY) > 0) {
      const { x, y } = reactFlowInstance.getViewport();
      
      // Calculate bounds to prevent scrolling notes off screen
      const flowArea = document.querySelector('.flow-area');
      const flowHeight = flowArea?.clientHeight || window.innerHeight;
      
      // Get the highest and lowest node positions
      const nodePositions = nodes.map(node => node.position.y);
      const minNodeY = Math.min(...nodePositions);
      const maxNodeY = Math.max(...nodePositions);
      
      // Estimate the height of the highest and lowest nodes
      const highestNode = nodes.find(node => node.position.y === maxNodeY);
      const lowestNode = nodes.find(node => node.position.y === minNodeY);
      
      let highestNodeHeight = 140; // Default height
      let lowestNodeHeight = 140; // Default height
      
      if (highestNode) {
        const contentLength = highestNode.data.content.length;
        const estimatedLines = Math.ceil(contentLength / 50);
        highestNodeHeight = Math.max(140, estimatedLines * 28 + 60);
      }
      
      if (lowestNode) {
        const contentLength = lowestNode.data.content.length;
        const estimatedLines = Math.ceil(contentLength / 50);
        lowestNodeHeight = Math.max(140, estimatedLines * 28 + 60);
      }
      
      // Calculate bounds
      const topBound = -minNodeY + 50; // Keep some padding at top
      const bottomBound = -(maxNodeY + highestNodeHeight - flowHeight + 50); // Keep some padding at bottom
      
      // Only allow vertical scrolling, keep x position fixed
      const newY = y - deltaY;
      const clampedY = Math.max(bottomBound, Math.min(topBound, newY));
      
      reactFlowInstance.setViewport({
        x: x, // Keep x position unchanged
        y: clampedY,
        zoom: 1,
      });
      // Update our viewport tracking with debouncing
      updateViewportX(x);
    }
  }, [reactFlowInstance, updateViewportX, nodes]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (viewportTimeoutRef.current) {
        clearTimeout(viewportTimeoutRef.current);
      }
    };
  }, []);

  // Memoize the onConnect callback
  const onConnect = useMemo(() => (connection: Connection) => {
    if (connection.source && connection.target) {
      connectNotes(connection.source, connection.target);
    }
  }, [connectNotes]);

  // Memoize the onNodeClick callback
  const onNodeClick = useMemo(() => (_event: React.MouseEvent, node: ReactFlowNode) => {
    setSelectedColumnId(node.data.columnId);
  }, []);

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

  // Memoize column headers to prevent unnecessary re-renders
  const columnHeaders = useMemo(() => (
    columns.map((column) => (
      <ColumnHeader
        key={`header-${column.id}`}
        style={{
          left: column.x + COLUMN_WIDTH / 2 + viewportX, // Add viewport offset to position where columns appear
          transform: 'translateX(-50%)', // Center the header around the column center
        }}
      >
        {column.title}
      </ColumnHeader>
    ))
  ), [columns, viewportX, addNote]);

  const handleSaveText = useCallback(async (content: string) => {
    try {
      const response = await fetch('http://localhost:8000/api/save-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error('Failed to save text');
      }

      const result = await response.json();
      console.log('Text saved successfully:', result);
      
      // Load the newly parsed data
      await loadArticle();
    } catch (error) {
      console.error('Failed to save text:', error);
      alert('Failed to save text. Please try again.');
    }
  }, [loadArticle]);

  // Group nodes by column
  const nodesByColumn = useMemo(() => {
    const grouped: { [key: string]: ReactFlowNode[] } = {};
    nodes.forEach((node) => {
      const columnId = node.data?.columnId || 'default';
      if (!grouped[columnId]) {
        grouped[columnId] = [];
      }
      grouped[columnId].push(node);
    });
    return grouped;
  }, [nodes]);

  // Get unique column titles
  const columnTitles = useMemo(() => {
    return columns.map(col => col.title);
  }, [columns]);

  return (
    <div className="h-screen w-screen relative">
      {/* Loading Indicator */}
      {isInitialLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading transcript data...</p>
          </div>
        </div>
      )}

      {/* Status Indicator */}
      {error && (
        <div className="absolute top-20 left-4 z-20 bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-2 rounded text-sm">
          <strong>Note:</strong> {error} 
          <button 
            onClick={() => setError(null)}
            className="ml-2 text-yellow-600 hover:text-yellow-800"
          >
            ×
          </button>
        </div>
      )}

      <FlowArea className="flow-area">
        {columnHeaders}
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
          minZoom={0.5}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          zoomOnScroll={false}
          panOnScroll={false}
          zoomOnPinch={true}
          zoomOnDoubleClick={true}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          panOnDrag={false}
        >
          <Controls showInteractive={false} />
        </ReactFlow>
      </FlowArea>

      <TextModal
        isOpen={isTextModalOpen}
        onClose={() => setIsTextModalOpen(false)}
        onSave={handleSaveText}
      />
    </div>
  );
};

const Flow: React.FC = () => {
  return (
    <ReactFlowProvider>
      <FlowComponent />
    </ReactFlowProvider>
  );
};

export default Flow; 