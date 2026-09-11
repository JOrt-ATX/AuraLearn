// Unit tests for the SM-2 scheduler. Run with:
//   node --test server/services/srs.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { review } from './srs.js';

const now = () => Math.floor(Date.now() / 1000);
const DAY = 86400;
const fresh = { ease: 2.5, interval: 0, reps: 0 };

test('first "good" review: reps 0→1, interval 1 day', () => {
  const r = review(fresh, 'good');
  assert.equal(r.reps, 1);
  assert.equal(r.interval, 1);
  assert.equal(r.ease, 2.5); // good (q=4) leaves ease unchanged
  assert.ok(Math.abs(r.dueAt - (now() + DAY)) <= 2);
});

test('second "good" review: interval 1→6 days', () => {
  const r = review({ ease: 2.5, interval: 1, reps: 1 }, 'good');
  assert.equal(r.reps, 2);
  assert.equal(r.interval, 6);
});

test('third "good" review: interval = round(prev * ease)', () => {
  const r = review({ ease: 2.5, interval: 6, reps: 2 }, 'good');
  assert.equal(r.interval, 15); // round(6 * 2.5)
  assert.equal(r.reps, 3);
});

test('"again" resets reps + interval and is due immediately', () => {
  const r = review({ ease: 2.5, interval: 15, reps: 3 }, 'again');
  assert.equal(r.reps, 0);
  assert.equal(r.interval, 0);
  assert.ok(Math.abs(r.dueAt - now()) <= 2);
  assert.ok(r.ease < 2.5, 'again lowers ease');
});

test('"easy" raises ease, "hard" lowers it', () => {
  assert.ok(review(fresh, 'easy').ease > 2.5);
  assert.ok(review(fresh, 'hard').ease < 2.5);
});

test('ease never drops below 1.3', () => {
  let card = { ease: 1.3, interval: 5, reps: 4 };
  for (let i = 0; i < 10; i++) card = { ...card, ...review(card, 'again') };
  assert.ok(card.ease >= 1.3);
});

test('invalid grade throws', () => {
  assert.throws(() => review(fresh, 'sometimes'));
});
