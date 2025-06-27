import { create } from "zustand";
import type { Node, Edge } from "reactflow";

interface Column {
  id: string;
  title: string;
  x: number;
}

interface NoteData {
  id: string;
  content: string;
  columnId: string;
}

interface ColumnData {
  id: string;
  title: string;
  notes: NoteData[];
}

interface EdgeData {
  id: string;
  source: string;
  target: string;
  type?: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface ParsedTranscriptData {
  columns: ColumnData[];
  edges?: EdgeData[];
}

interface NoteStore {
  nodes: Node[];
  edges: Edge[];
  columns: Column[];
  addNote: (columnId: string) => void;
  updateNote: (id: string, content: string) => void;
  connectNotes: (sourceId: string, targetId: string) => void;
  deleteNote: (id: string) => void;
  loadParsedTranscript: () => Promise<void>;
}

const COLUMN_WIDTH = 300;
const COLUMN_SPACING = 50;
const NOTE_WIDTH = 280;
const NOTE_SPACING = 40;

// Create initial column and node
const initialColumn = {
  id: "column-1",
  title: "Column 1",
  x: 50,
};

const initialNode: Node = {
  id: "note-1",
  type: "note",
  position: {
    x: initialColumn.x + (COLUMN_WIDTH - NOTE_WIDTH) / 2,
    y: 50,
  },
  data: { content: "", columnId: initialColumn.id, isNew: true },
};

export const useNoteStore = create<NoteStore>((set) => ({
  nodes: [initialNode],
  edges: [],
  columns: [initialColumn],

  addNote: (columnId) =>
    set((state) => {
      const column = state.columns.find((col) => col.id === columnId);
      if (!column) return state;

      // Find the highest Y position of any existing note
      const highestY =
        state.nodes.length > 0
          ? Math.max(...state.nodes.map((node) => node.position.y))
          : 0;

      // Calculate the height of the highest note to determine next position
      const highestNode = state.nodes.find(
        (node) => node.position.y === highestY
      );
      let nextY = 50; // Default starting position

      if (highestNode) {
        // Estimate the height of the highest note based on its content
        const contentLength = highestNode.data.content.length;
        const estimatedLines = Math.ceil(contentLength / 50);
        const estimatedHeight = Math.max(140, estimatedLines * 28 + 60);
        nextY = highestY + estimatedHeight + NOTE_SPACING;
      }

      const id = `note-${Date.now()}`;

      const newNode: Node = {
        id,
        type: "note",
        position: {
          x: column.x + (COLUMN_WIDTH - NOTE_WIDTH) / 2,
          y: nextY,
        },
        data: { content: "", columnId, isNew: true },
      };

      // Mark all other notes as not new
      const updatedNodes = state.nodes.map((node) => ({
        ...node,
        data: { ...node.data, isNew: false },
      }));

      return {
        nodes: [...updatedNodes, newNode],
      };
    }),

  updateNote: (id, content) =>
    set((state) => {
      const newNodes = state.nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, content, isNew: false } }
          : node
      );
      return {
        nodes: newNodes,
      };
    }),

  connectNotes: (sourceId, targetId) =>
    set((state) => {
      const edgeId = `edge-${sourceId}-${targetId}`;
      const newEdge: Edge = {
        id: edgeId,
        source: sourceId,
        target: targetId,
        type: "smoothstep",
      };
      return {
        edges: [...state.edges, newEdge],
      };
    }),

