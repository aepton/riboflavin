/**
 * Design tokens for the Argument Canvas, lifted from the design handoff
 * (design_handoff_argument_canvas/README.md — Design Tokens section).
 */

export const tokens = {
  bg: "#f3f2f2",
  text: "#201e1d",
  accent: "#0088b0",
  accent2: "#d6006c",
  accent600: "#0077a0",
  accent700: "#00647f",
  accent2600: "#c00060",
  accent2700: "#9c0050",
  neutral100: "#eceaea",
  neutral200: "#e2e0df",
  neutral300: "#cfcccb",
  neutral500: "#8b8886",
  neutral600: "#5c5956",
  neutral700: "#463f3c",
  shadowMd: "0 4px 16px rgba(0,0,0,0.14)",
  shadowLg: "0 8px 28px rgba(0,0,0,0.18)",
  fontFamily: '"Source Serif 4", Georgia, serif',
} as const;

/** Default speaker palette, in order. */
export const PALETTE = ["#0088b0", "#d6006c", "#8a6a00", "#4a4744"];

/** Per-speaker swatch choices offered when recoloring a speaker chip. */
export const SWATCHES = ["#0088b0", "#d6006c", "#8a6a00", "#4a4744", "#00647f", "#9c0050", "#3f6212"];

export function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
