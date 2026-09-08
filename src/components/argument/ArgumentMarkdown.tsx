import Markdown from "react-markdown";
import { tokens } from "./tokens";

/**
 * Shared markdown renderer for counter and reply bodies (claim bodies stay
 * plain text — their highlights are anchored to raw character offsets, which
 * markdown syntax would throw off).
 */
export function ArgumentMarkdown({ content, fontSize }: { content: string; fontSize: number }) {
  return (
    <Markdown
      components={{
        p: ({ children }) => <p style={{ margin: "0 0 6px" }}>{children}</p>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: tokens.accent700 }}>
            {children}
          </a>
        ),
        ul: ({ children }) => <ul style={{ margin: "4px 0", paddingLeft: 20 }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: "4px 0", paddingLeft: 20 }}>{children}</ol>,
        code: ({ children }) => (
          <code style={{ background: tokens.neutral200, padding: "1px 4px", fontSize: fontSize - 2 }}>{children}</code>
        ),
        blockquote: ({ children }) => (
          <blockquote style={{ borderLeft: `2px solid ${tokens.neutral300}`, paddingLeft: 10, margin: "4px 0", color: tokens.neutral600 }}>
            {children}
          </blockquote>
        ),
      }}
    >
      {content}
    </Markdown>
  );
}
