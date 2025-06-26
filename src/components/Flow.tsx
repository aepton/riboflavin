import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
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

// Modal component
const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const ModalText = styled.p`
  font-size: 16px;
  line-height: 1.6;
  margin-bottom: 1rem;
  color: #333;
`;

const ModalInput = styled.input`
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  margin-top: 1rem;
`;

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
      {/* Gradient background circle */}
      <defs>
        <radialGradient id="ellipsisGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f8fafc" stopOpacity="1" />
          <stop offset="100%" stopColor="#f8fafc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        cx={centerX}
        cy={centerY}
        r="16"
        fill="url(#ellipsisGradient)"
      />
      <text
        x={centerX}
        y={centerY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="16"
        fill="#ef4444"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
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

const ColumnHeadersContainer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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

const FlowComponent = () => {
  const { nodes: initialNodes, edges: initialEdges, columns, loadParsedTranscript } = useNoteStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showModal, setShowModal] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const reactFlowInstance = useReactFlow();

  // Load parsed transcript immediately on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        await loadParsedTranscript();
      } catch (error) {
        console.error('Failed to load initial data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [loadParsedTranscript]);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    console.log('Edges loaded:', initialEdges);
    console.log('Edge types:', initialEdges.map(edge => edge.type));
    logEdgeTypes(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

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
    }
  }, [reactFlowInstance, nodes]);

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

  const handleModalKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setShowModal(false);
      // Scroll to the 35th node
      setTimeout(() => {
        const targetNode = nodes.find(node => node.id === 'note-35');
        if (targetNode && reactFlowInstance) {
          reactFlowInstance.setCenter(targetNode.position.x, targetNode.position.y, { duration: 1000 });
        }
      }, 100);
    }
  }, [nodes, reactFlowInstance]);

  const columnTitles = useMemo(() => {
    return columns.map(col => col.title);
  }, [columns]);

  return (
    <div style={{ width: '100vw', height: '100vh' }} className="flow-area">
      {/* Loading Indicator */}
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(255, 255, 255, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '2px solid #3b82f6',
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }}></div>
            <p style={{ color: '#666' }}>Loading transcript data...</p>
          </div>
        </div>
      )}
      {showModal && (
        <Modal>
          <ModalContent>
            <ModalText>
              Welcome to the conversation flow! This is a sample text to demonstrate the modal functionality.
              Press Enter to continue and scroll to the 35th node in the conversation.
            </ModalText>
            <ModalInput
              placeholder="Press Enter to continue..."
              onKeyDown={handleModalKeyDown}
              autoFocus
            />
          </ModalContent>
        </Modal>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.1}
        maxZoom={2}
        panOnScroll={false}
        zoomOnScroll={false}
        style={{ background: '#f8fafc' }}
      >
        <Controls />
      </ReactFlow>
      {/* Column Headers */}
      <ColumnHeadersContainer>
        {columnTitles.map((title, index) => (
          <ColumnHeader key={index} style={{ left: `${index * (COLUMN_WIDTH + COLUMN_GAP)}px` }}>
            {title}
          </ColumnHeader>
        ))}
      </ColumnHeadersContainer>
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