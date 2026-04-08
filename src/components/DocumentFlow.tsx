import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  useNodesState,
  useEdgesState,
  useReactFlow,
  Background,
  BackgroundVariant,
  Controls,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  useDocumentStore,
  estimateHeight,
  estimateAnnotationHeight,
  COLUMN_WIDTH,
} from "../store/documentStore";
import ParagraphNode from "./ParagraphNode";
import AnnotationNode from "./AnnotationNode";
import { CustomEdge, EdgeNo, EdgeYes, EllipsisEdge } from "./EdgeComponents";
import { REACTION_EMOJIS } from "./EmojiReactions";
import { useAuthStore } from "../store/authStore";
import { putJSON, getJSON } from "../store/spacesClient";
import { useFontStore, FONT_OPTIONS } from "../store/fontStore";

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
function getConnectedIds(startId: string, edges: { source: string; target: string }[]): Set<string> {
  const connected = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    if (connected.has(cur)) continue;
    connected.add(cur);
    for (const e of edges) {
      if (e.source === cur && !connected.has(e.target)) queue.push(e.target);
      if (e.target === cur && !connected.has(e.source)) queue.push(e.source);
    }
  }
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
  creator: string;
  tags: string[];
}

const DocumentFlow = () => {
  const {
    nodes: storeNodes,
    edges: storeEdges,
    documentTitle,
    loadDocument,
    loadRound,
    createHighlight,
    addReply,
    addTag,
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
  const lastDocTitle = useRef<string>("");
  const pannedToNodes = useRef(new Set<string>());

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

  // Show username modal after hydration if missing
  useEffect(() => {
    if (!authHydrated) return;
    if (!username) {
      setShowUsernameModal(true);
    }
  }, [authHydrated, username]);

  // Round picker / URL-based loading
  const [showRoundPicker, setShowRoundPicker] = useState(false);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const roundLoadAttempted = useRef(false);

  // On mount (once auth is ready), check the URL for a slug or show the round picker
  useEffect(() => {
    if (!authReady || roundLoadAttempted.current) return;
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
            nodes: { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }[];
            edges: { id: string; source: string; target: string; type: string; data?: Record<string, unknown>; sourceHandle?: string; targetHandle?: string }[];
          }>(`rounds/${slug}`);
          if (data) {
            loadRound(data.title, data.nodes as never[], data.edges as never[]);

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
      // No slug — fetch catalog and show picker
      (async () => {
        setCatalogLoading(true);
        setCatalogError(null);
        try {
          const entries = await getJSON<CatalogEntry[]>("rounds_catalog.json");
          setCatalog(entries ?? []);
          setShowRoundPicker(true);
        } catch {
          // Catalog doesn't exist yet or fetch failed — just show empty state
          setShowRoundPicker(true);
        } finally {
          setCatalogLoading(false);
        }
      })();
    }
  }, [authReady, loadRound]);

  const handlePickRound = useCallback(
    async (slug: string) => {
      setShowRoundPicker(false);
      try {
        const data = await getJSON<{
          title: string;
          nodes: { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }[];
          edges: { id: string; source: string; target: string; type: string; data?: Record<string, unknown>; sourceHandle?: string; targetHandle?: string }[];
        }>(`rounds/${slug}`);
        if (data) {
          loadRound(data.title, data.nodes as never[], data.edges as never[]);
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Persona picker
  const [personaOpen, setPersonaOpen] = useState(false);
  const [personaFilter, setPersonaFilter] = useState("");
  const personaRef = useRef<HTMLDivElement>(null);

  // Thread-focus state
  const [focusedNodeIds, setFocusedNodeIds] = useState<Set<string> | null>(null);
  const savedViewport = useRef<{ x: number; y: number; zoom: number } | null>(null);

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

  // Reaction leaderboard
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardEmoji, setLeaderboardEmoji] = useState<string>(REACTION_EMOJIS[0]);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  // Floating highlight button — rendered here (outside ReactFlow's transform layer)
  const [highlightSelection, setHighlightSelection] = useState<{
    text: string;
    sourceNodeId: string;
    startIdx: number;
    endIdx: number;
    rect: { top: number; bottom: number; left: number; right: number };
  } | null>(null);

  // ── Sync store → local ReactFlow state (with dimming + highlight) ──────────

  useEffect(() => {
    setNodes(
      storeNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          dimmed: focusedNodeIds ? !focusedNodeIds.has(n.id) : false,
          threadFocused: focusedNodeIds ? focusedNodeIds.has(n.id) : false,
          highlighted: n.id === highlightedNodeId,
        },
      })),
    );
  }, [storeNodes, focusedNodeIds, highlightedNodeId, setNodes]);

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

  // When a new document loads, center the viewport on the first node.
  const pendingNavToFirst = useRef(false);
  useEffect(() => {
    if (storeNodes.length > 0 && documentTitle !== lastDocTitle.current) {
      lastDocTitle.current = documentTitle;
      setFocusedNodeIds(null);
      currentNodeIdx.current = 0;
      pendingNavToFirst.current = true;
    }
  }, [storeNodes.length, documentTitle]);

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
      createHighlight(text, sourceNodeId, startIdx, endIdx, username ?? undefined);
    };
    document.addEventListener("docCreateHighlight", handler);
    return () => document.removeEventListener("docCreateHighlight", handler);
  }, [createHighlight, username]);

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
          setViewport(savedViewport.current, { duration: 250 });
          savedViewport.current = null;
        }
        // Remove node param from URL
        const url = new URL(window.location.href);
        url.searchParams.delete("node");
        window.history.replaceState({}, "", url.toString());
        return;
      }

      const connected = getConnectedIds(nodeId, storeEdges);
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
          duration: 300,
        });
      }, 50);
    };
    document.addEventListener("docFocusThread", handler);
    return () => document.removeEventListener("docFocusThread", handler);
  }, [focusedNodeIds, storeEdges, fitView, getViewport, setViewport]);

  const handlePaneClick = useCallback(() => {
    if (focusedNodeIds) {
      setFocusedNodeIds(null);
      if (savedViewport.current) {
        setViewport(savedViewport.current, { duration: 250 });
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
      if (highlightSelection) {
        createHighlight(
          highlightSelection.text,
          highlightSelection.sourceNodeId,
          highlightSelection.startIdx,
          highlightSelection.endIdx,
          username ?? undefined,
        );
        setHighlightSelection(null);
        window.getSelection()?.removeAllRanges();
      }
    },
    [highlightSelection, createHighlight, username],
  );

  const handleCreateDocument = useCallback(() => {
    if (docText.trim()) {
      loadDocument(docText.trim(), docTitle.trim() || "Untitled Document", username ?? undefined);
      setShowNewDoc(false);
      setDocText("");
      setDocTitle("");
    }
  }, [docText, docTitle, loadDocument, username]);

  const handleSubmitReply = useCallback(() => {
    if (replyNodeId && replyContent.trim()) {
      addReply(replyContent.trim(), replyNodeId, replyEdgeType, username ?? undefined);
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

  const currentNodeIdx = useRef(0);
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
      const duration = nextDepth < prevDepth ? 400 : 250;

      currentNodeIdx.current = idx;
      nodeScrollOffset.current = scrollY;

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

  // After navigateToNode is defined, handle pending nav-to-first-node on doc load
  useEffect(() => {
    if (pendingNavToFirst.current && sortedNavNodes.length > 0) {
      pendingNavToFirst.current = false;
      setTimeout(() => navigateToNode(0), 100);
    }
  }, [sortedNavNodes, navigateToNode]);

  // Keep currentNodeIdx in bounds when nodes change
  useEffect(() => {
    if (currentNodeIdx.current >= sortedNavNodes.length) {
      currentNodeIdx.current = Math.max(0, sortedNavNodes.length - 1);
    }
  }, [sortedNavNodes]);

  // Wheel handler: scroll down → next node, scroll up → previous node
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      // Don't intercept if a modal is open or an input/textarea is focused
      const active = document.activeElement;
      if (
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLInputElement ||
        active instanceof HTMLSelectElement
      ) {
        return;
      }

      if (navAnimating.current) {
        e.preventDefault();
        return;
      }

      // Determine direction — treat both vertical and horizontal scroll
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(delta) < 10) return; // ignore tiny ticks

      e.preventDefault();

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

      if (nodeH > viewportH) {
        const maxScroll = nodeH - viewportH;
        if (delta > 0) {
          // Scrolling down within tall node
          if (nodeScrollOffset.current < maxScroll) {
            const next = Math.min(nodeScrollOffset.current + scrollStep, maxScroll);
            navigateToNode(idx, next);
            return;
          }
          // At bottom of tall node — move to next node
        } else {
          // Scrolling up within tall node
          if (nodeScrollOffset.current > 0) {
            const next = Math.max(nodeScrollOffset.current - scrollStep, 0);
            navigateToNode(idx, next);
            return;
          }
          // At top of tall node — move to previous node
        }
      }

      if (delta > 0 && idx < sortedNavNodes.length - 1) {
        navigateToNode(idx + 1);
      } else if (delta < 0 && idx > 0) {
        navigateToNode(idx - 1);
      }
    };

    el.addEventListener("wheel", handler, { passive: false });

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
      el.removeEventListener("wheel", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [sortedNavNodes, navigateToNode]);

  // When a new annotation is created, navigate to it in the scroll sequence.
  useEffect(() => {
    const fresh = storeNodes.find(
      (n) => n.data.nodeType === "annotation" && n.data.isNew && !pannedToNodes.current.has(n.id),
    );
    if (!fresh) return;
    pannedToNodes.current.add(fresh.id);

    const idx = sortedNavNodes.findIndex((n) => n.id === fresh.id);
    if (idx >= 0) {
      navigateToNode(idx);
    }
  }, [storeNodes, sortedNavNodes, navigateToNode]);

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
      // Focus the thread containing this node
      const connected = getConnectedIds(nodeId, storeEdges);
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
    [storeEdges, getViewport, setFocusedNodeIds, sortedNavNodes, navigateToNode],
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
      // Build document JSON
      const docJSON = {
        title: documentTitle,
        slug,
        creator: username,
        savedAt: new Date().toISOString(),
        nodes: storeNodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
        edges: storeEdges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type, data: e.data, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })),
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
      const entry: CatalogEntry = { slug, name: documentTitle, creator: username, tags: allTags };
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

      setShowSave(false);
      setSaveSlug("");
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [saveSlug, username, documentTitle, storeNodes, storeEdges]);

  // Close persona dropdown on outside click
  useEffect(() => {
    if (!personaOpen) return;
    const handler = (e: MouseEvent) => {
      if (personaRef.current && !personaRef.current.contains(e.target as Node)) {
        setPersonaOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [personaOpen]);

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

        {/* Font picker */}
        <select
          value={currentFont.label}
          onChange={(e) => setFont(e.target.value)}
          style={{
            ...inputStyle,
            width: "auto",
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

        {/* ── Persona switcher ── */}
        {username && (
          <div ref={personaRef} style={{ position: "relative" }}>
            <button
              onClick={() => { setPersonaOpen((v) => !v); setPersonaFilter(""); }}
              style={{
                ...secondaryBtn,
                display: "flex",
                alignItems: "center",
                gap: "4px",
                maxWidth: "140px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={`Signed in as ${username}`}
            >
              <span style={{ fontSize: "12px" }}>{username}</span>
              <span style={{ fontSize: "9px", marginLeft: "2px" }}>{personaOpen ? "\u25B2" : "\u25BC"}</span>
            </button>

            {personaOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  width: "180px",
                  background: "#fff",
                  border: "1px solid #d1d5db",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                  zIndex: 300,
                  padding: "4px",
                }}
              >
                <input
                  autoFocus
                  value={personaFilter}
                  onChange={(e) => setPersonaFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && personaFilter.trim()) {
                      setUsername(personaFilter.trim());
                      setPersonaOpen(false);
                    }
                    if (e.key === "Escape") setPersonaOpen(false);
                  }}
                  placeholder="Switch user…"
                  style={{ ...inputStyle, fontSize: "12px", padding: "5px 8px", marginBottom: "2px" }}
                />
                {filteredUsers.map((u) => (
                  <div
                    key={u}
                    onClick={() => { setUsername(u); setPersonaOpen(false); }}
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
                    onClick={() => { setUsername(personaFilter.trim()); setPersonaOpen(false); }}
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
            )}
          </div>
        )}

        {hasContent && (
          <button
            onClick={() => setShowLeaderboard((v) => !v)}
            style={secondaryBtn}
          >
            Reactions
          </button>
        )}

        {/* Save or Login button */}
        {hasContent && authReady ? (
          <button
            onClick={() => { setShowSave(true); setSaveSlug(slugify(documentTitle)); setSaveError(null); }}
            style={primaryBtn}
          >
            Save
          </button>
        ) : hasContent && !authReady ? (
          <button
            onClick={() => {
              if (!username) setShowUsernameModal(true);
            }}
            style={secondaryBtn}
          >
            Set Username to Save
          </button>
        ) : null}

        <button
          onClick={() => setShowNewDoc(true)}
          style={secondaryBtn}
        >
          {hasContent ? "+ New Document" : "Open Document"}
        </button>
      </div>

      {/* ── Canvas ────────────────────────────────────────────────────────── */}
      <div ref={canvasRef} style={{ flex: 1, position: "relative" }}>
        {hasContent ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={{ x: 40, y: 20, zoom: 1 }}
            minZoom={0.15}
            maxZoom={2}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            defaultEdgeOptions={{ style: { strokeWidth: 1.5 } }}
            nodesDraggable
            panOnScroll={false}
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
            <div style={{ fontSize: "12px", color: "#64748b" }}>
              Saves to <code>rounds/{slugify(saveSlug) || "…"}</code>
            </div>
            <input
              autoFocus
              value={saveSlug}
              onChange={(e) => setSaveSlug(e.target.value)}
              placeholder="Document slug (e.g. my-document)"
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
