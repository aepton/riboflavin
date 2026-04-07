import { create } from "zustand";
import type { Node, Edge } from "reactflow";

// ── Layout constants ────────────────────────────────────────────────────────
const COLUMN_X_BASE = 20;
const COLUMN_WIDTH = 320;  // matches actual node width
const COLUMN_SPACING = 50; // gap between columns
const NODE_GAP = 24;       // minimum vertical gap between nodes in the same column

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
function estimateHeight(content: string): number {
  // 320px wide, 16px padding each side → 288px content area.
  // EB Garamond 15px at line-height 1.75 ≈ 26px/line, ~36 chars/line.
  // Fixed chrome: 32px padding + 46px action bar = 78px.
  if (!content) return 124;
  const charsPerLine = 36;
  const hardLines = content.split("\n").length;
  const wrappedLines = Math.ceil(content.length / charsPerLine);
  const totalLines = Math.max(hardLines, wrappedLines, 1);
  return totalLines * 26 + 78;
}

/** Estimate rendered height of an AnnotationNode (more chrome than paragraphs). */
function estimateAnnotationHeight(content: string): number {
  if (!content) return 170;
  const charsPerLine = 42;
  const hardLines = content.split("\n").length;
  const wrappedLines = Math.ceil(content.length / charsPerLine);
  const totalLines = Math.max(hardLines, wrappedLines, 1);
  return Math.max(170, totalLines * 22 + 110);
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

  const topPad = nodeType === "paragraph" ? 16 : 52;
  const cpl = nodeType === "paragraph" ? 36 : 38;
  const lh = nodeType === "paragraph" ? 26 : 25;

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

/**
 * Re-sort and re-position every annotation node at a given depth so that:
 *  1. Each node sits as close as possible to its source node's Y
 *  2. Nodes are ordered by their ideal Y (== source order), minimising edge crossings
 *  3. No two nodes overlap
 *
 * Then cascade to deeper depths, since moving nodes here shifts their
 * children's ideal positions.
 */
function relayoutFromDepth(nodes: Node[], edges: Edge[], startDepth: number): Node[] {
  let result = [...nodes];

  // Find the max depth present in the graph
  let maxDepth = 0;
  for (const n of result) {
    if ((n.data.depth as number) > maxDepth) maxDepth = n.data.depth as number;
  }

  for (let depth = startDepth; depth <= maxDepth; depth++) {
    const atDepth = result.filter((n) => n.data.depth === depth);
    if (atDepth.length === 0) continue;

    // Build a lookup for quick access
    const nodeById = new Map(result.map((n) => [n.id, n]));

    // For each node at this depth, compute its ideal Y from its source
    const items = atDepth.map((n) => {
      const inEdge = edges.find((e) => e.target === n.id);
      const sourceNode = inEdge ? nodeById.get(inEdge.source) : undefined;
      const ideal = sourceNode ? idealYForNode(n, sourceNode) : n.position.y;
      return { node: n, idealY: ideal };
    });

    // Sort by ideal Y. Array.sort is stable, so creation-order is the tiebreaker.
    items.sort((a, b) => a.idealY - b.idealY);

    // Greedy top-to-bottom placement: each node gets max(idealY, previousBottom + gap)
    const updates = new Map<string, number>();
    let cursor = 20;
    for (const { node, idealY } of items) {
      const y = Math.max(idealY, cursor);
      updates.set(node.id, y);
      cursor = y + estimateAnnotationHeight(node.data.content) + NODE_GAP;
    }

    // Apply position updates
    result = result.map((n) => {
      const newY = updates.get(n.id);
      if (newY !== undefined && newY !== n.position.y) {
        return { ...n, position: { x: getColumnX(depth), y: newY } };
      }
      return n;
    });
  }

  return result;
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
}

interface DocumentStore {
  nodes: Node[];
  edges: Edge[];
  documentTitle: string;
  nextColorIndex: number;

  loadDocument: (text: string, title?: string) => void;
  createHighlight: (
    selectedText: string,
    sourceNodeId: string,
    startIdx: number,
    endIdx: number,
  ) => void;
  addReply: (content: string, sourceNodeId: string, edgeType: string) => void;
  updateNode: (id: string, content: string) => void;
  addTag: (nodeId: string, tag: string) => void;
  removeTag: (nodeId: string, tag: string) => void;
  deleteNode: (id: string) => void;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useDocumentStore = create<DocumentStore>((set) => ({
  nodes: [],
  edges: [],
  documentTitle: "",
  nextColorIndex: 0,

  loadDocument: (text, title = "Untitled Document") => {
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
        } as DocNodeData,
      };
    });

    set({ nodes, edges: [], documentTitle: title, nextColorIndex: 0 });
  },

  createHighlight: (selectedText, sourceNodeId, startIdx, endIdx) =>
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
        nodes: relayoutFromDepth([...updatedNodes, newNode], allEdges, newDepth),
        edges: allEdges,
        nextColorIndex: state.nextColorIndex + 1,
      };
    }),

  addReply: (content, sourceNodeId, edgeType) =>
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
        nodes: relayoutFromDepth([...state.nodes, newNode], allEdges, newDepth),
        edges: allEdges,
      };
    }),

  updateNode: (id, content) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, content, isNew: false } }
          : n,
      ),
    })),

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

  deleteNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
    })),
}));
