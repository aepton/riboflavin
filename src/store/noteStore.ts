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
  addColumn: (speakerName?: string) => void;
  addNote: (columnId: string) => void;
  updateNote: (id: string, content: string) => void;
  connectNotes: (sourceId: string, targetId: string) => void;
  deleteNote: (id: string) => void;
  loadArticle: () => Promise<void>;
  parseManualContent: (content: string) => void;
}

const COLUMN_WIDTH = 300;
const COLUMN_SPACING = 50;
const NOTE_SPACING = 20;
const NOTE_WIDTH = 280;

// Create initial column and node
const initialColumn = {
  id: 'column-1',
  title: 'Column 1',
  x: 50,
};

const initialNode: Node = {
  id: 'note-1',
  type: 'note',
  position: { 
    x: initialColumn.x + (COLUMN_WIDTH - NOTE_WIDTH) / 2, 
    y: 50 
  },
  data: { content: '', columnId: initialColumn.id, isNew: true },
};

// Helper function to process dialogue and create columns/notes
const processDialogue = (
  dialogue: { speaker: string; text: string }[], 
  set: (state: any) => void
) => {
  // Map to normalize speakers: last name(s) -> full name
  const speakerFullNameMap = new Map<string, string>();
  const normalizedDialogue: { speaker: string; text: string }[] = [];

  dialogue.forEach(({ speaker, text }) => {
    const normSpeaker = speaker.trim().replace(/\s+/g, ' ');
    const words = normSpeaker.split(' ');
    // If this is a multi-word name, treat as full name
    if (words.length > 1) {
      const lastName = words.slice(-2).join(' '); // Try last two words (for DEL TORO, VAN BUREN, etc.)
      speakerFullNameMap.set(lastName.toUpperCase(), normSpeaker);
      speakerFullNameMap.set(words.slice(-1)[0].toUpperCase(), normSpeaker); // Also map just the last word
      normalizedDialogue.push({ speaker: normSpeaker, text });
    } else {
      // Single word: try to map to a full name
      const mapped = speakerFullNameMap.get(normSpeaker.toUpperCase());
      if (mapped) {
        normalizedDialogue.push({ speaker: mapped, text });
      } else {
        normalizedDialogue.push({ speaker: normSpeaker, text });
      }
    }
  });

  // Group speakers and create columns
  const speakerGroups = new Map<string, string[]>();
  normalizedDialogue.forEach(({ speaker, text }) => {
    if (!speakerGroups.has(speaker)) speakerGroups.set(speaker, []);
    speakerGroups.get(speaker)!.push(text);
  });

  const newColumns: Column[] = [];
  let colIdx = 0;
  speakerGroups.forEach((_, speaker) => {
    newColumns.push({
      id: `column-${colIdx + 1}`,
      title: speaker,
      x: colIdx * (COLUMN_WIDTH + COLUMN_SPACING) + 50,
    });
    colIdx++;
  });

  // Sequential vertical layout
  let currentY = 50;
  let nodeIdCounter = 1;
  const allNodes: { node: Node; transcriptOrder: number }[] = [];

  normalizedDialogue.forEach(({ speaker, text }, idx) => {
    const column = newColumns.find(col => col.title === speaker);
    if (!column) return;

    const nodeId = `note-${nodeIdCounter++}`;
    // Estimate height: 20px per line, min 80px, 50 chars/line
    const estimatedLines = Math.ceil(text.length / 50);
    const estimatedHeight = Math.max(80, estimatedLines * 20 + 24);

    const node: Node = {
      id: nodeId,
      type: 'note',
      position: { 
        x: column.x + (COLUMN_WIDTH - NOTE_WIDTH) / 2, 
        y: currentY
      },
      data: { 
        content: text, 
        columnId: column.id, 
        isNew: idx === 0
      },
    };

    allNodes.push({ node, transcriptOrder: idx });
    currentY += estimatedHeight + NOTE_SPACING;
  });

  // Edges in transcript order
  const newEdges: Edge[] = [];
  for (let i = 0; i < allNodes.length - 1; i++) {
    newEdges.push({
      id: `edge-${allNodes[i].node.id}-${allNodes[i + 1].node.id}`,
      source: allNodes[i].node.id,
      target: allNodes[i + 1].node.id,
      type: 'articleLink',
    });
  }

  set({
    columns: newColumns,
    nodes: allNodes.map(item => item.node),
    edges: newEdges,
  });
};

