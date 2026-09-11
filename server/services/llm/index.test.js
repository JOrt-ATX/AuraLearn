// Unit tests for the pure LLM-facade helpers (no network calls). Run with:
//   node --disable-warning=ExperimentalWarning --test server/services/llm/index.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { echoForRepair } from './index.js';

test('echoForRepair: passes short responses through unchanged', () => {
  assert.equal(echoForRepair('{"ok":true}'), '{"ok":true}');
});

test('echoForRepair: truncates a runaway response instead of echoing it whole', () => {
  const huge = 'x'.repeat(50_000); // e.g. a reasoning model's unfiltered <think> trace
  const echoed = echoForRepair(huge);
  assert.ok(echoed.length < huge.length, 'must be shorter than the original');
  assert.ok(echoed.length < 6100, 'must stay close to the cap regardless of input size');
  assert.match(echoed, /truncated/);
});
