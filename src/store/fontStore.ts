/**
 * Font selection store.
 *
 * Persists the chosen font in localStorage and lazily loads Google Font
 * stylesheets as the user switches between fonts.
 */
import { create } from "zustand";

const LS_FONT = "riboflavin:font";

export interface FontOption {
  /** Display label */
  label: string;
  /** CSS font-family value (including fallbacks) */
  family: string;
  /** Google Fonts family name for the stylesheet URL */
  gFontFamily: string;
  /** Weights to load */
  weights: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    label: "EB Garamond",
    family: '"EB Garamond", Georgia, serif',
    gFontFamily: "EB+Garamond",
    weights: "ital,wght@0,400;0,500;0,600;0,700;1,400;1,500",
  },
  {
    label: "Crimson Text",
    family: '"Crimson Text", Georgia, serif',
    gFontFamily: "Crimson+Text",
    weights: "ital,wght@0,400;0,600;0,700;1,400;1,600;1,700",
  },
  {
    label: "Libre Baskerville",
    family: '"Libre Baskerville", Georgia, serif',
    gFontFamily: "Libre+Baskerville",
    weights: "ital,wght@0,400;0,700;1,400",
  },
  {
    label: "Lora",
    family: '"Lora", Georgia, serif',
    gFontFamily: "Lora",
    weights: "ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700",
  },
  {
    label: "Merriweather",
    family: '"Merriweather", Georgia, serif',
    gFontFamily: "Merriweather",
    weights: "ital,wght@0,300;0,400;0,700;0,900;1,300;1,400;1,700;1,900",
  },
  {
    label: "Playfair Display",
    family: '"Playfair Display", Georgia, serif',
    gFontFamily: "Playfair+Display",
    weights: "ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700",
  },
  {
    label: "Source Serif 4",
    family: '"Source Serif 4", Georgia, serif',
    gFontFamily: "Source+Serif+4",
    weights: "ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700",
  },
  {
    label: "Cormorant Garamond",
    family: '"Cormorant Garamond", Georgia, serif',
    gFontFamily: "Cormorant+Garamond",
    weights: "ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700",
  },
  {
    label: "Spectral",
    family: '"Spectral", Georgia, serif',
    gFontFamily: "Spectral",
    weights: "ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700",
  },
  {
    label: "Alegreya",
    family: '"Alegreya", Georgia, serif',
    gFontFamily: "Alegreya",
    weights: "ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700",
  },
  {
    label: "IBM Plex Sans",
    family: '"IBM Plex Sans", system-ui, sans-serif',
    gFontFamily: "IBM+Plex+Sans",
    weights: "ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700",
  },
  {
    label: "Inter",
    family: '"Inter", system-ui, sans-serif',
    gFontFamily: "Inter",
    weights: "wght@300;400;500;600;700",
  },
  {
    label: "Literata",
    family: '"Literata", Georgia, serif',
    gFontFamily: "Literata",
    weights: "ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700",
  },
  {
    label: "IBM Plex Mono",
    family: '"IBM Plex Mono", monospace',
    gFontFamily: "IBM+Plex+Mono",
    weights: "ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700",
  },
];

/** Set of gFontFamily values for which we've already injected a <link>. */
const loadedFonts = new Set<string>();

function ensureFontLoaded(opt: FontOption) {
  if (loadedFonts.has(opt.gFontFamily)) return;
  loadedFonts.add(opt.gFontFamily);

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${opt.gFontFamily}:${opt.weights}&display=swap`;
  document.head.appendChild(link);
}

// Pre-mark fonts loaded by index.html.
loadedFonts.add("EB+Garamond");
loadedFonts.add("Merriweather");

interface FontStore {
  current: FontOption;
  setFont: (label: string) => void;
}

const DEFAULT_FONT = FONT_OPTIONS.find((f) => f.label === "Merriweather")!;

function resolveFont(label: string | null): FontOption {
  if (!label) return DEFAULT_FONT;
  return FONT_OPTIONS.find((f) => f.label === label) ?? DEFAULT_FONT;
}

export const useFontStore = create<FontStore>((set) => ({
  current: resolveFont(localStorage.getItem(LS_FONT)),

  setFont: (label) => {
    const opt = FONT_OPTIONS.find((f) => f.label === label);
    if (!opt) return;
    localStorage.setItem(LS_FONT, label);
    ensureFontLoaded(opt);
    set({ current: opt });
  },
}));

// Ensure the initial font is loaded (in case it was persisted and isn't EB Garamond)
ensureFontLoaded(useFontStore.getState().current);