  deleteNote: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== id),
      edges: state.edges.filter(
        (edge) => edge.source !== id && edge.target !== id
      ),
    })),

  loadParsedTranscript: async () => {
    try {
      // Load from public directory as static asset
      const response = await fetch("/daily_covids_wake_parsed.json");
      if (!response.ok) {
        throw new Error(
          `Failed to load static asset: ${response.status} ${response.statusText}`
        );
      }
      const data: ParsedTranscriptData = await response.json();

      // Process the data - filter out empty columns and duplicates
      const uniqueColumns = new Map<
        string,
        { id: string; title: string; notes: NoteData[] }
      >();
      data.columns.forEach((col: ColumnData) => {
        if (col.title && col.title.trim() !== "") {
          // Use title as key to prevent duplicates
          if (!uniqueColumns.has(col.title)) {
            uniqueColumns.set(col.title, col);
          } else {
            // Merge notes from duplicate columns
            const existing = uniqueColumns.get(col.title)!;
            existing.notes = [...existing.notes, ...col.notes];
          }
        }
      });

      const newColumns: Column[] = Array.from(uniqueColumns.values()).map(
        (
          col: {
            id: string;
            title: string;
            notes: NoteData[];
          },
          idx: number
        ) => {
          // Start columns from a fixed left margin (50px) and space them out
          const columnX = 50 + idx * (COLUMN_WIDTH + COLUMN_SPACING);

          return {
            id: col.id,
            title: col.title,
            x: columnX,
          };
        }
      );

      const nodeIdToColumnX: Record<string, number> = {};
      newColumns.forEach((col) => {
        nodeIdToColumnX[col.id] = col.x;
      });

      // Create a mapping from original column IDs to new column positions
      const originalToNewColumnMap: Record<string, string> = {};
      data.columns.forEach((originalCol: ColumnData) => {
        if (originalCol.title && originalCol.title.trim() !== "") {
          // Find the new column with the same title
          const newColumn = newColumns.find(
            (col) => col.title === originalCol.title
          );
          if (newColumn) {
            originalToNewColumnMap[originalCol.id] = newColumn.id;
          }
        }
      });

      // Collect all notes from all columns and sort them by ID to get chronological order
      const allNotes: NoteData[] = [];
      data.columns.forEach((col: ColumnData) => {
        // Only include notes from columns that have titles (skip empty columns)
        if (col.title && col.title.trim() !== "") {
          col.notes.forEach((note: NoteData) => {
            allNotes.push({ ...note, columnId: col.id });
          });
        }
      });

      // Sort notes by their ID to get chronological order (note-1, note-2, note-3, etc.)
      allNotes.sort((a, b) => {
        const aNum = parseInt(a.id.replace("note-", ""));
        const bNum = parseInt(b.id.replace("note-", ""));
        return aNum - bNum;
      });

      // Position nodes sequentially across all columns to maintain conversation flow
      const nodes: Node[] = [];
      let currentY = 100; // Start position
      const NODE_SPACING = 60; // Spacing between nodes

      allNotes.forEach((note) => {
        const originalColumnId = note.columnId;
        const newColumnId = originalToNewColumnMap[originalColumnId];
        const columnX = nodeIdToColumnX[newColumnId];

        if (columnX === undefined) {
          console.warn(
            `No column found for note ${note.id} with columnId ${originalColumnId}`
          );
          return;
        }

        const calculatedX = columnX + COLUMN_WIDTH / 2 - NOTE_WIDTH / 2;

        // Calculate estimated height based on content length and line breaks
        const contentLength = note.content.length;
        const lineBreaks = (note.content.match(/\n/g) || []).length;
        const estimatedLines = Math.max(
          1,
          Math.ceil(contentLength / 40) + lineBreaks
        );
        const estimatedHeight = Math.max(104, estimatedLines * 21 + 60); // 104px min (80px + 24px padding)

        // Position node at current Y, then update Y for next node
        const y = currentY;

        nodes.push({
          id: note.id,
          type: "noteNode",
          position: { x: calculatedX, y },
          data: {
            content: note.content,
            columnId: newColumnId,
          },
        });

        // Update Y position for next node
        currentY += estimatedHeight + NODE_SPACING;
      });

      // Edges
      const allEdges: Edge[] = (data.edges || []).map((edge: EdgeData) => {
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type || "smoothstep", // Use the type from backend, fallback to smoothstep
          sourceHandle: edge.sourceHandle || "right",
          targetHandle: edge.targetHandle || "left",
          // Ensure edges are drawn between nodes with proper routing
          style: { zIndex: 1 }, // Ensure edges are drawn behind nodes
        };
      });

      set({
        columns: newColumns,
        nodes: nodes,
        edges: allEdges,
      });
    } catch (error) {
      console.error(
        "Failed to load parsed transcript from static asset:",
        error
      );
      throw error; // Re-throw the error to see what's happening
    }
  },
}));
