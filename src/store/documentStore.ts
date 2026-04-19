import { create } from "zustand";
import type { Node, Edge } from "reactflow";

// ── Layout constants ────────────────────────────────────────────────────────
const COLUMN_X_BASE = 20;
export const COLUMN_WIDTH = 360;  // wider to accommodate Merriweather
const COLUMN_SPACING = 60; // gap between columns
const NODE_GAP = 32;       // minimum vertical gap between nodes

// PR review mode: monospace, 140 chars wide
// At 13px monospace, 1ch ≈ 7.8px → 140 * 7.8 = 1092 + line-number gutter (~56px) + padding (32px * 2)
export const PR_REVIEW_WIDTH = 1200;

export type DocumentMode = "document" | "pr-review";

// ── Thread color palette ─────────────────────────────────────────────────────
// Each highlight (and its reply chain) gets one of these colors.
// light  = background used on the source text <mark>
// nodeBg = annotation card background
// border = annotation card border & edge stroke
/**
 * Generate a thread color for the given index using golden-ratio hue rotation.
 * Adjacent indices produce maximally-spaced hues; all colors are pastels so
 * they always look good together regardless of how many threads exist.
 */
export function threadColor(index: number, depth = 1): { light: string; nodeBg: string; border: string } {
  const hue = Math.round((index * 137.508) % 360);
  // depth=1 is a highlight (lightest/palest); each reply level (depth 2, 3, …)
  // darkens the shade so ancestry is visible while staying in the same hue family.
  const step = Math.max(0, depth - 1);
  return {
    light:  `hsl(${hue}, 75%, ${91 - step * 4}%)`,
    nodeBg: `hsl(${hue}, ${60 + step * 5}%, ${97 - step * 3}%)`,
    border: `hsl(${hue}, ${65 + step * 5}%, ${72 - step * 6}%)`,
  };
}

// ── Text entry node constants ───────────────────────────────────────────────
export const TEXT_ENTRY_WIDTH = 640;

// ── Height estimation ────────────────────────────────────────────────────────

/** Estimate rendered height of a TextEntryNode given its text content. */
export function estimateTextEntryHeight(content: string, isPRReview = false): number {
  if (isPRReview) {
    // PR review: monospace, no wrapping, 13px font at line-height 1.5 ≈ 20px/line
    if (!content) return 200;
    const lines = content.split("\n").length;
    return lines * 20 + 80; // 80 = top/bottom padding + label
  }
  // 640px wide, 32px padding each side → 576px content area.
  // 15px font at line-height 1.8 ≈ 30px/line, ~64 chars/line.
  if (!content) return 200;
  const charsPerLine = 64;
  const hardLines = content.split("\n").length;
  const wrappedLines = Math.ceil(content.length / charsPerLine);
  const totalLines = Math.max(hardLines, wrappedLines, 1);
  return totalLines * 30 + 80;
}

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

// ── Diff parsing ────────────────────────────────────────────────────────────

function detectLangFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const m: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
    cpp: "cpp", cc: "cpp", cxx: "cpp", c: "c", h: "c", cs: "csharp",
    swift: "swift", kt: "kotlin", php: "php", html: "xml", xml: "xml",
    css: "css", scss: "scss", sass: "css", json: "json",
    yaml: "yaml", yml: "yaml", md: "markdown", sh: "bash", bash: "bash",
    zsh: "bash", sql: "sql", graphql: "graphql", gql: "graphql",
    ex: "elixir", exs: "elixir", erl: "erlang", hs: "haskell",
    lua: "lua", dart: "dart", r: "r", pl: "perl", pm: "perl",
  };
  return m[ext] ?? "plaintext";
}

interface ParsedDiffFile {
  filename: string;
  language: string;
  content: string;
  diffLines: DiffLine[];
  committed: boolean;
}

