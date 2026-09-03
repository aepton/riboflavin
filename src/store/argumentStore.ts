/**
 * Store for Argument Canvas documents (documentMode: "argument").
 *
 * Kept separate from documentStore.ts: argument-mode content is naturally
 * shaped as claims → marks → counter → replies (see the design handoff),
 * not as the generic column/depth nodes-and-edges model the rest of the app
 * uses. ArgumentCanvas.tsx derives ephemeral reactflow nodes/edges from this
 * state on every render via argumentLayout.ts.
 */
import { create } from "zustand";
import { reactToMark } from "./spacesClient";
import type { Claim, Counter, Mark, Reply, Speaker } from "./argumentLayout";

export type { Claim, Counter, Mark, Reply, Speaker };

const RX_STORE_KEY = "argument-canvas-reactions-v1";

export function canEditFromUrl(): boolean {
  try {
    const v = (new URLSearchParams(window.location.search).get("edit") || "").toLowerCase();
    return v === "true" || v === "1" || v === "yes";
  } catch {
    return false;
  }
}

function loadCachedReactions(): Record<string, Record<string, number>> {
  try {
    const raw = window.localStorage.getItem(RX_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function cacheReaction(markId: string, reactions: Record<string, number>) {
  try {
    const all = loadCachedReactions();
    all[markId] = reactions;
    window.localStorage.setItem(RX_STORE_KEY, JSON.stringify(all));
  } catch {
    // ignore unwritable storage
  }
}

interface ArgumentStore {
  claims: Claim[];
  speakers: Speaker[];
  sources: { label: string; url: string }[];
  kicker: string;
  slug: string | null;

  sideFilter: string; // "all" | speaker id
  tagFilter: string | null;
  activeThread: string | null;
  editMode: boolean;
  selection: { claimId: string; start: number; end: number; text: string; top: number; left: number } | null;

  loadArgumentDoc: (claims: Claim[], speakers: Speaker[], kicker: string, sources: { label: string; url: string }[], slug?: string) => void;
  newArgumentDoc: () => void;
  setEditModeFromUrl: () => void;
  setSlug: (slug: string) => void;

  setKicker: (kicker: string) => void;
  addSpeaker: () => string;
  renameSpeaker: (id: string, name: string) => void;
  setSpeakerColor: (id: string, color: string) => void;
  removeSpeaker: (id: string) => void;

  addSource: () => void;
  updateSource: (index: number, label: string, url: string) => void;
  removeSource: (index: number) => void;

  addClaim: (side: string) => string;
  updateClaimText: (claimId: string, text: string) => void;
  updateClaimSource: (claimId: string, sourceDoc: string) => void;
  deleteClaim: (claimId: string) => void;

  addCounterFromSelection: (claimId: string, start: number, end: number, phrase: string, side: string) => string | null;
  updateCounterText: (markId: string, text: string) => void;
  updateCounterSource: (markId: string, sourceDoc: string) => void;
  deleteCounter: (claimId: string, markId: string) => void;

  addReply: (markId: string, side: string, text: string) => void;
  updateReply: (markId: string, replyIndex: number, field: "text" | "sourceDoc", value: string) => void;
  deleteReply: (markId: string, replyIndex: number) => void;

  addTag: (markId: string, tag: string) => void;
  react: (markId: string, emoji: string) => void;

  setSideFilter: (side: string) => void;
  setTagFilter: (tag: string | null) => void;
  setActiveThread: (markId: string | null) => void;
  setSelection: (selection: ArgumentStore["selection"]) => void;
}

function findMark(claims: Claim[], markId: string): Mark | null {
  for (const c of claims) {
    const m = c.marks.find((mm) => mm.id === markId);
    if (m) return m;
  }
  return null;
}

export const useArgumentStore = create<ArgumentStore>((set, get) => ({
  claims: [],
  speakers: [],
  sources: [],
  kicker: "",
  slug: null,

  sideFilter: "all",
  tagFilter: null,
  activeThread: null,
  editMode: false,
  selection: null,

  loadArgumentDoc: (claims, speakers, kicker, sources, slug) =>
    set({
      claims,
      speakers,
      kicker,
      sources,
      slug: slug ?? null,
      sideFilter: "all",
      tagFilter: null,
      activeThread: null,
    }),

  newArgumentDoc: () =>
    set({
      claims: [],
      speakers: [
        { id: "side1", name: "Speaker 1" },
        { id: "side2", name: "Speaker 2" },
      ],
      kicker: "",
      sources: [],
      slug: null,
      sideFilter: "all",
      tagFilter: null,
      activeThread: null,
    }),

  setEditModeFromUrl: () => set({ editMode: canEditFromUrl() }),
  setSlug: (slug) => set({ slug }),

  setKicker: (kicker) => set({ kicker }),

  addSpeaker: () => {
    const id = `side${Date.now()}`;
    set((s) => ({ speakers: [...s.speakers, { id, name: "New speaker" }] }));
    return id;
  },

  renameSpeaker: (id, name) =>
    set((s) => ({ speakers: s.speakers.map((sp) => (sp.id === id ? { ...sp, name } : sp)) })),

  setSpeakerColor: (id, color) =>
    set((s) => ({ speakers: s.speakers.map((sp) => (sp.id === id ? { ...sp, color } : sp)) })),

  removeSpeaker: (id) => {
    const { claims } = get();
    const used = claims.some(
      (c) =>
        c.side === id ||
        c.marks.some((m) => m.side === id || m.counter.side === id || m.counter.replies.some((r) => r.side === id)),
    );
    if (used) return;
    set((s) => ({
      speakers: s.speakers.filter((sp) => sp.id !== id),
      sideFilter: s.sideFilter === id ? "all" : s.sideFilter,
    }));
  },

  addSource: () => set((s) => ({ sources: [...s.sources, { label: "New source", url: "https://" }] })),

  updateSource: (index, label, url) =>
    set((s) => ({ sources: s.sources.map((src, i) => (i === index ? { label, url } : src)) })),

  removeSource: (index) => set((s) => ({ sources: s.sources.filter((_, i) => i !== index) })),

  addClaim: (side) => {
    const id = `c${Date.now()}`;
    const claim: Claim = { id, side, sourceDoc: "add the source document", text: "Paste or type the claim from the source document.", marks: [] };
    set((s) => ({ claims: [...s.claims, claim] }));
    return id;
  },

  updateClaimText: (claimId, text) =>
    set((s) => ({
      claims: s.claims.map((c) => {
        if (c.id !== claimId) return c;
        const marks = c.marks
          .map((m) => {
            const i = text.indexOf(m.phrase);
            return i >= 0 ? { ...m, start: i, end: i + m.phrase.length } : null;
          })
          .filter((m): m is Mark => m !== null)
          .sort((a, b) => a.start - b.start);
        return { ...c, text, marks };
      }),
    })),

  updateClaimSource: (claimId, sourceDoc) =>
    set((s) => ({ claims: s.claims.map((c) => (c.id === claimId ? { ...c, sourceDoc } : c)) })),

  deleteClaim: (claimId) =>
    set((s) => ({
      claims: s.claims.filter((c) => c.id !== claimId),
      activeThread: null,
    })),

  addCounterFromSelection: (claimId, start, end, phrase, side) => {
    const { claims } = get();
    const claim = claims.find((c) => c.id === claimId);
    if (!claim) return null;
    if (claim.marks.some((m) => start < m.end && end > m.start)) return null;

    const id = `${claimId}-h${Date.now()}`;
    const mark: Mark = {
      id,
      start,
      end,
      phrase,
      side,
      counter: { side, sourceDoc: "add the source document", text: "Write the counter-argument here.", tags: [], reactions: {}, replies: [] },
    };
    set((s) => ({
      claims: s.claims.map((c) =>
        c.id === claimId ? { ...c, marks: [...c.marks, mark].sort((a, b) => a.start - b.start) } : c,
      ),
    }));
    return id;
  },

  updateCounterText: (markId, text) =>
    set((s) => ({
      claims: s.claims.map((c) => ({
        ...c,
        marks: c.marks.map((m) => (m.id === markId ? { ...m, counter: { ...m.counter, text } } : m)),
      })),
    })),

  updateCounterSource: (markId, sourceDoc) =>
    set((s) => ({
      claims: s.claims.map((c) => ({
        ...c,
        marks: c.marks.map((m) => (m.id === markId ? { ...m, counter: { ...m.counter, sourceDoc } } : m)),
      })),
    })),

  deleteCounter: (claimId, markId) =>
    set((s) => ({
      claims: s.claims.map((c) => (c.id === claimId ? { ...c, marks: c.marks.filter((m) => m.id !== markId) } : c)),
      activeThread: null,
    })),

  addReply: (markId, side, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    set((s) => ({
      claims: s.claims.map((c) => ({
        ...c,
        marks: c.marks.map((m) =>
          m.id === markId
            ? { ...m, counter: { ...m.counter, replies: [...m.counter.replies, { side, sourceDoc: "add the source document", text: trimmed }] } }
            : m,
        ),
      })),
    }));
  },

  updateReply: (markId, replyIndex, field, value) =>
    set((s) => ({
      claims: s.claims.map((c) => ({
        ...c,
        marks: c.marks.map((m) => {
          if (m.id !== markId) return m;
          const replies = m.counter.replies.map((r, i) => (i === replyIndex ? { ...r, [field]: value } : r));
          return { ...m, counter: { ...m.counter, replies } };
        }),
      })),
    })),

  deleteReply: (markId, replyIndex) =>
    set((s) => ({
      claims: s.claims.map((c) => ({
        ...c,
        marks: c.marks.map((m) =>
          m.id === markId ? { ...m, counter: { ...m.counter, replies: m.counter.replies.filter((_, i) => i !== replyIndex) } } : m,
        ),
      })),
    })),

  addTag: (markId, tag) => {
    const clean = tag.trim().replace(/^#/, "");
    if (!clean) return;
    set((s) => ({
      claims: s.claims.map((c) => ({
        ...c,
        marks: c.marks.map((m) => {
          if (m.id !== markId) return m;
          if (m.counter.tags.includes(clean)) return m;
          return { ...m, counter: { ...m.counter, tags: [...m.counter.tags, clean] } };
        }),
      })),
    }));
  },

  react: (markId, emoji) => {
    const { claims, slug } = get();
    const mark = findMark(claims, markId);
    if (!mark) return;
    const reactions = { ...mark.counter.reactions, [emoji]: (mark.counter.reactions[emoji] ?? 0) + 1 };

    set((s) => ({
      claims: s.claims.map((c) => ({
        ...c,
        marks: c.marks.map((m) => (m.id === markId ? { ...m, counter: { ...m.counter, reactions } } : m)),
      })),
    }));
    cacheReaction(markId, reactions);

    if (slug) {
      reactToMark(slug, markId, emoji).catch(() => {
        // Best-effort — the local + localStorage update above already stands.
      });
    }
  },

  setSideFilter: (side) => set({ sideFilter: side }),
  setTagFilter: (tag) => set((s) => ({ tagFilter: s.tagFilter === tag ? null : tag, activeThread: null })),
  setActiveThread: (markId) => set((s) => ({ activeThread: s.activeThread === markId ? null : markId })),
  setSelection: (selection) => set({ selection }),
}));
