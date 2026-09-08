/**
 * Pure layout + height-estimation helpers for the Argument Canvas.
 * No React/store imports — mirrors the estimateHeight/relayoutAll helpers
 * in documentStore.ts but for the claim-row / counter-stack grid described
 * in the design handoff (one row per claim, counters stacked to its right).
 */
import type { Node, Edge } from "reactflow";

export interface Speaker {
  id: string;
  name: string;
  color?: string;
}

export interface Reply {
  side: string;
  sourceDoc: string;
  text: string;
}

export interface Counter {
  side: string;
  sourceDoc: string;
  text: string;
  tags: string[];
  reactions: Record<string, number>;
  replies: Reply[];
}

export interface Mark {
  id: string;
  start: number;
  end: number;
  phrase: string;
  side: string;
  counter: Counter;
}

export interface Claim {
  id: string;
  side: string;
  sourceDoc: string;
  text: string;
  marks: Mark[];
}

// ── Layout constants (design handoff, Region 4) ─────────────────────────────
export const CLAIM_X = 0;
export const CLAIM_WIDTH = 520;
export const GRID_GAP = 80;
export const COUNTER_X = CLAIM_X + CLAIM_WIDTH + GRID_GAP; // 600
export const COUNTER_WIDTH = 420;
export const ROW_GAP = 56;
export const COUNTER_STACK_GAP = 26;
export const COUNTER_PAD_TOP = 26;
export const CANVAS_CONTENT_WIDTH = 1180;

function linesFor(text: string, charsPerLine: number): number {
  if (!text) return 1;
  const hardLines = text.split("\n");
  let lines = 0;
  for (const seg of hardLines) lines += Math.max(1, Math.ceil(seg.length / charsPerLine));
  return Math.max(1, lines);
}

/** Claim body: 19px / line-height 1.62, ~506px content width (520 - 14 indent). */
export function estimateClaimHeight(text: string): number {
  const headerH = 19; // speaker label row + margin-bottom
  const bodyLines = linesFor(text, 57);
  return headerH + bodyLines * 30.8;
}

/** A single reply, rendered inline inside its counter card. */
export function estimateReplyHeight(reply: Reply): number {
  const header = 18;
  const padding = 16;
  const marginTop = 14;
  const lines = linesFor(reply.text, 40);
  return marginTop + header + lines * 23 * 1.15 + padding;
}

/** A counter card: header + source + quoted target + body + replies + meta row. */
export function estimateCounterHeight(counter: Counter): number {
  const cardPadding = 28; // 14px top + 14px bottom
  const speakerLabel = 17;
  const sourceLine = 20;
  const quoteLines = linesFor(counter.sourceDoc ? counter.text : counter.text, 46);
  const quoteHeight = quoteLines * 19.5 + 8;
  const bodyLines = linesFor(counter.text, 45);
  // Body renders as markdown — paragraph/list spacing runs taller than flat
  // text, so pad the char-count estimate rather than measuring the DOM.
  const bodyHeight = bodyLines * 26.4 * 1.15;
  const repliesHeight = counter.replies.reduce((sum, r) => sum + estimateReplyHeight(r), 0);
  const metaRow = 36;
  return cardPadding + speakerLabel + sourceLine + quoteHeight + bodyHeight + repliesHeight + metaRow;
}

// ── Color helpers ────────────────────────────────────────────────────────────

export function sideColor(speakers: Speaker[], id: string, palette: string[]): { id: string; name: string; color: string } {
  const idx = speakers.findIndex((s) => s.id === id);
  if (idx === -1) return { id, name: "Unknown speaker", color: "#201e1d" };
  const s = speakers[idx];
  return { id: s.id, name: s.name, color: s.color ?? palette[idx % palette.length] };
}

// ── Filter / dim logic (shared by ClaimNode, CounterNode, edge dimming) ────

export interface FilterState {
  sideFilter: string;
  tagFilter: string | null;
  activeThread: string | null;
}

export function isClaimDim(claim: Claim, f: FilterState): boolean {
  const sideDim = f.sideFilter !== "all" && claim.side !== f.sideFilter && !claim.marks.some((m) => m.side === f.sideFilter);
  const threadDim = !!f.activeThread && !claim.marks.some((m) => m.id === f.activeThread);
  const tagDim = !!f.tagFilter && !claim.marks.some((m) => m.counter.tags.includes(f.tagFilter!));
  return sideDim || threadDim || tagDim;
}

export function isMarkDim(mark: Mark, f: FilterState): boolean {
  if (f.activeThread && f.activeThread !== mark.id) return true;
  if (f.sideFilter !== "all" && mark.side !== f.sideFilter) return true;
  if (f.tagFilter && !mark.counter.tags.includes(f.tagFilter)) return true;
  return false;
}

// ── Layout ───────────────────────────────────────────────────────────────────

export interface ArgumentLayoutResult {
  nodes: Node[];
  edges: Edge[];
  height: number;
}

/** Room reserved for a claim's row while it's being edited — matches the edit textarea's maxHeight (420) plus its header/save-row chrome, so a growing draft never overflows its allotted row and clips against reactflow's `overflow: hidden`. */
export const CLAIM_EDIT_MIN_HEIGHT = 520;

export function layoutArgumentCanvas(
  claims: Claim[],
  speakers: Speaker[],
  palette: string[],
  editingClaimId: string | null = null,
): ArgumentLayoutResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let y = 0;

  for (const claim of claims) {
    let claimH = estimateClaimHeight(claim.text);
    if (claim.id === editingClaimId) claimH = Math.max(claimH, CLAIM_EDIT_MIN_HEIGHT);

    let stackH = 0;
    claim.marks.forEach((mark, i) => {
      stackH += estimateCounterHeight(mark.counter);
      if (i < claim.marks.length - 1) stackH += COUNTER_STACK_GAP;
    });
    const countersH = claim.marks.length > 0 ? COUNTER_PAD_TOP + stackH : 0;
    const rowH = Math.max(claimH, countersH);

    nodes.push({
      id: claim.id,
      type: "argumentClaim",
      position: { x: CLAIM_X, y },
      data: { claim },
      draggable: false,
      selectable: false,
    });

    let counterY = y + COUNTER_PAD_TOP;
    claim.marks.forEach((mark, i) => {
      const h = estimateCounterHeight(mark.counter);
      nodes.push({
        id: mark.id,
        type: "argumentCounter",
        position: { x: COUNTER_X, y: counterY },
        data: { claimId: claim.id, mark },
        draggable: false,
        selectable: false,
      });
      const stroke = sideColor(speakers, mark.counter.side, palette).color;
      edges.push({
        id: `edge-${mark.id}`,
        source: claim.id,
        target: mark.id,
        sourceHandle: `hl-${i}`,
        targetHandle: "left",
        type: "argumentLink",
        data: { stroke },
      });
      counterY += h + COUNTER_STACK_GAP;
    });

    y += rowH + ROW_GAP;
  }

  return { nodes, edges, height: Math.max(y, 200) };
}