export const useNoteStore = create<NoteStore>((set) => ({
  nodes: [initialNode],
  edges: [],
  columns: [initialColumn],
  
  addColumn: (speakerName?: string) => set((state) => {
    const newColumnId = `column-${state.columns.length + 1}`;
    const newColumn = {
      id: newColumnId,
      title: speakerName || `Column ${state.columns.length + 1}`,
      x: state.columns.length * (COLUMN_WIDTH + COLUMN_SPACING) + 50,
    };
    return {
      columns: [...state.columns, newColumn],
    };
  }),

  addNote: (columnId) => set((state) => {
    const column = state.columns.find((col) => col.id === columnId);
    if (!column) return state;

    // Find the highest Y position of any existing note
    const highestY = state.nodes.length > 0 
      ? Math.max(...state.nodes.map(node => node.position.y))
      : 0;
    
    // Calculate the height of the highest note to determine next position
    const highestNode = state.nodes.find(node => node.position.y === highestY);
    let nextY = 50; // Default starting position
    
    if (highestNode) {
      // Estimate the height of the highest note based on its content
      const contentLength = highestNode.data.content.length;
      const estimatedLines = Math.ceil(contentLength / 50);
      const estimatedHeight = Math.max(80, estimatedLines * 20 + 24);
      nextY = highestY + estimatedHeight + NOTE_SPACING;
    }
    
    const id = `note-${Date.now()}`;
    
    const newNode: Node = {
      id,
      type: 'note',
      position: { 
        x: column.x + (COLUMN_WIDTH - NOTE_WIDTH) / 2, 
        y: nextY
      },
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

  loadArticle: async () => {
    try {
      // Try multiple CORS proxies in case one fails
      const corsProxies = [
        'https://api.allorigins.win/raw?url=',
        'https://cors-anywhere.herokuapp.com/',
        'https://thingproxy.freeboard.io/fetch/'
      ];
      
      let html = '';
      let success = false;
      
      for (const proxy of corsProxies) {
        try {
          const articleUrl = 'https://www.npr.org/2025/06/12/nx-s1-5425327/benicio-del-toro-the-phoenician-scheme';
          const response = await fetch(proxy + encodeURIComponent(articleUrl), {
            method: 'GET',
            headers: {
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate',
              'Connection': 'keep-alive',
            },
            signal: AbortSignal.timeout(10000) // 10 second timeout
          });
          
          if (response.ok) {
            html = await response.text();
            success = true;
            break;
          }
        } catch (proxyError) {
          console.log(`Proxy ${proxy} failed:`, proxyError);
          continue;
        }
      }
      
      if (!success) {
        throw new Error('All CORS proxies failed');
      }
      
      // Create a DOM parser to extract text content
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Extract the transcript content - looking for the transcript section
      // NPR articles typically have transcript content in specific sections
      const transcriptSection = doc.querySelector('.transcript') ||
                               doc.querySelector('[class*="transcript"]') ||
                               doc.querySelector('[data-metrics*="transcript"]') ||
                               doc.querySelector('.storytext') ||
                               doc.querySelector('.story-body');
      
      if (!transcriptSection) {
        console.error('Could not find transcript section, trying to parse entire article');
        // Fallback: try to parse the entire article content
        const articleContent = doc.querySelector('article') || doc.querySelector('.story-body') || doc.body;
        if (!articleContent) {
          console.error('Could not find article content');
          return;
        }
        
        // Parse the article content for dialogue
        const paragraphs = articleContent.querySelectorAll('p');
        const dialogue: { speaker: string; text: string }[] = [];
        
        paragraphs.forEach(p => {
          const text = p.textContent?.trim();
          if (!text || text.length < 10) return; // Skip very short paragraphs
          
          // Look for speaker patterns like "TONYA MOSLEY:" or "DEL TORO:" or "(SOUNDBITE OF..."
          const speakerMatch = text.match(/^([A-Z\s]+):\s*(.*)/);
          const soundbiteMatch = text.match(/^\(SOUNDBITE OF.*\)/);
          
          if (soundbiteMatch) {
            // Skip soundbite descriptions
            return;
          } else if (speakerMatch) {
            const speaker = speakerMatch[1].trim();
            const dialogueText = speakerMatch[2].trim();
            if (dialogueText && dialogueText.length > 5) {
              dialogue.push({ speaker, text: dialogueText });
            }
          } else {
            // If no speaker found, treat as narration or description
            // Only add if it looks like dialogue (contains quotes or is substantial)
            if (text.includes('"') || text.length > 20) {
              dialogue.push({ speaker: 'NARRATION', text });
            }
          }
        });
        
        // If we found dialogue, process it
        if (dialogue.length > 0) {
          processDialogue(dialogue, set);
        } else {
          console.error('No dialogue found in article');
          // Use fallback content
          const fallbackDialogue = [
            { speaker: 'TONYA MOSLEY', text: 'This is FRESH AIR. I\'m Tonya Mosley. And my guest today, Benicio del Toro, has made a career out of playing complex, morally ambiguous characters.' },
            { speaker: 'BENICIO DEL TORO', text: 'Thank you, Tonya. Thank you for having me.' },
            { speaker: 'TONYA MOSLEY', text: 'You know, I read that Wes Anderson wrote this character with you in mind. You are essentially in every shot.' },
            { speaker: 'BENICIO DEL TORO', text: 'You know, Wes is a great director, and we know him as a director, and we know his films. But really, he is maybe a better writer.' },
            { speaker: 'TONYA MOSLEY', text: 'You had this relatively small role, but you made this choice. It wasn\'t called for in the script to give this character a mumbling accent.' },
            { speaker: 'BENICIO DEL TORO', text: 'You know, it was a decision made between the director and myself because it\'s correct. I died on page 37 out of, like, 98 pages.' }
          ];
          processDialogue(fallbackDialogue, set);
        }
        return;
      }

      // Get all paragraphs from the transcript
      const paragraphs = transcriptSection.querySelectorAll('p');
      const dialogue: { speaker: string; text: string }[] = [];
      
      paragraphs.forEach(p => {
        const text = p.textContent?.trim();
        if (!text) return;
        
        // Look for speaker patterns like "TONYA MOSLEY:" or "DEL TORO:"
        const speakerMatch = text.match(/^([A-Z\s]+):\s*(.*)/);
        if (speakerMatch) {
          const speaker = speakerMatch[1].trim();
          const dialogueText = speakerMatch[2].trim();
          if (dialogueText) {
            dialogue.push({ speaker, text: dialogueText });
          }
        } else {
          // If no speaker found, treat as narration or description
          dialogue.push({ speaker: 'NARRATION', text });
        }
      });

      if (dialogue.length > 0) {
        processDialogue(dialogue, set);
      } else {
        // Use fallback content if no dialogue found
        const fallbackDialogue = [
          { speaker: 'TONYA MOSLEY', text: 'This is FRESH AIR. I\'m Tonya Mosley. And my guest today, Benicio del Toro, has made a career out of playing complex, morally ambiguous characters.' },
          { speaker: 'BENICIO DEL TORO', text: 'Thank you, Tonya. Thank you for having me.' },
          { speaker: 'TONYA MOSLEY', text: 'You know, I read that Wes Anderson wrote this character with you in mind. You are essentially in every shot.' },
          { speaker: 'BENICIO DEL TORO', text: 'You know, Wes is a great director, and we know him as a director, and we know his films. But really, he is maybe a better writer.' },
          { speaker: 'TONYA MOSLEY', text: 'You had this relatively small role, but you made this choice. It wasn\'t called for in the script to give this character a mumbling accent.' },
          { speaker: 'BENICIO DEL TORO', text: 'You know, it was a decision made between the director and myself because it\'s correct. I died on page 37 out of, like, 98 pages.' }
        ];
        processDialogue(fallbackDialogue, set);
      }

    } catch (error) {
      console.error('Error loading article:', error);
      // Fallback: create sample dialogue for testing
      const sampleDialogue = [
        { speaker: 'TONYA MOSLEY', text: 'This is FRESH AIR. I\'m Tonya Mosley. And my guest today, Benicio del Toro, has made a career out of playing complex, morally ambiguous characters.' },
        { speaker: 'BENICIO DEL TORO', text: 'Thank you, Tonya. Thank you for having me.' },
        { speaker: 'TONYA MOSLEY', text: 'You know, I read that Wes Anderson wrote this character with you in mind. You are essentially in every shot.' },
        { speaker: 'BENICIO DEL TORO', text: 'You know, Wes is a great director, and we know him as a director, and we know his films. But really, he is maybe a better writer.' },
        { speaker: 'TONYA MOSLEY', text: 'You had this relatively small role, but you made this choice. It wasn\'t called for in the script to give this character a mumbling accent.' },
        { speaker: 'BENICIO DEL TORO', text: 'You know, it was a decision made between the director and myself because it\'s correct. I died on page 37 out of, like, 98 pages.' }
      ];
      processDialogue(sampleDialogue, set);
    }
  },

  parseManualContent: (content: string) => {
    try {
      // Split content into lines and parse for dialogue
      const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      const dialogue: { speaker: string; text: string }[] = [];
      
      lines.forEach(line => {
        // Look for speaker patterns like "TONYA MOSLEY:" or "DEL TORO:"
        const speakerMatch = line.match(/^([A-Z\s]+):\s*(.*)/);
        if (speakerMatch) {
          const speaker = speakerMatch[1].trim();
          const dialogueText = speakerMatch[2].trim();
          if (dialogueText && dialogueText.length > 5) {
            dialogue.push({ speaker, text: dialogueText });
          }
        } else if (line.length > 20) {
          // If no speaker found but line is substantial, treat as narration
          dialogue.push({ speaker: 'NARRATION', text: line });
        }
      });
      
      if (dialogue.length > 0) {
        processDialogue(dialogue, set);
      } else {
        // If no dialogue found, create a single column with the content
        const column: Column = {
          id: 'column-1',
          title: 'Article Content',
          x: 50,
        };
        
        const node: Node = {
          id: 'note-1',
          type: 'note',
          position: { 
            x: column.x + (COLUMN_WIDTH - NOTE_WIDTH) / 2, 
            y: 50 
          },
          data: { 
            content: content.substring(0, 500) + (content.length > 500 ? '...' : ''), 
            columnId: column.id, 
            isNew: true 
          },
        };
        
        set({
          columns: [column],
          nodes: [node],
          edges: [],
        });
      }
    } catch (error) {
      console.error('Error parsing manual content:', error);
    }
  },
})); 