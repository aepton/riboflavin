import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import styled from "@emotion/styled";
import { useNoteStore } from "../store/noteStore";
import NoteNode from "./NoteNode";

// Import constants from store
const COLUMN_WIDTH = 300;

// Add CSS for spinner animation
const spinnerStyle = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

// Inject the CSS
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = spinnerStyle;
  document.head.appendChild(style);
}

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

// Edge component props interface
interface EdgeProps {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  id?: string;
}

// Custom edge component that connects to the closest handles
const CustomEdge = ({ sourceX, sourceY, targetX, targetY }: EdgeProps) => {
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

  return (
    <path
      d={path}
      stroke="#3b82f6"
      strokeWidth={2}
      fill="none"
      style={{ zIndex: 1 }}
    />
  );
};

// Custom edge component with ellipsis overlay
const EllipsisEdge = ({ sourceX, sourceY, targetX, targetY }: EdgeProps) => {
  // Calculate position closer to source (1/3 of the way from source to target)
  const symbolX = sourceX + (targetX - sourceX) * 0.33;
  const symbolY = sourceY + (targetY - sourceY) * 0.33;

  // Use ReactFlow's provided coordinates - they're already correct
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

  return (
    <g style={{ zIndex: 1 }}>
      <path
        d={path}
        stroke="#3b82f6"
        strokeWidth={2}
        fill="none"
        style={{ zIndex: 1 }}
      />
      {/* Gradient background circle */}
      <defs>
        <radialGradient id="ellipsisGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f8fafc" stopOpacity="1" />
          <stop offset="100%" stopColor="#f8fafc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        cx={symbolX}
        cy={symbolY}
        r="64"
        fill="url(#ellipsisGradient)"
        style={{ zIndex: 2 }}
      />
      <text
        x={symbolX}
        y={symbolY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="32"
        fill="#3b82f6"
        style={{ userSelect: "none", pointerEvents: "none", zIndex: 3 }}
      >
        ...
      </text>
    </g>
  );
};

// Custom edge component with check mark
const EdgeYes = ({ sourceX, sourceY, targetX, targetY }: EdgeProps) => {
  // Calculate position closer to source (1/3 of the way from source to target)
  const symbolX = sourceX + (targetX - sourceX) * 0.33;
  const symbolY = sourceY + (targetY - sourceY) * 0.33;

  // Use ReactFlow's provided coordinates - they're already correct
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

  return (
    <g style={{ zIndex: 1 }}>
      <path
        d={path}
        stroke="#10b981"
        strokeWidth={2}
        fill="none"
        style={{ zIndex: 1 }}
      />
      {/* Gradient background circle */}
      <defs>
        <radialGradient id="checkGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f8fafc" stopOpacity="1" />
          <stop offset="100%" stopColor="#f8fafc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        cx={symbolX}
        cy={symbolY}
        r="64"
        fill="url(#checkGradient)"
        style={{ zIndex: 2 }}
      />
      <text
        x={symbolX}
        y={symbolY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="32"
        fill="#10b981"
        style={{ userSelect: "none", pointerEvents: "none", zIndex: 3 }}
      >
        ✓
      </text>
    </g>
  );
};

// Custom edge component with X mark
const EdgeNo = ({ sourceX, sourceY, targetX, targetY }: EdgeProps) => {
  // Calculate position closer to source (1/3 of the way from source to target)
  const symbolX = sourceX + (targetX - sourceX) * 0.33;
  const symbolY = sourceY + (targetY - sourceY) * 0.33;

  // Use ReactFlow's provided coordinates - they're already correct
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

  return (
    <g style={{ zIndex: 1 }}>
      <path
        d={path}
        stroke="#ef4444"
        strokeWidth={2}
        fill="none"
        style={{ zIndex: 1 }}
      />
      {/* Gradient background circle */}
      <defs>
        <radialGradient id="xGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f8fafc" stopOpacity="1" />
          <stop offset="100%" stopColor="#f8fafc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        cx={symbolX}
        cy={symbolY}
        r="64"
        fill="url(#xGradient)"
        style={{ zIndex: 2 }}
      />
      <text
        x={symbolX}
        y={symbolY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="32"
        fill="#ef4444"
        style={{ userSelect: "none", pointerEvents: "none", zIndex: 3 }}
      >
        ✗
      </text>
    </g>
  );
};

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
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  gap: 8px;
  transform: translateX(-50%); /* Center the header */
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
  noteNode: NoteNode,
};

const edgeTypes = {
  articleLink: CustomEdge,
  smoothstep: CustomEdge,
  ellipsis: EllipsisEdge,
  yes: EdgeYes,
  no: EdgeNo,
  default: CustomEdge, // Fallback for any unmapped types
  // Add any other edge types that might come from the backend
  straight: CustomEdge,
  step: CustomEdge,
  bezier: CustomEdge,
};

const FlowComponent = () => {
  const {
    nodes: initialNodes,
    edges: initialEdges,
    columns,
    loadParsedTranscript,
  } = useNoteStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const reactFlowInstance = useReactFlow();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [modalText, setModalText] = useState("");

  // Check for admin parameter
  const urlParams = new URLSearchParams(window.location.search);
  const isAdmin = urlParams.get("admin") === "true";

  // Load parsed transcript immediately on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        await loadParsedTranscript();
      } catch (error) {
        console.error("Failed to load initial data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [loadParsedTranscript]);

  useEffect(() => {
    setNodes(initialNodes);
    // Add a small delay to ensure nodes are rendered before setting edges
    setTimeout(() => {
      setEdges(initialEdges);
    }, 100);
  }, [initialNodes, initialEdges, setNodes, setEdges, columns]);

  // Set initial viewport position after nodes are loaded
  useEffect(() => {
    if (reactFlowInstance && nodes.length > 0 && !isLoading) {
      // Set initial viewport to show the columns starting from the left margin
      reactFlowInstance.setViewport({
        x: -25, // Small offset to ensure first column is fully visible
        y: 0,
        zoom: 1,
      });
    }
  }, [reactFlowInstance, nodes, isLoading]);

  // Handle mouse wheel for vertical scrolling only
  const onWheel = useCallback(
    (event: Event) => {
      const wheelEvent = event as WheelEvent;
      event.preventDefault();
      event.stopPropagation();

      const { deltaY } = wheelEvent;

      // Only respond to vertical scrolling, completely ignore horizontal scrolling
      if (Math.abs(deltaY) > 0) {
        const { x, y } = reactFlowInstance.getViewport();

        // Calculate bounds to prevent scrolling notes off screen
        const flowArea = document.querySelector(".flow-area");
        const flowHeight = flowArea?.clientHeight || window.innerHeight;

        // Get the highest and lowest node positions
        const nodePositions = nodes.map((node) => node.position.y);
        const minNodeY = Math.min(...nodePositions);
        const maxNodeY = Math.max(...nodePositions);

        // Estimate the height of the highest and lowest nodes
        const highestNode = nodes.find((node) => node.position.y === maxNodeY);

        let highestNodeHeight = 140; // Default height

        if (highestNode) {
          const contentLength = highestNode.data.content.length;
          const estimatedLines = Math.ceil(contentLength / 50);
          highestNodeHeight = Math.max(140, estimatedLines * 28 + 60);
        }

        // Calculate bounds
        const topBound = -minNodeY + 50; // Keep some padding at top
        const bottomBound = -(maxNodeY + highestNodeHeight - flowHeight + 50); // Keep some padding at bottom

        // Only allow vertical scrolling, keep x position and zoom fixed
        const newY = y - deltaY;
        const clampedY = Math.max(bottomBound, Math.min(topBound, newY));

        reactFlowInstance.setViewport({
          x: x, // Keep x position unchanged
          y: clampedY,
          zoom: 1, // Always keep zoom at 1
        });
      }
    },
    [reactFlowInstance, nodes]
  );

  // Add wheel event listener to the entire flow area
  useEffect(() => {
    const flowArea = document.querySelector(".flow-area");
    if (flowArea) {
      flowArea.addEventListener("wheel", onWheel, { passive: false });
      return () => {
        flowArea.removeEventListener("wheel", onWheel);
      };
    }
  }, [onWheel]);

  const scrollToNode = (nodeId: string) => {
    if (!reactFlowInstance) return;

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Calculate the center position of the node
    const nodeCenterX = node.position.x + 200; // Half of node width
    const nodeCenterY = node.position.y + 100; // Half of node height

    // Get the flow container dimensions
    const flowContainer = reactFlowWrapper.current;
    if (!flowContainer) return;

    const containerWidth = flowContainer.offsetWidth;
    const containerHeight = flowContainer.offsetHeight;

    // Calculate the viewport center that would center the target node
    const viewportX = nodeCenterX - containerWidth / 2;
    const viewportY = nodeCenterY - containerHeight / 2;

    // Use setCenter to avoid zoom changes
    reactFlowInstance.setCenter(
      viewportX + containerWidth / 2,
      viewportY + containerHeight / 2,
      { duration: 800 }
    );
  };

  const handleModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setShowModal(false);
      // Find the 35th node (index 34)
      const targetNode = nodes[34];
      if (targetNode) {
        setTimeout(() => scrollToNode(targetNode.id), 100);
      }
    }
  };

  // Show modal only if not admin
  useEffect(() => {
    if (!isAdmin && nodes.length > 0) {
      setModalText(
        "Welcome to the transcript viewer. Press Enter to scroll to the 35th note."
      );
      setShowModal(true);
    }
  }, [nodes, isAdmin]);

  return (
    <div style={{ width: "100vw", height: "100vh" }} className="flow-area">
      {/* Loading Indicator */}
      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(255, 255, 255, 0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                border: "2px solid #3b82f6",
                borderTop: "2px solid transparent",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 16px",
              }}
            ></div>
            <p style={{ color: "#666" }}>Loading transcript data...</p>
          </div>
        </div>
      )}
      {showModal && (
        <Modal>
          <ModalContent>
            <ModalText>{modalText}</ModalText>
            <ModalInput
              placeholder="Press Enter to continue..."
              onKeyDown={handleModalKeyDown}
              autoFocus
            />
          </ModalContent>
        </Modal>
      )}
      {nodes.length > 1 && columns.length > 1 && (
        <>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={1}
            maxZoom={1}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            panOnScroll={false}
            panOnDrag={true}
            style={{ background: "#f8fafc" }}
            onError={(error) => {
              console.error("ReactFlow error:", error);
            }}
            attributionPosition="bottom-left"
          ></ReactFlow>
          {/* Column Headers */}
          <ColumnHeadersContainer>
            {columns.map((column) => {
              // Only show headers for columns that have titles
              if (!column.title || column.title.trim() === "") return null;

              return (
                <ColumnHeader
                  key={column.id}
                  style={{
                    position: "absolute",
                    top: "20px",
                    left: `${column.x + COLUMN_WIDTH / 2}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  {column.title}
                </ColumnHeader>
              );
            })}
          </ColumnHeadersContainer>
        </>
      )}
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
