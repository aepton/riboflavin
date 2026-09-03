import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Handle, Position } from "reactflow";
import { useArgumentStore } from "../../store/argumentStore";
import { isClaimDim, sideColor, type Claim } from "../../store/argumentLayout";
import { absOffset } from "../textUtils";
import { tokens, PALETTE, rgba } from "./tokens";

interface ClaimNodeProps {
  data: { claim: Claim };
  id: string;
}

const CHARS_PER_LINE = 57;
const LINE_H = 30.8;
const PAD_TOP = 19;

const ClaimNode = memo(({ data, id }: ClaimNodeProps) => {
  const { claim } = data;
  const speakers = useArgumentStore((s) => s.speakers);
  const editMode = useArgumentStore((s) => s.editMode);
  const sideFilter = useArgumentStore((s) => s.sideFilter);
  const tagFilter = useArgumentStore((s) => s.tagFilter);
  const activeThread = useArgumentStore((s) => s.activeThread);
  const updateClaimText = useArgumentStore((s) => s.updateClaimText);
  const updateClaimSource = useArgumentStore((s) => s.updateClaimSource);
  const deleteClaim = useArgumentStore((s) => s.deleteClaim);
  const setActiveThread = useArgumentStore((s) => s.setActiveThread);
  const setSelection = useArgumentStore((s) => s.setSelection);

  const contentRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hovered, setHovered] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [editingSource, setEditingSource] = useState(false);
  const [draft, setDraft] = useState("");
  const [sourceDraft, setSourceDraft] = useState("");

  const speaker = sideColor(speakers, claim.side, PALETTE);
  const dim = isClaimDim(claim, { sideFilter, tagFilter, activeThread });

  useEffect(() => {
    if (editingText) {
      setDraft(claim.text);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [editingText, claim.text]);

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);
  useEffect(() => { if (editingText) adjustHeight(); }, [draft, editingText, adjustHeight]);

  const saveText = useCallback(() => {
    updateClaimText(id, draft);
    setEditingText(false);
  }, [id, draft, updateClaimText]);

  const saveSource = useCallback(() => {
    updateClaimSource(id, sourceDraft);
    setEditingSource(false);
  }, [id, sourceDraft, updateClaimSource]);

  const segs = useMemo(() => {
    const out: { plain?: boolean; text: string; markId?: string; color?: string }[] = [];
    let pos = 0;
    for (const m of claim.marks) {
      if (m.start > pos) out.push({ plain: true, text: claim.text.slice(pos, m.start) });
      out.push({ text: claim.text.slice(m.start, m.end), markId: m.id, color: sideColor(speakers, m.counter.side, PALETTE).color });
      pos = Math.max(pos, m.end);
    }
    if (pos < claim.text.length) out.push({ plain: true, text: claim.text.slice(pos) });
    return out;
  }, [claim.text, claim.marks, speakers]);

  const handleMouseUp = useCallback(() => {
    if (!editMode) return;
    const sel = window.getSelection();
    if (!sel || !sel.toString().trim() || sel.rangeCount === 0 || !contentRef.current) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!contentRef.current.contains(range.commonAncestorContainer)) { setSelection(null); return; }
    const start = absOffset(contentRef.current, range.startContainer, range.startOffset);
    const end = absOffset(contentRef.current, range.endContainer, range.endOffset);
    if (end - start < 3) { setSelection(null); return; }
    const r = range.getBoundingClientRect();
    setSelection({ claimId: id, start, end, text: sel.toString(), top: r.bottom + 8, left: r.left });
  }, [editMode, id, setSelection]);

  const highlightHandles = useMemo(
    () =>
      claim.marks.map((m, i) => {
        const midChar = (m.start + m.end) / 2;
        const midLine = midChar / CHARS_PER_LINE;
        return { id: `hl-${i}`, topPx: PAD_TOP + midLine * LINE_H };
      }),
    [claim.marks],
  );

  const actionStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", marginLeft: "auto", flexShrink: 0,
    opacity: editMode && hovered ? 1 : 0, pointerEvents: editMode && hovered ? "auto" : "none",
    transition: "opacity 0.15s ease",
  };

  return (
    <div
      className="nopan"
      style={{ width: 520, fontFamily: tokens.fontFamily, color: tokens.text, opacity: dim ? 0.18 : 1, transition: "opacity 0.25s ease" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {highlightHandles.map((h) => (
        <Handle key={h.id} id={h.id} type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none", right: 0, top: h.topPx }} />
      ))}
      <Handle id="left" type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none", left: 0 }} />

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
        <span style={{ fontFamily: tokens.fontFamily, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: speaker.color }}>
          {speaker.name}
        </span>
        {editingSource ? (
          <input
            autoFocus
            className="nodrag"
            value={sourceDraft}
            onChange={(e) => setSourceDraft(e.target.value)}
            onBlur={saveSource}
            onKeyDown={(e) => { if (e.key === "Enter") saveSource(); if (e.key === "Escape") setEditingSource(false); }}
            style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "2px 6px", width: 280, border: "none", borderLeft: `2px solid ${tokens.neutral300}`, background: "rgba(255,255,255,0.8)" }}
          />
        ) : (
          <span
            onDoubleClick={() => { if (!editMode) return; setSourceDraft(claim.sourceDoc); setEditingSource(true); }}
            title="Double-click to edit the source"
            style={{ fontSize: 12, color: tokens.neutral500, cursor: editMode ? "text" : "default" }}
          >
            {claim.sourceDoc}
          </span>
        )}
        <span style={actionStyle}>
          <button
            className="nodrag"
            onClick={() => deleteClaim(id)}
            style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "1px 9px", background: "none", border: "none", color: tokens.neutral600, cursor: "pointer" }}
          >
            delete
          </button>
        </span>
      </div>

      <div style={{ borderLeft: `3px solid ${speaker.color}` }}>
        {editingText ? (
          <div style={{ paddingLeft: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              ref={textareaRef}
              className="nodrag"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); adjustHeight(); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); setEditingText(false); }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveText(); }
              }}
              style={{ fontFamily: tokens.fontFamily, fontSize: 19, lineHeight: 1.55, minHeight: 120, width: "100%", border: "none", resize: "vertical", background: "rgba(255,255,255,0.8)", padding: "8px 10px", borderLeft: `2px solid ${tokens.neutral300}` }}
            />
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="nodrag" onClick={saveText} style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "4px 12px", background: tokens.text, color: "#fff", border: "none", cursor: "pointer" }}>Save</button>
              <button className="nodrag" onClick={() => setEditingText(false)} style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "1px 9px", background: "none", border: "none", color: tokens.neutral600, cursor: "pointer" }}>Cancel</button>
              <span style={{ fontSize: 11, color: tokens.neutral500 }}>⌘↵ save · esc cancel · highlights re-anchor to the phrase they wrap</span>
            </div>
          </div>
        ) : (
          <div
            ref={contentRef}
            className="nodrag nopan"
            onMouseUp={handleMouseUp}
            onDoubleClick={() => { if (!editMode) return; setEditingText(true); }}
            title={editMode ? "Double-click to edit · select a passage to counter it" : undefined}
            style={{ fontSize: 19, lineHeight: 1.62, textWrap: "pretty", paddingLeft: 14, cursor: editMode ? "text" : "default", userSelect: "text", WebkitUserSelect: "text" }}
          >
            {segs.map((seg, i) =>
              seg.plain ? (
                <span key={i}>{seg.text}</span>
              ) : (
                <mark
                  key={i}
                  data-hl-id={seg.markId}
                  onClick={(e) => { e.stopPropagation(); setActiveThread(seg.markId!); }}
                  style={{ background: rgba(seg.color!, 0.15), color: "inherit", boxShadow: `inset 0 -2px 0 ${seg.color}`, padding: "1px 0", cursor: "pointer" }}
                >
                  {seg.text}
                </mark>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
});

ClaimNode.displayName = "ClaimNode";
export default ClaimNode;
