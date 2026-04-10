// Citation pattern: "- " followed by alphanumeric characters and spaces at the
// very end of the content. Can appear inline or on its own line.
const CITATION_RE = /-\s+([A-Za-z0-9][A-Za-z0-9 ]*)$/;

/** Extract citation name from content, returning stripped body + cite name. */
export function extractCitation(content: string): { body: string; citeName: string } | null {
  const match = content.match(CITATION_RE);
  if (!match) return null;
  return { body: content.slice(0, match.index!).trimEnd(), citeName: match[1].trim() };
}

// Detect a partial citation being typed at the end of text.
// Requires "- " then at least 2 characters.
const PARTIAL_CITE_RE = /-\s+([A-Za-z0-9][A-Za-z0-9 ]+)$/;

/** Returns the partial citation prefix (2+ chars after "- ") or null. */
export function detectPartialCitation(text: string): string | null {
  const match = text.match(PARTIAL_CITE_RE);
  if (!match || match[1].trim().length < 2) return null;
  return match[1];
}
