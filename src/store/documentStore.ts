import { create } from "zustand";
import type { Node, Edge } from "reactflow";

// ── Layout constants ────────────────────────────────────────────────────────
const COLUMN_X_BASE = 20;
export const COLUMN_WIDTH = 360;  // wider to accommodate Merriweather
const COLUMN_SPACING = 60; // gap between columns
const NODE_GAP = 32;       // minimum vertical gap between nodes

// ── Thread color palette ─────────────────────────────────────────────────────
// Each highlight (and its reply chain) gets one of these colors.
// light  = background used on the source text <mark>
// nodeBg = annotation card background
// border = annotation card border & edge stroke
export const THREAD_COLORS = [
  { light: "#fef9c3", nodeBg: "#fffbeb", border: "#fde047" }, // amber
  { light: "#dbeafe", nodeBg: "#eff6ff", border: "#93c5fd" }, // blue
  { light: "#f3e8ff", nodeBg: "#f5f3ff", border: "#c4b5fd" }, // violet
  { light: "#dcfce7", nodeBg: "#ecfdf5", border: "#86efac" }, // green
  { light: "#ffe4e6", nodeBg: "#fff1f2", border: "#fca5a5" }, // red
  { light: "#e0f2fe", nodeBg: "#f0f9ff", border: "#7dd3fc" }, // sky
  { light: "#fce7f3", nodeBg: "#fdf2f8", border: "#f9a8d4" }, // pink
  { light: "#d1fae5", nodeBg: "#f0fdf4", border: "#6ee7b7" }, // emerald
] as const;

// ── Height estimation ────────────────────────────────────────────────────────

/** Estimate rendered height of a ParagraphNode given its text content. */
export function estimateHeight(content: string): number {
  // 360px wide, 16px padding each side → 328px content area.
  // Merriweather 15px at line-height 1.8 ≈ 30px/line, ~32 chars/line.
  // Fixed chrome: 32px padding + 56px action bar + reactions = 100px.
  if (!content) return 140;
  const charsPerLine = 32;
  const hardLines = content.split("\n").length;
  const wrappedLines = Math.ceil(content.length / charsPerLine);
  const totalLines = Math.max(hardLines, wrappedLines, 1);
  return totalLines * 30 + 100;
}

/** Estimate rendered height of an AnnotationNode (more chrome than paragraphs). */
export function estimateAnnotationHeight(content: string): number {
  if (!content) return 190;
  const charsPerLine = 36;
  const hardLines = content.split("\n").length;
  const wrappedLines = Math.ceil(content.length / charsPerLine);
  const totalLines = Math.max(hardLines, wrappedLines, 1);
  return Math.max(190, totalLines * 26 + 130);
}

function getColumnX(depth: number): number {
  return COLUMN_X_BASE + depth * (COLUMN_WIDTH + COLUMN_SPACING);
}

/**
 * Estimate the pixel Y offset of a character index within a node's rendered text.
 * Used to align highlight annotations with the highlighted passage.
 */
function estimateCharY(
  content: string,
  charIdx: number,
  nodeType: "paragraph" | "annotation",
): number {
  if (!content || charIdx <= 0) return 0;

  const topPad = nodeType === "paragraph" ? 16 : 56;
  const cpl = nodeType === "paragraph" ? 32 : 34;
  const lh = nodeType === "paragraph" ? 30 : 28;

  const textBefore = content.slice(0, charIdx);
  let lines = 0;
  for (const segment of textBefore.split("\n")) {
    lines += Math.max(1, Math.ceil(segment.length / cpl));
  }
  lines -= 1;

  return topPad + Math.max(0, lines) * lh;
}

// ── Column layout ───────────────────────────────────────────────────────────

/** Compute the ideal Y for an annotation based on its source node. */
function idealYForNode(node: Node, sourceNode: Node): number {
  const nodeType = sourceNode.data.nodeType as "paragraph" | "annotation";

  // Highlights: align with the character position in the source text
  if (node.data.highlightStartIdx !== undefined) {
    const charY = estimateCharY(sourceNode.data.content, node.data.highlightStartIdx, nodeType);
    return Math.max(20, sourceNode.position.y + charY);
  }

  // Replies: align with the vertical center of the source node
  const sourceH = nodeType === "paragraph"
    ? estimateHeight(sourceNode.data.content)
    : estimateAnnotationHeight(sourceNode.data.content);
  return Math.max(20, sourceNode.position.y + sourceH / 2 - 50);
}

/** Estimate the height of any node based on its type. */
function nodeHeight(node: Node): number {
  return node.data.nodeType === "paragraph"
    ? estimateHeight(node.data.content)
    : estimateAnnotationHeight(node.data.content);
}

/**
 * Global re-layout: position every node so that no two occupy the same
 * vertical space, regardless of which column (depth) they are in.
 *
 * Algorithm:
 *  1. Compute an ideal Y for each node (paragraphs: sequential; annotations:
 *     aligned with their source).
 *  2. Sort *all* nodes by ideal Y.
 *  3. Greedy top-to-bottom placement: each node gets max(idealY, cursor),
 *     where cursor tracks the bottom of the last placed node + gap.
 */
