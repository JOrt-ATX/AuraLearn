import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import './db.js'; // initializes SQLite + schema on import
import { migrateProviderSecrets } from './services/crypto.js';
import contentRouter from './routes/content.js';
import serversRouter from './routes/servers.js';
import llmRouter from './routes/llm.js';
import sourcesRouter from './routes/sources.js';
import chatRouter from './routes/chat.js';
import flashcardsRouter from './routes/flashcards.js';
import studyRouter from './routes/study.js';
import termsRouter from './routes/terms.js';
import termImagesRouter from './routes/termImages.js';
import notesRouter from './routes/notes.js';
import exportRouter from './routes/export.js';
import importRouter from './routes/import.js';
import sttProvidersRouter from './routes/sttProviders.js';
import ttsProvidersRouter from './routes/ttsProviders.js';
import settingsRouter from './routes/settings.js';
import teachbackRouter from './routes/teachback.js';
import audioRouter from './routes/audio.js';
import ingestRouter from './routes/ingest.js';
import { backfillExplanationIndex, backfillNoteIndex } from './services/rag.js';

migrateProviderSecrets(); // one-time, idempotent: encrypts any pre-existing plaintext api_key values

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '25mb' })); // explanations / pasted context can be large

// API
app.use('/api/servers', serversRouter);
app.use('/api/llm', llmRouter);
app.use('/api/stt-providers', sttProvidersRouter);
app.use('/api/tts-providers', ttsProvidersRouter);
// Feature routers share the /api base with content; mount them first so their
// specific routes (e.g. /units/:id/sources) resolve before the content router.
app.use('/api', settingsRouter);
app.use('/api', sourcesRouter);
app.use('/api', chatRouter);
app.use('/api', flashcardsRouter);
app.use('/api', studyRouter);
app.use('/api', termsRouter);
app.use('/api', termImagesRouter);
app.use('/api', notesRouter);
app.use('/api', exportRouter);
app.use('/api', importRouter);
app.use('/api', teachbackRouter);
app.use('/api', audioRouter);
app.use('/api', ingestRouter);
app.use('/api', contentRouter);

// Static vanilla frontend + SPA fallback
const publicDir = join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(join(publicDir, 'index.html')));

const PORT = process.env.PORT || 8787;
// Loopback-only by default: this app has no auth, so it must not be reachable
// from the network. Set HOST to override (e.g. for an intentional LAN setup).
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`Aura Learn → http://localhost:${PORT}`);
  // Fire-and-forget: index any explanation/note that predates chat-RAG coverage
  // (or arrived via zip import, which doesn't compute embeddings).
  backfillExplanationIndex().catch((e) => console.error('[rag] backfill error:', e.message));
  backfillNoteIndex().catch((e) => console.error('[rag] backfill error:', e.message));
});
