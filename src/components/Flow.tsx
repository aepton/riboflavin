import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import ReactFlow, {
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { useNoteStore } from "../store/noteStore";
import NoteNode from "./NoteNode";
import { CustomEdge, EdgeNo, EdgeYes, EllipsisEdge } from "./EdgeComponents";
import {
  Modal,
  ModalContent,
  ModalText,
  ColumnHeader,
  ColumnHeadersContainer,
  NoteModal,
  NoteModalContent,
  NoteModalTitle,
  NoteModalTextarea,
  NoteModalSelect,
  NoteModalButton,
  NoteModalCancelButton,
} from "./FlowStyles";

// Import constants from store
const COLUMN_WIDTH = 300;

// Static node and edge types - defined outside component to prevent recreation
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
    addNoteToFourthColumn,
    lastUsedEdgeType,
  } = useNoteStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const reactFlowInstance = useReactFlow();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [modalText, setModalText] = useState("");

  // Note creation modal state
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [selectedEdgeType, setSelectedEdgeType] = useState("smoothstep");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const selectedTextRef = useRef<string>("");
  const justOpenedWithSelectionRef = useRef<boolean>(false);

  // Filter state
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Check for admin parameter
  const urlParams = new URLSearchParams(window.location.search);
  const isAdmin = urlParams.get("admin") === "true";

  const handleNoteClick = useCallback(
    (nodeId: string, content: string, columnId: string) => {
      // Check if there's a text selection - if so, don't clear the content
      const selection = window.getSelection();
      const hasSelection = selection && selection.toString().trim().length > 0;

      if (!hasSelection) {
        setSelectedNodeId(nodeId);
        setNoteContent("");
        selectedTextRef.current = ""; // Clear the ref for blank modals
        setSelectedEdgeType(lastUsedEdgeType);
        setShowNoteModal(true);
      }
    },
    [lastUsedEdgeType]
  );

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

  // Only update nodes and edges when they actually change
  useEffect(() => {
    if (initialNodes.length > 0) {
      setNodes(initialNodes);
    }
  }, [initialNodes, setNodes]);

  useEffect(() => {
    if (initialEdges.length > 0) {
      setEdges(initialEdges);
    }
  }, [initialEdges, setEdges]);

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

  // Handle keyboard scrolling
  const onKeyDown = useCallback(
    (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (
        keyboardEvent.key === "ArrowUp" ||
        keyboardEvent.key === "ArrowDown"
      ) {
        event.preventDefault();
        event.stopPropagation();

        const { x, y } = reactFlowInstance.getViewport();
        const scrollAmount = 100; // Pixels to scroll per key press

        // Calculate new Y position based on arrow key
        let newY = y;
        if (keyboardEvent.key === "ArrowUp") {
          newY = y + scrollAmount; // Scroll up
        } else if (keyboardEvent.key === "ArrowDown") {
          newY = y - scrollAmount; // Scroll down
        }

        reactFlowInstance.setViewport({
          x: x, // Keep x position unchanged
          y: newY,
          zoom: 1, // Always keep zoom at 1
        });
      }
    },
    [reactFlowInstance]
  );

  // Add keyboard event listener to the entire flow area
  useEffect(() => {
    const flowArea = document.querySelector(".flow-area");
    if (flowArea) {
      flowArea.addEventListener("keydown", onKeyDown, { passive: false });
      return () => {
        flowArea.removeEventListener("keydown", onKeyDown);
      };
    }
  }, [onKeyDown]);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("[data-filter-dropdown]")) {
        setShowFilterDropdown(false);
      }
    };

    if (showFilterDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showFilterDropdown]);

  const scrollToNode = (nodeId: string) => {
    if (!reactFlowInstance) return;

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Calculate the center position of the node
    const nodeCenterY = node.position.y + 100; // Half of node height

    // Get the flow container dimensions
    const flowContainer = reactFlowWrapper.current;
    if (!flowContainer) return;

    const containerWidth = flowContainer.offsetWidth;
    const containerHeight = flowContainer.offsetHeight;

    // Get current viewport position to maintain x position
    const currentViewport = reactFlowInstance.getViewport();
    const currentX = currentViewport.x;

    // Calculate the viewport center that would center the target node
    const viewportY = nodeCenterY - containerHeight / 2;

    // Use setCenter to avoid zoom changes, keeping current x position
    reactFlowInstance.setCenter(
      currentX + containerWidth / 2,
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

  // Show modal only if not admin - only on initial load
  useEffect(() => {
    if (!isAdmin && nodes.length > 0 && !isLoading) {
      setModalText(
        "Welcome to the transcript viewer. Press Enter to scroll to the 35th note."
      );
      setShowModal(true);
    }
  }, [isAdmin, isLoading]); // Remove nodes dependency to prevent modal from showing on filter changes

  // Focus the modal when it appears
  useEffect(() => {
    if (showModal) {
      const modal = document.querySelector('[tabindex="0"]') as HTMLElement;
      if (modal) {
        modal.focus();
      }
    }
  }, [showModal]);

  // Listen for note clicks from the first three speakers
  useEffect(() => {
    const handleNoteClickEvent = (event: CustomEvent) => {
      const { nodeId, content, columnId } = event.detail;

      // Check if we just opened the modal with selected text
      if (justOpenedWithSelectionRef.current) {
        return;
      }

      // Check if there's a text selection - if so, don't clear the content
      const selection = window.getSelection();
      const hasSelection = selection && selection.toString().trim().length > 0;

      if (!hasSelection) {
        setSelectedNodeId(nodeId);
        setNoteContent("");
        selectedTextRef.current = ""; // Clear the ref for blank modals
        setSelectedEdgeType("smoothstep");
        setShowNoteModal(true);
      }
    };

    document.addEventListener(
      "noteClick",
      handleNoteClickEvent as EventListener
    );

    return () => {
      document.removeEventListener(
        "noteClick",
        handleNoteClickEvent as EventListener
      );
    };
  }, []);

  // Global text selection handler
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      const selection = window.getSelection();

      if (selection && selection.toString().trim().length > 0) {
        // Find which node contains the selection
        const range = selection.getRangeAt(0);
        const nodeElement =
          range.commonAncestorContainer.parentElement?.closest("[data-id]");

        if (nodeElement) {
          const nodeId = nodeElement.getAttribute("data-id");
          if (nodeId) {
            const node = nodes.find((n: any) => n.id === nodeId);

            if (
              node &&
              (node.data.columnId === "column-1" ||
                node.data.columnId === "column-2" ||
                node.data.columnId === "column-3")
            ) {
              const selectedText = selection.toString().trim();
              const quotedText = `> ${selectedText}`;

              // Open the rebuttal modal with selected text
              selectedTextRef.current = quotedText;
              justOpenedWithSelectionRef.current = true;
              setSelectedNodeId(nodeId);
              setSelectedEdgeType("smoothstep");
              setNoteContent(quotedText);
              setShowNoteModal(true);
              
              // Clear the flag after a short delay
              setTimeout(() => {
                justOpenedWithSelectionRef.current = false;
              }, 100);
            }
          }
        }
      }
    };

    document.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [nodes]);

  // Listen for text selection events (keeping for backward compatibility)
  useEffect(() => {
    const handleTextSelectedEvent = (event: CustomEvent) => {
      const { nodeId, selectedText, columnId } = event.detail;
      setSelectedNodeId(nodeId);
      setNoteContent(selectedText);
      setSelectedEdgeType("smoothstep");
      setShowNoteModal(true);
    };

    document.addEventListener(
      "textSelected",
      handleTextSelectedEvent as EventListener
    );

    return () => {
      document.removeEventListener(
        "textSelected",
        handleTextSelectedEvent as EventListener
      );
    };
  }, []);

  const handleNoteModalSubmit = () => {
    if (noteContent.trim() && selectedNodeId) {
      addNoteToFourthColumn(
        noteContent.trim(),
        selectedNodeId,
        selectedEdgeType
      );
      setShowNoteModal(false);
      setNoteContent("");
      setSelectedNodeId("");
      selectedTextRef.current = ""; // Clear the ref
      justOpenedWithSelectionRef.current = false; // Clear the flag
    }
  };

  const handleNoteModalCancel = () => {
    setShowNoteModal(false);
    setNoteContent("");
    setSelectedNodeId("");
    selectedTextRef.current = ""; // Clear the ref
    justOpenedWithSelectionRef.current = false; // Clear the flag
  };

  const handleNoteModalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleNoteModalSubmit();
    } else if (e.key === "Enter" && !e.shiftKey) {
      // Enter key (without shift) saves and closes the modal
      e.preventDefault();
      handleNoteModalSubmit();
    } else if (e.key === "Escape") {
      handleNoteModalCancel();
    }
  };

  const handleSaveData = async () => {
    try {
      // Prepare the data in the same format as the original
      const saveData = {
        columns: columns.map((column) => ({
          id: column.id,
          title: column.title,
          notes: nodes
            .filter((node) => node.data.columnId === column.id)
            .map((node) => ({
              id: node.id,
              content: node.data.content,
            })),
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type || "smoothstep",
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
        })),
      };

      const response = await fetch("http://localhost:8000/api/save-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(saveData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await response.json();
    } catch (error) {
      console.error("Error saving data:", error);
      alert("Error saving data. Please check the console for details.");
    }
  };

  // Filter nodes and edges based on active filter
  const filteredNodes = useMemo(() => {
    if (!activeFilter) return nodes;

    // Find all nodes that have edges of the specified type
    const nodesWithFilteredEdges = new Set<string>();

    edges.forEach((edge) => {
      if (edge.type === activeFilter) {
        nodesWithFilteredEdges.add(edge.source);
        nodesWithFilteredEdges.add(edge.target);
      }
    });

    return nodes.filter((node) => nodesWithFilteredEdges.has(node.id));
  }, [nodes, edges, activeFilter]);

  const filteredEdges = useMemo(() => {
    if (!activeFilter) return edges;
    return edges.filter((edge) => edge.type === activeFilter);
  }, [edges, activeFilter]);

  // Recalculate viewport when filter changes - using same logic as scroll wheel handler
  useEffect(() => {
    if (reactFlowInstance && filteredNodes.length > 0) {
      // Use the same bounds calculation as the scroll wheel handler
      const flowArea = document.querySelector(".flow-area");
      const flowHeight = flowArea?.clientHeight || window.innerHeight;

      // Get the highest and lowest node positions from filtered nodes
      const nodePositions = filteredNodes.map((node) => node.position.y);
      const minNodeY = Math.min(...nodePositions);
      const maxNodeY = Math.max(...nodePositions);

      // Estimate the height of the highest node (same logic as scroll wheel)
      const highestNode = filteredNodes.find(
        (node) => node.position.y === maxNodeY
      );
      let highestNodeHeight = 140; // Default height

      if (highestNode) {
        const contentLength = highestNode.data.content.length;
        const estimatedLines = Math.ceil(contentLength / 50);
        highestNodeHeight = Math.max(140, estimatedLines * 28 + 60);
      }

      // Calculate bounds using same logic as scroll wheel handler
      const topBound = -minNodeY + 50; // Keep some padding at top
      const bottomBound = -(maxNodeY + highestNodeHeight - flowHeight + 50); // Keep some padding at bottom

      // Set viewport to show all filtered nodes with proper bounds
      const currentViewport = reactFlowInstance.getViewport();

      reactFlowInstance.setViewport({
        x: currentViewport.x, // Keep x position unchanged
        y: Math.max(bottomBound, Math.min(topBound, currentViewport.y)), // Clamp to bounds like scroll wheel
        zoom: 1,
      });
    }
  }, [reactFlowInstance, filteredNodes, activeFilter]);

  // Handle mouse wheel for vertical scrolling only - using filtered nodes when filter is active
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

        // Use filtered nodes when filter is active, otherwise use all nodes
        const nodesToUse = activeFilter ? filteredNodes : nodes;

        if (nodesToUse.length === 0) return;

        // Get the highest and lowest node positions
        const nodePositions = nodesToUse.map((node) => node.position.y);
        const minNodeY = Math.min(...nodePositions);
        const maxNodeY = Math.max(...nodePositions);

        // Estimate the height of the highest and lowest nodes
        const highestNode = nodesToUse.find(
          (node) => node.position.y === maxNodeY
        );
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
    [reactFlowInstance, nodes, filteredNodes, activeFilter]
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

  const handleFilterToggle = (filterType: string) => {
    if (activeFilter === filterType) {
      setActiveFilter(null); // Clear filter
    } else {
      setActiveFilter(filterType); // Set new filter
    }
    setShowFilterDropdown(false);
  };

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const { id, data } = node;

      if (data && data.columnId) {
        const { columnId, content } = data;

        // Only allow clicking on notes from the first three speakers when admin=true
        if (
          isAdmin &&
          (columnId === "column-1" ||
            columnId === "column-2" ||
            columnId === "column-3")
        ) {
          // Check if we just opened the modal with selected text
          if (justOpenedWithSelectionRef.current) {
            return;
          }
          
          handleNoteClick(id, content, columnId);
        }
      }
    },
    [handleNoteClick, isAdmin]
  );

  return (
    <div
      style={{ width: "100vw", height: "100vh", background: "#ffffff" }}
      className="flow-area"
    >
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
            backdropFilter: "blur(4px)",
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
            <p
              style={{ color: "#6b7280", fontSize: "16px", fontWeight: "500" }}
            >
              Loading transcript data...
            </p>
          </div>
        </div>
      )}

      {/* Save Button - Only visible when admin=true */}
      {isAdmin && !isLoading && (
        <button
          onClick={handleSaveData}
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            padding: "0.75rem 1.5rem",
            backgroundColor: "#10b981",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: "600",
            zIndex: 100,
            boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#059669";
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 6px 12px rgba(0,0,0,0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#10b981";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 6px rgba(0,0,0,0.05)";
          }}
        >
          Save Data
        </button>
      )}

      {/* Filter Button - Visible to all users */}
      {!isLoading && (
        <div
          style={{
            position: "absolute",
            top: isAdmin ? "80px" : "20px",
            right: "20px",
            zIndex: 100,
          }}
          data-filter-dropdown
        >
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: activeFilter ? "#3b82f6" : "#6b7280",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "600",
              boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = activeFilter
                ? "#2563eb"
                : "#4b5563";
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 6px 12px rgba(0,0,0,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = activeFilter
                ? "#3b82f6"
                : "#6b7280";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 6px rgba(0,0,0,0.05)";
            }}
          >
            <span style={{ fontSize: "16px" }}>🔍</span>
            Filter
            {activeFilter && (
              <span style={{ fontSize: "12px", opacity: 0.8 }}>
                ({activeFilter})
              </span>
            )}
          </button>

          {/* Filter Dropdown */}
          {showFilterDropdown && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: "4px",
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                boxShadow: "0 10px 15px rgba(0,0,0,0.1)",
                padding: "0.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
                minWidth: "120px",
              }}
            >
              <button
                onClick={() => handleFilterToggle("yes")}
                style={{
                  padding: "0.5rem 0.75rem",
                  backgroundColor:
                    activeFilter === "yes" ? "#10b981" : "transparent",
                  color: activeFilter === "yes" ? "white" : "#374151",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  transition: "all 0.2s",
                  fontWeight: "500",
                }}
                onMouseEnter={(e) => {
                  if (activeFilter !== "yes") {
                    e.currentTarget.style.backgroundColor = "#f3f4f6";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeFilter !== "yes") {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                <span style={{ fontSize: "16px" }}>✓</span>
                Yes
              </button>

              <button
                onClick={() => handleFilterToggle("no")}
                style={{
                  padding: "0.5rem 0.75rem",
                  backgroundColor:
                    activeFilter === "no" ? "#ef4444" : "transparent",
                  color: activeFilter === "no" ? "white" : "#374151",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  transition: "all 0.2s",
                  fontWeight: "500",
                }}
                onMouseEnter={(e) => {
                  if (activeFilter !== "no") {
                    e.currentTarget.style.backgroundColor = "#f3f4f6";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeFilter !== "no") {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                <span style={{ fontSize: "16px" }}>✗</span>
                No
              </button>

              <button
                onClick={() => handleFilterToggle("ellipsis")}
                style={{
                  padding: "0.5rem 0.75rem",
                  backgroundColor:
                    activeFilter === "ellipsis" ? "#8b5cf6" : "transparent",
                  color: activeFilter === "ellipsis" ? "white" : "#374151",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  transition: "all 0.2s",
                  fontWeight: "500",
                }}
                onMouseEnter={(e) => {
                  if (activeFilter !== "ellipsis") {
                    e.currentTarget.style.backgroundColor = "#f3f4f6";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeFilter !== "ellipsis") {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                <span style={{ fontSize: "16px" }}>⋯</span>
                Ellipsis
              </button>

              {/* Clear Filter Option */}
              {activeFilter && (
                <>
                  <div
                    style={{
                      height: "1px",
                      backgroundColor: "#e5e7eb",
                      margin: "0.25rem 0",
                    }}
                  />
                  <button
                    onClick={() => handleFilterToggle(activeFilter)}
                    style={{
                      padding: "0.5rem 0.75rem",
                      backgroundColor: "transparent",
                      color: "#6b7280",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      transition: "all 0.2s",
                      fontWeight: "500",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#f3f4f6";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <span style={{ fontSize: "16px" }}>✕</span>
                    Clear Filter
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <Modal onKeyDown={handleModalKeyDown} tabIndex={0}>
          <ModalContent>
            <ModalText>{modalText}</ModalText>
            <button
              onClick={() => {
                setShowModal(false);
                // Find the 35th node (index 34)
                const targetNode = nodes[34];
                if (targetNode) {
                  setTimeout(() => scrollToNode(targetNode.id), 100);
                }
              }}
              style={{
                marginTop: "1.5rem",
                padding: "0.75rem 1.5rem",
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "600",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#2563eb";
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 12px rgba(0,0,0,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#3b82f6";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              Continue
            </button>
          </ModalContent>
        </Modal>
      )}
      {showNoteModal && (
        <NoteModal>
          <NoteModalContent onKeyDown={handleNoteModalKeyDown}>
            <NoteModalTitle>Add Note to Fourth Column</NoteModalTitle>
            <NoteModalTextarea
              value={noteContent || selectedTextRef.current}
              onChange={(e) => setNoteContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleNoteModalSubmit();
                }
              }}
              placeholder="Enter your note content... (supports markdown formatting)"
              autoFocus
            />
            <NoteModalSelect
              value={selectedEdgeType}
              onChange={(e) => setSelectedEdgeType(e.target.value)}
            >
              <option value="smoothstep">Smooth Step</option>
              <option value="ellipsis">Ellipsis (...)</option>
              <option value="yes">Yes (✓)</option>
              <option value="no">No (✗)</option>
            </NoteModalSelect>
            <div>
              <NoteModalButton onClick={handleNoteModalSubmit}>
                Add Note
              </NoteModalButton>
              <NoteModalCancelButton onClick={handleNoteModalCancel}>
                Cancel
              </NoteModalCancelButton>
            </div>
          </NoteModalContent>
        </NoteModal>
      )}
      {nodes.length > 1 && columns.length > 1 && (
        <>
          <ReactFlow
            ref={reactFlowWrapper}
            nodes={filteredNodes}
            edges={filteredEdges}
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
            panOnDrag={false}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
            selectNodesOnDrag={false}
            style={{ background: "#f8fafc" }}
            onError={(error) => {
              // Only log non-008 errors to reduce noise
              if (!String(error).includes("008")) {
                console.error("ReactFlow error:", error);
              }
            }}
            attributionPosition="bottom-right"
            onNodeClick={handleNodeClick}
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
