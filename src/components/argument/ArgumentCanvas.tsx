import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow from "reactflow";
import "reactflow/dist/style.css";
import { useDocumentStore } from "../../store/documentStore";
import { useArgumentStore } from "../../store/argumentStore";
import { layoutArgumentCanvas, isMarkDim, CANVAS_CONTENT_WIDTH } from "../../store/argumentLayout";
import { ArgumentEdge } from "../EdgeComponents";
import ClaimNode from "./ClaimNode";
import CounterNode from "./CounterNode";
import { tokens, PALETTE, SWATCHES, rgba } from "./tokens";

const nodeTypes = { argumentClaim: ClaimNode, argumentCounter: CounterNode };
const edgeTypes = { argumentLink: ArgumentEdge };

const chipStyle = (active: boolean, color?: string): React.CSSProperties => ({
  fontFamily: tokens.fontFamily, fontSize: 13, padding: "4px 12px",
  background: active ? (color ? rgba(color, 0.16) : tokens.text) : "none",
  border: `1px solid ${active ? (color ?? tokens.text) : tokens.neutral300}`,
  color: active ? (color ?? "#fff") : tokens.text,
  fontWeight: active && color ? 600 : 400,
  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7,
});

const editInputStyle: React.CSSProperties = {
  fontFamily: tokens.fontFamily, color: tokens.text, background: "rgba(255,255,255,0.8)",
  border: "none", borderLeft: `2px solid ${tokens.neutral300}`, padding: "2px 6px",
};

interface ArgumentCanvasProps {
  canSave: boolean;
  onRequestSave: () => void;
}

