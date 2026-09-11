// Unit tests for the citation-link plumbing (search + verification). Run with:
//   node --disable-warning=ExperimentalWarning --test server/services/llm/websearch.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchWeb, verifyUrl, verifyUrls } from './websearch.js';

test('searchWeb: no-ops when GOOGLE_CSE_API_KEY/CX are unset', async () => {
  delete process.env.GOOGLE_CSE_API_KEY;
  delete process.env.GOOGLE_CSE_CX;
  assert.deepEqual(await searchWeb('photosynthesis'), []);
});

test('searchWeb: maps CSE items into {url, title, snippet}', async () => {
  process.env.GOOGLE_CSE_API_KEY = 'key';
  process.env.GOOGLE_CSE_CX = 'cx';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ items: [{ link: 'https://example.com/a', title: 'A', snippet: 'about a' }] }),
  });
  try {
    const out = await searchWeb('photosynthesis');
    assert.deepEqual(out, [{ url: 'https://example.com/a', title: 'A', snippet: 'about a' }]);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_CSE_API_KEY;
    delete process.env.GOOGLE_CSE_CX;
  }
});

test('searchWeb: swallows fetch errors and returns []', async () => {
  process.env.GOOGLE_CSE_API_KEY = 'key';
  process.env.GOOGLE_CSE_CX = 'cx';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network down'); };
  try {
    assert.deepEqual(await searchWeb('x'), []);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_CSE_API_KEY;
    delete process.env.GOOGLE_CSE_CX;
  }
});

test('verifyUrl: true when HEAD resolves ok', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => ({ ok: opts.method === 'HEAD' });
  try {
    assert.equal(await verifyUrl('https://example.com'), true);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('verifyUrl: falls back to ranged GET when HEAD fails', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => ({ ok: opts.method === 'GET', status: opts.method === 'GET' ? 206 : 405 });
  try {
    assert.equal(await verifyUrl('https://example.com'), true);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('verifyUrl: false when both HEAD and GET fail', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  try {
    assert.equal(await verifyUrl('https://example.com/dead'), false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('verifyUrls: filters out dead links while preserving order', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: !url.includes('dead') });
  try {
    const out = await verifyUrls([
      { url: 'https://a.com/ok1' },
      { url: 'https://b.com/dead' },
      { url: 'https://c.com/ok2' },
    ]);
    assert.deepEqual(out.map((c) => c.url), ['https://a.com/ok1', 'https://c.com/ok2']);
  } finally {
    globalThis.fetch = realFetch;
  }
});
