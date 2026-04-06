import { useCallback, useEffect, useRef, useState } from "react";
import ReactFlow, {
  useNodesState,
  useEdgesState,
  useReactFlow,
  Background,
  BackgroundVariant,
  Controls,
} from "reactflow";
import "reactflow/dist/style.css";
import { useDocumentStore } from "../store/documentStore";
import ParagraphNode from "./ParagraphNode";
import AnnotationNode from "./AnnotationNode";
import { CustomEdge, EdgeNo, EdgeYes, EllipsisEdge } from "./EdgeComponents";

// Static registrations — outside component to avoid recreation
const nodeTypes = {
  paragraphNode: ParagraphNode,
  annotationNode: AnnotationNode,
};

const edgeTypes = {
  articleLink: CustomEdge,
  smoothstep: CustomEdge,
  ellipsis: EllipsisEdge,
  yes: EdgeYes,
  no: EdgeNo,
  default: CustomEdge,
  straight: CustomEdge,
  step: CustomEdge,
  bezier: CustomEdge,
};

// ─── Shared modal overlay style ────────────────────────────────────────────────
const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: "14px",
  boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const primaryBtn: React.CSSProperties = {
  padding: "8px 20px",
  background: "#1e293b",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 600,
  fontFamily: "inherit",
};

const secondaryBtn: React.CSSProperties = {
  padding: "8px 16px",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  background: "#fff",
  cursor: "pointer",
  fontSize: "13px",
  fontFamily: "inherit",
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  fontSize: "14px",
  outline: "none",
  fontFamily: "inherit",
  color: "#1e293b",
  width: "100%",
  boxSizing: "border-box",
};