export function parseDiff(diffText: string, committed = true): ParsedDiffFile[] {
  // Split on file headers (lookahead keeps "diff --git" at start of each section)
  const sections = diffText.split(/(?=^diff --git )/m).filter((s) => s.trim());
  const files: ParsedDiffFile[] = [];

  for (const section of sections) {
    const lines = section.split("\n");

    // Extract filename from "+++ b/..." line
    let filename = "unknown";
    for (const line of lines) {
      if (line.startsWith("+++ b/")) { filename = line.slice(6).trim(); break; }
      if (line.startsWith("+++ ") && !line.startsWith("+++ /dev/null")) {
        filename = line.slice(4).trim(); break;
      }
    }

    const language = detectLangFromFilename(filename);
    const diffLines: DiffLine[] = [];
    let inHunk = false;
    let oldNo = 0, newNo = 0;

    for (const line of lines) {
      if (line.startsWith("@@")) {
        inHunk = true;
        const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (m) { oldNo = parseInt(m[1]) - 1; newNo = parseInt(m[2]) - 1; }
        continue;
      }
      if (!inHunk) continue;
      // Skip meta-lines that can appear inside a section
      if (line.startsWith("diff --git") || line.startsWith("index ") ||
          line.startsWith("--- ") || line.startsWith("+++ ") ||
          line.startsWith("new file") || line.startsWith("deleted file") ||
          line.startsWith("old mode") || line.startsWith("new mode") ||
          line.startsWith("Binary") || line.startsWith("\\ No newline")) continue;

      if (line.startsWith("+")) {
        newNo++;
        diffLines.push({ type: "add", content: line.slice(1), newLineNo: newNo, committed });
      } else if (line.startsWith("-")) {
        oldNo++;
        diffLines.push({ type: "remove", content: line.slice(1), oldLineNo: oldNo, committed });
      } else {
        oldNo++; newNo++;
        diffLines.push({ type: "context", content: line.slice(1), oldLineNo: oldNo, newLineNo: newNo, committed });
      }
    }

    if (diffLines.length > 0) {
      files.push({ filename, language, diffLines, content: diffLines.map((l) => l.content).join("\n"), committed });
    }
  }

  return files;
}

