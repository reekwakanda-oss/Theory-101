// Progress persistence.
//
// localStorage is the working copy and stays authoritative for the running
// app, so every read here is synchronous and the whole app keeps functioning
// with no server, no account and no network. When someone is signed in,
// src/sync.js mirrors this to their account in the background.

const KEY = 'theory101.progress.v1';

const EMPTY = {
  onboarded: false,
  proficiency: null, // 'beginner' | 'some' | 'confident'
  focus: [], // subset of 'reading' | 'ear' | 'scales' | 'chords'
  introIndex: 0, // how far through the intro slides
  introDone: false,
  concepts: {}, // id -> { streak, best, attempts, correct, masteredAt, reviewStage, dueAt }
  drills: {}, // id -> { rank, streak, best, attempts, correct, times: [] }
};

let cache = null;

/** Notified after every write, so the sync layer can mirror it to the account. */
const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...structuredClone(EMPTY), ...JSON.parse(raw) } : structuredClone(EMPTY);
  } catch {
    cache = structuredClone(EMPTY);
  }
  return cache;
}

export function save(next) {
  cache = next ?? cache;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Private browsing or quota exhausted. Progress stays in memory for the session.
  }
  for (const fn of listeners) fn(cache);
  return cache;
}

/**
 * Install a whole record, used after merging an account's progress in.
 * Deliberately does not notify listeners: the sync layer is the only caller,
 * and it would otherwise immediately push back what it just pulled.
 */
export function replaceAll(state) {
  cache = { ...structuredClone(EMPTY), ...state };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  return cache;
}

/** Read-modify-write helper. */
export function update(fn) {
  const state = load();
  fn(state);
  return save(state);
}

export function reset() {
  cache = structuredClone(EMPTY);
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return cache;
}

export function conceptState(id) {
  const state = load();
  if (!state.concepts[id]) {
    state.concepts[id] = {
      streak: 0,
      best: 0,
      attempts: 0,
      correct: 0,
      masteredAt: null,
      reviewStage: 0,
      dueAt: null,
    };
  }
  return state.concepts[id];
}

export function drillState(id) {
  const state = load();
  if (!state.drills[id]) {
    state.drills[id] = { rank: 0, streak: 0, best: 0, attempts: 0, correct: 0, times: [] };
  }
  return state.drills[id];
}
