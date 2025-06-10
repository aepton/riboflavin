import { create } from 'zustand';
import type { Node, Edge } from 'reactflow';

interface Column {
  id: string;
  title: string;
  x: number;
}

interface NoteStore {
  nodes: Node[];
  edges: Edge[];
  columns: Column[];
  addColumn: () => void;
  addNote: (columnId: string) => void;
  updateNote: (id: string, content: string) => void;
  connectNotes: (sourceId: string, targetId: string) => void;
  deleteNote: (id: string) => void;
}

const COLUMN_WIDTH = 300;
const COLUMN_SPACING = 50;
const NOTE_HEIGHT = 100;
const NOTE_SPACING = 20;

// Create initial column and node
const initialColumn = {
  id: 'column-1',
  title: 'Column 1',
  x: 50,
};

const initialNode: Node = {
  id: 'note-1',
  type: 'note',
  position: { x: initialColumn.x, y: 50 },
  data: { content: '', columnId: initialColumn.id, isNew: true },
};

export const useNoteStore = create<NoteStore>((set) => ({
  nodes: [initialNode],
  edges: [],
  columns: [initialColumn],
  
  addColumn: () => set((state) => {
    const newColumnId = `column-${state.columns.length + 1}`;
    const newColumn = {
      id: newColumnId,
      title: `Column ${state.columns.length + 1}`,
      x: state.columns.length * (COLUMN_WIDTH + COLUMN_SPACING) + 50,
    };
    return {
      columns: [...state.columns, newColumn],
    };
  }),

  addNote: (columnId) => set((state) => {
    const column = state.columns.find((col) => col.id === columnId);
    if (!column) return state;

    const columnNotes = state.nodes.filter((node) => 
      node.position.x === column.x
    );
    
    const newY = columnNotes.length * (NOTE_HEIGHT + NOTE_SPACING) + 50;
    const id = `note-${Date.now()}`;
    
    const newNode: Node = {
      id,
      type: 'note',
      position: { x: column.x, y: newY },
      data: { content: '', columnId, isNew: true },
    };

    // Mark all other notes as not new
    const updatedNodes = state.nodes.map(node => ({
      ...node,
      data: { ...node.data, isNew: false }
    }));

    return {
      nodes: [...updatedNodes, newNode],
    };
  }),

  updateNote: (id, content) => set((state) => {
    const newNodes = state.nodes.map((node) =>
      node.id === id 
        ? { ...node, data: { ...node.data, content, isNew: false } } 
        : node
    );
    return {
      nodes: newNodes,
    };
  }),

  connectNotes: (sourceId, targetId) => set((state) => {
    const edgeId = `edge-${sourceId}-${targetId}`;
    const newEdge: Edge = {
      id: edgeId,
      source: sourceId,
      target: targetId,
      type: 'smoothstep',
    };
    return {
      edges: [...state.edges, newEdge],
    };
  }),

  deleteNote: (id) => set((state) => ({
    nodes: state.nodes.filter((node) => node.id !== id),
    edges: state.edges.filter(
      (edge) => edge.source !== id && edge.target !== id
    ),
  })),
})); 