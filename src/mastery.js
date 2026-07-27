// Mastery gating and spaced review.
//
// Two council blind spots are addressed here:
//  - "Till perfection" had no visible finish line  -> STREAK_TARGET, always shown.
//  - Mastery was forward-only, with no forgetting model -> REVIEW_DAYS.
//
// STREAK_TARGET is deliberately a single constant so the whole gating model can
// be swapped for a confidence-weighted one without touching any view code.

import { update, conceptState, drillState } from './storage.js';
import { rankFor } from './ranks.js';

export const STREAK_TARGET = 5;

/** Hints appear before the learner is stuck, not after they've given up. */
export const HINT_AFTER_WRONG = 2;
export const REOPEN_SLIDE_AFTER_WRONG = 3;

/** Spaced review schedule in days. Mastery decays; the dashboard surfaces what's due. */
export const REVIEW_DAYS = [1, 3, 7, 21];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Record an answer against an intro concept.
 * Returns { mastered, streak, justMastered }.
 */
export function recordConceptAnswer(id, correct) {
  let result;
  update((state) => {
    const concept = conceptState(id);
    concept.attempts += 1;

    if (correct) {
      concept.correct += 1;
      concept.streak += 1;
      concept.best = Math.max(concept.best, concept.streak);
    } else {
      concept.streak = 0;
    }

    const wasMastered = concept.masteredAt !== null;
    const nowMastered = concept.streak >= STREAK_TARGET;

    if (nowMastered && !wasMastered) {
      concept.masteredAt = Date.now();
      concept.reviewStage = 0;
      concept.dueAt = Date.now() + REVIEW_DAYS[0] * DAY_MS;
    }

    result = {
      mastered: concept.masteredAt !== null,
      justMastered: nowMastered && !wasMastered,
      streak: concept.streak,
    };
    state.concepts[id] = concept;
  });
  return result;
}

/** Advance a concept to the next review interval after a successful review. */
export function completeReview(id) {
  update((state) => {
    const concept = conceptState(id);
    concept.reviewStage = Math.min(concept.reviewStage + 1, REVIEW_DAYS.length - 1);
    concept.dueAt = Date.now() + REVIEW_DAYS[concept.reviewStage] * DAY_MS;
    concept.streak = 0;
    state.concepts[id] = concept;
  });
}

export function isMastered(id) {
  return conceptState(id).masteredAt !== null;
}

export function isDueForReview(id) {
  const concept = conceptState(id);
  return concept.masteredAt !== null && concept.dueAt !== null && Date.now() >= concept.dueAt;
}

export function dueConcepts(conceptIds) {
  return conceptIds.filter(isDueForReview);
}

/**
 * Record an answer against a skill drill. Tracks answer time for ranking.
 * Returns { rank, rankUp, streak }.
 */
export function recordDrillAnswer(id, correct, seconds) {
  let result;
  update((state) => {
    const drill = drillState(id);
    const before = drill.rank;

    drill.attempts += 1;
    if (correct) {
      drill.correct += 1;
      drill.streak += 1;
      drill.best = Math.max(drill.best, drill.streak);
      drill.times = [...drill.times, seconds].slice(-40);
    } else {
      drill.streak = 0;
    }

    drill.rank = rankFor(drill.best, drill.times);
    result = { rank: drill.rank, rankUp: drill.rank > before, streak: drill.streak };
    state.drills[id] = drill;
  });
  return result;
}
