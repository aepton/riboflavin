import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Handle, Position } from "reactflow";
import { useArgumentStore } from "../../store/argumentStore";
import { isMarkDim, sideColor, type Mark } from "../../store/argumentLayout";
import { REACTION_EMOJIS } from "../EmojiReactions";
import { tokens, PALETTE, rgba } from "./tokens";

interface CounterNodeProps {
  data: { claimId: string; mark: Mark; isNew?: boolean };
  id: string;
}

const actBtn: React.CSSProperties = {
  fontFamily: tokens.fontFamily, fontSize: 12, padding: "1px 9px", background: "none", border: "none", color: tokens.neutral600, cursor: "pointer",
};

const CounterNode = memo(({ data, id }: CounterNodeProps) => {
  const { claimId, mark, isNew } = data;
  const speakers = useArgumentStore((s) => s.speakers);
  const editMode = useArgumentStore((s) => s.editMode);
  const sideFilter = useArgumentStore((s) => s.sideFilter);
  const tagFilter = useArgumentStore((s) => s.tagFilter);
  const activeThread = useArgumentStore((s) => s.activeThread);
  const updateCounterText = useArgumentStore((s) => s.updateCounterText);
  const updateCounterSource = useArgumentStore((s) => s.updateCounterSource);
  const deleteCounter = useArgumentStore((s) => s.deleteCounter);
  const addReply = useArgumentStore((s) => s.addReply);
  const updateReply = useArgumentStore((s) => s.updateReply);
  const deleteReply = useArgumentStore((s) => s.deleteReply);
  const addTag = useArgumentStore((s) => s.addTag);
  const reactToMark = useArgumentStore((s) => s.react);
  const setActiveThread = useArgumentStore((s) => s.setActiveThread);

  const [hovered, setHovered] = useState(false);
  const [hoveredReply, setHoveredReply] = useState<number | null>(null);
  const [editingText, setEditingText] = useState(false);
  const [editingSource, setEditingSource] = useState(false);
  const [editingReply, setEditingReply] = useState<{ index: number; field: "text" | "sourceDoc" } | null>(null);
  const [draft, setDraft] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [tagging, setTagging] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speaker = sideColor(speakers, mark.counter.side, PALETTE);
  const dim = isMarkDim(mark, { sideFilter, tagFilter, activeThread });
  const quote = mark.phrase.length > 80 ? `${mark.phrase.slice(0, 80)}…` : mark.phrase;

  useEffect(() => {
    if (editingText) {
      setDraft(mark.counter.text);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [editingText, mark.counter.text]);

  // Newly-created counters (from a selection toolbar pick) open straight into edit mode.
  useEffect(() => {
    if (isNew) setEditingText(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEditReply = useCallback((index: number, field: "text" | "sourceDoc", value: string) => {
    setEditingReply({ index, field });
    setDraft(value);
  }, []);

  const saveText = useCallback(() => { updateCounterText(id, draft); setEditingText(false); }, [id, draft, updateCounterText]);
  const saveSource = useCallback((value: string) => { updateCounterSource(id, value); setEditingSource(false); }, [id, updateCounterSource]);
  const saveReply = useCallback(() => {
    if (!editingReply) return;
    updateReply(id, editingReply.index, editingReply.field, draft);
    setEditingReply(null);
  }, [editingReply, id, draft, updateReply]);

  const inputStyle: React.CSSProperties = {
    fontFamily: tokens.fontFamily, color: tokens.text, background: "rgba(255,255,255,0.8)", border: "none",
    borderLeft: `2px solid ${tokens.neutral300}`, padding: "8px 10px", width: "100%",
  };

  const actionRowStyle = (on: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", marginLeft: "auto", flexShrink: 0,
    opacity: editMode && on ? 1 : 0, pointerEvents: editMode && on ? "auto" : "none", transition: "opacity 0.15s ease",
  });

  return (
    <div
      className="nopan"
      onClick={() => setActiveThread(id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 420, padding: "14px 18px", borderLeft: `3px solid ${speaker.color}`, background: rgba(speaker.color, 0.11),
        cursor: "pointer", opacity: dim ? 0.16 : 1, transition: "opacity 0.25s ease",
        fontFamily: tokens.fontFamily, color: tokens.text,
      }}
    >
      <Handle id="left" type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none", left: 0, top: 16 }} />

      <div style={{ marginBottom: 3 }}>
        <span style={{ fontFamily: tokens.fontFamily, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: speaker.color }}>
          {speaker.name}
        </span>
      </div>
      <div style={{ marginBottom: 8 }}>
        {editingSource ? (
          <input
            autoFocus
            className="nodrag"
            defaultValue={mark.counter.sourceDoc}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => saveSource(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveSource(e.currentTarget.value); if (e.key === "Escape") setEditingSource(false); }}
            style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "2px 6px", width: "100%", border: "none", borderLeft: `2px solid ${tokens.neutral300}`, background: "rgba(255,255,255,0.8)" }}
          />
        ) : (
          <span
            onDoubleClick={(e) => { e.stopPropagation(); if (editMode) setEditingSource(true); }}
            title="Double-click to edit the source"
            style={{ fontSize: 12, color: tokens.neutral500, cursor: editMode ? "text" : "default" }}
          >
            {mark.counter.sourceDoc}
          </span>
        )}
      </div>

      <div style={{ fontSize: 13, fontStyle: "italic", color: tokens.neutral600, lineHeight: 1.5, marginBottom: 8 }}>
        responding to “{quote}”
      </div>

      {editingText ? (
        <div className="nodrag" style={{ display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); setEditingText(false); }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveText(); }
            }}
            style={{ ...inputStyle, fontSize: 17, lineHeight: 1.5, minHeight: 90, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={saveText} style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "4px 12px", background: tokens.text, color: "#fff", border: "none", cursor: "pointer" }}>Save</button>
            <button onClick={() => setEditingText(false)} style={actBtn}>Cancel</button>
          </div>
        </div>
      ) : (
        <div
          onDoubleClick={(e) => { e.stopPropagation(); if (editMode) setEditingText(true); }}
          title={editMode ? "Double-click to edit" : undefined}
          style={{ fontSize: 17, lineHeight: 1.55, textWrap: "pretty" }}
        >
          {mark.counter.text}
        </div>
      )}

      {mark.counter.replies.map((r, ri) => {
        const rSpeaker = sideColor(speakers, r.side, PALETTE);
        const editingRText = editingReply?.index === ri && editingReply.field === "text";
        const editingRSource = editingReply?.index === ri && editingReply.field === "sourceDoc";
        return (
          <div key={ri} style={{ marginTop: 14, borderLeft: `2px solid ${rSpeaker.color}`, background: "rgba(255,255,255,0.6)", padding: "8px 12px" }}
            onMouseEnter={(e) => { e.stopPropagation(); setHoveredReply(ri); }}
            onMouseLeave={(e) => { e.stopPropagation(); setHoveredReply(null); }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
              <span style={{ fontFamily: tokens.fontFamily, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: rSpeaker.color }}>
                {rSpeaker.name}
              </span>
              {editingRSource ? (
                <input
                  autoFocus
                  className="nodrag"
                  value={draft}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={saveReply}
                  onKeyDown={(e) => { if (e.key === "Enter") saveReply(); if (e.key === "Escape") setEditingReply(null); }}
                  style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "2px 6px", width: 220, border: "none", borderLeft: `2px solid ${tokens.neutral300}`, background: "rgba(255,255,255,0.8)" }}
                />
              ) : (
                <span
                  onDoubleClick={(e) => { e.stopPropagation(); if (editMode) startEditReply(ri, "sourceDoc", r.sourceDoc); }}
                  title="Double-click to edit the source"
                  style={{ fontSize: 12, color: tokens.neutral500, cursor: editMode ? "text" : "default" }}
                >
                  {r.sourceDoc}
                </span>
              )}
              <span style={actionRowStyle(hoveredReply === ri)}>
                <button className="nodrag" onClick={(e) => { e.stopPropagation(); deleteReply(id, ri); }} style={actBtn}>delete</button>
              </span>
            </div>
            {editingRText ? (
              <div className="nodrag" style={{ display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setEditingReply(null); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveReply(); }}
                  style={{ ...inputStyle, fontSize: 15, lineHeight: 1.5, minHeight: 70, resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={saveReply} style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "4px 12px", background: tokens.text, color: "#fff", border: "none", cursor: "pointer" }}>Save</button>
                  <button onClick={() => setEditingReply(null)} style={actBtn}>Cancel</button>
                </div>
              </div>
            ) : (
              <div
                onDoubleClick={(e) => { e.stopPropagation(); if (editMode) startEditReply(ri, "text", r.text); }}
                title={editMode ? "Double-click to edit" : undefined}
                style={{ fontSize: 15, lineHeight: 1.55 }}
              >
                {r.text}
              </div>
            )}
          </div>
        );
      })}

      {replying && (
        <div className="nodrag" style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
          <textarea
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            placeholder="Respond to this counter…"
            style={{ ...inputStyle, fontSize: 15, lineHeight: 1.5, minHeight: 64, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {speakers.map((s, i) => (
              <button
                key={s.id}
                onClick={() => { addReply(id, s.id, replyDraft); setReplying(false); setReplyDraft(""); }}
                style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "4px 12px", background: s.color ?? PALETTE[i % PALETTE.length], color: "#fff", border: "none", cursor: "pointer" }}
              >
                Reply as {s.name}
              </button>
            ))}
            <button onClick={() => { setReplying(false); setReplyDraft(""); }} style={actBtn}>Cancel</button>
          </div>
        </div>
      )}

      <div className="nodrag" style={{ marginTop: 14, display: "flex", alignItems: "baseline", gap: 16, minHeight: 22 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 12, color: tokens.neutral600, minWidth: 0, flexWrap: "wrap" }}>
          {mark.counter.tags.map((tag) => (
            <button
              key={tag}
              onClick={() => useArgumentStore.getState().setTagFilter(tag)}
              title="Show every node with this tag"
              style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "1px 2px", background: "none", border: "none", color: tokens.neutral600, cursor: "pointer" }}
            >
              #{tag}
            </button>
          ))}
          {editMode && tagging ? (
            <input
              autoFocus
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { addTag(id, tagDraft); setTagging(false); setTagDraft(""); }
                if (e.key === "Escape") { setTagging(false); setTagDraft(""); }
              }}
              placeholder="tag, then ↵"
              style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "1px 6px", width: 130, border: "none", borderLeft: `2px solid ${tokens.neutral300}`, background: "rgba(255,255,255,0.8)" }}
            />
          ) : editMode ? (
            <button onClick={() => setTagging(true)} title="Add a tag" style={{ fontFamily: tokens.fontFamily, fontSize: 12, padding: "1px 4px", background: "none", border: "none", color: tokens.neutral600, cursor: "pointer" }}>+</button>
          ) : null}
          {Object.entries(mark.counter.reactions).filter(([, c]) => c > 0).map(([emoji, count]) => (
            <button
              key={emoji}
              onClick={() => reactToMark(id, emoji)}
              style={{ fontFamily: tokens.fontFamily, fontSize: 13, padding: "1px 6px", background: "none", border: "none", cursor: "pointer", color: tokens.neutral700, display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <span>{emoji}</span><span style={{ fontSize: 11 }}>{count}</span>
            </button>
          ))}
          <span style={{ position: "relative", display: "inline-flex" }}>
            <button onClick={() => setPickerOpen((v) => !v)} title="Add a reaction" style={{ fontFamily: tokens.fontFamily, fontSize: 14, padding: "1px 4px", background: "none", border: "none", color: tokens.neutral600, cursor: "pointer" }}>☺</button>
            {pickerOpen && (
              <span style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 40, background: tokens.bg, boxShadow: tokens.shadowLg, padding: 6, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 2, width: 186 }}>
                {REACTION_EMOJIS.map((emoji) => (
                  <button key={emoji} onClick={() => { reactToMark(id, emoji); setPickerOpen(false); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 17, padding: 4, lineHeight: 1 }}>{emoji}</button>
                ))}
              </span>
            )}
          </span>
        </div>
        <span style={actionRowStyle(hovered)}>
          <button onClick={() => setReplying(true)} style={{ ...actBtn, color: tokens.accent700 }}>reply</button>
          <button onClick={() => deleteCounter(claimId, id)} style={{ ...actBtn, borderLeft: `1px solid ${tokens.neutral300}` }}>delete</button>
        </span>
      </div>
    </div>
  );
});

CounterNode.displayName = "CounterNode";
export default CounterNode;
