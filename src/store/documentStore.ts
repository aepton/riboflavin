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
 * Pick a Y position for a new annotation that:
 * - tries to align with the source node's vertical center
 * - never overlaps any existing node at the same depth
 */
function getAnnotationY(
  sourceNode: Node,
  siblings: Node[],   // nodes directly linked from this same source
  allAtDepth: Node[],  // all nodes already placed at the new depth
): number {
  const sourceH = estimateHeight(sourceNode.data.content);
  const idealY = Math.max(50, sourceNode.position.y + sourceH / 2 - 50);

  let minY = 50;
  if (allAtDepth.length > 0) {
    const last = allAtDepth.reduce((a, b) => (a.position.y > b.position.y ? a : b));
    minY = last.position.y + estimateAnnotationHeight(last.data.content) + NODE_GAP;
  }

  if (siblings.length > 0) {
    const lastSib = siblings.reduce((a, b) => (a.position.y > b.position.y ? a : b));
    minY = Math.max(minY, lastSib.position.y + estimateAnnotationHeight(lastSib.data.content) + NODE_GAP);
  }

  return Math.max(idealY, minY);
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
  sourceText?: string;         // quoted text snippet (highlights only)
  tags: string[];
  isNew?: boolean;
  depth: number;
  colorIndex?: number;         // thread color — assigned at highlight creation, inherited by replies
  highlights?: HighlightRange[]; // persisted highlight ranges on this node's text
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

      const linkedIds = state.edges
        .filter((e) => e.source === sourceNodeId)
        .map((e) => e.target);
      const siblings = state.nodes.filter((n) => linkedIds.includes(n.id));
      const allAtDepth = state.nodes.filter((n) => n.data.depth === newDepth);

      const newId = `anno-${Date.now()}`;
      const y = getAnnotationY(sourceNode, siblings, allAtDepth);

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
        position: { x: getColumnX(newDepth), y },
        data: {
          content: "",
          nodeType: "annotation",
          annotationType: "highlight",
          sourceText: selectedText,
          tags: [],
          depth: newDepth,
          colorIndex,
          isNew: true,
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

      return {
        nodes: [...updatedNodes, newNode],
        edges: [...state.edges, newEdge],
        nextColorIndex: state.nextColorIndex + 1,
      };
    }),

  addReply: (content, sourceNodeId, edgeType) =>
    set((state) => {
      const sourceNode = state.nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return state;

      const colorIndex = sourceNode.data.colorIndex as number | undefined;
      const newDepth = (sourceNode.data.depth as number) + 1;

      const linkedIds = state.edges
        .filter((e) => e.source === sourceNodeId)
        .map((e) => e.target);
      const siblings = state.nodes.filter((n) => linkedIds.includes(n.id));
      const allAtDepth = state.nodes.filter((n) => n.data.depth === newDepth);

      const newId = `anno-${Date.now()}`;
      const y = getAnnotationY(sourceNode, siblings, allAtDepth);

      const newNode: Node = {
        id: newId,
        type: "annotationNode",
        position: { x: getColumnX(newDepth), y },
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

      return {
        nodes: [...state.nodes, newNode],
        edges: [...state.edges, newEdge],
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
