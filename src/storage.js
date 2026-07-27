// Progress persistence. localStorage only - no accounts, no backend in v1.

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
