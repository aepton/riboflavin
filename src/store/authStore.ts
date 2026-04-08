/**
 * Persistent auth & identity state.
 *
 * Credentials and the active username are stored in localStorage so
 * they survive page reloads.  The store also tracks every username
 * that has been used in this browser for the persona switcher.
 */
import { create } from "zustand";
import { initSpaces } from "./spacesClient";

const LS_ACCESS_KEY = "riboflavin:accessKey";
const LS_SECRET_KEY = "riboflavin:secretKey";
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
  accessKey: string | null;
  secretKey: string | null;
  username: string | null;
  knownUsers: string[];
  /** true once credentials + username have been set at least once */
  ready: boolean;
  /** true after hydrate() has run — prevents premature login prompts */
  hydrated: boolean;

  setCredentials: (accessKey: string, secretKey: string) => void;
  setUsername: (name: string) => void;
  /** Boot from localStorage — call once on app mount */
  hydrate: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  accessKey: null,
  secretKey: null,
  username: null,
  knownUsers: [],
  ready: false,
  hydrated: false,

  setCredentials: (accessKey, secretKey) => {
    localStorage.setItem(LS_ACCESS_KEY, accessKey);
    localStorage.setItem(LS_SECRET_KEY, secretKey);
    initSpaces(accessKey, secretKey);
    set({ accessKey, secretKey, ready: !!get().username });
  },

  setUsername: (name) => {
    localStorage.setItem(LS_USERNAME, name);
    const known = get().knownUsers;
    if (!known.includes(name)) {
      const next = [...known, name];
      localStorage.setItem(LS_KNOWN_USERS, JSON.stringify(next));
      set({ username: name, knownUsers: next, ready: !!get().accessKey });
    } else {
      set({ username: name, ready: !!get().accessKey });
    }
  },

  hydrate: () => {
    const accessKey = localStorage.getItem(LS_ACCESS_KEY);
    const secretKey = localStorage.getItem(LS_SECRET_KEY);
    const username = localStorage.getItem(LS_USERNAME);
    const knownUsers = readKnownUsers();

    if (accessKey && secretKey) initSpaces(accessKey, secretKey);

    set({
      accessKey,
      secretKey,
      username,
      knownUsers,
      ready: !!(accessKey && secretKey && username),
      hydrated: true,
    });
  },
}));
