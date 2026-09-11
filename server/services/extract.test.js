// Unit tests for the pure HTML-parsing helpers. Run with:
//   node --disable-warning=ExperimentalWarning --test server/services/extract.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractOgImage } from './extract.js';

test('extractOgImage: reads an absolute og:image URL', () => {
  const html = '<head><meta property="og:image" content="https://example.com/pic.jpg"></head>';
  assert.equal(extractOgImage(html, 'https://example.com/article'), 'https://example.com/pic.jpg');
});

test('extractOgImage: resolves a relative og:image against the page URL', () => {
  const html = '<head><meta property="og:image" content="/static/pic.jpg"></head>';
  assert.equal(extractOgImage(html, 'https://example.com/article'), 'https://example.com/static/pic.jpg');
});

test('extractOgImage: falls back to twitter:image when og:image is absent', () => {
  const html = '<head><meta name="twitter:image" content="https://example.com/tw.jpg"></head>';
  assert.equal(extractOgImage(html, 'https://example.com/article'), 'https://example.com/tw.jpg');
});

test('extractOgImage: returns null when no image meta tags exist', () => {
  const html = '<head><title>No image here</title></head>';
  assert.equal(extractOgImage(html, 'https://example.com/article'), null);
});
