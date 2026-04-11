import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  useNodesState,
  useEdgesState,
  useReactFlow,
  useUpdateNodeInternals,
  Background,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  useDocumentStore,
  estimateHeight,
  estimateAnnotationHeight,
  estimateTextEntryHeight,
  COLUMN_WIDTH,
  PR_REVIEW_WIDTH,
} from "../store/documentStore";
import ParagraphNode from "./ParagraphNode";
import AnnotationNode from "./AnnotationNode";
import AddParagraphNode from "./AddParagraphNode";
import TextEntryNode, { SUPPORTED_LANGUAGES } from "./TextEntryNode";
import { CustomEdge, EdgeNo, EdgeYes, EllipsisEdge } from "./EdgeComponents";
import { REACTION_EMOJIS } from "./EmojiReactions";
import { useAuthStore } from "../store/authStore";
import { putJSON, getJSON } from "../store/spacesClient";
import { useFontStore, FONT_OPTIONS } from "../store/fontStore";

// Static registrations — outside component to avoid recreation
const nodeTypes = {
  paragraphNode: ParagraphNode,
  annotationNode: AnnotationNode,
  addParagraphNode: AddParagraphNode,
  textEntryNode: TextEntryNode,
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
  borderRadius: 0,
  border: "1px solid #d1d5db",
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
  borderRadius: 0,
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 600,
  fontFamily: "inherit",
};

const secondaryBtn: React.CSSProperties = {
  padding: "8px 16px",
  border: "1px solid #d1d5db",
  borderRadius: 0,
  background: "#fff",
  cursor: "pointer",
  fontSize: "13px",
  fontFamily: "inherit",
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 0,
  fontSize: "14px",
  outline: "none",
  fontFamily: "inherit",
  color: "#1e293b",
  width: "100%",
  boxSizing: "border-box",
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** BFS through edges to find every node in the same connected component. */
function getConnectedIds(
  startId: string,
  edges: { source: string; target: string }[],
  nodes?: { id: string; data: Record<string, unknown> }[],
): Set<string> {
  // Build a set of node IDs to skip during traversal (source/textentry nodes)
  const skipIds = new Set<string>();
  if (nodes) {
    for (const n of nodes) {
      if (n.data.nodeType === "textentry") skipIds.add(n.id);
    }
  }

  const connected = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    if (connected.has(cur)) continue;
    // Don't traverse through source nodes (but still mark them so edges stop)
    if (skipIds.has(cur)) {
      connected.add(cur);
      continue;
    }
    connected.add(cur);
    for (const e of edges) {
      if (e.source === cur && !connected.has(e.target)) queue.push(e.target);
      if (e.target === cur && !connected.has(e.source)) queue.push(e.source);
    }
  }
  // Remove source nodes from the result
  for (const id of skipIds) connected.delete(id);
  return connected;
}

// ─── Main component ─────────────────────────────────────────────────────────
// ─── Slug helper ───────────────────────────────────────────────────────────
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Catalog type ──────────────────────────────────────────────────────────
interface CatalogEntry {
  slug: string;
  name: string;
  description?: string;
  link?: string;
  creator: string;
  tags: string[];
}

