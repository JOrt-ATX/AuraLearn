import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Local data dir holds the SQLite file (portable, backup-able) and generated audio.
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

const dbPath = process.env.DB_PATH || join(DATA_DIR, 'aura.db');
export const db = new DatabaseSync(dbPath);

// Apply schema (idempotent — all CREATE TABLE IF NOT EXISTS).
db.exec(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));

// Lightweight migrations for columns added after a DB already existed.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('servers', 'multimodal_model', 'multimodal_model TEXT');
ensureColumn('sources', 'file_path', 'file_path TEXT');
ensureColumn('submissions', 'written_feedback_json', 'written_feedback_json TEXT');
ensureColumn('submissions', 'written_score', 'written_score REAL');
ensureColumn('submissions', 'total_score', 'total_score REAL');
ensureColumn('explanations', 'citations_json', 'citations_json TEXT');
ensureColumn('courses', 'objectives', 'objectives TEXT');
ensureColumn('audio', 'explanation_ids', 'explanation_ids TEXT');
ensureColumn('audio', 'transcript', 'transcript TEXT');
ensureColumn('audio', 'score', 'score REAL');
ensureColumn('audio', 'feedback_json', 'feedback_json TEXT');
ensureColumn('audio', 'stt_provider', 'stt_provider TEXT');
ensureColumn('audio', 'source_type', 'source_type TEXT');
ensureColumn('audio', 'source_id', 'source_id TEXT');
ensureColumn('term_images', 'caption', 'caption TEXT');

// One-time migrations: widen artifacts.kind CHECK to allow new kinds (SQLite
// can't ALTER a CHECK constraint, so rebuild the table when it predates one).
function ensureArtifactKind(kind, allKinds) {
  try {
    const tbl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='artifacts'").get();
    if (tbl && !tbl.sql.includes(kind)) {
      const kindList = allKinds.map((k) => `'${k}'`).join(',');
      db.exec(`
        ALTER TABLE artifacts RENAME TO artifacts_old;
        CREATE TABLE artifacts (
          id         TEXT PRIMARY KEY,
          unit_id    TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
          kind       TEXT NOT NULL CHECK (kind IN (${kindList})),
          title      TEXT NOT NULL,
          content    TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        INSERT INTO artifacts SELECT * FROM artifacts_old;
        DROP TABLE artifacts_old;
      `);
    }
  } catch (_) { /* no artifacts table yet, or already migrated */ }
}
ensureArtifactKind('infographic', ['study_guide', 'mindmap', 'infographic']);
ensureArtifactKind('diagram', ['study_guide', 'mindmap', 'infographic', 'diagram']);

// One-time migration: copy existing single-exam submissions into exam_results.
try {
  const oldSubs = db.prepare(`
    SELECT s.*, e.id AS exam_id
    FROM submissions s
    JOIN exams e ON e.unit_id = s.unit_id
  `).all();
  for (const sub of oldSubs) {
    const already = db.prepare('SELECT id FROM exam_results WHERE exam_id = ?').get(sub.exam_id);
    if (already) continue;
    db.prepare(`INSERT INTO exam_results
      (id, exam_id, unit_id, answers_json, score, feedback_json, written_feedback_json, written_score, total_score, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      globalThis.crypto.randomUUID(), sub.exam_id, sub.unit_id,
      sub.answers_json || '{}', sub.score || 0, sub.feedback_json,
      sub.written_feedback_json, sub.written_score, sub.total_score,
      sub.submitted_at || Math.floor(Date.now() / 1000)
    );
  }
} catch (_) { /* no old data or already migrated */ }

export const DATA_PATH = DATA_DIR;
export const uid = () => globalThis.crypto.randomUUID();
