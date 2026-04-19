import { memo, useRef, useState, useCallback, useEffect, useMemo } from "react";
import { Handle, Position } from "reactflow";
import { useDocumentStore, threadColor, estimateAnnotationHeight, type AnnotationType, type HighlightRange } from "../store/documentStore";
import { absOffset, HighlightedContent } from "./textUtils";
import { NodeFrame } from "./NodeChrome";
import { ReactionBar } from "./EmojiReactions";
import Markdown from "react-markdown";
import { extractCitation, detectPartialCitation } from "./citationUtils";
import hljs, { ensureHljsTheme } from "./hljs";

const TYPE_COLORS: Record<
  AnnotationType,
  { nodeBg: string; border: string }
> = {
  highlight: { nodeBg: "#fffbeb", border: "#fde047" },
  reply:     { nodeBg: "#f9fafb", border: "#e5e7eb" },
};

const PLACEHOLDERS: Record<AnnotationType, string> = {
  highlight: "Add notes about this highlight…",
  reply:     "Type your reply…",
};

interface AnnotationNodeProps {
  data: {
    content: string;
    annotationType: AnnotationType;
    sourceText?: string;
    tags: string[];
    isNew?: boolean;
    depth: number;
    colorIndex?: number;
    highlights?: HighlightRange[];
    dimmed?: boolean;
    threadFocused?: boolean;
    reactions?: Record<string, number>;
    highlighted?: boolean;
    currentNav?: boolean;
    author?: string;
    codeMode?: boolean;
    language?: string;
  };
  id: string;
}

const MONO_FONT = "'SF Mono', 'Fira Code', 'Cascadia Code', monospace";

