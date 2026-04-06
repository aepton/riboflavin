import { useCallback, useEffect, useState } from "react";
import ReactFlow, {
  useNodesState,
  useEdgesState,
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
    createDerivedAnnotation,
    addReply,
    addTag,
  } = useDocumentStore();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

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

  // Sync store → local ReactFlow state
  useEffect(() => {
    setNodes(storeNodes);
  }, [storeNodes, setNodes]);

  useEffect(() => {
    setEdges(storeEdges);
  }, [storeEdges, setEdges]);

  // ── Event listeners from nodes ─────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: Event) => {
      const { action, nodeId } = (e as CustomEvent).detail;
      if (
        action === "simplify" ||
        action === "rephrase" ||
        action === "summarize"
      ) {
        createDerivedAnnotation(action, nodeId);
      } else if (action === "tag") {
        setTagNodeId(nodeId);
        setTagInput("");
      }
    };
    document.addEventListener("docParagraphAction", handler);
    return () => document.removeEventListener("docParagraphAction", handler);
  }, [createDerivedAnnotation]);

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
      const { text, sourceNodeId } = (e as CustomEvent).detail;
      createHighlight(text, sourceNodeId);
    };
    document.addEventListener("docCreateHighlight", handler);
    return () => document.removeEventListener("docCreateHighlight", handler);
  }, [createHighlight]);

  // ── Actions ────────────────────────────────────────────────────────────────

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
              fontFamily: "system-ui, sans-serif",
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
            fitView
            fitViewOptions={{ padding: 0.08 }}
            minZoom={0.15}
            maxZoom={2}
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
              fontFamily: "system-ui, sans-serif",
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
                "Paste your document here.\n\nParagraphs are separated by blank lines.\nEach paragraph becomes an independent node you can annotate, highlight, simplify, or rephrase."
              }
              value={docText}
              onChange={(e) => setDocText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setShowNewDoc(false);
              }}
              style={{
                ...inputStyle,
                fontFamily: 'Georgia, "Times New Roman", serif',
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
