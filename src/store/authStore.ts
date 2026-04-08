/**
 * Persistent auth & identity state.
 *
 * The active username is stored in localStorage so it survives page
 * reloads.  The store also tracks every username that has been used
 * in this browser for the persona switcher.
 *
 * Spaces credentials are no longer needed here — they live server-side
 * in the DigitalOcean Functions environment.
 */
import { create } from "zustand";

const LS_USERNAME = "riboflavin:username";
const LS_KNOWN_USERS = "riboflavin:knownUsers";

function readKnownUsers(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KNOWN_USERS) ?? "[]");
  } catch {
    return [];
  }
}

interface AuthStore {
  username: string | null;
  knownUsers: string[];
  /** true once a username has been set */
  ready: boolean;
  /** true after hydrate() has run — prevents premature login prompts */
  hydrated: boolean;

  setUsername: (name: string) => void;
  /** Boot from localStorage — call once on app mount */
  hydrate: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  username: null,
  knownUsers: [],
  ready: false,
  hydrated: false,

  setUsername: (name) => {
    localStorage.setItem(LS_USERNAME, name);
    const known = get().knownUsers;
    if (!known.includes(name)) {
      const next = [...known, name];
      localStorage.setItem(LS_KNOWN_USERS, JSON.stringify(next));
      set({ username: name, knownUsers: next, ready: true });
    } else {
      set({ username: name, ready: true });
    }
  },

  hydrate: () => {
    const username = localStorage.getItem(LS_USERNAME);
    const knownUsers = readKnownUsers();

    set({
      username,
      knownUsers,
      ready: !!username,
      hydrated: true,
    });
  },
}));