const AnnotationNode = memo(({ data, id }: AnnotationNodeProps) => {
  const { updateNode, removeTag, toggleReaction, deleteNode, addCitation, citations, documentMode, language: docLanguage } = useDocumentStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const isPRReview = documentMode === "pr-review";
  const isCodeMode = !!data.codeMode;
  const codeLang = data.language || docLanguage || "";

  useEffect(() => {
    if (isPRReview || isCodeMode) ensureHljsTheme();
  }, [isPRReview, isCodeMode]);

  // Citation prompt state (shown after saving with a new citation)
  const [citationPrompt, setCitationPrompt] = useState<{ name: string } | null>(null);
  const [citationUrl, setCitationUrl] = useState("");
  const [citationDesc, setCitationDesc] = useState("");

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionIdx, setSuggestionIdx] = useState(0);

  const color =
    data.colorIndex !== undefined
      ? threadColor(data.colorIndex, data.depth)
      : TYPE_COLORS[data.annotationType] ?? TYPE_COLORS.reply;

  const placeholder = PLACEHOLDERS[data.annotationType] ?? "Type here…";

  // Compute per-highlight handle positions
  const highlightHandles = useMemo(() => {
    const highlights = data.highlights ?? [];
    if (highlights.length === 0) return [];
    const totalH = estimateAnnotationHeight(data.content);
    const charsPerLine = 36;
    const lineH = 26;
    const padTop = 12 + (data.sourceText && !isCodeMode && !isPRReview ? 40 : 0); // padding + quoted text height

    return highlights.map((hl, i) => {
      const midChar = (hl.startIdx + hl.endIdx) / 2;
      const midLine = midChar / charsPerLine;
      const yPx = padTop + midLine * lineH;
      const topPct = Math.min(Math.max((yPx / totalH) * 100, 5), 95);
      return { id: `hl-${i}`, topPct };
    });
  }, [data.highlights, data.content, data.sourceText]);

  // Snapshot current content into local draft when editing begins
  useEffect(() => {
    if (isEditing) setDraft(data.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // Auto-focus new nodes
  useEffect(() => {
    if (data.isNew) {
      const t = setTimeout(() => setIsEditing(true), 150);
      return () => clearTimeout(t);
    }
  }, [data.isNew]);

  // Focus the textarea after the render that enables editing
  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  useEffect(() => { adjustHeight(); }, [draft, isEditing, adjustHeight]);

  const saveEdit = useCallback(() => {
    updateNode(id, draft);
    setIsEditing(false);
    setSuggestions([]);

    // If the draft contains a citation not yet registered, prompt for details
    const parsed = extractCitation(draft);
    if (parsed && !citations[parsed.citeName]) {
      setCitationPrompt({ name: parsed.citeName });
      setCitationUrl("");
      setCitationDesc("");
    }
  }, [id, draft, updateNode, citations]);

  const handleDoubleClick = useCallback(() => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    setIsEditing(true);
  }, []);
  const handleBlur = useCallback(() => saveEdit(), [saveEdit]);

  const citationNames = useMemo(() => Object.keys(citations), [citations]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setDraft(val);
      adjustHeight();

      // Autocomplete: detect partial citation at end of text
      const partial = detectPartialCitation(val);
      if (partial && citationNames.length > 0) {
        const lower = partial.toLowerCase();
        const matches = citationNames.filter((n) => n.toLowerCase().startsWith(lower));
        setSuggestions(matches);
        setSuggestionIdx(0);
      } else {
        setSuggestions([]);
      }
    },
    [adjustHeight, citationNames],
  );

  const applyCitationAutocomplete = useCallback(
    (name: string) => {
      // Replace the partial citation text with the full name
      const partial = detectPartialCitation(draft);
      if (!partial) return;
      const idx = draft.lastIndexOf(partial);
      const newDraft = draft.slice(0, idx) + name;
      setDraft(newDraft);
      setSuggestions([]);
    },
    [draft],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Tab: accept autocomplete suggestion, or insert indent in code mode
      if (e.key === "Tab") {
        if (suggestions.length > 0) {
          e.preventDefault();
          applyCitationAutocomplete(suggestions[suggestionIdx]);
          return;
        }
        if (isCodeMode) {
          e.preventDefault();
          const ta = e.currentTarget;
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const newDraft = draft.slice(0, start) + "  " + draft.slice(end);
          setDraft(newDraft);
          requestAnimationFrame(() => {
            ta.selectionStart = ta.selectionEnd = start + 2;
          });
          return;
        }
      }
      if (suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSuggestionIdx((i) => Math.min(i + 1, suggestions.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSuggestionIdx((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSuggestions([]);
          return;
        }
      }
      // PR review mode: Enter saves, Shift+Enter inserts newline
      // Code mode (non-PR): Enter inserts newline, Cmd/Ctrl+Enter saves
      if (e.key === "Enter") {
        if (isPRReview) {
          if (e.shiftKey) {
            // Shift+Enter: insert newline
            return;
          }
          e.preventDefault();
          saveEdit();
          return;
        }
        if (isCodeMode) {
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            saveEdit();
            return;
          }
          // Let Enter pass through for normal newlines in code mode
        } else if (!e.shiftKey) {
          e.preventDefault();
          saveEdit();
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setIsEditing(false);
      }
    },
    [saveEdit, suggestions, suggestionIdx, applyCitationAutocomplete, isCodeMode, draft],
  );

  // Single-click → open reply modal after short delay (allows double-click to cancel)
  const handleNodeClick = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) return;
      if ((e.target as HTMLElement).closest("[data-no-reply]")) return;
      if (!window.getSelection()?.toString().trim()) {
        if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          document.dispatchEvent(
            new CustomEvent("docAnnotationAction", {
              detail: { nodeId: id, depth: data.depth },
            }),
          );
        }, 250);
      }
    },
    [isEditing, id, data.depth],
  );

  const handleTagClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      document.dispatchEvent(
        new CustomEvent("docTagAction", { detail: { nodeId: id } }),
      );
    },
    [id],
  );

  const handleFocusClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      document.dispatchEvent(
        new CustomEvent("docFocusThread", { detail: { nodeId: id } }),
      );
    },
    [id],
  );

  // Text selection → emit event so DocumentFlow can show the highlight button
  const handleMouseUp = useCallback(() => {
    if (isEditing) return;
    const selection = window.getSelection();
    if (
      selection &&
      selection.toString().trim().length > 0 &&
      selection.rangeCount > 0 &&
      contentRef.current
    ) {
      const range = selection.getRangeAt(0);
      if (contentRef.current.contains(range.commonAncestorContainer)) {
        const startIdx = absOffset(contentRef.current, range.startContainer, range.startOffset);
        const endIdx = absOffset(contentRef.current, range.endContainer, range.endOffset);
        const rect = range.getBoundingClientRect();
        document.dispatchEvent(
          new CustomEvent("docTextSelected", {
            detail: {
              text: selection.toString().trim(),
              sourceNodeId: id,
              startIdx,
              endIdx,
              rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
            },
          }),
        );
        return;
      }
    }
    document.dispatchEvent(new CustomEvent("docTextSelected", { detail: null }));
  }, [id, isEditing]);

  const footerBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    borderTop: `1px solid ${color.border}`,
    borderRight: `1px solid ${color.border}`,
    borderRadius: 0,
    cursor: "pointer",
    padding: "1px 6px",
    fontSize: "10px",
    color: "#64748b",
    fontFamily: "inherit",
    fontWeight: 500,
  };

  return (
    <NodeFrame
      borderColor={data.highlighted ? "#3b82f6" : data.currentNav ? "#94a3b8" : color.border}
      bracketColor={data.highlighted ? "#2563eb" : data.currentNav ? "#64748b" : color.border}
      background={color.nodeBg}
      innerRuleColor={data.highlighted ? "#93c5fd" : data.currentNav ? "#cbd5e1" : color.border}
      width={340}
      opacity={data.dimmed ? 0.18 : 1}
      style={{ cursor: isEditing ? "text" : "pointer" }}
    >
      <div
        onDoubleClick={handleDoubleClick}
        onClick={handleNodeClick}
        onMouseUp={handleMouseUp}
        style={{
          padding: "12px 14px",
          position: "relative",
          fontFamily: "inherit",
          fontSize: "15px",
          lineHeight: "1.65",
          color: "#1e293b",
          userSelect: isEditing ? "text" : "none",
        }}
      >
      {/* Per-highlight source handles */}
      {highlightHandles.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type="source"
          position={Position.Right}
          style={{ opacity: 0, pointerEvents: "none", right: -4, top: `${h.topPct}%` }}
        />
      ))}
      <Handle id="right" type="source" position={Position.Right}
        style={{ opacity: 0, pointerEvents: "none", right: -4 }} />
      <Handle id="left" type="target" position={Position.Left}
        style={{ opacity: 0, pointerEvents: "none", left: -4 }} />

      {/* Author */}
      {data.author && (
        <div style={{
          fontSize: "10px",
          color: "#64748b",
          fontWeight: 600,
          letterSpacing: "0.03em",
          marginBottom: "4px",
        }}>
          {data.author}
        </div>
      )}

      {/* Quoted source text (highlights only — not in code/PR-review mode) */}
      {data.annotationType === "highlight" && data.sourceText && !isCodeMode && !isPRReview && (
        <div style={{
          borderLeft: `2.5px solid ${color.border}`,
          paddingLeft: "8px",
          marginBottom: "8px",
          color: "#64748b",
          fontSize: "13px",
          fontStyle: "italic",
          lineHeight: "1.5",
        }}>
          {data.sourceText.length > 100
            ? data.sourceText.slice(0, 100) + "\u2026"
            : data.sourceText}
        </div>
      )}

      {/* Content — editable textarea or rendered text with highlights */}
      {isEditing ? (
        <div style={{ position: "relative" }}>
          <textarea
            ref={textareaRef}
            className="nodrag"
            value={draft}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={{
              width: "100%",
              minHeight: "56px",
              border: "none",
              resize: "none",
              outline: "none",
              fontFamily: isCodeMode ? MONO_FONT : "inherit",
              fontSize: isCodeMode ? "13px" : "15px",
              lineHeight: isCodeMode ? "1.5" : "1.65",
              color: "#1e293b",
              background: "transparent",
              overflow: "hidden",
              display: "block",
              boxSizing: "border-box",
              userSelect: "text",
              WebkitUserSelect: "text",
              tabSize: 2,
              whiteSpace: isCodeMode ? "pre" : undefined,
            }}
          />
          {/* Autocomplete dropdown */}
          {suggestions.length > 0 && (
            <div
              className="nodrag"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: -4,
                transform: "translateY(100%)",
                background: "#fff",
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                zIndex: 10,
                maxHeight: "120px",
                overflowY: "auto",
              }}
            >
              {suggestions.map((name, i) => (
                <div
                  key={name}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyCitationAutocomplete(name);
                  }}
                  style={{
                    padding: "6px 10px",
                    fontSize: "13px",
                    cursor: "pointer",
                    background: i === suggestionIdx ? "#f1f5f9" : "transparent",
                    color: "#334155",
                  }}
                >
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (() => {
        const parsed = data.content ? extractCitation(data.content) : null;
        const displayContent = parsed ? parsed.body : data.content;
        const citeName = parsed?.citeName;
        const citeMeta = citeName ? citations[citeName] : undefined;

        // Syntax-highlight code for code-mode nodes
        const codeHtml = isCodeMode && displayContent
          ? (() => {
              try {
                return codeLang && hljs.getLanguage(codeLang)
                  ? hljs.highlight(displayContent, { language: codeLang }).value
                  : hljs.highlightAuto(displayContent).value;
              } catch {
                return displayContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
              }
            })()
          : null;

        // Markdown components — with syntax-highlighted code blocks in PR review mode
        const mdCodeComponent = isPRReview
          ? ({ className, children }: { className?: string; children?: React.ReactNode }) => {
              const text = String(children).replace(/\n$/, "");
              const langMatch = className?.match(/language-(\w+)/);
              const lang = langMatch?.[1] || codeLang;
              if (className) {
                // Fenced code block (```): syntax highlight it
                try {
                  const highlighted = lang && hljs.getLanguage(lang)
                    ? hljs.highlight(text, { language: lang }).value
                    : hljs.highlightAuto(text).value;
                  return (
                    <code
                      style={{ fontFamily: MONO_FONT, fontSize: "12px" }}
                      dangerouslySetInnerHTML={{ __html: highlighted }}
                    />
                  );
                } catch {
                  return <code style={{ fontFamily: MONO_FONT, fontSize: "12px" }}>{children}</code>;
                }
              }
              // Inline code
              return (
                <code style={{ background: "#f1f5f9", padding: "1px 4px", fontSize: "12px", fontFamily: MONO_FONT }}>
                  {children}
                </code>
              );
            }
          : ({ children }: { children?: React.ReactNode }) => (
              <code style={{ background: "#f1f5f9", padding: "1px 4px", fontSize: "13px", borderRadius: "2px" }}>
                {children}
              </code>
            );

        return (
          <>
            <div
              ref={contentRef}
              className="nodrag nopan"
              style={{ minHeight: "36px", userSelect: "text", WebkitUserSelect: "text" }}
              onDoubleClick={handleDoubleClick}
            >
              {displayContent ? (
                isCodeMode ? (
                  <pre
                    style={{
                      fontFamily: MONO_FONT,
                      fontSize: "13px",
                      lineHeight: "1.5",
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      color: "#1e293b",
                    }}
                    dangerouslySetInnerHTML={{ __html: codeHtml! }}
                  />
                ) : data.highlights && data.highlights.length > 0 ? (
                  <HighlightedContent
                    content={displayContent}
                    highlights={data.highlights}
                  />
                ) : (
                  <Markdown
                    components={{
                      p: ({ children }) => <p style={{ margin: "0 0 8px" }}>{children}</p>,
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6", textDecoration: "underline" }}>
                          {children}
                        </a>
                      ),
                      ul: ({ children }) => <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ margin: "4px 0", paddingLeft: "20px" }}>{children}</ol>,
                      code: mdCodeComponent,
                      pre: ({ children }) => (
                        <pre style={{ background: "#f1f5f9", padding: "8px", overflow: "auto", fontSize: "13px", fontFamily: isPRReview ? MONO_FONT : undefined, margin: "4px 0" }}>
                          {children}
                        </pre>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote style={{ borderLeft: "3px solid #cbd5e1", paddingLeft: "10px", margin: "4px 0", color: "#64748b" }}>
                          {children}
                        </blockquote>
                      ),
                    }}
                  >
                    {displayContent}
                  </Markdown>
                )
              ) : (
                <span style={{ color: "#94a3b8", fontStyle: "italic" }}>
                  {isCodeMode ? "Double-click to add code…" : "Double-click to add notes…"}
                </span>
              )}
            </div>

            {/* Citation box */}
            {citeName && (
              <div
                data-no-reply
                style={{
                  marginTop: "8px",
                  paddingTop: "6px",
                  borderTop: `1px solid ${color.border}`,
                  fontSize: "12px",
                  color: "#64748b",
                  fontStyle: "italic",
                }}
              >
                {citeMeta ? (
                  <a
                    href={citeMeta.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={citeMeta.description}
                    style={{ color: "#3b82f6", textDecoration: "underline" }}
                  >
                    {citeName}
                  </a>
                ) : (
                  <span>{citeName}</span>
                )}
              </div>
            )}
          </>
        );
      })()}

      {/* Citation prompt modal */}
      {citationPrompt && (
        <div
          data-no-reply
          className="nodrag"
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: "8px",
            padding: "10px",
            border: `1px solid ${color.border}`,
            background: "#fff",
            fontSize: "12px",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "6px", color: "#334155" }}>
            New citation: {citationPrompt.name}
          </div>
          <input
            type="url"
            placeholder="URL"
            value={citationUrl}
            onChange={(e) => setCitationUrl(e.target.value)}
            style={{
              width: "100%",
              padding: "4px 6px",
              fontSize: "12px",
              border: "1px solid #d1d5db",
              marginBottom: "4px",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
          <input
            type="text"
            placeholder="Description"
            value={citationDesc}
            onChange={(e) => setCitationDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && citationUrl.trim()) {
                addCitation(citationPrompt.name, citationUrl.trim(), citationDesc.trim());
                setCitationPrompt(null);
              }
              if (e.key === "Escape") setCitationPrompt(null);
            }}
            style={{
              width: "100%",
              padding: "4px 6px",
              fontSize: "12px",
              border: "1px solid #d1d5db",
              marginBottom: "6px",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              onClick={() => {
                if (citationUrl.trim()) {
                  addCitation(citationPrompt.name, citationUrl.trim(), citationDesc.trim());
                }
                setCitationPrompt(null);
              }}
              style={{
                padding: "3px 8px",
                fontSize: "11px",
                background: "#f1f5f9",
                border: "1px solid #d1d5db",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Save
            </button>
            <button
              onClick={() => setCitationPrompt(null)}
              style={{
                padding: "3px 8px",
                fontSize: "11px",
                background: "none",
                border: "1px solid #d1d5db",
                cursor: "pointer",
                fontFamily: "inherit",
                color: "#64748b",
              }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Tags */}
      {data.tags && data.tags.length > 0 && (
        <div
          data-no-reply
          style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "8px" }}
        >
          {data.tags.map((tag: string) => (
            <span key={tag} style={{
              background: "none",
              color: "#475569",
              padding: "2px 6px",
              borderRadius: 0,
              fontSize: "11px",
              border: "none",
              borderTop: `1px solid ${color.border}`,
              borderRight: `1px solid ${color.border}`,
              display: "flex", alignItems: "center", gap: "3px",
            }}>
              #{tag}
              <button
                data-no-reply
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.stopPropagation(); removeTag(id, tag); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: 0, color: "#94a3b8", fontSize: "13px", lineHeight: 1,
                }}
              >×</button>
            </span>
          ))}
        </div>
      )}

      {/* Reactions */}
      {!isEditing && (
        <div className="nodrag" data-no-reply style={{ paddingTop: "4px" }}>
          <ReactionBar
            reactions={data.reactions ?? {}}
            onToggle={(emoji) => toggleReaction(id, emoji)}
            accentColor={color.border}
          />
        </div>
      )}

      {/* Footer */}
      {!isEditing && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "4px",
          paddingTop: "6px",
          borderTop: `1px solid ${color.border}`,
          fontSize: "10px",
          color: "#94a3b8",
        }}>
          <span>{isPRReview ? "click to reply · double-click to edit · ⇧↵ newline" : isCodeMode ? "click to reply · double-click to edit · ⌘↵ to save" : "click to reply · double-click to edit"}</span>
          <div data-no-reply style={{ display: "flex", gap: "4px" }}>
            <button
              data-no-reply
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleTagClick}
              style={footerBtnStyle}
            >
              # tag
            </button>
            <button
              data-no-reply
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
              style={{ ...footerBtnStyle, color: "#dc2626" }}
            >
              delete
            </button>
            <button
              data-no-reply
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleFocusClick}
              style={{
                ...footerBtnStyle,
                color: data.threadFocused ? "#1e293b" : "#94a3b8",
                background: data.threadFocused ? "rgba(0,0,0,0.06)" : "none",
              }}
            >
              {data.threadFocused ? "unfocus" : "focus"}
            </button>
          </div>
        </div>
      )}
      </div>
    </NodeFrame>
  );
});

AnnotationNode.displayName = "AnnotationNode";
export default AnnotationNode;
