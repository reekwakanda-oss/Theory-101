// Rank tiers for skill drills (idea #3).
//
// Advancement needs BOTH accuracy and speed - "quicker at identifying more
// complex material" is the whole point. Difficulty scales with rank, so a
// Diamond interval drill is drawing from a harder pool than a Bronze one.

export const RANKS = [
  { id: 'iron', label: 'Iron', streak: 0, maxMedian: Infinity, difficulty: 1 },
  { id: 'bronze', label: 'Bronze', streak: 5, maxMedian: Infinity, difficulty: 1 },
  { id: 'silver', label: 'Silver', streak: 10, maxMedian: 6.0, difficulty: 2 },
  { id: 'gold', label: 'Gold', streak: 15, maxMedian: 4.5, difficulty: 2 },
  { id: 'platinum', label: 'Platinum', streak: 20, maxMedian: 3.0, difficulty: 3 },
  { id: 'diamond', label: 'Diamond', streak: 25, maxMedian: 2.0, difficulty: 3 },
];

/** Recent answer times define current speed; older ones shouldn't hold you back. */
const SPEED_WINDOW = 10;

export function medianTime(times) {
  const recent = times.slice(-SPEED_WINDOW);
  if (recent.length === 0) return Infinity;
  const sorted = [...recent].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Highest rank index earned by a best-streak and answer-time history.
 * Speed is only judged once enough answers exist to be meaningful.
 */
export function rankFor(bestStreak, times) {
  const median = medianTime(times);
  const enoughSamples = times.slice(-SPEED_WINDOW).length >= 5;

  let earned = 0;
  for (let i = 1; i < RANKS.length; i++) {
    const rank = RANKS[i];
    const fastEnough = rank.maxMedian === Infinity || (enoughSamples && median <= rank.maxMedian);
    if (bestStreak >= rank.streak && fastEnough) earned = i;
    else break;
  }
  return earned;
}

export function rankAt(index) {
  return RANKS[Math.max(0, Math.min(index, RANKS.length - 1))];
}

/** What the learner still needs for the next tier - shown on every drill tile. */
export function nextRankHint(bestStreak, times) {
  const current = rankFor(bestStreak, times);
  if (current >= RANKS.length - 1) return null;

  const next = RANKS[current + 1];
  const median = medianTime(times);
  const needs = [];

  if (bestStreak < next.streak) needs.push(`${next.streak} in a row`);
  if (next.maxMedian !== Infinity && !(median <= next.maxMedian)) {
    needs.push(`answers under ${next.maxMedian.toFixed(1)}s`);
  }
  if (needs.length === 0) needs.push('one more correct run');

  return { label: next.label, needs };
}

/** Difficulty tier the question generators should draw from. */
export function difficultyFor(rankIndex) {
  return rankAt(rankIndex).difficulty;
}
