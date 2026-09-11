// Client UI preferences (language, speech opt-in, onboarding flag), persisted
// server-side in SQLite instead of browser localStorage — the server stays the
// single source of truth for state, same as everything else in this app.
import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

router.put('/settings', (req, res) => {
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  for (const [key, value] of Object.entries(req.body || {})) upsert.run(key, String(value));
  res.json({ ok: true });
});

export default router;
