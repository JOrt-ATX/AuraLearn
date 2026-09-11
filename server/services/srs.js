// Spaced repetition scheduling (SM-2 / SuperMemo 2). Given a card's current
// scheduling state and a review grade, returns the next { ease, interval, reps,
// dueAt }. Intervals are in days; due_at is a unix epoch (seconds).
//
// Grade → quality (q) mapping (Anki-style four buttons):
//   again = 0 (lapse), hard = 3, good = 4, easy = 5.  q < 3 is a failure.
const QUALITY = { again: 0, hard: 3, good: 4, easy: 5 };
export const GRADES = ['again', 'hard', 'good', 'easy'];

const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

export function review(card, grade) {
  const q = QUALITY[grade];
  if (q == null) throw new Error(`Invalid grade: ${grade}`);

  let ease = typeof card.ease === 'number' ? card.ease : 2.5;
  let interval = typeof card.interval === 'number' ? card.interval : 0;
  let reps = typeof card.reps === 'number' ? card.reps : 0;

  // SM-2 ease-factor update, floored at 1.3.
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  if (q < 3) {
    // Lapse: relearn from the start; card becomes due again immediately.
    reps = 0;
    interval = 0;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    reps += 1;
  }

  return { ease: Number(ease.toFixed(4)), interval, reps, dueAt: nowSec() + interval * DAY };
}