const DocumentFlow = () => {
  const {
    nodes: storeNodes,
    edges: storeEdges,
    documentTitle,
    documentMode,
    loadDocument,
    loadPRReview,
    loadRound,
    createHighlight,
    createParagraphFromHighlight,
    createLineComment,
    addReply,
    addTag,
    setDocumentTitle,
  } = useDocumentStore();

  const {
    username,
    knownUsers,
    ready: authReady,
    hydrated: authHydrated,
    setUsername,
    hydrate,
  } = useAuthStore();

  const { current: currentFont, setFont } = useFontStore();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { setViewport, fitView, getViewport } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const lastDocTitle = useRef<string>("");
  const pannedToNodes = useRef(new Set<string>());
  const lastSavedSnapshot = useRef<string>("");
  const currentNodeIdx = useRef(0);
  const [currentNavIdx, setCurrentNavIdx] = useState(0);
  const currentNavNodeId = useRef<string | null>(null);

  // Hydrate auth from localStorage on mount
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      hydrate();
    }
  }, [hydrate]);

  // Username modal
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");


  // Round picker / URL-based loading
  const [showRoundPicker, setShowRoundPicker] = useState(false);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const roundLoadAttempted = useRef(false);

  // On mount (once hydrated), check the URL for a slug or show the round picker
  useEffect(() => {
    if (!authHydrated || roundLoadAttempted.current) return;
    roundLoadAttempted.current = true;

    const params = new URLSearchParams(window.location.search);
    const slug = params.get("round");

    if (slug) {
      // Load a specific round by slug
      const nodeParam = params.get("node");
      (async () => {
        try {
          const data = await getJSON<{
            title: string;
            description?: string;
            link?: string;
            nodes: { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }[];
            edges: { id: string; source: string; target: string; type: string; data?: Record<string, unknown>; sourceHandle?: string; targetHandle?: string }[];
            citations?: Record<string, { url: string; description: string }>;
            documentMode?: string;
            language?: string;
          }>(`rounds/${slug}`);
          if (data) {
            loadRound(data.title, data.nodes as never[], data.edges as never[], data.citations, (data.documentMode as "document" | "pr-review") ?? "document", data.language);
            setRoundDescription(data.description ?? "");
            setRoundLink(data.link ?? "");
            lastSavedSnapshot.current = JSON.stringify({ nodes: data.nodes, edges: data.edges });

            // If a node param is present, focus its thread after a brief delay
            if (nodeParam) {
              setTimeout(() => {
                document.dispatchEvent(
                  new CustomEvent("docFocusThread", { detail: { nodeId: nodeParam } }),
                );
              }, 400);
            }
          }
        } catch (err) {
          console.error("Failed to load round:", err);
        }
      })();
    } else {
      // No slug — fetch catalog and load first round, or show picker if empty
      (async () => {
        setCatalogLoading(true);
        setCatalogError(null);
        try {
          const entries = await getJSON<CatalogEntry[]>("rounds_catalog.json");
          setCatalog(entries ?? []);
          if (entries && entries.length > 0) {
            // Load the first round automatically
            const first = entries[0];
            const data = await getJSON<{
              title: string;
              description?: string;
              link?: string;
              nodes: { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }[];
              edges: { id: string; source: string; target: string; type: string; data?: Record<string, unknown>; sourceHandle?: string; targetHandle?: string }[];
              citations?: Record<string, { url: string; description: string }>;
              documentMode?: string;
              language?: string;
            }>(`rounds/${first.slug}`);
            if (data) {
              loadRound(data.title, data.nodes as never[], data.edges as never[], data.citations, (data.documentMode as "document" | "pr-review") ?? "document", data.language);
              setRoundDescription(data.description ?? "");
              setRoundLink(data.link ?? "");
              lastSavedSnapshot.current = JSON.stringify({ nodes: data.nodes, edges: data.edges });
              const url = new URL(window.location.href);
              url.searchParams.set("round", first.slug);
              window.history.replaceState({}, "", url.toString());
            } else {
              setShowRoundPicker(true);
            }
          } else {
            setShowRoundPicker(true);
          }
        } catch {
          setShowRoundPicker(true);
        } finally {
          setCatalogLoading(false);
        }
      })();
    }
  }, [authHydrated, loadRound]);

  const handlePickRound = useCallback(
    async (slug: string) => {
      setShowRoundPicker(false);
      try {
        const data = await getJSON<{
          title: string;
          description?: string;
          link?: string;
          nodes: { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }[];
          edges: { id: string; source: string; target: string; type: string; data?: Record<string, unknown>; sourceHandle?: string; targetHandle?: string }[];
          citations?: Record<string, { url: string; description: string }>;
          documentMode?: string;
          language?: string;
        }>(`rounds/${slug}`);
        if (data) {
          loadRound(data.title, data.nodes as never[], data.edges as never[], data.citations, (data.documentMode as "document" | "pr-review") ?? "document", data.language);
          setRoundDescription(data.description ?? "");
          setRoundLink(data.link ?? "");
          lastSavedSnapshot.current = JSON.stringify({ nodes: data.nodes, edges: data.edges });
          // Update URL without reload
          const url = new URL(window.location.href);
          url.searchParams.set("round", slug);
          window.history.pushState({}, "", url.toString());
        }
      } catch (err) {
        console.error("Failed to load round:", err);
      }
    },
    [loadRound],
  );

  // Save modal
  const [showSave, setShowSave] = useState(false);
  const [saveSlug, setSaveSlug] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveLink, setSaveLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Round metadata (persisted across loads)
  const [roundDescription, setRoundDescription] = useState("");
  const [roundLink, setRoundLink] = useState("");

  // Hamburger menu & persona picker
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [personaFilter, setPersonaFilter] = useState("");
  const personaRef = useRef<HTMLDivElement>(null);

  // Thread-focus state
  const [focusedNodeIds, setFocusedNodeIds] = useState<Set<string> | null>(null);
  const savedViewport = useRef<{ x: number; y: number; zoom: number } | null>(null);

  // New-document modal
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [docText, setDocText] = useState("");
  const [docTitle, setDocTitle] = useState("");

  // PR review modal
  const [showPRReview, setShowPRReview] = useState(false);
  const [prCode, setPRCode] = useState("");
  const [prTitle, setPRTitle] = useState("");
  const [prLanguage, setPRLanguage] = useState("typescript");

  // Reply modal
  const [replyNodeId, setReplyNodeId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [replyEdgeType, setReplyEdgeType] = useState("smoothstep");

  // Tag modal
  const [tagNodeId, setTagNodeId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  // Edit metadata modal
  const [showEditMetadata, setShowEditMetadata] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLink, setEditLink] = useState("");

  // Reaction leaderboard
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardEmoji, setLeaderboardEmoji] = useState<string>(REACTION_EMOJIS[0]);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  // Tag browser panel
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Floating highlight button — rendered here (outside ReactFlow's transform layer)
  const [highlightSelection, setHighlightSelection] = useState<{
    text: string;
    sourceNodeId: string;
    startIdx: number;
    endIdx: number;
    rect: { top: number; bottom: number; left: number; right: number };
    isTextEntry?: boolean;
  } | null>(null);

  // ── Sync store → local ReactFlow state (with dimming + highlight) ──────────

  useEffect(() => {
    const mapped = storeNodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        dimmed: focusedNodeIds ? !focusedNodeIds.has(n.id) : false,
        threadFocused: focusedNodeIds ? focusedNodeIds.has(n.id) : false,
        highlighted: n.id === highlightedNodeId,
        currentNav: !focusedNodeIds && n.id === currentNavNodeId.current,
      },
    }));

    // Append an "add paragraph" node after the last paragraph (not in PR review mode)
    if (storeNodes.length > 0 && documentMode !== "pr-review") {
      const paragraphs = storeNodes
        .filter((n) => n.data.depth === 0)
        .sort((a, b) => a.position.y - b.position.y);
      const lastPara = paragraphs[paragraphs.length - 1];
      if (lastPara) {
        const lastH = estimateHeight(lastPara.data.content as string);
        mapped.push({
          id: "__add_paragraph__",
          type: "addParagraphNode",
          position: { x: lastPara.position.x, y: lastPara.position.y + lastH + 32 },
          data: { afterNodeId: lastPara.id },
          draggable: false,
          selectable: false,
        } as never);
      }
    }

    setNodes(mapped);
  }, [storeNodes, focusedNodeIds, highlightedNodeId, documentMode, setNodes, currentNavIdx]);

  useEffect(() => {
    setEdges(
      focusedNodeIds
        ? storeEdges.map((e) => ({
            ...e,
            data: {
              ...e.data,
              dimmed: !(focusedNodeIds.has(e.source) && focusedNodeIds.has(e.target)),
            },
          }))
        : storeEdges,
    );
  }, [storeEdges, focusedNodeIds, setEdges]);

  // When edges change, re-measure handle positions on source nodes so
  // ReactFlow can route edges to newly-created dynamic handles (hl-0, hl-1, …).
  const prevEdgeCount = useRef(0);
  useEffect(() => {
    if (storeEdges.length > prevEdgeCount.current) {
      // Collect unique source node IDs from newly added edges
      const sourceIds = new Set(storeEdges.slice(prevEdgeCount.current).map((e) => e.source));
      // Also include target nodes (they may also have dynamic handles)
      for (const e of storeEdges.slice(prevEdgeCount.current)) sourceIds.add(e.target);
      // Delay to ensure handles are in the DOM after React commits
      requestAnimationFrame(() => {
        updateNodeInternals([...sourceIds]);
      });
    }
    prevEdgeCount.current = storeEdges.length;
  }, [storeEdges, updateNodeInternals]);

  // When a new document loads, center the viewport on the first node.
  const pendingInitialNav = useRef<{ position: { x: number; y: number }; data: Record<string, unknown> } | null>(null);
  const rfInitialized = useRef(false);

  const applyInitialNav = useCallback(() => {
    const node = pendingInitialNav.current;
    if (!node) return;
    pendingInitialNav.current = null;

    const h =
      node.data.nodeType === "textentry"
        ? estimateTextEntryHeight(node.data.content as string)
        : node.data.nodeType === "paragraph"
          ? estimateHeight(node.data.content as string)
          : estimateAnnotationHeight(node.data.content as string);
    const zoom = 1;
    const headerH = 52;
    const availW = window.innerWidth;
    const availH = window.innerHeight - headerH;
    const viewportH = availH / zoom;
    const nodeWidth = node.data.nodeType === "textentry"
      ? (node.data.language ? PR_REVIEW_WIDTH : 640)
      : COLUMN_WIDTH;
    const centerX = node.position.x + nodeWidth / 2;
    const targetY = h > viewportH
      ? node.position.y + viewportH / 2
      : node.position.y + h / 2;

    setViewport(
      {
        x: availW / 2 - centerX * zoom,
        y: availH / 2 - targetY * zoom + headerH / 2,
        zoom,
      },
      { duration: 0 },
    );
  }, [setViewport]);

  const handleReactFlowInit = useCallback(() => {
    rfInitialized.current = true;
    applyInitialNav();
  }, [applyInitialNav]);

  useEffect(() => {
    if (storeNodes.length > 0 && documentTitle !== lastDocTitle.current) {
      lastDocTitle.current = documentTitle;
      setFocusedNodeIds(null);
      currentNodeIdx.current = 0;
      nodeScrollOffset.current = 0;

      // Find the first paragraph node and center on it
      const paragraphs = storeNodes
        .filter((n) => n.data.depth === 0)
        .sort((a, b) => a.position.y - b.position.y);
      const node = paragraphs[0];
      if (node) {
        pendingInitialNav.current = node;
        if (rfInitialized.current) {
          // RF already initialized (e.g. picking a new round), apply immediately
          setTimeout(() => applyInitialNav(), 0);
        }
      }
    }
  }, [storeNodes, documentTitle, applyInitialNav]);

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
      const { text, sourceNodeId, startIdx, endIdx, isTextEntry } = (e as CustomEvent).detail;
      if (!username) { setShowUsernameModal(true); return; }
      if (isTextEntry && documentMode !== "pr-review") {
        createParagraphFromHighlight(text, sourceNodeId, startIdx, endIdx, username);
      } else {
        createHighlight(text, sourceNodeId, startIdx, endIdx, username);
      }
    };
    document.addEventListener("docCreateHighlight", handler);
    return () => document.removeEventListener("docCreateHighlight", handler);
  }, [createHighlight, createParagraphFromHighlight, username, documentMode]);

  // Line comment event listener (PR review mode)
  useEffect(() => {
    const handler = (e: Event) => {
      const { lineNumber, sourceNodeId } = (e as CustomEvent).detail;
      if (!username) { setShowUsernameModal(true); return; }
      createLineComment(lineNumber, sourceNodeId, username);
    };
    document.addEventListener("docLineComment", handler);
    return () => document.removeEventListener("docLineComment", handler);
  }, [createLineComment, username]);

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

  // ── Thread focus ──────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: Event) => {
      const { nodeId } = (e as CustomEvent).detail;

      // Toggle off if this node is already in the focused set
      if (focusedNodeIds?.has(nodeId)) {
        setFocusedNodeIds(null);
        if (savedViewport.current) {
          setViewport(savedViewport.current, { duration: 125 });
          savedViewport.current = null;
        }
        // Remove node param from URL
        const url = new URL(window.location.href);
        url.searchParams.delete("node");
        window.history.replaceState({}, "", url.toString());
        return;
      }

      const connected = getConnectedIds(nodeId, storeEdges, storeNodes);
      savedViewport.current = getViewport();
      setFocusedNodeIds(connected);

      // Update URL with focused node
      const url = new URL(window.location.href);
      url.searchParams.set("node", nodeId);
      window.history.replaceState({}, "", url.toString());

      // Let React flush the dimming update, then fit the view to the connected nodes
      setTimeout(() => {
        fitView({
          nodes: [...connected].map((id) => ({ id })),
          padding: 0.12,
          duration: 150,
        });
      }, 50);
    };
    document.addEventListener("docFocusThread", handler);
    return () => document.removeEventListener("docFocusThread", handler);
  }, [focusedNodeIds, storeEdges, storeNodes, fitView, getViewport, setViewport]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: { id: string }) => {
    const url = new URL(window.location.href);
    url.searchParams.set("node", node.id);
    window.history.replaceState({}, "", url.toString());
  }, []);

  const handlePaneClick = useCallback(() => {
    if (focusedNodeIds) {
      setFocusedNodeIds(null);
      if (savedViewport.current) {
        setViewport(savedViewport.current, { duration: 125 });
        savedViewport.current = null;
      }
      // Remove node param from URL
      const url = new URL(window.location.href);
      url.searchParams.delete("node");
      window.history.replaceState({}, "", url.toString());
    }
  }, [focusedNodeIds, setViewport]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleHighlightClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!username) { setShowUsernameModal(true); return; }
      if (highlightSelection) {
        if (highlightSelection.isTextEntry && documentMode !== "pr-review") {
          createParagraphFromHighlight(
            highlightSelection.text,
            highlightSelection.sourceNodeId,
            highlightSelection.startIdx,
            highlightSelection.endIdx,
            username,
          );
        } else {
          createHighlight(
            highlightSelection.text,
            highlightSelection.sourceNodeId,
            highlightSelection.startIdx,
            highlightSelection.endIdx,
            username,
          );
        }
        setHighlightSelection(null);
        window.getSelection()?.removeAllRanges();
      }
    },
    [highlightSelection, createHighlight, createParagraphFromHighlight, username, documentMode],
  );

  const handleCreateDocument = useCallback(() => {
    if (docText.trim()) {
      loadDocument(docText.trim(), docTitle.trim() || "Untitled Document", username ?? undefined);
      setShowNewDoc(false);
      setDocText("");
      setDocTitle("");
    }
  }, [docText, docTitle, loadDocument, username]);

  const handleCreatePRReview = useCallback(() => {
    if (prCode.trim()) {
      loadPRReview(prCode.trim(), prLanguage, prTitle.trim() || "Untitled PR Review", username ?? undefined);
      setShowPRReview(false);
      setPRCode("");
      setPRTitle("");
    }
  }, [prCode, prTitle, prLanguage, loadPRReview, username]);

  const handleSubmitReply = useCallback(() => {
    if (!username) { setShowUsernameModal(true); return; }
    if (replyNodeId && replyContent.trim()) {
      addReply(replyContent.trim(), replyNodeId, replyEdgeType, username);
      setReplyNodeId(null);
      setReplyContent("");
    }
  }, [replyNodeId, replyContent, replyEdgeType, addReply, username]);

  const handleSubmitTag = useCallback(() => {
    if (tagNodeId && tagInput.trim()) {
      addTag(tagNodeId, tagInput.trim());
      setTagNodeId(null);
      setTagInput("");
    }
  }, [tagNodeId, tagInput, addTag]);

  // ── Scroll-to-node navigation ──────────────────────────────────────────────

  /** All nodes sorted by Y position — the reading order. */
  const sortedNavNodes = useMemo(
    () => [...storeNodes].sort((a, b) => a.position.y - b.position.y),
    [storeNodes],
  );

  const navAnimating = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  /** For tall nodes: how far we've scrolled within the current node (0 = top). */
  const nodeScrollOffset = useRef(0);

  /** Center the viewport on node at `idx` in sortedNavNodes, optionally offset vertically within the node. */
  const navigateToNode = useCallback(
    (idx: number, scrollY = 0) => {
      const node = sortedNavNodes[idx];
      if (!node) return;

      // Compute duration before updating the index ref
      const prevNode = sortedNavNodes[currentNodeIdx.current];
      const prevDepth = prevNode ? (prevNode.data.depth as number) : 0;
      const nextDepth = node.data.depth as number;
      const duration = nextDepth < prevDepth ? 200 : 125;

      currentNodeIdx.current = idx;
      currentNavNodeId.current = node.id;
      setCurrentNavIdx(idx);
      nodeScrollOffset.current = scrollY;

      // Update URL with the current node
      const url = new URL(window.location.href);
      url.searchParams.set("node", node.id);
      window.history.replaceState({}, "", url.toString());

      const h =
        node.data.nodeType === "paragraph"
          ? estimateHeight(node.data.content)
          : estimateAnnotationHeight(node.data.content);

      const zoom = 1;
      const headerH = 52;
      const availW = window.innerWidth;
      const availH = window.innerHeight - headerH;
      const viewportH = availH / zoom;

      const centerX = node.position.x + COLUMN_WIDTH / 2;
      // If the node is taller than the viewport, position based on scrollY offset
      // instead of centering on the node's midpoint
      let targetY: number;
      if (h > viewportH) {
        // Show the node starting from scrollY offset — top of visible area = node.y + scrollY
        targetY = node.position.y + scrollY + viewportH / 2;
      } else {
        targetY = node.position.y + h / 2;
      }

      navAnimating.current = true;
      setViewport(
        {
          x: availW / 2 - centerX * zoom,
          y: availH / 2 - targetY * zoom + headerH / 2,
          zoom,
        },
        { duration },
      );
      setTimeout(() => {
        navAnimating.current = false;
      }, duration + 50);
    },
    [sortedNavNodes, setViewport],
  );

  // Keep currentNodeIdx in bounds when nodes change
  useEffect(() => {
    if (currentNodeIdx.current >= sortedNavNodes.length) {
      currentNodeIdx.current = Math.max(0, sortedNavNodes.length - 1);
    }
  }, [sortedNavNodes]);

  // Arrow-key handler: navigate between nodes
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const keyHandler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLInputElement ||
        active instanceof HTMLSelectElement
      ) {
        return;
      }
      if (navAnimating.current) return;

      const idx = currentNodeIdx.current;
      const node = sortedNavNodes[idx];
      if (!node) return;

      const nodeH =
        node.data.nodeType === "paragraph"
          ? estimateHeight(node.data.content)
          : estimateAnnotationHeight(node.data.content);
      const headerH = 52;
      const zoom = 1;
      const viewportH = (window.innerHeight - headerH) / zoom;
      const scrollStep = viewportH * 0.7;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (nodeH > viewportH && nodeScrollOffset.current < nodeH - viewportH) {
          const next = Math.min(nodeScrollOffset.current + scrollStep, nodeH - viewportH);
          navigateToNode(idx, next);
        } else if (idx < sortedNavNodes.length - 1) {
          navigateToNode(idx + 1);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (nodeH > viewportH && nodeScrollOffset.current > 0) {
          const next = Math.max(nodeScrollOffset.current - scrollStep, 0);
          navigateToNode(idx, next);
        } else if (idx > 0) {
          navigateToNode(idx - 1);
        }
      }
    };

    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("keydown", keyHandler);
    };
  }, [sortedNavNodes, navigateToNode]);

  // When a new annotation is created, navigate to it in the scroll sequence.
  // In PR review mode, skip — user controls viewport via free panning/scrolling.
  useEffect(() => {
    if (documentMode === "pr-review") return;
    const fresh = storeNodes.find(
      (n) => n.data.nodeType === "annotation" && n.data.isNew && !pannedToNodes.current.has(n.id),
    );
    if (!fresh) return;
    pannedToNodes.current.add(fresh.id);

    const idx = sortedNavNodes.findIndex((n) => n.id === fresh.id);
    if (idx >= 0) {
      navigateToNode(idx);
    }
  }, [storeNodes, sortedNavNodes, navigateToNode, documentMode]);

  // ── Reaction leaderboard ───────────────────────────────────────────────────

  /** Nodes sorted descending by count of the selected emoji. */
  const leaderboardNodes = useMemo(() => {
    return storeNodes
      .map((n) => ({
        node: n,
        count: ((n.data.reactions as Record<string, number> | undefined) ?? {})[leaderboardEmoji] ?? 0,
      }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [storeNodes, leaderboardEmoji]);

  /** Click a row in the leaderboard → focus its thread and highlight the node. */
  const handleLeaderboardClick = useCallback(
    (nodeId: string) => {
      // Focus the thread containing this node (exclude source node)
      const connected = getConnectedIds(nodeId, storeEdges, storeNodes);
      savedViewport.current = getViewport();
      setFocusedNodeIds(connected);
      setHighlightedNodeId(nodeId);
      setShowLeaderboard(false);

      // Update URL with focused node
      const url = new URL(window.location.href);
      url.searchParams.set("node", nodeId);
      window.history.replaceState({}, "", url.toString());

      // Navigate viewport to the clicked node
      setTimeout(() => {
        const idx = sortedNavNodes.findIndex((n) => n.id === nodeId);
        if (idx >= 0) navigateToNode(idx);
      }, 80);
    },
    [storeEdges, storeNodes, getViewport, setFocusedNodeIds, sortedNavNodes, navigateToNode],
  );

  // ── Tag browser ─────────────────────────────────────────────────────────────

  /** All unique tags across all nodes. */
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const n of storeNodes) {
      const tags = n.data.tags as string[] | undefined;
      if (tags) for (const t of tags) tagSet.add(t);
    }
    return [...tagSet].sort();
  }, [storeNodes]);

  // Auto-select first tag when panel opens or tags change
  useEffect(() => {
    if (showTagPanel && allTags.length > 0 && (!selectedTag || !allTags.includes(selectedTag))) {
      setSelectedTag(allTags[0]);
    }
  }, [showTagPanel, allTags, selectedTag]);

  /** Nodes that have the selected tag. */
  const taggedNodes = useMemo(() => {
    if (!selectedTag) return [];
    return storeNodes.filter((n) => {
      const tags = n.data.tags as string[] | undefined;
      return tags?.includes(selectedTag);
    });
  }, [storeNodes, selectedTag]);

  /** Click a row in the tag panel → focus its thread and highlight the node. */
  const handleTagPanelClick = useCallback(
    (nodeId: string) => {
      const connected = getConnectedIds(nodeId, storeEdges, storeNodes);
      savedViewport.current = getViewport();
      setFocusedNodeIds(connected);
      setHighlightedNodeId(nodeId);
      setShowTagPanel(false);

      const url = new URL(window.location.href);
      url.searchParams.set("node", nodeId);
      window.history.replaceState({}, "", url.toString());

      setTimeout(() => {
        const idx = sortedNavNodes.findIndex((n) => n.id === nodeId);
        if (idx >= 0) navigateToNode(idx);
      }, 80);
    },
    [storeEdges, storeNodes, getViewport, setFocusedNodeIds, sortedNavNodes, navigateToNode],
  );

  // Clear the highlighted node when thread focus is removed
  useEffect(() => {
    if (!focusedNodeIds) setHighlightedNodeId(null);
  }, [focusedNodeIds]);

  // ── Sync store → local ReactFlow state (with dimming + highlight) ─────────
  // Patch: include highlightedNodeId in the node data so the component can render it

  // ── Auth handlers ─────────────────────────────────────────────────────────
  const handleSubmitUsername = useCallback(() => {
    if (loginUsername.trim()) {
      setUsername(loginUsername.trim());
      setShowUsernameModal(false);
    }
  }, [loginUsername, setUsername]);

  // ── Save handler ─────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const slug = slugify(saveSlug);
    if (!slug || !username) return;

    setSaving(true);
    setSaveError(null);
    try {
      const desc = saveDescription.trim();
      const lnk = saveLink.trim();

      // Build document JSON
      const docJSON = {
        title: documentTitle,
        description: desc || undefined,
        link: lnk || undefined,
        slug,
        creator: username,
        savedAt: new Date().toISOString(),
        nodes: storeNodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
        edges: storeEdges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type, data: e.data, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })),
        citations: useDocumentStore.getState().citations,
        documentMode: useDocumentStore.getState().documentMode,
        language: useDocumentStore.getState().language,
      };
      await putJSON(`rounds/${slug}`, docJSON);

      // Collect all tags across every node
      const allTags = Array.from(
        new Set(storeNodes.flatMap((n) => (n.data.tags as string[]) ?? [])),
      );

      // Update catalog
      let catalog: CatalogEntry[] = [];
      try {
        catalog = (await getJSON<CatalogEntry[]>("rounds_catalog.json")) ?? [];
      } catch {
        /* first save — catalog doesn't exist yet */
      }
      const existing = catalog.findIndex((c) => c.slug === slug);
      const entry: CatalogEntry = { slug, name: documentTitle, description: desc || undefined, link: lnk || undefined, creator: username, tags: allTags };
      if (existing >= 0) {
        catalog[existing] = entry;
      } else {
        catalog.push(entry);
      }
      await putJSON("rounds_catalog.json", catalog);

      // Update URL to reflect the saved round
      const url = new URL(window.location.href);
      url.searchParams.set("round", slug);
      window.history.replaceState({}, "", url.toString());

      setRoundDescription(desc);
      setRoundLink(lnk);
      setShowSave(false);
      setSaveSlug("");
      setSaveDescription("");
      setSaveLink("");
      lastSavedSnapshot.current = JSON.stringify({ nodes: storeNodes, edges: storeEdges });
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [saveSlug, saveDescription, saveLink, username, documentTitle, storeNodes, storeEdges]);

  // Close hamburger menu on outside click
  useEffect(() => {
    if (!hamburgerOpen) return;
    const handler = (e: MouseEvent) => {
      if (personaRef.current && !personaRef.current.contains(e.target as Node)) {
        setHamburgerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [hamburgerOpen]);

  const filteredUsers = useMemo(
    () =>
      personaFilter
        ? knownUsers.filter((u) => u.toLowerCase().includes(personaFilter.toLowerCase()))
        : knownUsers,
    [knownUsers, personaFilter],
  );

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
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: "12px",
          zIndex: 100,
          position: "relative",
        }}
      >
        {/* Title */}
        <div style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", display: "flex", alignItems: "baseline", gap: "8px" }}>
          {hasContent ? (
            <>
              <span style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}>
                {documentTitle}
              </span>
              {roundDescription && (
                <span style={{ fontSize: "12px", color: "#94a3b8", flexShrink: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {roundDescription}
                </span>
              )}
              {roundLink && (
                <a
                  href={roundLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "11px", color: "#3b82f6", textDecoration: "none", flexShrink: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  link
                </a>
              )}
            </>
          ) : (
            <>
              <span style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>
                Riboflavin
              </span>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                The name doesn't mean anything
              </span>
            </>
          )}
        </div>

        {/* Save button — only when there are unsaved changes */}
        {(() => {
          const isDirty = hasContent && lastSavedSnapshot.current !== JSON.stringify({ nodes: storeNodes, edges: storeEdges });
          if (!isDirty) return null;
          if (!authReady) {
            return (
              <button
                onClick={() => { if (!username) setShowUsernameModal(true); }}
                style={secondaryBtn}
              >
                Set Username to Save
              </button>
            );
          }
          return (
            <button
              onClick={() => {
                setShowSave(true);
                setSaveSlug(slugify(documentTitle));
                setSaveDescription(roundDescription);
                setSaveLink(roundLink);
                setSaveError(null);
              }}
              style={primaryBtn}
            >
              Save
            </button>
          );
        })()}

        {/* Hamburger menu */}
        <div ref={personaRef} style={{ position: "relative" }}>
          <button
            onClick={() => setHamburgerOpen((v) => !v)}
            style={{
              ...secondaryBtn,
              fontSize: "18px",
              padding: "4px 10px",
              lineHeight: 1,
            }}
            title="Menu"
          >
            &#9776;
          </button>

          {hamburgerOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                width: "220px",
                background: "#fff",
                border: "1px solid #d1d5db",
                boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                zIndex: 300,
                padding: "8px",
              }}
            >
              {/* Font picker */}
              <div style={{ marginBottom: "8px" }}>
                <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 600, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Font</div>
                <select
                  value={currentFont.label}
                  onChange={(e) => setFont(e.target.value)}
                  style={{
                    ...inputStyle,
                    width: "100%",
                    padding: "4px 8px",
                    fontSize: "12px",
                    cursor: "pointer",
                    appearance: "auto",
                    fontFamily: currentFont.family,
                  }}
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.label} value={f.label} style={{ fontFamily: f.family }}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Persona switcher */}
              <div style={{ marginBottom: "8px" }}>
                <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 600, marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  User{username ? `: ${username}` : ""}
                </div>
                <input
                  value={personaFilter}
                  onChange={(e) => setPersonaFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && personaFilter.trim()) {
                      setUsername(personaFilter.trim());
                      setPersonaFilter("");
                    }
                  }}
                  placeholder="Switch user…"
                  style={{ ...inputStyle, fontSize: "12px", padding: "5px 8px", width: "100%", marginBottom: "2px", boxSizing: "border-box" }}
                />
                {filteredUsers.map((u) => (
                  <div
                    key={u}
                    onClick={() => { setUsername(u); setPersonaFilter(""); }}
                    style={{
                      padding: "4px 8px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontFamily: "inherit",
                      color: u === username ? "#0f172a" : "#475569",
                      fontWeight: u === username ? 700 : 400,
                      background: u === username ? "#f1f5f9" : "transparent",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget).style.background = "#f1f5f9"; }}
                    onMouseLeave={(e) => { (e.currentTarget).style.background = u === username ? "#f1f5f9" : "transparent"; }}
                  >
                    {u}
                  </div>
                ))}
                {personaFilter.trim() && !knownUsers.includes(personaFilter.trim()) && (
                  <div
                    onClick={() => { setUsername(personaFilter.trim()); setPersonaFilter(""); }}
                    style={{
                      padding: "4px 8px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontFamily: "inherit",
                      color: "#3b82f6",
                      borderTop: "1px solid #e5e7eb",
                      marginTop: "2px",
                      paddingTop: "6px",
                    }}
                  >
                    + create "{personaFilter.trim()}"
                  </div>
                )}
              </div>

              {/* Divider */}
              <div style={{ borderTop: "1px solid #e5e7eb", margin: "4px 0" }} />

              {/* Actions */}
              {hasContent && (
                <button
                  onClick={() => { setShowLeaderboard((v) => !v); setShowTagPanel(false); setHamburgerOpen(false); }}
                  style={{ ...secondaryBtn, width: "100%", textAlign: "left", marginBottom: "4px" }}
                >
                  Reactions
                </button>
              )}
              {hasContent && allTags.length > 0 && (
                <button
                  onClick={() => { setShowTagPanel((v) => !v); setShowLeaderboard(false); setHamburgerOpen(false); }}
                  style={{ ...secondaryBtn, width: "100%", textAlign: "left", marginBottom: "4px" }}
                >
                  Tags
                </button>
              )}
              <button
                onClick={() => {
                  setCatalogLoading(true);
                  setCatalogError(null);
                  getJSON<CatalogEntry[]>("rounds_catalog.json").then((entries) => {
                    setCatalog(entries ?? []);
                    setCatalogLoading(false);
                  }).catch(() => {
                    setCatalogLoading(false);
                  });
                  setShowRoundPicker(true);
                  setHamburgerOpen(false);
                }}
                style={{ ...secondaryBtn, width: "100%", textAlign: "left", marginBottom: "4px" }}
              >
                Load Document
              </button>
              <button
                onClick={() => { setShowNewDoc(true); setHamburgerOpen(false); }}
                style={{ ...secondaryBtn, width: "100%", textAlign: "left", marginBottom: "4px" }}
              >
                + New Document
              </button>
              <button
                onClick={() => { setShowPRReview(true); setHamburgerOpen(false); }}
                style={{ ...secondaryBtn, width: "100%", textAlign: "left", marginBottom: "4px" }}
              >
                + PR Review
              </button>
              {hasContent && (
                <button
                  onClick={() => {
                    setEditTitle(documentTitle);
                    setEditDescription(roundDescription);
                    setEditLink(roundLink);
                    setShowEditMetadata(true);
                    setHamburgerOpen(false);
                  }}
                  style={{ ...secondaryBtn, width: "100%", textAlign: "left" }}
                >
                  Edit Metadata
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Progress bar ─────────────────────────────────────────────── */}
        {hasContent && sortedNavNodes.length > 0 && (() => {
          const heights = sortedNavNodes.map((n) =>
            n.data.nodeType === "textentry"
              ? estimateTextEntryHeight(n.data.content as string)
              : n.data.nodeType === "paragraph"
                ? estimateHeight(n.data.content as string)
                : estimateAnnotationHeight(n.data.content as string),
          );
          const totalH = heights.reduce((s, h) => s + h, 0);
          if (totalH === 0) return null;

          if (focusedNodeIds) {
            // Focus mode: show focused nodes as accent, rest as light
            const segments = sortedNavNodes.map((n, i) => ({
              pct: (heights[i] / totalH) * 100,
              focused: focusedNodeIds.has(n.id),
            }));
            return (
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: "3px",
                display: "flex",
              }}>
                {segments.map((seg, i) => (
                  <div key={i} style={{
                    width: `${seg.pct}%`,
                    background: seg.focused ? "#6366f1" : "#e2e8f0",
                    transition: "background 0.2s",
                  }} />
                ))}
              </div>
            );
          }

          // Normal mode: dark = read, accent = current, light = unread
          const segments = sortedNavNodes.map((_, i) => ({
            pct: (heights[i] / totalH) * 100,
            state: i < currentNavIdx ? "read" : i === currentNavIdx ? "current" : "unread",
          }));
          return (
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0, height: "3px",
              display: "flex",
            }}>
              {segments.map((seg, i) => (
                <div key={i} style={{
                  width: `${seg.pct}%`,
                  background: seg.state === "read" ? "#334155" : seg.state === "current" ? "#6366f1" : "#e2e8f0",
                  transition: "background 0.2s",
                }} />
              ))}
            </div>
          );
        })()}
      </div>

      {/* ── Canvas ────────────────────────────────────────────────────────── */}
      <div ref={canvasRef} style={{ flex: 1, position: "relative" }}>
        {hasContent ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={handleReactFlowInit}
            defaultViewport={{ x: 40, y: 20, zoom: 1 }}
            minZoom={0.15}
            maxZoom={2}
            zoomOnScroll
            zoomOnPinch
            zoomOnDoubleClick={false}
            defaultEdgeOptions={{ style: { strokeWidth: 1.5 } }}
            nodesDraggable={false}
            panOnDrag
            panOnScroll
            selectionOnDrag={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="#e2e8f0"
            />

            {/* ── Prev / Next nav buttons ─────────────────────────── */}
            <style>{`
              .rf-nav-btn {
                padding: 14px 28px;
                font-size: 18px;
                font-weight: 600;
                border: 1px solid #cbd5e1;
                border-radius: 10px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.10);
                user-select: none;
                -webkit-tap-highlight-color: transparent;
                touch-action: manipulation;
              }
              @media (min-width: 768px) {
                .rf-nav-btn {
                  padding: 6px 14px;
                  font-size: 13px;
                  border-radius: 6px;
                  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
                  opacity: 0.6;
                  transition: opacity 0.15s;
                }
                .rf-nav-btn:hover:not(:disabled) {
                  opacity: 1;
                }
              }
            `}</style>
            {sortedNavNodes.length > 1 && (
              <div
                style={{
                  position: "absolute",
                  bottom: 20,
                  left: "50%",
                  transform: "translateX(-50%)",
                  display: "flex",
                  gap: "12px",
                  zIndex: 10,
                }}
              >
                <button
                  className="rf-nav-btn"
                  onClick={() => {
                    if (currentNavIdx > 0) navigateToNode(currentNavIdx - 1);
                  }}
                  disabled={currentNavIdx === 0}
                  style={{
                    background: currentNavIdx === 0 ? "#f1f5f9" : "#fff",
                    color: currentNavIdx === 0 ? "#94a3b8" : "#334155",
                    cursor: currentNavIdx === 0 ? "default" : "pointer",
                  }}
                >
                  Prev
                </button>
                <button
                  className="rf-nav-btn"
                  onClick={() => {
                    if (currentNavIdx < sortedNavNodes.length - 1) navigateToNode(currentNavIdx + 1);
                  }}
                  disabled={currentNavIdx >= sortedNavNodes.length - 1}
                  style={{
                    background: currentNavIdx >= sortedNavNodes.length - 1 ? "#f1f5f9" : "#fff",
                    color: currentNavIdx >= sortedNavNodes.length - 1 ? "#94a3b8" : "#334155",
                    cursor: currentNavIdx >= sortedNavNodes.length - 1 ? "default" : "pointer",
                  }}
                >
                  Next
                </button>
              </div>
            )}
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
              (highlightSelection.rect.left + highlightSelection.rect.right) / 2 - 52,
            ),
            zIndex: 9999,
            background: "#1e293b",
            color: "#fff",
            padding: "6px 16px",
            borderRadius: 0,
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
          {highlightSelection.isTextEntry
            ? (documentMode === "pr-review" ? "💬 Comment" : "¶ Create Paragraph")
            : "✎ Highlight"}
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
                "Paste your document here.\n\nThe text will appear as a single node. Select passages to create paragraph nodes linked to the source."
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

      {/* ── PR Review Modal ────────────────────────────────────────────── */}
      {showPRReview && (
        <div style={overlayStyle} onClick={() => setShowPRReview(false)}>
          <div
            style={{
              ...cardStyle,
              width: "700px",
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
              New PR Review
            </div>
            <input
              placeholder="Title (optional)"
              value={prTitle}
              onChange={(e) => setPRTitle(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <label style={{ fontSize: "13px", color: "#475569", fontWeight: 500 }}>Language:</label>
              <select
                value={prLanguage}
                onChange={(e) => setPRLanguage(e.target.value)}
                style={{
                  ...inputStyle,
                  flex: 1,
                  marginBottom: 0,
                  padding: "6px 8px",
                  fontSize: "13px",
                }}
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>
            <textarea
              autoFocus
              placeholder="Paste your code here."
              value={prCode}
              onChange={(e) => setPRCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setShowPRReview(false);
                // Allow Tab in code input
                if (e.key === "Tab") {
                  e.preventDefault();
                  const ta = e.currentTarget;
                  const start = ta.selectionStart;
                  const end = ta.selectionEnd;
                  setPRCode(prCode.slice(0, start) + "  " + prCode.slice(end));
                  requestAnimationFrame(() => {
                    ta.selectionStart = ta.selectionEnd = start + 2;
                  });
                }
              }}
              style={{
                ...inputStyle,
                fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                lineHeight: "1.5",
                resize: "vertical",
                minHeight: "320px",
                fontSize: "13px",
                tabSize: 2,
                whiteSpace: "pre",
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
                onClick={() => setShowPRReview(false)}
                style={secondaryBtn}
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePRReview}
                disabled={!prCode.trim()}
                style={{
                  ...primaryBtn,
                  opacity: prCode.trim() ? 1 : 0.45,
                  cursor: prCode.trim() ? "pointer" : "default",
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Metadata Modal ─────────────────────────────────────────── */}
      {showEditMetadata && (
        <div style={overlayStyle} onClick={() => setShowEditMetadata(false)}>
          <div
            style={{ ...cardStyle, width: "440px", maxWidth: "92vw", padding: "24px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: "17px", color: "#0f172a", marginBottom: "8px" }}>
              Edit Metadata
            </div>
            <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Title
            </label>
            <input
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Document title"
              style={{ ...inputStyle, marginBottom: "8px" }}
            />
            <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Description
            </label>
            <input
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Brief description (optional)"
              style={{ ...inputStyle, marginBottom: "8px" }}
            />
            <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Link
            </label>
            <input
              value={editLink}
              onChange={(e) => setEditLink(e.target.value)}
              placeholder="https://… (optional)"
              style={{ ...inputStyle, marginBottom: "12px" }}
            />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowEditMetadata(false)} style={secondaryBtn}>
                Cancel
              </button>
              <button
                onClick={() => {
                  setDocumentTitle(editTitle.trim() || "Untitled Document");
                  setRoundDescription(editDescription.trim());
                  setRoundLink(editLink.trim());
                  setShowEditMetadata(false);
                }}
                style={primaryBtn}
              >
                Save
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
      {tagNodeId && (() => {
        const allTags = Array.from(
          new Set(storeNodes.flatMap((n) => (n.data.tags as string[]) ?? [])),
        ).sort();
        const currentNodeTags = new Set(
          (storeNodes.find((n) => n.id === tagNodeId)?.data.tags as string[]) ?? [],
        );
        const suggestions = allTags.filter(
          (t) => !currentNodeTags.has(t) && t.toLowerCase().includes(tagInput.trim().toLowerCase()),
        );
        const isNewTag = tagInput.trim() && !allTags.includes(tagInput.trim());

        return (
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
                placeholder="Search or create tag…"
                style={inputStyle}
              />
              {/* Suggestions */}
              {(suggestions.length > 0 || isNewTag) && (
                <div style={{
                  maxHeight: "150px",
                  overflowY: "auto",
                  marginBottom: "8px",
                  border: "1px solid #e2e8f0",
                }}>
                  {suggestions.map((tag) => (
                    <div
                      key={tag}
                      onClick={() => {
                        addTag(tagNodeId, tag);
                        setTagNodeId(null);
                        setTagInput("");
                      }}
                      style={{
                        padding: "6px 10px",
                        fontSize: "13px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        color: "#334155",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      #{tag}
                    </div>
                  ))}
                  {isNewTag && (
                    <div
                      onClick={handleSubmitTag}
                      style={{
                        padding: "6px 10px",
                        fontSize: "13px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        color: "#3b82f6",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#f1f5f9"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      + create "{tagInput.trim()}"
                    </div>
                  )}
                </div>
              )}
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
        );
      })()}

      {/* ── Reaction Leaderboard Panel ────────────────────────────────────── */}
      {showLeaderboard && (
        <div
          style={{
            position: "fixed",
            top: 52,
            right: 0,
            width: "340px",
            maxWidth: "100vw",
            height: "calc(100vh - 52px)",
            background: "#fff",
            borderLeft: "1px solid #d1d5db",
            boxShadow: "-4px 0 16px rgba(0,0,0,0.06)",
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            fontFamily: "inherit",
          }}
        >
          {/* Panel header */}
          <div
            style={{
              padding: "14px 16px 10px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>
              Reactions
            </span>
            <button
              onClick={() => setShowLeaderboard(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "16px",
                color: "#94a3b8",
                lineHeight: 1,
                padding: "2px 4px",
              }}
            >
              &times;
            </button>
          </div>

          {/* Emoji tabs */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "2px",
              padding: "10px 12px",
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => setLeaderboardEmoji(emoji)}
                style={{
                  background: emoji === leaderboardEmoji ? "#f1f5f9" : "none",
                  border:
                    emoji === leaderboardEmoji
                      ? "1px solid #94a3b8"
                      : "1px solid transparent",
                  borderRadius: 0,
                  cursor: "pointer",
                  fontSize: "16px",
                  padding: "4px 6px",
                  lineHeight: 1,
                }}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Ranked list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {leaderboardNodes.length === 0 && (
              <div
                style={{
                  padding: "24px 16px",
                  textAlign: "center",
                  color: "#94a3b8",
                  fontSize: "13px",
                }}
              >
                No nodes have this reaction yet.
              </div>
            )}
            {leaderboardNodes.map(({ node, count }, rank) => {
              const preview =
                node.data.content && (node.data.content as string).length > 0
                  ? (node.data.content as string).slice(0, 80) +
                    ((node.data.content as string).length > 80 ? "\u2026" : "")
                  : node.data.sourceText
                    ? `"${(node.data.sourceText as string).slice(0, 60)}\u2026"`
                    : "(empty)";
              const typeLabel =
                node.data.nodeType === "paragraph" ? "Paragraph" : "Annotation";

              return (
                <div
                  key={node.id}
                  onClick={() => handleLeaderboardClick(node.id)}
                  style={{
                    padding: "8px 16px",
                    cursor: "pointer",
                    borderBottom: "1px solid #f1f5f9",
                    transition: "background 0.1s",
                    display: "flex",
                    gap: "10px",
                    alignItems: "flex-start",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#f8fafc";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "none";
                  }}
                >
                  {/* Rank + count */}
                  <div
                    style={{
                      flexShrink: 0,
                      width: "36px",
                      textAlign: "center",
                      paddingTop: "2px",
                    }}
                  >
                    <div style={{ fontSize: "16px" }}>
                      {leaderboardEmoji}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#475569",
                        marginTop: "2px",
                      }}
                    >
                      &times;{count}
                    </div>
                  </div>

                  {/* Node preview */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#94a3b8",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        marginBottom: "2px",
                      }}
                    >
                      #{rank + 1} {typeLabel}
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#334155",
                        lineHeight: 1.4,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {preview}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tag Browser Panel ───────────────────────────────────────────── */}
      {showTagPanel && (
        <div
          style={{
            position: "fixed",
            top: 52,
            right: 0,
            width: "340px",
            maxWidth: "100vw",
            height: "calc(100vh - 52px)",
            background: "#fff",
            borderLeft: "1px solid #d1d5db",
            boxShadow: "-4px 0 16px rgba(0,0,0,0.06)",
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            fontFamily: "inherit",
          }}
        >
          {/* Panel header */}
          <div
            style={{
              padding: "14px 16px 10px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>
              Tags
            </span>
            <button
              onClick={() => setShowTagPanel(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "16px",
                color: "#94a3b8",
                lineHeight: 1,
                padding: "2px 4px",
              }}
            >
              &times;
            </button>
          </div>

          {/* Tag tabs */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
              padding: "10px 12px",
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                style={{
                  background: tag === selectedTag ? "#f1f5f9" : "none",
                  border:
                    tag === selectedTag
                      ? "1px solid #94a3b8"
                      : "1px solid transparent",
                  borderRadius: 0,
                  cursor: "pointer",
                  fontSize: "12px",
                  padding: "4px 8px",
                  lineHeight: 1,
                  fontFamily: "inherit",
                  color: tag === selectedTag ? "#0f172a" : "#475569",
                  fontWeight: tag === selectedTag ? 600 : 400,
                }}
              >
                #{tag}
              </button>
            ))}
          </div>

          {/* Tagged nodes list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {taggedNodes.length === 0 && (
              <div
                style={{
                  padding: "24px 16px",
                  textAlign: "center",
                  color: "#94a3b8",
                  fontSize: "13px",
                }}
              >
                No nodes have this tag.
              </div>
            )}
            {taggedNodes.map((node) => {
              const preview =
                node.data.content && (node.data.content as string).length > 0
                  ? (node.data.content as string).slice(0, 80) +
                    ((node.data.content as string).length > 80 ? "\u2026" : "")
                  : node.data.sourceText
                    ? `"${(node.data.sourceText as string).slice(0, 60)}\u2026"`
                    : "(empty)";
              const typeLabel =
                node.data.nodeType === "paragraph" ? "Paragraph" : "Annotation";

              return (
                <div
                  key={node.id}
                  onClick={() => handleTagPanelClick(node.id)}
                  style={{
                    padding: "8px 16px",
                    cursor: "pointer",
                    borderBottom: "1px solid #f1f5f9",
                    transition: "background 0.1s",
                    display: "flex",
                    gap: "10px",
                    alignItems: "flex-start",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#f8fafc";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "none";
                  }}
                >
                  {/* Tag icon */}
                  <div
                    style={{
                      flexShrink: 0,
                      width: "36px",
                      textAlign: "center",
                      paddingTop: "2px",
                      fontSize: "14px",
                      color: "#6366f1",
                      fontWeight: 700,
                    }}
                  >
                    #
                  </div>

                  {/* Node preview */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "10px",
                        color: "#94a3b8",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        marginBottom: "2px",
                      }}
                    >
                      {typeLabel}
                      {node.data.author ? ` · ${node.data.author}` : ""}
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#334155",
                        lineHeight: 1.4,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {preview}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Username Modal ────────────────────────────────────────────── */}
      {showUsernameModal && (
        <div style={overlayStyle} onClick={() => { if (username) setShowUsernameModal(false); }}>
          <div
            style={{ ...cardStyle, width: "340px", maxWidth: "92vw", padding: "24px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: "17px", color: "#0f172a" }}>
              Choose a Username
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
              This will be shown on your annotations and replies.
            </div>
            <input
              autoFocus
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              placeholder="Username"
              style={inputStyle}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmitUsername(); }}
            />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
              {username && (
                <button onClick={() => setShowUsernameModal(false)} style={secondaryBtn}>
                  Cancel
                </button>
              )}
              <button
                onClick={handleSubmitUsername}
                disabled={!loginUsername.trim()}
                style={{
                  ...primaryBtn,
                  opacity: loginUsername.trim() ? 1 : 0.45,
                  cursor: loginUsername.trim() ? "pointer" : "default",
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save Modal ───────────────────────────────────────────────────── */}
      {showSave && (
        <div style={overlayStyle} onClick={() => setShowSave(false)}>
          <div
            style={{ ...cardStyle, width: "400px", maxWidth: "92vw", padding: "20px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>
              Save to Spaces
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
              Saves to <code>rounds/{slugify(saveSlug) || "…"}</code>
            </div>
            <input
              autoFocus
              value={saveSlug}
              onChange={(e) => setSaveSlug(e.target.value)}
              placeholder="Document slug (e.g. my-document)"
              style={inputStyle}
            />
            <input
              value={saveDescription}
              onChange={(e) => setSaveDescription(e.target.value)}
              placeholder="Brief description (optional)"
              style={inputStyle}
            />
            <input
              value={saveLink}
              onChange={(e) => setSaveLink(e.target.value)}
              placeholder="Link URL (optional)"
              style={inputStyle}
              onKeyDown={(e) => { if (e.key === "Enter" && slugify(saveSlug)) handleSave(); }}
            />
            {saveError && (
              <div style={{ fontSize: "12px", color: "#dc2626" }}>{saveError}</div>
            )}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
              <button onClick={() => setShowSave(false)} style={secondaryBtn}>
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!slugify(saveSlug) || saving}
                style={{
                  ...primaryBtn,
                  opacity: slugify(saveSlug) && !saving ? 1 : 0.45,
                  cursor: slugify(saveSlug) && !saving ? "pointer" : "default",
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Round Picker Modal ────────────────────────────────────────── */}
      {showRoundPicker && (
        <div style={overlayStyle}>
          <div
            style={{ ...cardStyle, width: "480px", maxWidth: "92vw", padding: "24px", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: "17px", color: "#0f172a", marginBottom: "4px" }}>
              Open a Round
            </div>

            {catalogLoading && (
              <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                Loading…
              </div>
            )}

            {catalogError && (
              <div style={{ fontSize: "12px", color: "#dc2626", marginBottom: "8px" }}>{catalogError}</div>
            )}

            {!catalogLoading && catalog.length === 0 && (
              <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                No saved rounds yet. Create a new document to get started.
              </div>
            )}

            {!catalogLoading && catalog.length > 0 && (
              <div style={{ flex: 1, overflowY: "auto", margin: "4px 0" }}>
                {catalog.map((entry) => (
                  <div
                    key={entry.slug}
                    onClick={() => handlePickRound(entry.slug)}
                    style={{
                      padding: "10px 12px",
                      cursor: "pointer",
                      borderBottom: "1px solid #f1f5f9",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget).style.background = "#f8fafc"; }}
                    onMouseLeave={(e) => { (e.currentTarget).style.background = "transparent"; }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a" }}>
                      {entry.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <span>by {entry.creator}</span>
                      {entry.tags.length > 0 && (
                        <>
                          <span style={{ color: "#cbd5e1" }}>&middot;</span>
                          {entry.tags.slice(0, 5).map((t) => (
                            <span
                              key={t}
                              style={{
                                background: "#f1f5f9",
                                border: "1px solid #e2e8f0",
                                padding: "0 5px",
                                fontSize: "10px",
                                color: "#475569",
                              }}
                            >
                              #{t}
                            </span>
                          ))}
                          {entry.tags.length > 5 && (
                            <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                              +{entry.tags.length - 5} more
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button
                onClick={() => { setShowRoundPicker(false); setShowNewDoc(true); }}
                style={secondaryBtn}
              >
                New Document Instead
              </button>
              <button
                onClick={() => setShowRoundPicker(false)}
                style={secondaryBtn}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentFlow;