function relayoutAll(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const idealYMap = new Map<string, number>();

  // Find max depth
  let maxDepth = 0;
  for (const n of nodes) {
    if ((n.data.depth as number) > maxDepth) maxDepth = n.data.depth as number;
  }

  // Depth 0 (paragraphs): ideal Y is sequential, preserving existing order
  const depth0 = nodes
    .filter((n) => n.data.depth === 0)
    .sort((a, b) => a.position.y - b.position.y);
  let seqCursor = 20;
  for (const n of depth0) {
    idealYMap.set(n.id, seqCursor);
    seqCursor += nodeHeight(n) + NODE_GAP;
  }

  // Deeper depths: ideal Y based on source node's ideal position
  for (let depth = 1; depth <= maxDepth; depth++) {
    const atDepth = nodes.filter((n) => n.data.depth === depth);
    for (const n of atDepth) {
      const inEdge = edges.find((e) => e.target === n.id);
      const sourceNode = inEdge ? nodeById.get(inEdge.source) : undefined;
      if (sourceNode) {
        const sourceIdealY = idealYMap.get(sourceNode.id) ?? sourceNode.position.y;
        const tempSource = { ...sourceNode, position: { ...sourceNode.position, y: sourceIdealY } };
        idealYMap.set(n.id, idealYForNode(n, tempSource));
      } else {
        idealYMap.set(n.id, n.position.y);
      }
    }
  }

  // Sort ALL nodes by ideal Y (stable sort — creation order is tiebreaker)
  const allSorted = [...nodes].sort((a, b) => {
    const diff = (idealYMap.get(a.id) ?? 0) - (idealYMap.get(b.id) ?? 0);
    if (diff !== 0) return diff;
    return (a.data.depth as number) - (b.data.depth as number);
  });

  // Greedy placement across all columns
  let cursor = 20;
  const finalY = new Map<string, number>();
  for (const n of allSorted) {
    const idealY = idealYMap.get(n.id) ?? 20;
    const y = Math.max(idealY, cursor);
    finalY.set(n.id, y);
    cursor = y + nodeHeight(n) + NODE_GAP;
  }

  // Apply positions
  return nodes.map((n) => {
    const newY = finalY.get(n.id)!;
    return { ...n, position: { x: getColumnX(n.data.depth as number), y: newY } };
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface HighlightRange {
  startIdx: number;
  endIdx: number;
  colorIndex: number;
}

export type AnnotationType = "highlight" | "reply";

export interface DocNodeData {
  content: string;
  nodeType: "paragraph" | "annotation";
  annotationType?: AnnotationType;
  sourceText?: string;            // quoted text snippet (highlights only)
  tags: string[];
  isNew?: boolean;
  depth: number;
  colorIndex?: number;            // thread color — assigned at highlight creation, inherited by replies
  highlights?: HighlightRange[];  // persisted highlight ranges on this node's text
  highlightStartIdx?: number;     // char offset in source — used by layout to position near the highlight
  reactions?: Record<string, number>;  // emoji → count
  author?: string;                     // username who created this node
}

interface DocumentStore {
  nodes: Node[];
  edges: Edge[];
  documentTitle: string;
  nextColorIndex: number;

  loadDocument: (text: string, title?: string, author?: string) => void;
  loadRound: (title: string, nodes: Node[], edges: Edge[]) => void;
  createHighlight: (
    selectedText: string,
    sourceNodeId: string,
    startIdx: number,
    endIdx: number,
    author?: string,
  ) => void;
  addReply: (content: string, sourceNodeId: string, edgeType: string, author?: string) => void;
  updateNode: (id: string, content: string) => void;
  addTag: (nodeId: string, tag: string) => void;
  removeTag: (nodeId: string, tag: string) => void;
  toggleReaction: (nodeId: string, emoji: string) => void;
  deleteNode: (id: string) => void;
  addParagraph: (afterNodeId: string | null, author?: string) => void;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useDocumentStore = create<DocumentStore>((set) => ({
  nodes: [],
  edges: [],
  documentTitle: "",
  nextColorIndex: 0,

  loadDocument: (text, title = "Untitled Document", author) => {
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    let currentY = 20;
    const nodes: Node[] = paragraphs.map((content, idx) => {
      const height = estimateHeight(content);
      const y = currentY;
      currentY += height + NODE_GAP;
      return {
        id: `para-${idx}`,
        type: "paragraphNode",
        position: { x: getColumnX(0), y },
        data: {
          content,
          nodeType: "paragraph",
          tags: [],
          depth: 0,
          highlights: [],
          reactions: {},
          author,
        } as DocNodeData,
      };
    });

    set({ nodes: relayoutAll(nodes, []), edges: [], documentTitle: title, nextColorIndex: 0 });
  },

  loadRound: (title, nodes, edges) => {
    // Determine the next color index from existing nodes
    let maxColor = -1;
    for (const n of nodes) {
      const ci = n.data.colorIndex as number | undefined;
      if (ci !== undefined && ci > maxColor) maxColor = ci;
    }
    set({
      nodes: relayoutAll(nodes, edges),
      edges,
      documentTitle: title,
      nextColorIndex: maxColor + 1,
    });
  },

  createHighlight: (selectedText, sourceNodeId, startIdx, endIdx, author) =>
    set((state) => {
      const sourceNode = state.nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return state;

      const colorIndex = state.nextColorIndex % THREAD_COLORS.length;
      const newDepth = (sourceNode.data.depth as number) + 1;
      const newId = `anno-${Date.now()}`;

      // Persist the highlight range on the source node
      const updatedNodes = state.nodes.map((n) =>
        n.id === sourceNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                highlights: [
                  ...(n.data.highlights ?? []),
                  { startIdx, endIdx, colorIndex },
                ],
              },
            }
          : n,
      );

      const newNode: Node = {
        id: newId,
        type: "annotationNode",
        position: { x: getColumnX(newDepth), y: 0 }, // placeholder — relayout will position
        data: {
          content: "",
          nodeType: "annotation",
          annotationType: "highlight",
          sourceText: selectedText,
          tags: [],
          depth: newDepth,
          colorIndex,
          isNew: true,
          highlightStartIdx: startIdx,
          reactions: {},
          author,
        } as DocNodeData,
      };

      const newEdge: Edge = {
        id: `edge-${sourceNodeId}-${newId}`,
        source: sourceNodeId,
        target: newId,
        type: "articleLink",
        sourceHandle: "right",
        targetHandle: "left",
        data: { colorIndex },
      };

      const allEdges = [...state.edges, newEdge];

      return {
        nodes: relayoutAll([...updatedNodes, newNode], allEdges),
        edges: allEdges,
        nextColorIndex: state.nextColorIndex + 1,
      };
    }),

  addReply: (content, sourceNodeId, edgeType, author) =>
    set((state) => {
      const sourceNode = state.nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return state;

      const colorIndex = sourceNode.data.colorIndex as number | undefined;
      const newDepth = (sourceNode.data.depth as number) + 1;
      const newId = `anno-${Date.now()}`;

      const newNode: Node = {
        id: newId,
        type: "annotationNode",
        position: { x: getColumnX(newDepth), y: 0 }, // placeholder — relayout will position
        data: {
          content,
          nodeType: "annotation",
          annotationType: "reply",
          tags: [],
          depth: newDepth,
          colorIndex,
          reactions: {},
          author,
        } as DocNodeData,
      };

      const newEdge: Edge = {
        id: `edge-${sourceNodeId}-${newId}`,
        source: sourceNodeId,
        target: newId,
        type: edgeType,
        sourceHandle: "right",
        targetHandle: "left",
        data: { colorIndex },
      };

      const allEdges = [...state.edges, newEdge];

      return {
        nodes: relayoutAll([...state.nodes, newNode], allEdges),
        edges: allEdges,
      };
    }),

  updateNode: (id, content) =>
    set((state) => {
      const updatedNodes = state.nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, content, isNew: false } }
          : n,
      );
      return { nodes: relayoutAll(updatedNodes, state.edges) };
    }),

  addTag: (nodeId, tag) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                tags: [...(n.data.tags as string[]).filter((t) => t !== tag), tag],
              },
            }
          : n,
      ),
    })),

  removeTag: (nodeId, tag) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                tags: (n.data.tags as string[]).filter((t) => t !== tag),
              },
            }
          : n,
      ),
    })),

  toggleReaction: (nodeId, emoji) =>
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const prev = (n.data.reactions as Record<string, number> | undefined) ?? {};
        const cur = prev[emoji] ?? 0;
        const next = { ...prev, [emoji]: cur + 1 };
        return { ...n, data: { ...n.data, reactions: next } };
      }),
    })),

  deleteNode: (id) =>
    set((state) => {
      const remaining = state.nodes.filter((n) => n.id !== id);
      const remainingEdges = state.edges.filter((e) => e.source !== id && e.target !== id);
      return { nodes: relayoutAll(remaining, remainingEdges), edges: remainingEdges };
    }),

  addParagraph: (afterNodeId, author) =>
    set((state) => {
      const newId = `para-${Date.now()}`;
      // Find the target node to insert after; if null, append at the end
      const depth0 = state.nodes
        .filter((n) => n.data.depth === 0)
        .sort((a, b) => a.position.y - b.position.y);
      const afterIdx = afterNodeId
        ? depth0.findIndex((n) => n.id === afterNodeId)
        : depth0.length - 1;
      const afterNode = depth0[afterIdx];
      const newY = afterNode
        ? afterNode.position.y + nodeHeight(afterNode) + NODE_GAP
        : 20;

      const newNode: Node = {
        id: newId,
        type: "paragraphNode",
        position: { x: getColumnX(0), y: newY },
        data: {
          content: "",
          nodeType: "paragraph",
          tags: [],
          depth: 0,
          highlights: [],
          reactions: {},
          isNew: true,
          author,
        } as DocNodeData,
      };
      const nodes = [...state.nodes, newNode];
      return { nodes: relayoutAll(nodes, state.edges) };
    }),
}));
