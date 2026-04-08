/**
 * Emoji picker + reaction display for document-mode nodes.
 */
import { memo, useState, useCallback, useRef, useEffect } from "react";
import type { CSSProperties } from "react";

// ── Palette ─────────────────────────────────────────────────────────────────

export const REACTION_EMOJIS = [
  "\u{1F44D}", // thumbs up
  "\u{1F44E}", // thumbs down
  "\u{2764}\u{FE0F}",  // red heart
  "\u{1F525}", // fire
  "\u{1F4A1}", // light bulb
  "\u{2753}",  // question mark
  "\u{2757}",  // exclamation
  "\u{1F440}", // eyes
  "\u{2705}",  // check mark
  "\u{274C}",  // cross mark
  "\u{1F3AF}", // bullseye
  "\u{1F4CC}", // pushpin
] as const;

// ── Picker ──────────────────────────────────────────────────────────────────

interface PickerProps {
  onSelect: (emoji: string) => void;
  accentColor?: string;
}

const toggleBtnStyle = (_accent: string): CSSProperties => ({
  background: "none",
  border: "none",
  borderRadius: 0,
  cursor: "pointer",
  padding: "1px 5px",
  fontSize: "12px",
  lineHeight: 1,
  fontFamily: "inherit",
  color: "#94a3b8",
  userSelect: "none",
});

export const EmojiPicker = memo(({ onSelect, accentColor = "#d1d5db" }: PickerProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      setOpen(false);
    },
    [onSelect],
  );

  return (
    <div ref={ref} data-no-reply style={{ position: "relative", display: "inline-block" }}>
      <button
        data-no-reply
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={toggleBtnStyle(accentColor)}
        title="Add reaction"
      >
        +
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 50,
            background: "#fff",
            border: "none",
            borderTop: `1px solid ${accentColor}`,
            borderRight: `1px solid ${accentColor}`,
            boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
            padding: "6px",
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: "2px",
            width: "168px",
          }}
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(emoji);
              }}
              style={{
                background: "none",
                border: "none",
                borderRadius: 0,
                cursor: "pointer",
                fontSize: "16px",
                padding: "3px",
                lineHeight: 1,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "#f1f5f9";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "none";
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
EmojiPicker.displayName = "EmojiPicker";

// ── Reaction bar ────────────────────────────────────────────────────────────

interface ReactionBarProps {
  reactions: Record<string, number>;
  onToggle: (emoji: string) => void;
  accentColor?: string;
}

export const ReactionBar = memo(({ reactions, onToggle, accentColor = "#d1d5db" }: ReactionBarProps) => {
  const entries = Object.entries(reactions).filter(([, count]) => count > 0);

  return (
    <div
      data-no-reply
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "4px",
        marginTop: entries.length > 0 ? "6px" : "2px",
      }}
    >
      {entries.map(([emoji, count]) => (
        <button
          key={emoji}
          data-no-reply
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(emoji);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "3px",
            background: "none",
            border: "none",
            borderTop: `1px solid ${accentColor}`,
            borderRight: `1px solid ${accentColor}`,
            borderRadius: 0,
            padding: "1px 6px",
            cursor: "pointer",
            fontSize: "13px",
            lineHeight: 1.4,
            fontFamily: "inherit",
            color: "#475569",
          }}
          title={`${emoji} (click to add more)`}
        >
          <span>{emoji}</span>
          {count > 1 && (
            <span style={{ fontSize: "10px", fontWeight: 600 }}>{count}</span>
          )}
        </button>
      ))}
      <EmojiPicker onSelect={onToggle} accentColor={accentColor} />
    </div>
  );
});
ReactionBar.displayName = "ReactionBar";