// ─── Main component ─────────────────────────────────────────────────────────
const DocumentFlow = () => {
  const {
    nodes: storeNodes,
    edges: storeEdges,
    documentTitle,
    loadDocument,
    createHighlight,
    addReply,
    addTag,
  } = useDocumentStore();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { setViewport } = useReactFlow();
  const lastDocTitle = useRef<string>("");
  const pannedToNodes = useRef(new Set<string>());

  // New-document modal
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [docText, setDocText] = useState("");
  const [docTitle, setDocTitle] = useState("");

  // Reply modal
  const [replyNodeId, setReplyNodeId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replyEdgeType, setReplyEdgeType] = useState("smoothstep");

  // Tag modal
  const [tagNodeId, setTagNodeId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  // Floating highlight button — rendered here (outside ReactFlow's transform layer)
  const [highlightSelection, setHighlightSelection] = useState<{
    text: string;
    sourceNodeId: string;
    startIdx: number;
    endIdx: number;
    rect: { top: number; bottom: number; left: number; right: number };
  } | null>(null);

  // Sync store → local ReactFlow state
  useEffect(() => {
    setNodes(storeNodes);
  }, [storeNodes, setNodes]);

  // When a new document loads, snap to zoom=2 with paragraphs at the top-left.
  // COLUMN_X_BASE=20, first paragraph y=20 → viewport (-20,-20,2) puts them at screen (20,20).
  useEffect(() => {
    if (storeNodes.length > 0 && documentTitle !== lastDocTitle.current) {
      lastDocTitle.current = documentTitle;
      setViewport({ x: -20, y: -20, zoom: 2 }, { duration: 250 });
    }
  }, [storeNodes.length, documentTitle, setViewport]);

  useEffect(() => {
    setEdges(storeEdges);
  }, [storeEdges, setEdges]);

  // Pan viewport to center the source + new annotation pair when a highlight/annotation is created
  useEffect(() => {
    const fresh = storeNodes.find(
      (n) => n.data.nodeType === "annotation" && n.data.isNew && !pannedToNodes.current.has(n.id)
    );
    if (!fresh) return;
    pannedToNodes.current.add(fresh.id);

    // Find the source node so we can center the pair
    const sourceEdge = storeEdges.find((e) => e.target === fresh.id);
    const sourceNode = sourceEdge ? storeNodes.find((n) => n.id === sourceEdge.source) : null;

    const pairLeft = sourceNode ? sourceNode.position.x : fresh.position.x;
    const pairRight = fresh.position.x + 300; // annotation node width
    const pairCenterX = (pairLeft + pairRight) / 2;
    // Vertical: annotation is roughly aligned with source, use annotation center as proxy
    const pairCenterY = fresh.position.y + 85;

    const availH = window.innerHeight - 52; // subtract header height
    setViewport(
      {
        x: window.innerWidth / 2 - pairCenterX * 2,
        y: availH / 2 - pairCenterY * 2,
        zoom: 2,
      },
      { duration: 250 }
    );
  }, [storeNodes, storeEdges, setViewport]);

  // ── Event listeners from nodes ─────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: Event) => {
      const { action, nodeId } = (e as CustomEvent).detail;
      if (action === "tag") {
        setTagNodeId(nodeId);
        setTagInput("");
      }
    };
    document.addEventListener("docParagraphAction", handler);
    return () => document.removeEventListener("docParagraphAction", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { nodeId } = (e as CustomEvent).detail;
      setReplyNodeId(nodeId);
      setReplyContent("");
      setReplyEdgeType("smoothstep");
    };
    document.addEventListener("docAnnotationAction", handler);
    return () => document.removeEventListener("docAnnotationAction", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { nodeId } = (e as CustomEvent).detail;
      setTagNodeId(nodeId);
      setTagInput("");
    };
    document.addEventListener("docTagAction", handler);
    return () => document.removeEventListener("docTagAction", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { text, sourceNodeId, startIdx, endIdx } = (e as CustomEvent).detail;
      createHighlight(text, sourceNodeId, startIdx, endIdx);
    };
    document.addEventListener("docCreateHighlight", handler);
    return () => document.removeEventListener("docCreateHighlight", handler);
  }, [createHighlight]);

  // Listen for text selections from ParagraphNode
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setHighlightSelection(detail ?? null);
    };
    document.addEventListener("docTextSelected", handler);
    return () => document.removeEventListener("docTextSelected", handler);
  }, []);

  // Clear highlight button on any mousedown outside it
  useEffect(() => {
    const handler = () => setHighlightSelection(null);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleHighlightClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (highlightSelection) {
        createHighlight(
          highlightSelection.text,
          highlightSelection.sourceNodeId,
          highlightSelection.startIdx,
          highlightSelection.endIdx,
        );
        setHighlightSelection(null);
        window.getSelection()?.removeAllRanges();
      }
    },
    [highlightSelection, createHighlight]
  );

  const handleCreateDocument = useCallback(() => {
    if (docText.trim()) {
      loadDocument(docText.trim(), docTitle.trim() || "Untitled Document");
      setShowNewDoc(false);
      setDocText("");
      setDocTitle("");
    }
  }, [docText, docTitle, loadDocument]);

  const handleSubmitReply = useCallback(() => {
    if (replyNodeId && replyContent.trim()) {
      addReply(replyContent.trim(), replyNodeId, replyEdgeType);
      setReplyNodeId(null);
      setReplyContent("");
    }
  }, [replyNodeId, replyContent, replyEdgeType, addReply]);

  const handleSubmitTag = useCallback(() => {
    if (tagNodeId && tagInput.trim()) {
      addTag(tagNodeId, tagInput.trim());
      setTagNodeId(null);
      setTagInput("");
    }
  }, [tagNodeId, tagInput, addTag]);

  const hasContent = storeNodes.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        background: "#f8fafc",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          height: "52px",
          background: "#fff",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: "12px",
          zIndex: 100,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: "15px",
            color: "#0f172a",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {hasContent ? documentTitle : "Document Mode"}
        </div>

        {/* Legend */}
        {hasContent && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "11px",
              color: "#94a3b8",
              fontFamily: "inherit",
            }}
          >
            <span>Select text → highlight</span>
            <span>·</span>
            <span>Click annotation → reply</span>
          </div>
        )}

        <button
          onClick={() => setShowNewDoc(true)}
          style={primaryBtn}
        >
          {hasContent ? "+ New Document" : "Open Document"}
        </button>
      </div>

      {/* ── Canvas ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: "relative" }}>
        {hasContent ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={{ x: -20, y: -20, zoom: 2 }}
            minZoom={2}
            maxZoom={2}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            defaultEdgeOptions={{ style: { strokeWidth: 1.5 } }}
            nodesDraggable
            panOnScroll
            selectionOnDrag={false}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="#e2e8f0"
            />
            <Controls showInteractive={false} style={{ bottom: 16, left: 16 }} />
          </ReactFlow>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "14px",
              color: "#94a3b8",
              fontFamily: "inherit",
            }}
          >
            <div style={{ fontSize: "40px" }}>📄</div>
            <div style={{ fontSize: "18px", fontWeight: 600, color: "#334155" }}>
              No document open
            </div>
            <div style={{ fontSize: "14px" }}>
              Paste any text to break it into paragraphs and start annotating
            </div>
            <button
              onClick={() => setShowNewDoc(true)}
              style={{ ...primaryBtn, marginTop: "6px", padding: "10px 28px", fontSize: "14px" }}
            >
              Open Document
            </button>
          </div>
        )}
      </div>

      {/* ── Floating Highlight Button ─────────────────────────────────────── */}
      {highlightSelection && (
        <div
          style={{
            position: "fixed",
            top: highlightSelection.rect.bottom + 8,
            left: Math.round(
              (highlightSelection.rect.left + highlightSelection.rect.right) / 2 - 52
            ),
            zIndex: 9999,
            background: "#1e293b",
            color: "#fff",
            padding: "6px 16px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            boxShadow: "0 4px 14px rgba(0,0,0,0.28)",
            whiteSpace: "nowrap",
            letterSpacing: "0.02em",
            pointerEvents: "auto",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleHighlightClick}
        >
          ✎ Highlight
        </div>
      )}

      {/* ── New Document Modal ─────────────────────────────────────────────── */}
      {showNewDoc && (
        <div style={overlayStyle} onClick={() => setShowNewDoc(false)}>
          <div
            style={{
              ...cardStyle,
              width: "600px",
              maxWidth: "92vw",
              maxHeight: "85vh",
              padding: "24px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: "17px",
                color: "#0f172a",
                marginBottom: "2px",
              }}
            >
              New Document
            </div>
            <input
              placeholder="Title (optional)"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              style={inputStyle}
            />
            <textarea
              autoFocus
              placeholder={
                "Paste your document here.\n\nParagraphs are separated by blank lines.\nEach paragraph becomes a node you can highlight, annotate, and reply to."
              }
              value={docText}
              onChange={(e) => setDocText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setShowNewDoc(false);
              }}
              style={{
                ...inputStyle,
                fontFamily: "inherit",
                lineHeight: "1.7",
                resize: "vertical",
                minHeight: "280px",
                fontSize: "15px",
              }}
            />
            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
                marginTop: "4px",
              }}
            >
              <button
                onClick={() => setShowNewDoc(false)}
                style={secondaryBtn}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDocument}
                disabled={!docText.trim()}
                style={{
                  ...primaryBtn,
                  opacity: docText.trim() ? 1 : 0.45,
                  cursor: docText.trim() ? "pointer" : "default",
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reply Modal ───────────────────────────────────────────────────── */}
      {replyNodeId && (
        <div style={overlayStyle} onClick={() => setReplyNodeId(null)}>
          <div
            style={{ ...cardStyle, width: "420px", maxWidth: "92vw", padding: "20px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>
              Reply
            </div>
            <textarea
              autoFocus
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleSubmitReply();
                }
                if (e.key === "Escape") setReplyNodeId(null);
              }}
              placeholder="Write your reply…"
              style={{
                ...inputStyle,
                minHeight: "80px",
                resize: "none",
                lineHeight: "1.6",
              }}
            />
            <select
              value={replyEdgeType}
              onChange={(e) => setReplyEdgeType(e.target.value)}
              style={{
                ...inputStyle,
                cursor: "pointer",
                appearance: "auto",
              }}
            >
              <option value="smoothstep">— Note</option>
              <option value="yes">✓ Agree</option>
              <option value="no">✗ Disagree</option>
              <option value="ellipsis">… Continue</option>
            </select>
            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
                marginTop: "2px",
              }}
            >
              <button onClick={() => setReplyNodeId(null)} style={secondaryBtn}>
                Cancel
              </button>
              <button
                onClick={handleSubmitReply}
                disabled={!replyContent.trim()}
                style={{
                  ...primaryBtn,
                  opacity: replyContent.trim() ? 1 : 0.45,
                  cursor: replyContent.trim() ? "pointer" : "default",
                }}
              >
                Reply (⌘↵)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tag Modal ─────────────────────────────────────────────────────── */}
      {tagNodeId && (
        <div style={overlayStyle} onClick={() => setTagNodeId(null)}>
          <div
            style={{ ...cardStyle, width: "300px", maxWidth: "92vw", padding: "18px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>
              Add Tag
            </div>
            <input
              autoFocus
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmitTag();
                if (e.key === "Escape") setTagNodeId(null);
              }}
              placeholder="Enter tag name…"
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setTagNodeId(null)} style={secondaryBtn}>
                Cancel
              </button>
              <button
                onClick={handleSubmitTag}
                disabled={!tagInput.trim()}
                style={{
                  ...primaryBtn,
                  opacity: tagInput.trim() ? 1 : 0.45,
                  cursor: tagInput.trim() ? "pointer" : "default",
                }}
              >
                Add Tag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentFlow;
