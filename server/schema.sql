-- Aura Learn local schema (node:sqlite). Single-user, no auth.
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---- Core content hierarchy: Course > Subject > Unit ----
CREATE TABLE IF NOT EXISTS courses (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  objectives TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS subjects (
  id         TEXT PRIMARY KEY,
  course_id  TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS units (
  id         TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS explanations (
  id            TEXT PRIMARY KEY,
  unit_id       TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  prompt        TEXT NOT NULL,
  content       TEXT NOT NULL,
  citations_json TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Cached "explain this selection" results — one per (explanation, term) so a
-- previously asked term is shown instantly without another LLM call.
CREATE TABLE IF NOT EXISTS term_explanations (
  id             TEXT PRIMARY KEY,
  explanation_id TEXT NOT NULL REFERENCES explanations(id) ON DELETE CASCADE,
  term           TEXT NOT NULL,
  content        TEXT NOT NULL,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_term_explanations_unique ON term_explanations(explanation_id, term COLLATE NOCASE);

-- Cached "illustrate this term" results (Wikimedia lookup) — one per
-- (explanation, term), same caching idiom as term_explanations. The image is
-- downloaded to disk (file_path) rather than hotlinked, keeping the app fully
-- self-hosted; page_url/attribution/license are shown next to it (CC compliance).
CREATE TABLE IF NOT EXISTS term_images (
  id             TEXT PRIMARY KEY,
  explanation_id TEXT NOT NULL REFERENCES explanations(id) ON DELETE CASCADE,
  term           TEXT NOT NULL,
  file_path      TEXT NOT NULL,
  page_url       TEXT,
  attribution    TEXT,
  license        TEXT,
  caption        TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_term_images_unique ON term_images(explanation_id, term COLLATE NOCASE);

-- User-authored notes attached to an explanation. Shown as chips at the end of
-- the explanation; optionally anchored to a selected text fragment and tagged
-- with a quick label. embedding_json is filled in lazily (after create/edit) so
-- the chat RAG pipeline can cite notes the same way it cites sources/explanations.
CREATE TABLE IF NOT EXISTS notes (
  id             TEXT PRIMARY KEY,
  explanation_id TEXT NOT NULL REFERENCES explanations(id) ON DELETE CASCADE,
  content        TEXT NOT NULL,
  anchor_text    TEXT,
  label          TEXT,
  embedding_json TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS exams (
  id            TEXT PRIMARY KEY,
  unit_id       TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  questions_json TEXT NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS submissions (
  unit_id       TEXT PRIMARY KEY REFERENCES units(id) ON DELETE CASCADE,
  answers_json  TEXT NOT NULL,
  score         INTEGER NOT NULL,
  feedback_json TEXT,
  submitted_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---- Multi-provider LLM servers ----
CREATE TABLE IF NOT EXISTS servers (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('openai','gemini')),
  base_url        TEXT NOT NULL,
  api_key         TEXT,
  model           TEXT,
  multimodal_model TEXT,
  embedding_model TEXT,
  is_active       INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---- Client UI preferences (language, speech opt-in, onboarding flag) — the server
-- is the source of truth instead of browser localStorage. Key-value on purpose: this
-- is a handful of small scalar prefs, not a modeled entity. ----
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ---- Speech-to-text providers (B1 teach-back) — single local Whisper backend today ----
CREATE TABLE IF NOT EXISTS stt_providers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('whisper')),
  base_url   TEXT NOT NULL,
  api_key    TEXT,
  is_active  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---- Text-to-speech providers (audio narration for explanations/study guides) —
-- single local Chatterbox backend today ----
CREATE TABLE IF NOT EXISTS tts_providers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('chatterbox')),
  base_url   TEXT NOT NULL,
  api_key    TEXT,
  is_active  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---- Roadmap feature tables (created now, populated by later phases) ----
CREATE TABLE IF NOT EXISTS sources (
  id         TEXT PRIMARY KEY,
  unit_id    TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  mime       TEXT,
  text       TEXT NOT NULL,
  file_path  TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS chunks (
  id            TEXT PRIMARY KEY,
  source_id     TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  ord           INTEGER NOT NULL,
  text          TEXT NOT NULL,
  embedding_json TEXT
);

-- Chunked + embedded explanation content, so chat (RAG) can retrieve and cite
-- a unit's own explanations alongside manually added sources.
CREATE TABLE IF NOT EXISTS explanation_chunks (
  id             TEXT PRIMARY KEY,
  explanation_id TEXT NOT NULL REFERENCES explanations(id) ON DELETE CASCADE,
  ord            INTEGER NOT NULL,
  text           TEXT NOT NULL,
  embedding_json TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id            TEXT PRIMARY KEY,
  unit_id       TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,
  content       TEXT NOT NULL,
  citations_json TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS flashcards (
  id       TEXT PRIMARY KEY,
  unit_id  TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  front    TEXT NOT NULL,
  back     TEXT NOT NULL,
  due_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  interval INTEGER NOT NULL DEFAULT 0,
  ease     REAL NOT NULL DEFAULT 2.5,
  reps     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audio (
  id         TEXT PRIMARY KEY,
  unit_id    TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  script     TEXT,
  file_path  TEXT,
  provider   TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---- R3: generated study materials (study guides, mind maps, infographics) ----
CREATE TABLE IF NOT EXISTS artifacts (
  id         TEXT PRIMARY KEY,
  unit_id    TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('study_guide','mindmap','infographic','diagram')),
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---- LLM call log (model benchmarking across providers) ----
CREATE TABLE IF NOT EXISTS llm_log (
  id         TEXT PRIMARY KEY,
  model      TEXT NOT NULL,
  task       TEXT NOT NULL DEFAULT 'json',
  attempts   INTEGER NOT NULL DEFAULT 1,
  ok         INTEGER NOT NULL DEFAULT 1,  -- 1 success / 0 failure
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---- Multi-exam results (one result per exam, keyed by exam_id) ----
CREATE TABLE IF NOT EXISTS exam_results (
  id                    TEXT PRIMARY KEY,
  exam_id               TEXT NOT NULL UNIQUE REFERENCES exams(id) ON DELETE CASCADE,
  unit_id               TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  answers_json          TEXT NOT NULL DEFAULT '{}',
  score                 INTEGER NOT NULL DEFAULT 0,
  feedback_json         TEXT,
  written_feedback_json TEXT,
  written_score         REAL,
  total_score           REAL,
  submitted_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---- Folder ingest: staging area for a course built from a documentation folder.
-- Holds the extracted text of every file so the corpus can be re-planned without
-- re-uploading. Cascades away with the course.
CREATE TABLE IF NOT EXISTS ingest_docs (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  filename    TEXT NOT NULL,
  mime        TEXT,
  kind        TEXT NOT NULL DEFAULT 'text',      -- text | image
  text        TEXT NOT NULL DEFAULT '',
  digest_json TEXT,                              -- {title, summary, topics[], terms[]}
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | digested | failed
  error       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_ingest_docs_course ON ingest_docs(course_id, status);