export default function ArgumentCanvas({ canSave, onRequestSave }: ArgumentCanvasProps) {
  const documentTitle = useDocumentStore((s) => s.documentTitle);
  const setDocumentTitle = useDocumentStore((s) => s.setDocumentTitle);

  const claims = useArgumentStore((s) => s.claims);
  const speakers = useArgumentStore((s) => s.speakers);
  const sources = useArgumentStore((s) => s.sources);
  const kicker = useArgumentStore((s) => s.kicker);
  const sideFilter = useArgumentStore((s) => s.sideFilter);
  const tagFilter = useArgumentStore((s) => s.tagFilter);
  const activeThread = useArgumentStore((s) => s.activeThread);
  const editMode = useArgumentStore((s) => s.editMode);
  const selection = useArgumentStore((s) => s.selection);

  const setEditModeFromUrl = useArgumentStore((s) => s.setEditModeFromUrl);
  const setKicker = useArgumentStore((s) => s.setKicker);
  const addSpeaker = useArgumentStore((s) => s.addSpeaker);
  const renameSpeaker = useArgumentStore((s) => s.renameSpeaker);
  const setSpeakerColor = useArgumentStore((s) => s.setSpeakerColor);
  const removeSpeaker = useArgumentStore((s) => s.removeSpeaker);
  const addSource = useArgumentStore((s) => s.addSource);
  const updateSource = useArgumentStore((s) => s.updateSource);
  const removeSource = useArgumentStore((s) => s.removeSource);
  const addClaim = useArgumentStore((s) => s.addClaim);
  const addCounterFromSelection = useArgumentStore((s) => s.addCounterFromSelection);
  const setSideFilter = useArgumentStore((s) => s.setSideFilter);
  const setTagFilter = useArgumentStore((s) => s.setTagFilter);
  const setActiveThread = useArgumentStore((s) => s.setActiveThread);
  const setSelection = useArgumentStore((s) => s.setSelection);

  useEffect(() => { setEditModeFromUrl(); }, [setEditModeFromUrl]);

  // Clear the selection toolbar once the browser selection itself collapses.
  useEffect(() => {
    const onChange = () => {
      const s = window.getSelection();
      if (selection && (!s || !s.toString().trim())) setSelection(null);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [selection, setSelection]);

  const [zoom, setZoom] = useState(1);
  const [editingKicker, setEditingKicker] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [fieldDraft, setFieldDraft] = useState("");
  const [editingChip, setEditingChip] = useState<string | null>(null);
  const [chipDraft, setChipDraft] = useState("");
  const [editingSourceIdx, setEditingSourceIdx] = useState<number | null>(null);
  const [srcLabelDraft, setSrcLabelDraft] = useState("");
  const [srcUrlDraft, setSrcUrlDraft] = useState("");
  const [hoveredSourceIdx, setHoveredSourceIdx] = useState<number | null>(null);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);

  const { nodes: rawNodes, edges: rawEdges, height } = useMemo(
    () => layoutArgumentCanvas(claims, speakers, PALETTE),
    [claims, speakers],
  );

  const filterState = { sideFilter, tagFilter, activeThread };

  const nodes = useMemo(
    () => rawNodes.map((n) => (n.id === justCreatedId ? { ...n, data: { ...n.data, isNew: true } } : n)),
    [rawNodes, justCreatedId],
  );

  const edges = useMemo(() => {
    return rawEdges.map((e) => {
      const claim = claims.find((c) => c.id === e.source);
      const mark = claim?.marks.find((m) => m.id === e.target);
      const dimmed = mark ? isMarkDim(mark, filterState) : false;
      return { ...e, data: { ...e.data, dimmed } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawEdges, claims, sideFilter, tagFilter, activeThread]);

  const onPanStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".nopan, mark, button, textarea, input, a")) return;
    const el = scrollerRef.current;
    if (!el) return;
    const sx = e.clientX, sy = e.clientY, l = el.scrollLeft, t = el.scrollTop;
    const move = (ev: MouseEvent) => { el.scrollLeft = l - (ev.clientX - sx); el.scrollTop = t - (ev.clientY - sy); };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, []);

  const commitKicker = useCallback(() => { setKicker(fieldDraft); setEditingKicker(false); }, [fieldDraft, setKicker]);
  const commitTitle = useCallback(() => { setDocumentTitle(fieldDraft); setEditingTitle(false); }, [fieldDraft, setDocumentTitle]);
  const commitChip = useCallback(() => {
    if (editingChip) renameSpeaker(editingChip, chipDraft);
    setEditingChip(null);
  }, [editingChip, chipDraft, renameSpeaker]);
  const commitSource = useCallback(() => {
    if (editingSourceIdx !== null) updateSource(editingSourceIdx, srcLabelDraft, srcUrlDraft);
    setEditingSourceIdx(null);
  }, [editingSourceIdx, srcLabelDraft, srcUrlDraft, updateSource]);

  const handleCounterAs = useCallback(
    (side: string) => {
      if (!selection) return;
      const markId = addCounterFromSelection(selection.claimId, selection.start, selection.end, selection.text, side);
      window.getSelection()?.removeAllRanges();
      setSelection(null);
      if (markId) setJustCreatedId(markId);
    },
    [selection, addCounterFromSelection, setSelection],
  );

  let counterCount = 0;
  for (const c of claims) counterCount += c.marks.length;
  const hasFilter = !!activeThread || !!tagFilter;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: tokens.bg, fontFamily: tokens.fontFamily, color: tokens.text }}>
      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: "20px 32px 12px", display: "flex", alignItems: "flex-end", gap: "20px 28px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 420px", minWidth: 420 }}>
          {editingKicker ? (
            <input
              autoFocus
              value={fieldDraft}
              onChange={(e) => setFieldDraft(e.target.value)}
              onBlur={commitKicker}
              onKeyDown={(e) => { if (e.key === "Enter") commitKicker(); if (e.key === "Escape") setEditingKicker(false); }}
              style={{ ...editInputStyle, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", width: 320 }}
            />
          ) : (
            <div
              onDoubleClick={() => { if (!editMode) return; setFieldDraft(kicker); setEditingKicker(true); }}
              title={editMode ? "Double-click to edit" : undefined}
              style={{ fontFamily: tokens.fontFamily, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: tokens.neutral600, cursor: editMode ? "text" : "default", minHeight: 15 }}
            >
              {kicker}
            </div>
          )}
          {editingTitle ? (
            <input
              autoFocus
              value={fieldDraft}
              onChange={(e) => setFieldDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") setEditingTitle(false); }}
              style={{ ...editInputStyle, fontSize: 30, fontWeight: 700, width: 720 }}
            />
          ) : (
            <h1
              onDoubleClick={() => { if (!editMode) return; setFieldDraft(documentTitle); setEditingTitle(true); }}
              title={editMode ? "Double-click to edit" : undefined}
              style={{ margin: 0, fontFamily: tokens.fontFamily, fontSize: 30, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.01em", cursor: editMode ? "text" : "default", textWrap: "balance" }}
            >
              {documentTitle}
            </h1>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={() => setSideFilter("all")} style={chipStyle(sideFilter === "all")}>All speakers</button>
          {speakers.map((s, i) => {
            const color = s.color ?? PALETTE[i % PALETTE.length];
            const active = sideFilter === s.id;
            if (editingChip === s.id) {
              return (
                <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input
                    autoFocus
                    value={chipDraft}
                    onChange={(e) => setChipDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitChip(); if (e.key === "Escape") setEditingChip(null); }}
                    placeholder="speaker name"
                    style={{ ...editInputStyle, fontSize: 13, width: 220 }}
                  />
                  <span style={{ display: "inline-flex", gap: 3 }}>
                    {SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        onClick={() => setSpeakerColor(s.id, hex)}
                        title="Set this speaker's color"
                        style={{ width: 18, height: 18, background: hex, border: hex === color ? `2px solid ${tokens.text}` : `1px solid ${tokens.neutral300}`, cursor: "pointer", padding: 0 }}
                      />
                    ))}
                  </span>
                  <button onClick={commitChip} style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "4px 12px", background: tokens.text, color: "#fff", border: "none", cursor: "pointer" }}>Save</button>
                  <button onClick={() => removeSpeaker(s.id)} style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "1px 9px", background: "none", border: "none", color: tokens.neutral600, cursor: "pointer" }}>remove</button>
                </span>
              );
            }
            return (
              <button
                key={s.id}
                onClick={() => setSideFilter(active ? "all" : s.id)}
                onDoubleClick={() => { if (!editMode) return; setChipDraft(s.name); setEditingChip(s.id); }}
                title="Click to filter · double-click to rename this speaker"
                style={chipStyle(active, color)}
              >
                <span style={{ width: 11, height: 11, background: color, display: "inline-block", flexShrink: 0 }} />
                <span>{s.name}</span>
              </button>
            );
          })}
          {editMode && (
            <button onClick={() => { const id = addSpeaker(); setChipDraft("New speaker"); setEditingChip(id); }} style={{ fontFamily: tokens.fontFamily, fontSize: 12, background: "none", border: "none", color: tokens.neutral600, cursor: "pointer" }}>+ speaker</button>
          )}
          {editMode && canSave && (
            <button onClick={onRequestSave} style={{ fontFamily: tokens.fontFamily, fontSize: 13, padding: "4px 12px", background: tokens.text, color: "#fff", border: "none", cursor: "pointer", marginLeft: 10 }}>Save</button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: tokens.neutral600, marginLeft: 10 }}>
            <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} style={{ fontFamily: tokens.fontFamily, fontSize: 14, width: 26, height: 26, background: "none", border: `1px solid ${tokens.neutral300}`, cursor: "pointer", color: tokens.text, lineHeight: 1 }}>−</button>
            <span style={{ minWidth: 38, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(1.3, +(z + 0.1).toFixed(2)))} style={{ fontFamily: tokens.fontFamily, fontSize: 14, width: 26, height: 26, background: "none", border: `1px solid ${tokens.neutral300}`, cursor: "pointer", color: tokens.text, lineHeight: 1 }}>+</button>
          </div>
        </div>
      </div>

      {/* ── Sources row ──────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: "0 32px 10px", display: "flex", alignItems: "baseline", gap: 14, fontSize: 13, color: tokens.neutral600, flexWrap: "wrap" }}>
        <span style={{ flexShrink: 0 }}>Sources</span>
        {sources.map((src, i) =>
          editingSourceIdx === i ? (
            <span key={i} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input autoFocus value={srcLabelDraft} onChange={(e) => setSrcLabelDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitSource(); if (e.key === "Escape") setEditingSourceIdx(null); }} placeholder="label" style={{ ...editInputStyle, fontSize: 13, width: 220 }} />
              <input value={srcUrlDraft} onChange={(e) => setSrcUrlDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitSource(); if (e.key === "Escape") setEditingSourceIdx(null); }} placeholder="https://" style={{ ...editInputStyle, fontSize: 13, width: 260 }} />
              <button onClick={commitSource} style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "4px 12px", background: tokens.text, color: "#fff", border: "none", cursor: "pointer" }}>Save</button>
              <button onClick={() => removeSource(i)} style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "1px 9px", background: "none", border: "none", color: tokens.neutral600, cursor: "pointer" }}>remove</button>
            </span>
          ) : (
            <span key={i} onMouseEnter={() => setHoveredSourceIdx(i)} onMouseLeave={() => setHoveredSourceIdx(null)} style={{ display: "inline-flex", alignItems: "baseline", gap: 4, minWidth: 0 }}>
              <a href={src.url} target="_blank" rel="noopener noreferrer" onDoubleClick={() => { if (!editMode) return; setSrcLabelDraft(src.label); setSrcUrlDraft(src.url); setEditingSourceIdx(i); }} title="Double-click to edit this source" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: tokens.accent700 }}>{src.label}</a>
              {editMode && (
                <span style={{ opacity: hoveredSourceIdx === i ? 1 : 0, pointerEvents: hoveredSourceIdx === i ? "auto" : "none", transition: "opacity 0.15s ease" }}>
                  <button onClick={() => { setSrcLabelDraft(src.label); setSrcUrlDraft(src.url); setEditingSourceIdx(i); }} style={{ fontFamily: tokens.fontFamily, fontSize: 11, padding: "0 6px", background: "none", border: "none", color: tokens.neutral600, cursor: "pointer" }}>edit</button>
                  <button onClick={() => removeSource(i)} style={{ fontFamily: tokens.fontFamily, fontSize: 11, padding: "0 6px", background: "none", border: "none", color: tokens.neutral600, cursor: "pointer" }}>delete</button>
                </span>
              )}
            </span>
          ),
        )}
        {editMode && <button onClick={addSource} style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "0 4px", background: "none", border: "none", color: tokens.neutral600, cursor: "pointer" }}>+ source</button>}
        <span style={{ marginLeft: "auto", whiteSpace: "nowrap", flexShrink: 0 }}>
          {editMode ? `${claims.length} claims · ${counterCount} counters · double-click any text to edit · select a passage to counter it` : ""}
        </span>
      </div>

      {/* ── Rule pair ────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: "6px 32px 0" }}>
        <div style={{ height: 3, background: tokens.text }} />
        <div style={{ height: 1, background: tokens.text, marginTop: 3 }} />
      </div>

      {/* ── Canvas ───────────────────────────────────────────────────────── */}
      <div ref={scrollerRef} onMouseDown={onPanStart} style={{ flex: 1, overflow: "auto", padding: "34px 32px 140px", cursor: "grab" }}>
        <div style={{ position: "relative", width: CANVAS_CONTENT_WIDTH, transformOrigin: "top left", transform: `scale(${zoom})` }}>
          <div style={{ position: "relative", width: CANVAS_CONTENT_WIDTH, height }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              panOnDrag={false}
              zoomOnScroll={false}
              zoomOnPinch={false}
              zoomOnDoubleClick={false}
              proOptions={{ hideAttribution: true }}
              style={{ width: "100%", height: "100%" }}
            />
          </div>

          {editMode && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", paddingTop: 8 }}>
              {speakers.map((s, i) => {
                const color = s.color ?? PALETTE[i % PALETTE.length];
                return (
                  <button
                    key={s.id}
                    onClick={() => addClaim(s.id)}
                    style={{ fontFamily: tokens.fontFamily, fontSize: 13, padding: "6px 14px", background: "none", border: `1px solid ${color}`, color, cursor: "pointer" }}
                  >
                    + claim · {s.name}
                  </button>
                );
              })}
              <span style={{ fontSize: 12, color: tokens.neutral500 }}>a new claim opens in edit mode; select a passage inside it to attach a counter</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Floating selection toolbar ───────────────────────────────────── */}
      {selection && (
        <div style={{ position: "fixed", zIndex: 60, top: selection.top, left: selection.left }}>
          <div style={{ display: "flex", background: tokens.text, boxShadow: tokens.shadowLg }}>
            {speakers.map((s) => (
              <button
                key={s.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleCounterAs(s.id)}
                style={{ fontFamily: tokens.fontFamily, fontSize: 13, padding: "7px 14px", background: "none", border: "none", color: "#fff", cursor: "pointer" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = s.color ?? tokens.accent; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
              >
                Counter as {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Floating filter banner ───────────────────────────────────────── */}
      {hasFilter && (
        <button
          onClick={() => { setActiveThread(null); setTagFilter(null); }}
          style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", fontFamily: tokens.fontFamily, fontSize: 13, padding: "7px 18px", background: tokens.text, color: "#fff", border: "none", cursor: "pointer", zIndex: 60, boxShadow: tokens.shadowMd }}
        >
          {tagFilter ? `Filtered by #${tagFilter}` : "Showing one thread"} · show all
        </button>
      )}
    </div>
  );
}