export function looksLikeDiff(text: string): boolean {
  return /^diff --git /m.test(text) ||
    (/^--- [ab]\//m.test(text) && /^\+\+\+ [ab]\//m.test(text));
}

function getColumnX(depth: number, isTextEntry?: boolean): number {
  if (isTextEntry || depth === 0) {
    // Depth 0 with textentry: the textentry node itself
    if (isTextEntry) return COLUMN_X_BASE;
    // Depth 0 paragraphs: positioned to the right of the textentry node
    return COLUMN_X_BASE;
  }
  return COLUMN_X_BASE + depth * (COLUMN_WIDTH + COLUMN_SPACING);
}

/** Get column X accounting for textentry nodes in the graph. */
function getColumnXForNode(node: Node, hasTextEntry: boolean, isPRReview = false): number {
  const sourceWidth = isPRReview ? PR_REVIEW_WIDTH : TEXT_ENTRY_WIDTH;
  if (node.data.nodeType === "textentry") return COLUMN_X_BASE;
  if (hasTextEntry) {
    // Paragraphs go to the right of the textentry node
    if (node.data.nodeType === "paragraph") {
      return COLUMN_X_BASE + sourceWidth + COLUMN_SPACING;
    }
    // Annotations go further right: depth 1+ relative to paragraph column
    const depth = node.data.depth as number;
    if (isPRReview) {
      // PR review: no paragraph column, annotations start directly after source
      return COLUMN_X_BASE + sourceWidth + COLUMN_SPACING + Math.max(0, depth - 1) * (COLUMN_WIDTH + COLUMN_SPACING);
    }
    return COLUMN_X_BASE + sourceWidth + COLUMN_SPACING + Math.max(0, depth) * (COLUMN_WIDTH + COLUMN_SPACING);
  }
  return COLUMN_X_BASE + (node.data.depth as number) * (COLUMN_WIDTH + COLUMN_SPACING);
}

/**
 * Estimate the pixel Y offset of a character index within a node's rendered text.
 * Used to align highlight annotations with the highlighted passage.
 */
function estimateCharY(
  content: string,
  charIdx: number,
  nodeType: "paragraph" | "annotation" | "textentry",
  isPRReview = false,
): number {
  if (!content || charIdx <= 0) return 0;

  // PR review: monospace, no wrapping, 20px line height
  if (isPRReview && nodeType === "textentry") {
    const textBefore = content.slice(0, charIdx);
    const line = textBefore.split("\n").length - 1;
    return 32 + line * 20;
  }

  const topPad = nodeType === "textentry" ? 32 : nodeType === "paragraph" ? 16 : 56;
  const cpl = nodeType === "textentry" ? 64 : nodeType === "paragraph" ? 32 : 34;
  const lh = nodeType === "textentry" ? 30 : nodeType === "paragraph" ? 30 : 28;

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
function idealYForNode(node: Node, sourceNode: Node, isPRReview = false): number {
  const nodeType = sourceNode.data.nodeType as "paragraph" | "annotation" | "textentry";

  // Highlights: align with the character position in the source text
  if (node.data.highlightStartIdx !== undefined) {
    const charY = estimateCharY(sourceNode.data.content, node.data.highlightStartIdx, nodeType, isPRReview);
    return Math.max(20, sourceNode.position.y + charY);
  }

  // Replies: align with the vertical center of the source node
  const sourceH = nodeType === "textentry"
    ? estimateTextEntryHeight(sourceNode.data.content, isPRReview)
    : nodeType === "paragraph"
      ? estimateHeight(sourceNode.data.content)
      : estimateAnnotationHeight(sourceNode.data.content);
  return Math.max(20, sourceNode.position.y + sourceH / 2 - 50);
}

/** Estimate the height of any node based on its type. */
function nodeHeight(node: Node, isPRReview = false): number {
  if (node.data.nodeType === "textentry") return estimateTextEntryHeight(node.data.content, isPRReview);
  return node.data.nodeType === "paragraph"
    ? estimateHeight(node.data.content)
    : estimateAnnotationHeight(node.data.content);
}

/**
 * Sort comparator for nodes within a single depth column.
 * Orders by source node's final Y (prevents edge crossings), then by
 * highlightStartIdx (text-order within same source), then ideal Y, then ID.
 */
function depthSort(
  a: Node,
  b: Node,
  sourceOf: Map<string, string>,
  finalY: Map<string, number>,
  idealYMap: Map<string, number>,
): number {
  // Primary: source node's final Y position — keeps child order matching parent order
  const srcA = sourceOf.get(a.id);
  const srcB = sourceOf.get(b.id);
  const srcYA = srcA ? (finalY.get(srcA) ?? 0) : 0;
  const srcYB = srcB ? (finalY.get(srcB) ?? 0) : 0;
  if (srcYA !== srcYB) return srcYA - srcYB;

  // Secondary: highlight start index — orders by position in source text
  const hlA = a.data.highlightStartIdx as number | undefined;
  const hlB = b.data.highlightStartIdx as number | undefined;
  if (hlA !== undefined && hlB !== undefined && hlA !== hlB) return hlA - hlB;
  if (hlA !== undefined && hlB === undefined) return -1;
  if (hlA === undefined && hlB !== undefined) return 1;

  // Tertiary: ideal Y
  const idealDiff = (idealYMap.get(a.id) ?? 0) - (idealYMap.get(b.id) ?? 0);
  if (idealDiff !== 0) return idealDiff;

  // Final: deterministic by node ID
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Global re-layout: position every node so that no two occupy the same
 * vertical space, regardless of which column (depth) they are in.
 *
 * Algorithm:
 *  1. Process each depth column in order (0, 1, 2, …) so that source
 *     positions are finalized before their children are sorted.
 *  2. Within each column, sort nodes by their source's final Y, then by
 *     highlightStartIdx — this keeps edges from crossing.
 *  3. Greedy top-to-bottom placement: each node gets max(idealY, cursor),
 *     where cursor tracks the bottom of the last placed node + gap.
 */
function relayoutAll(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const hasTextEntry = nodes.some((n) => n.data.nodeType === "textentry");
  const isPRReview = nodes.some((n) => n.data.nodeType === "textentry" && n.data.language);

  let maxDepth = 0;
  for (const n of nodes) {
    if ((n.data.depth as number) > maxDepth) maxDepth = n.data.depth as number;
  }

  // Build source map: target nodeId → source nodeId
  const sourceOf = new Map<string, string>();
  for (const e of edges) {
    sourceOf.set(e.target, e.source);
  }

  const finalY = new Map<string, number>();
  const idealYMap = new Map<string, number>();

  // TextEntry nodes: stack vertically in creation order (sorted by ID)
  const textEntryNodes = nodes
    .filter((n) => n.data.nodeType === "textentry")
    .sort((a, b) => a.id.localeCompare(b.id));
  let teCursor = 20;
  for (const ten of textEntryNodes) {
    finalY.set(ten.id, teCursor);
    idealYMap.set(ten.id, teCursor);
    teCursor += nodeHeight(ten, isPRReview) + (isPRReview ? 120 : NODE_GAP);
  }

  // ── Depth 0 paragraphs ─────────────────────────────────────────────────
  const depth0 = nodes.filter(
    (n) => n.data.depth === 0 && n.data.nodeType === "paragraph",
  );

  if (hasTextEntry) {
    for (const n of depth0) {
      const srcId = sourceOf.get(n.id);
      const srcNode = srcId ? nodeById.get(srcId) : undefined;
      if (srcNode && n.data.highlightStartIdx !== undefined) {
        const srcY = finalY.get(srcId!) ?? srcNode.position.y;
        const charY = estimateCharY(
          srcNode.data.content,
          n.data.highlightStartIdx,
          "textentry",
          isPRReview,
        );
        idealYMap.set(n.id, Math.max(20, srcY + charY));
      } else {
        idealYMap.set(n.id, n.position.y);
      }
    }
  } else {
    const sorted = [...depth0].sort((a, b) => a.position.y - b.position.y);
    let seqCursor = 20;
    for (const n of sorted) {
      idealYMap.set(n.id, seqCursor);
      seqCursor += nodeHeight(n, isPRReview) + NODE_GAP;
    }
  }

  depth0.sort((a, b) => depthSort(a, b, sourceOf, finalY, idealYMap));

  let cursor0 = 20;
  for (const n of depth0) {
    const idealY = idealYMap.get(n.id) ?? 20;
    const y = Math.max(idealY, cursor0);
    finalY.set(n.id, y);
    cursor0 = y + nodeHeight(n, isPRReview) + NODE_GAP;
  }

  // ── Deeper depths — processed in order so sources are already placed ───
  // Start at 0 to catch annotation nodes from textentry sources (depth -1 + 1 = 0).
  for (let depth = 0; depth <= maxDepth; depth++) {
    const atDepth = nodes.filter(
      (n) => n.data.depth === depth &&
             n.data.nodeType !== "paragraph" &&
             n.data.nodeType !== "textentry",
    );
    if (atDepth.length === 0) continue;

    // Compute ideal Y based on source's FINAL position
    for (const n of atDepth) {
      const srcId = sourceOf.get(n.id);
      const sourceNode = srcId ? nodeById.get(srcId) : undefined;
      if (sourceNode) {
        const sourceY = finalY.get(sourceNode.id) ?? sourceNode.position.y;
        const tempSource = {
          ...sourceNode,
          position: { ...sourceNode.position, y: sourceY },
        };
        idealYMap.set(n.id, idealYForNode(n, tempSource, isPRReview));
      } else {
        idealYMap.set(n.id, n.position.y);
      }
    }

    atDepth.sort((a, b) => depthSort(a, b, sourceOf, finalY, idealYMap));

    let cursor = 20;
    for (const n of atDepth) {
      const idealY = idealYMap.get(n.id) ?? 20;
      const y = Math.max(idealY, cursor);
      finalY.set(n.id, y);
      cursor = y + nodeHeight(n, isPRReview) + NODE_GAP;
    }
  }

  // Apply positions
  return nodes.map((n) => {
    const newY = finalY.get(n.id)!;
    return { ...n, position: { x: getColumnXForNode(n, hasTextEntry, isPRReview), y: newY } };
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface HighlightRange {
  startIdx: number;
  endIdx: number;
  colorIndex: number;
}

export type AnnotationType = "highlight" | "reply";

/** A single line in a unified diff, used for coloring in the TextEntryNode. */
export interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;      // line text, prefix char stripped
  oldLineNo?: number;   // line number in the old file (remove/context)
  newLineNo?: number;   // line number in the new file (add/context)
  committed?: boolean;  // true = part of a committed change; false = uncommitted (staged/working)
}

export interface DocNodeData {
  content: string;
  nodeType: "paragraph" | "annotation" | "textentry";
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
  language?: string;                   // programming language (PR review mode)
  codeMode?: boolean;                  // true = entire content is code (monospace + syntax highlight)
  filename?: string;                   // file path (diff mode, one node per file)
  diffLines?: DiffLine[];             // per-line diff metadata (diff mode)
  committed?: boolean;                 // false = node contains uncommitted changes
}

// ── Citations ───────────────────────────────────────────────────────────────

export interface CitationMeta {
  url: string;
  description: string;
}

interface DocumentStore {
  nodes: Node[];
  edges: Edge[];
  documentTitle: string;
  nextColorIndex: number;
  citations: Record<string, CitationMeta>;

  documentMode: DocumentMode;
  language: string;

  loadDocument: (text: string, title?: string, author?: string) => void;
  loadPRReview: (code: string, language: string, title?: string, author?: string) => void;
  loadDiff: (committedDiff: string, uncommittedDiff: string, title?: string, author?: string) => void;
  loadRound: (title: string, nodes: Node[], edges: Edge[], citations?: Record<string, CitationMeta>, mode?: DocumentMode, language?: string) => void;
  addCitation: (name: string, url: string, description: string) => void;
  createLineComment: (lineNumber: number, sourceNodeId: string, author?: string) => void;
  createHighlight: (
    selectedText: string,
    sourceNodeId: string,
    startIdx: number,
    endIdx: number,
    author?: string,
  ) => void;
  createParagraphFromHighlight: (
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
  setDocumentTitle: (title: string) => void;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useDocumentStore = create<DocumentStore>((set) => ({
  nodes: [],
  edges: [],
  documentTitle: "",
  nextColorIndex: 0,
  citations: {},
  documentMode: "document" as DocumentMode,
  language: "",

  loadDocument: (text, title = "Untitled Document", author) => {
    const paragraphs = text.trim().split(/\n\n+/).map(p => p.trim()).filter(Boolean);
    const now = Date.now();
    const nodes: Node[] = paragraphs.map((para, i) => ({
      id: `para-${now + i}`,
      type: "paragraphNode",
      position: { x: COLUMN_X_BASE, y: 0 },
      data: {
        content: para,
        nodeType: "paragraph",
        tags: [],
        depth: 0,
        highlights: [],
        reactions: {},
        author,
      } as DocNodeData,
    }));

    set({ nodes: relayoutAll(nodes, []), edges: [], documentTitle: title, nextColorIndex: 0, citations: {}, documentMode: "document", language: "" });
  },

  loadPRReview: (code, language, title = "Untitled PR Review", author) => {
    const textEntryNode: Node = {
      id: `textentry-${Date.now()}`,
      type: "textEntryNode",
      position: { x: COLUMN_X_BASE, y: 20 },
      data: {
        content: code.trimEnd(),
        nodeType: "textentry",
        tags: [],
        depth: -1,
        highlights: [],
        reactions: {},
        author,
        language,
      } as DocNodeData,
    };

    set({ nodes: relayoutAll([textEntryNode], []), edges: [], documentTitle: title, nextColorIndex: 0, citations: {}, documentMode: "pr-review", language });
  },

  loadDiff: (committedDiff, uncommittedDiff, title = "Untitled Diff Review", author) => {
    const parsed = [
      ...parseDiff(committedDiff, true),
      ...parseDiff(uncommittedDiff, false),
    ];
    if (parsed.length === 0) return;
    const now = Date.now();
    const textEntryNodes: Node[] = parsed.map((file, i) => ({
      id: `textentry-${now + i}`,
      type: "textEntryNode",
      position: { x: COLUMN_X_BASE, y: 20 },
      data: {
        content: file.content,
        nodeType: "textentry",
        tags: [],
        depth: -1,
        highlights: [],
        reactions: {},
        author,
        language: file.language,
        filename: file.filename,
        diffLines: file.diffLines,
        committed: file.committed,
      } as DocNodeData,
    }));
    set({
      nodes: relayoutAll(textEntryNodes, []),
      edges: [],
      documentTitle: title,
      nextColorIndex: 0,
      citations: {},
      documentMode: "pr-review",
      language: "",
    });
  },

  loadRound: (title, nodes, edges, citations, mode, language) => {
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
      citations: citations ?? {},
      documentMode: mode ?? "document",
      language: language ?? "",
    });
  },

  addCitation: (name, url, description) =>
    set((state) => ({
      citations: { ...state.citations, [name]: { url, description } },
    })),

  createLineComment: (lineNumber, sourceNodeId, author) =>
    set((state) => {
      const sourceNode = state.nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return state;

      const colorIndex = state.nextColorIndex;
      const content = sourceNode.data.content as string;
      const lines = content.split("\n");
      const lineText = lines[lineNumber] ?? "";

      // Compute character index at start of line for positioning
      let charIdx = 0;
      for (let i = 0; i < lineNumber && i < lines.length; i++) {
        charIdx += lines[i].length + 1; // +1 for \n
      }

      const newId = `anno-${Date.now()}`;
      const existingHighlights = (sourceNode.data.highlights ?? []) as HighlightRange[];
      const highlightIndex = existingHighlights.length;

      const updatedNodes = state.nodes.map((n) =>
        n.id === sourceNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                highlights: [
                  ...existingHighlights,
                  { startIdx: charIdx, endIdx: charIdx + lineText.length, colorIndex },
                ],
              },
            }
          : n,
      );

      const newNode: Node = {
        id: newId,
        type: "annotationNode",
        position: { x: 0, y: 0 },
        data: {
          content: "",
          nodeType: "annotation",
          annotationType: "highlight",
          sourceText: lineText.trim().slice(0, 100),
          tags: [],
          depth: 1,
          colorIndex,
          isNew: true,
          highlightStartIdx: charIdx,
          reactions: {},
          author,
          codeMode: true,
          language: sourceNode.data.language as string | undefined,
        } as DocNodeData,
      };

      const newEdge: Edge = {
        id: `edge-${sourceNodeId}-${newId}`,
        source: sourceNodeId,
        target: newId,
        type: "articleLink",
        sourceHandle: `hl-${highlightIndex}`,
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

  createHighlight: (selectedText, sourceNodeId, startIdx, endIdx, author) =>
    set((state) => {
      const sourceNode = state.nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return state;

      const colorIndex = state.nextColorIndex;
      // textentry nodes have depth -1; clamp to 1 so annotations always enter the layout loop
      const newDepth = Math.max(1, (sourceNode.data.depth as number) + 1);
      const newId = `anno-${Date.now()}`;

      // Persist the highlight range on the source node
      const existingHighlights = (sourceNode.data.highlights ?? []) as HighlightRange[];
      const highlightIndex = existingHighlights.length; // index of the new highlight

      const updatedNodes = state.nodes.map((n) =>
        n.id === sourceNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                highlights: [
                  ...existingHighlights,
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
        sourceHandle: `hl-${highlightIndex}`,
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

  createParagraphFromHighlight: (selectedText, sourceNodeId, startIdx, endIdx, author) =>
    set((state) => {
      const sourceNode = state.nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode || sourceNode.data.nodeType !== "textentry") return state;

      const colorIndex = state.nextColorIndex;
      const newId = `para-${Date.now()}`;

      // Persist the highlight range on the textentry node
      const existingHighlights = (sourceNode.data.highlights ?? []) as HighlightRange[];
      const highlightIndex = existingHighlights.length;

      const updatedNodes = state.nodes.map((n) =>
        n.id === sourceNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                highlights: [
                  ...existingHighlights,
                  { startIdx, endIdx, colorIndex },
                ],
              },
            }
          : n,
      );

      const newNode: Node = {
        id: newId,
        type: "paragraphNode",
        position: { x: 0, y: 0 }, // placeholder — relayout will position
        data: {
          content: selectedText,
          nodeType: "paragraph",
          tags: [],
          depth: 0,
          highlights: [],
          reactions: {},
          author,
          highlightStartIdx: startIdx,
          colorIndex,
        } as DocNodeData,
      };

      const newEdge: Edge = {
        id: `edge-${sourceNodeId}-${newId}`,
        source: sourceNodeId,
        target: newId,
        type: "articleLink",
        sourceHandle: `hl-${highlightIndex}`,
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

  setDocumentTitle: (title) => set({ documentTitle: title }),
}));
