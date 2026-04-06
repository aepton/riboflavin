import { create } from "zustand";
import type { Node, Edge } from "reactflow";

const COLUMN_X_BASE = 50;
const COLUMN_WIDTH = 340;
const COLUMN_SPACING = 100;
const ANNOTATION_GAP = 20;

function estimateHeight(content: string): number {
  if (!content) return 100;
  const charsPerLine = 48;
  const hardLines = content.split("\n").length;
  const wrappedLines = Math.ceil(content.length / charsPerLine);
  const totalLines = Math.max(hardLines, wrappedLines, 1);
  return Math.max(100, totalLines * 22 + 80);
}

function getColumnX(depth: number): number {
  return COLUMN_X_BASE + depth * (COLUMN_WIDTH + COLUMN_SPACING);
}

function getAnnotationY(sourceNode: Node, existingSiblings: Node[]): number {
  if (existingSiblings.length === 0) {
    const sourceHeight = estimateHeight(sourceNode.data.content);
    const sourceCenterY = sourceNode.position.y + sourceHeight / 2;
    return Math.max(50, sourceCenterY - 50);
  }
  const last = existingSiblings.reduce((a, b) =>
    a.position.y > b.position.y ? a : b
  );
  return last.position.y + estimateHeight(last.data.content) + ANNOTATION_GAP;
}

export type AnnotationType =
  | "highlight"
  | "simplify"
  | "rephrase"
  | "summarize"
  | "reply";

export interface DocNodeData {
  content: string;
  nodeType: "paragraph" | "annotation";
  annotationType?: AnnotationType;
  sourceText?: string;
  tags: string[];
  isNew?: boolean;
  depth: number;
}

interface DocumentStore {
  nodes: Node[];
  edges: Edge[];
  documentTitle: string;

  loadDocument: (text: string, title?: string) => void;
  createHighlight: (selectedText: string, sourceNodeId: string) => void;
  createDerivedAnnotation: (
    type: "simplify" | "rephrase" | "summarize",
    sourceNodeId: string
  ) => void;
  addReply: (
    content: string,
    sourceNodeId: string,
    edgeType: string
  ) => void;
  updateNode: (id: string, content: string) => void;
  addTag: (nodeId: string, tag: string) => void;
  removeTag: (nodeId: string, tag: string) => void;
  deleteNode: (id: string) => void;
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  nodes: [],
  edges: [],
  documentTitle: "",

  loadDocument: (text, title = "Untitled Document") => {
    const rawParagraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    let currentY = 50;
    const nodes: Node[] = rawParagraphs.map((content, idx) => {
      const height = estimateHeight(content);
      const y = currentY;
      currentY += height + 40;

      return {
        id: `para-${idx}`,
        type: "paragraphNode",
        position: { x: getColumnX(0), y },
        data: {
          content,
          nodeType: "paragraph",
          tags: [],
          depth: 0,
        } as DocNodeData,
      };
    });

    set({ nodes, edges: [], documentTitle: title });
  },

  createHighlight: (selectedText, sourceNodeId) =>
    set((state) => {
      const sourceNode = state.nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return state;

      const newDepth = (sourceNode.data.depth as number) + 1;
      const linkedIds = state.edges
        .filter((e) => e.source === sourceNodeId)
        .map((e) => e.target);
      const siblings = state.nodes.filter((n) => linkedIds.includes(n.id));

      const newId = `anno-${Date.now()}`;
      const y = getAnnotationY(sourceNode, siblings);

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
      };

      return {
        nodes: [...state.nodes, newNode],
        edges: [...state.edges, newEdge],
      };
    }),

  createDerivedAnnotation: (type, sourceNodeId) =>
    set((state) => {
      const sourceNode = state.nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return state;

      const newDepth = (sourceNode.data.depth as number) + 1;
      const linkedIds = state.edges
        .filter((e) => e.source === sourceNodeId)
        .map((e) => e.target);
      const siblings = state.nodes.filter((n) => linkedIds.includes(n.id));

      const newId = `anno-${Date.now()}`;
      const y = getAnnotationY(sourceNode, siblings);

      const newNode: Node = {
        id: newId,
        type: "annotationNode",
        position: { x: getColumnX(newDepth), y },
        data: {
          content: "",
          nodeType: "annotation",
          annotationType: type,
          tags: [],
          depth: newDepth,
          isNew: true,
        } as DocNodeData,
      };

      const edgeTypeMap: Record<string, string> = {
        simplify: "smoothstep",
        rephrase: "ellipsis",
        summarize: "smoothstep",
      };

      const newEdge: Edge = {
        id: `edge-${sourceNodeId}-${newId}`,
        source: sourceNodeId,
        target: newId,
        type: edgeTypeMap[type] || "smoothstep",
        sourceHandle: "right",
        targetHandle: "left",
      };

      return {
        nodes: [...state.nodes, newNode],
        edges: [...state.edges, newEdge],
      };
    }),

  addReply: (content, sourceNodeId, edgeType) =>
    set((state) => {
      const sourceNode = state.nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return state;

      const newDepth = (sourceNode.data.depth as number) + 1;
      const linkedIds = state.edges
        .filter((e) => e.source === sourceNodeId)
        .map((e) => e.target);
      const siblings = state.nodes.filter((n) => linkedIds.includes(n.id));

      const newId = `anno-${Date.now()}`;
      const y = getAnnotationY(sourceNode, siblings);

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
        } as DocNodeData,
      };

      const newEdge: Edge = {
        id: `edge-${sourceNodeId}-${newId}`,
        source: sourceNodeId,
        target: newId,
        type: edgeType,
        sourceHandle: "right",
        targetHandle: "left",
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
          : n
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
                tags: [...(n.data.tags || []).filter((t: string) => t !== tag), tag],
              },
            }
          : n
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
                tags: (n.data.tags || []).filter((t: string) => t !== tag),
              },
            }
          : n
      ),
    })),

  deleteNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter(
        (e) => e.source !== id && e.target !== id
      ),
    })),
}));
