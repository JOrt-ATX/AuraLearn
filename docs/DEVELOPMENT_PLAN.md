# Aura Learn — Development Plan (roadmap kickoff)

> **Purpose.** This is a self-contained handoff so a fresh session can implement the
> NotebookLM-style roadmap without re-deriving context. Read §1–§4 first, then pick a
> feature from §5 and follow its sub-plan. The app already runs and the core is done.

---

## 1. What Aura Learn is — current state (DONE)

A **self-hosted, single-user** study app. Create **Courses → Subjects → Units**; generate
explanations and exams with **your own** LLM servers; everything stored in a **local SQLite
file**. No cloud, no auth, no data leaves the machine. Ported from a Google AI Studio export
(React + Firebase + bundled Gemini).

Already implemented and verified:
- **Backend:** Node + Express + built-in `node:sqlite` (`data/aura.db`). Serves `/public` + `/api`.
- **Vanilla frontend:** no framework, **no build step**. Tailwind + `marked` via CDN.
- **Multi-provider LLM:** OpenAI-compatible (Ollama/LM Studio/vLLM/OpenRouter/OpenAI/Groq…) **+ native Gemini**, behind a provider facade. **API keys live only on the backend.**
- **Server manager** (Settings): add/edit/activate/test servers; **"Load models"** populates 3 pickers — **generative / multimodal / embedding** (multimodal reserved for future image analysis).
- **Content:** Course/Subject/Unit CRUD + delete (FK cascade).
- **Explanations:** generate from Simple prompt / pasted Text / PDF; **accordion** view; per-item **edit / regenerate / delete** (delete & regenerate confirm first).
- **Exams:** AI-generated 10-question MCQ (JSON), take/score, AI feedback per wrong answer, retake.
- **i18n:** interface en/es/fr/de; separate "AI content language" setting.

Not started → this document: **R1 RAG, R2 Flashcards+SRS, R3 Mind maps/Study guides, R4 Audio+TTS (Chatterbox plugin).**

---

## 2. Architecture & stack

```
Browser (vanilla ES modules, Tailwind CDN)
        │  fetch /api/*
        ▼
Express  ──►  node:sqlite (data/aura.db)
        ├─ LLM facade  ──► OpenAI-compatible  | Gemini   (keys server-side)
        └─ (R4) TTS facade ──► Edge | ElevenLabs | Chatterbox(local)
```

**Run:** Node 22+ required. `npm install` then `npm run dev` (watch) or `npm start` → http://localhost:8787.
Env overrides: `PORT`, `DB_PATH`, `DATA_DIR`.

**File map (active app):**
```
server/
  index.js              boots Express, mounts routers, serves /public
  db.js                 node:sqlite connection, applies schema.sql, ensureColumn() migrations, uid()
  schema.sql            all tables (see §4)
  routes/
    content.js          /api/tree, courses/subjects/units CRUD, explanations create/update/delete, exam, submission
    servers.js          /api/servers CRUD + /activate + /test + POST /models (list models)
    llm.js              /api/llm/generate, /json, /embed
  services/llm/
    index.js            facade: generate(), generateJSON(), embed(), listModels(), testServer(), getActiveServer(), getActiveProfile()
    openai.js           OpenAI-compatible adapter (chat, embed, listModels); temperature param; response_format fallback on 400
    gemini.js           Gemini REST adapter (chat, embed, listModels); temperature param
    json.js             parseLooseJSON() — strips <think> blocks, ```json fences, trailing commas
    profiles.js         model behaviour profiles: noThink, systemRole, jsonMode, temperature, maxInputChars
    prompts.js          centralised prompt templates: examPrompt, gradeWrittenPrompt, flashcardsPrompt, studyGuidePrompt, mindmapPrompt, chatSystem
public/
  index.html            Tailwind CDN + importmap (marked)
  css/styles.css        scrollbar, fade-in, .prose-invert markdown styles
  js/
    app.js              orchestrator: render(), event delegation, all handlers + AI flows
    state.js            observable state, setState/setUnit/emit/subscribe, defaultUnitState()
    api.js              fetch wrapper over /api
    selectors.js        selectedCourse/Subject/Unit
    ui.js               escapeHtml(), renderMarkdown() (marked)
    i18n.js             translations + t()
    icons.js            inline SVG: icon(name, classes)
    views/
      dashboard.js      sidebar, header, grid, spinner
      unitView.js       tabs + explanations accordion + generator + exam; exports canGenerate()
      modals.js         create modals, settings (lang + server manager), server form, explanation-edit
```

---

## 3. Conventions & patterns — READ before coding

**Frontend is render-on-state-change with event delegation. No framework.**
- `state.js` holds everything. Mutate, then `emit()` (or `setState`/`setUnit`) → `render()` rebuilds `#app.innerHTML` from view functions that return **HTML strings**.
- **No per-keystroke re-render** (would lose focus). Text inputs are read on action via `captureInputs()`, or synced live via the `input` listener (`onInput`) which updates state and toggles things **without** re-rendering (see Generate button).
- Interactivity = `data-action="..."` (+ `data-id`, `data-*`) attributes. Global listeners in `app.js` (`onClick/onChange/onInput/onSubmit`) dispatch via `e.target.closest('[data-action]')`.
- **Gotcha:** a clickable action must NOT be a `<button>` nested inside another `<button>` (invalid HTML). Put sibling action buttons next to the toggle button (see the explanations accordion header).
- Always `escapeHtml()` user/AI strings in templates; render markdown with `renderMarkdown()`.
- Transient per-unit view state lives in `state.unit` and is reset by `defaultUnitState()` on unit select. Top-level modal/editing state lives on `state` (e.g. `state.modal`, `state.editingExplanation`).

**To add a feature, the established recipe:**
1. **Schema:** add table(s) to `server/schema.sql`. For columns added to existing tables, also add an `ensureColumn()` line in `db.js` (idempotent migration for existing DBs).
2. **Service** (if logic-heavy) under `server/services/`.
3. **Route** under `server/routes/<name>.js`, then **mount it in `server/index.js`** (mount `/api/<specific>` routers before the catch-all `/api` content router).
4. **API client:** add methods to `public/js/api.js`.
5. **State:** add fields to `state.js` (transient → `defaultUnitState()`; global → top-level).
6. **View:** add render function(s) in `public/js/views/`; wire `data-action` handlers in `app.js`.
7. **Restart backend** after server changes (`npm start` has **no hot-reload**; `npm run dev` watches). Frontend changes are served fresh on browser reload (static).

**Provider model:** all AI calls resolve the **active** `servers` row server-side; the browser never sees keys. Reuse `generate({prompt|messages, system, json})`, `generateJSON` route, and `embed(texts)` from `services/llm`. JSON outputs: instruct the model to return JSON and parse with `parseLooseJSON()`.

**Conventions:** API JSON is **camelCase**, DB columns are **snake_case** (map in routes, see `toPublic()` in `servers.js`). IDs = `crypto.randomUUID()` (`uid()`), or client `globalThis.crypto.randomUUID()`. Timestamps = `unixepoch()` default.

**Operational gotchas observed:**
- `node:sqlite` prints an experimental warning → suppressed via `--disable-warning=ExperimentalWarning` in npm scripts.
- Stopping a background `npm start` can orphan the child `node` and hold port 8787 → `EADDRINUSE`. Before restarting, kill listeners on 8787 (by port / by `CommandLine like '*server*index.js*'`).
- When testing, **never wipe `data/aura.db`** — the user has real content. Use throwaway rows and delete them.

---

## 4. Data model (`server/schema.sql`)

**In use today:** `courses`, `subjects`, `units`, `explanations`, `exams`(questions_json), `submissions`,
`servers`(type openai|gemini, base_url, api_key, model, **multimodal_model**, embedding_model, is_active),
`artifacts`(kind study_guide|mindmap), `sources`, `chunks`, `chat_messages`, `flashcards`,
`exam_results`, `llm_log`(model, task, attempts, ok, latency_ms) — added in F4.

**Scaffolded but unused (for the roadmap):**
- `audio(id, unit_id, kind, script, file_path, provider, created_at)` — R4

**Tables to ADD during the roadmap:** `tts_providers` (R4) — see that section.

`getTree()` in `content.js` assembles the nested structure the frontend consumes; extend it (or add per-unit detail endpoints) as features add per-unit data.

---

## 5. Roadmap features

Build order: **R1 → R2 → R3 → R4** (each shippable independently). Confirmed with the user.

### R1 — Source-grounded chat (RAG)  ← start here

**Goal.** Attach multiple sources (PDF, pasted text, or a URL) to a unit; chat with answers
**grounded in and cited from** those sources.

**Prereq.** The active server must have an **embedding model** set (the server form already has the
`embeddingModel` field; `embed()` is implemented for both providers).

**Backend**
- `services/rag.js`:
  - `chunk(text)` → ~800-char chunks with ~100 overlap (split on paragraph/sentence boundaries).
  - `indexSource(sourceId, text)` → chunk → `embed(chunks)` → insert into `chunks` (`embedding_json = JSON.stringify(vector)`).
  - `retrieve(unitId, query, k=6)` → `embed([query])`, brute-force **cosine** over all chunks of the unit's sources, return top-k `{text, sourceId, score}`. (Brute force is fine at personal scale; swap to `sqlite-vec` later if needed.)
- `services/extract.js`:
  - PDF: extracted **client-side** (reuse existing `pdfjs` flow in `app.js handlePdf`) and POSTed as text — keeps the backend dependency-free. (Alternative: add `pdfjs-dist` to backend.)
  - URL: backend `fetch(url)` → strip tags to text (small regex/util; no heavy dep).
- `routes/sources.js` (mount at `/api`):
  - `POST /api/units/:unitId/sources` body `{filename?, mime?, text?}` or `{url}` → store `sources` row → `indexSource` → return source meta.
  - `GET /api/units/:unitId/sources` (list, no chunk text) · `DELETE /api/sources/:id` (cascade chunks).
- `routes/chat.js`:
  - `POST /api/units/:unitId/chat` body `{message}` → `retrieve()` → build prompt: system "Answer only from the sources; cite as [n]; say if unknown", context = numbered chunks, plus recent history → `generate()` → persist user+assistant `chat_messages` (assistant `citations_json` = chunk/source refs) → return `{answer, citations}`.
  - `GET /api/units/:unitId/chat` (history) · `DELETE` to clear.

**Frontend**
- New unit tab **"Sources & Chat"** in `unitView.js` (add to the tab bar + `state.unit.viewMode`).
- Sources panel: add (file → reuse PDF extraction; textarea; URL field), list with delete.
- Chat panel: message list (user/assistant bubbles, render markdown), citations as `[1]` chips that reveal the source snippet; input box + send.
- `state.unit`: `sources`, `chatMessages`, `chatInput`, `chatBusy`, `indexingSource`. Add `api.js` methods. Wire `data-action`s.

**Verify.** Add a source with a known fact → ask about it → answer cites the right chunk; ask something absent → model declines. Test embeddings against the active server first via a throwaway call.

**Notes / extensions.** Multimodal: for image-bearing PDFs/links, send page images to the **multimodal model** for description before chunking (uses the already-stored `multimodal_model`). Defer unless needed.

---

### R2 — Flashcards + spaced repetition (SM-2)

**Goal.** Auto-generate flashcards from a unit's explanations (and/or sources) and review them on an SM-2 schedule.

**Backend**
- `services/srs.js`: SM-2. `review(card, grade)` where grade∈{again,hard,good,easy} (map to q=0..5) → update `ease` (min 1.3), `interval`, `reps`, `due_at = now + interval*86400`.
- `routes/flashcards.js`:
  - `POST /api/units/:unitId/flashcards/generate` → gather unit explanations → `generateJSON` prompt → `{cards:[{front,back}]}` → insert.
  - `GET /api/units/:unitId/flashcards` (all) · `GET .../due` (due_at ≤ now).
  - `POST /api/flashcards/:id/review {grade}` → SM-2 update. `PUT`/`DELETE` for manual edits.

**Frontend**
- Unit tab **"Flashcards"**: Generate button; **Review mode** (show front → flip → grade buttons Again/Hard/Good/Easy); list/manage; "X due" badge.
- `state.unit`: `flashcards`, `review` (queue, current, flipped).

**Verify.** Generate cards; review one with "Good" → `due_at` advances and `reps`/`interval` update; "Again" resets interval.

---

### R3 — Mind maps & study guides

**Goal.** One-click structured **study guide** (markdown) and a visual **mind map** from unit content.

**Data.** Add `artifacts(id, unit_id, kind ['study_guide'|'mindmap'], title, content, created_at)` to `schema.sql` (store guide as markdown; mind map as a markdown outline / nested headings). Add `ensureColumn` not needed (new table).

**Backend**
- `routes/study.js`:
  - `POST /api/units/:unitId/study-guide` → `generate()` a structured guide from explanations/sources → save artifact.
  - `POST /api/units/:unitId/mindmap` → `generate()` a nested markdown outline (`#`/`##`/`-`) → save artifact.
  - `GET /api/units/:unitId/artifacts`, `DELETE /api/artifacts/:id`.

**Frontend**
- Unit tab **"Study"**: buttons to generate; study guide rendered via `renderMarkdown`; mind map rendered with **markmap** (CDN, e.g. `markmap-autoloader`) fed the outline markdown — keeps the no-build rule.
- `state.unit`: `artifacts`.

**Verify.** Generate guide → renders as markdown; generate mind map → markmap renders the outline.

---

### R4 — Audio overview + pluggable TTS (incl. local Chatterbox)

**Goal.** Generate a spoken **summary** or 2-host **podcast** of a unit. TTS is a **plugin layer**;
the user can run **Chatterbox locally** and activate it (no audio leaves the machine).

**Data.** Add `tts_providers(id, name, type ['edge'|'elevenlabs'|'openai'|'chatterbox'], base_url, api_key, voice, voice2, is_active, created_at)` to `schema.sql`. `audio` table already exists.

**Backend**
- `services/tts/index.js`: registry + `synthesize(text, {voice}) → {buffer, mime}` dispatch by **active** provider (mirror the LLM facade). `getActiveTtsProvider()`.
- Adapters: `edge.js` (Edge TTS — `msedge-tts` npm, no native, free, good default), `elevenlabs.js` (API + key), `openai.js` (OpenAI `/audio/speech`), **`chatterbox.js`** (POST text to a user-run Chatterbox HTTP endpoint; Chatterbox is a separate local Python service — the app only needs its URL). All registered/activated in Settings like LLM servers; **Chatterbox is opt-in / off by default**.
- `routes/tts.js`:
  - CRUD/activate/test for `tts_providers` (mirror `servers.js`, mask keys).
  - `POST /api/units/:unitId/audio {style:'summary'|'podcast'}` → `generate()` a narration (summary) or 2-speaker dialogue script from unit content → `synthesize()` (for podcast, alternate `voice`/`voice2`, concatenate) → save file under `data/audio/<id>.mp3` → insert `audio` row → return URL.
  - `GET /api/units/:unitId/audio`, serve files (static route for `data/audio`), `DELETE`.

**Frontend**
- Unit tab **"Audio"**: choose style + Generate; `<audio>` player; list/delete past audio; status while synthesizing.
- Settings: a **"TTS providers"** panel mirroring the server manager (add/activate/test; Chatterbox = type `chatterbox` + local URL).
- `state`: `ttsProviders`; `state.unit`: `audio`, `generatingAudio`.

**Verify.** Configure a cloud TTS (Edge) → generate summary → plays. Then run Chatterbox locally, register it, activate, regenerate → confirm the request hits only the local endpoint and audio plays.

---

## 6. Verification playbook (how this repo is tested)

No automated suite yet. Per change:
1. `node --check <file>` on every changed JS file (syntax).
2. **Backend live:** restart server, exercise endpoints with `curl` on a **throwaway** course/row, then delete it. Confirm `data/aura.db` persists across restarts.
3. **Frontend real-module test:** write a temporary `public/__test.html` that imports the **actual** modules (with the `marked` importmap), runs assertions into `#out`, then headless-dump:
   `chrome --headless=new --dump-dom http://localhost:8787/__test.html` → grep `PASS/FAIL`; delete the temp file.
4. Recommended to add: `node --test` units for `services/rag.js` (cosine/chunking) and `services/srs.js` (SM-2) — pure logic, highest risk.

---

## 7. Decisions already made (don't re-litigate)

- Vanilla frontend, **no build step**; local Node + `node:sqlite`; multi-provider with keys server-side. Single user, no auth/sharing.
- Feature order R1→R4. TTS is a pluggable layer; **Chatterbox** is an opt-in **local** plugin (register its URL like a provider).
- "Regenerate explanation" currently regenerates from the stored **title/prompt** only (original pasted text/PDF isn't stored). If faithful regeneration for text/PDF sources is wanted, store the source with the explanation — but R1 introduces a proper `sources` table that supersedes this.
- Confirmation dialogs are currently English `confirm()`s (matching the UI). Localizing them is optional.

## 8. Open questions to confirm at kickoff

- **Embeddings provider** for R1: which server/model (e.g. Ollama `nomic-embed-text`, OpenAI `text-embedding-3-small`, Gemini `text-embedding-004`)? Affects nothing structurally — just needs `embeddingModel` set on the active server.
- **R1 scope:** sources per **unit** (recommended) vs per subject/course.
- **R4 default TTS:** ship Edge TTS as the zero-key default? And confirm Chatterbox server shape (HTTP endpoint contract) the user will run.
- Localize confirmations / add a Spanish-first UI pass?

---

## 9. Cross-cutting UX & i18n features (U1–U3)

> Requested after R1–R3 shipped. These are **not** "R" feature verticals; they touch
> existing views. Build order **U1 → U2 → U3** (U2/U3 depend on U1's i18n layer).
> Status note: R1 (RAG), R2 (Flashcards+SRS), R3 (Study guides + mind maps) are **DONE**.

### U1 — Full UI internationalization (EN/ES/FR) + language-coupled AI output  ← start here

**Goal.** Every interface string is localized, and the **single language picker also drives
the AI output language** (pick ES → UI in Spanish **and** generations in Spanish).

**Decisions (made at request).**
- **Scope languages: EN / ES / FR** (the requested focus). **Drop DE** from the picker — it
  was only ~12 keys translated; better three complete languages than four half-done. A
  previously-stored `de` value falls back to `en`.
- **Merge the two settings.** Today `state.lang` (interface) and `state.aiLanguage` (AI
  content) are independent. Collapse to one: the picker sets `lang`, and `aiLanguage` is
  **derived** via `aiLangFor(code)` → `English|Spanish|French`. Keep the `state.aiLanguage`
  field so every existing AI call site (`app.js` generate/exam/feedback; chat/flashcards/
  study routes that receive `aiLanguage`) keeps working unchanged.

**Approach.**
- `public/js/i18n.js`: replace the small dict with a **complete key set** for `en/es/fr`;
  add interpolation `t(key, vars)` (`{name}` placeholders); add `aiLangFor(lang)`;
  `interfaceLangs = [[en,…],[es,…],[fr,…]]`; remove `aiLanguages`.
- `public/js/state.js`: guard stored `lang` to the supported set; init
  `aiLanguage = aiLangFor(lang)`; drop the `auralearn.aiLang` key.
- Replace **all hardcoded strings** with `t()` in `views/dashboard.js`, `views/unitView.js`,
  `views/flashcards.js`, `views/study.js`, `views/modals.js`. Localize the main
  `confirm()/alert()` messages in `app.js`.
- **Settings modal:** one **Language** `<select>` (EN/ES/FR); remove the AI-content-language
  select. On save: set `lang` **and** `aiLanguage = aiLangFor(lang)`, persist `lang`.
- Keep untranslated: brand ("Aura Learn"), SRS jargon shown as data (`reps`, `ease`),
  citation markers `[n]`, URL examples.

**Verify.** Switch language → every visible label changes and persists across reload;
generate an explanation/exam/flashcards → output language matches the picker.

### U2 — Contextual help modal

**Goal.** A **"?"** button (header) opens a modal explaining the **current page/tab**,
localized.

**Approach.**
- Help button in `renderHeader` (`data-action="open-modal" data-modal="help"`).
- Context resolved live in `renderModals`: no unit selected → `dashboard`; else
  `state.unit.viewMode` (`explanations|generator|sources|flashcards|study|exam`).
- Help content as i18n keys `help_<ctx>_title` + `help_<ctx>_body` (Markdown string rendered
  with `renderMarkdown`) for `en/es/fr`.
- Footer button "Show the workflow overview" → opens the U3 `welcome` modal.

**Verify.** Open help on each tab → correct contextual text; changes with language.

### U3 — Onboarding / workflow modal

**Goal.** First-run modal showing the hierarchy & workflow as **chips**:
`Course → Subject → Unit → { Explanations · Sources & Chat · Flashcards · Study · Exam }`.
Localized, dismissible, remembered, reopenable.

**Approach.**
- `welcome` modal in `modals.js`: chip rows (styled spans + arrow glyphs, **no SVG**) +
  a one-line caption per stage. "Get started" sets `localStorage['auralearn.welcomed']` and
  closes.
- Boot (`app.js init`): if `!localStorage['auralearn.welcomed']` → `setState({modal:'welcome'})`.
- Reopen via the U2 Help modal button (and it reads `t()` so it follows the language).

**Verify.** Fresh profile → modal appears; dismiss → not shown again; reopen from Help;
all chips/labels localized.

---

## 10. Quality & content improvements (Q1–Q4)

> Requested 2026-06-10. These are **enhancements** to existing features (explanations, sources,
> exam). Build order Q1 → Q2 → Q3 → Q4; Q3 depends on Q2 (shared sources model); Q4 is independent.
> Status: Q1 DONE · Q2 DONE · Q3 DONE · Q4 DONE (2026-06-10).

---

### Q1 — Markdown rendering for explanation content

**Goal.** Explanation text generated by LLMs is sometimes plain text, sometimes Markdown, and sometimes
HTML with color/style spans. Currently all three render as raw text (asterisks, `#`, etc. visible).
Fix it so Markdown is rendered into rich text, and colour spans pass through safely.

**Root cause.** In `views/unitView.js` the accordion body renders explanation content via
`escapeHtml(content)`, which strips all markup. The `renderMarkdown()` helper in `ui.js`
already calls `marked()` and exists for this purpose — it just isn't called for explanations.

**Backend** — no changes.

**Frontend**
- `public/js/ui.js`: extend `renderMarkdown(text)` to do a **safe HTML passthrough** before
  calling `marked`: detect `<span style="color:…">` (and similar inline styles output by some LLMs)
  and preserve them after marked processing. Strategy: run `marked(text)` as usual (which renders
  Markdown) then re-apply a safe whitelist on the resulting HTML — allow `<span style="color:…">`,
  `<b>`, `<i>`, `<u>`, `<mark>`, `<code>`, `<pre>`, `<h1>`–`<h6>`, `<ul>/<ol>/<li>`, `<p>`,
  `<blockquote>`, `<table>/<tr>/<th>/<td>`, `<a href>`. Strip `<script>`, event attributes, and
  any `style` property other than `color`.  Implementation: a small regex/DOM scrubber — **no
  external sanitize library needed** (no npm dep required; write ~30-line `sanitizeHtml(html)`
  in `ui.js`).
- `views/unitView.js`: wherever explanation `.content` is output, replace `escapeHtml(content)`
  with `renderMarkdown(content)`. Wrap the output in `<div class="prose-invert">` (already
  styled in `css/styles.css`) so headings, lists, code blocks get correct typography.
- `views/modals.js`: same change for the explanation-edit preview (if any).

**Verify.** Open an explanation that contains `**bold**`, `## Heading`, and a `<span style="color:blue">blue</span>` fragment → confirm they render visually (no raw asterisks); confirm a `<script>alert(1)</script>` in content is stripped.

---

### Q2 — Shared sources between content generator and Sources & Chat

**Goal.** Sources (pasted text, URL, uploaded PDF) should be **shared across the unit** — usable
both as RAG context for the Sources & Chat tab **and** as grounding context when generating
explanations. The user can select which sources to include for each generation call.
Original PDF files should be preserved in `data/sources/`.

**Design decisions.**
- Sources remain per-**unit** (as in R1). A source uploaded in either tab is visible in both.
- The generator (Explanations tab → Generate form) gets a **"Use sources"** section: a checklist
  of the unit's sources; if any are checked, their text is prepended to the generation prompt as
  context.
- PDF files are stored on disk at `data/sources/<sourceId>.pdf`; the `sources` table already has
  a `filename` and `mime` column — add a `file_path` column to track the stored file.
- Extraction stays **client-side** (reuse existing `pdfjs` flow), but the raw PDF bytes are
  also POSTed to `/api/units/:unitId/sources` as a `multipart/form-data` upload (alongside the
  extracted text) so the backend can persist the file.

**Backend**
- `server/schema.sql` + `db.js`: add `ensureColumn('sources', 'file_path', 'TEXT')`.
- `routes/sources.js` (already planned in R1): extend `POST /api/units/:unitId/sources` to accept
  `multipart/form-data` (use `busboy` — already in Node; no new npm dep). When `mime` is
  `application/pdf`, write the binary to `data/sources/<id>.pdf`, store path in `file_path`.
  Serve a download at `GET /api/sources/:id/file` (stream the stored file).
- Nothing changes in the RAG pipeline (`rag.js`); it already uses `sources.text`.

**Frontend**
- `views/unitView.js` — Generator form (existing "Generate explanation" UI):
  - Add a **"Ground in sources"** collapsible section below the input type selector.
  - Fetch and render the unit's sources as a checklist (`data-action="toggle-source"` per item).
  - State: `state.unit.selectedSourceIds = []` (add to `defaultUnitState()`).
  - When generating: if `selectedSourceIds.length > 0`, fetch those sources' text and prepend
    as a `## Context` block to the final prompt before calling `/api/llm/generate`.
- `views/unitView.js` — Sources & Chat tab:
  - The source list is already planned in R1. No structural change needed; uploading a source
    here becomes visible in the generator checklist immediately (sources reloaded on tab switch
    or after upload).
- `api.js`: adjust `createSource` to accept `FormData` for PDF uploads.

**Verify.** Upload a PDF in Sources & Chat; switch to Explanations generator → the PDF appears
in the "Ground in sources" checklist; check it → generate → prompt includes the PDF text;
confirm `data/sources/<id>.pdf` exists on disk.

---

### Q3 — Explanation-source selection for flashcards, study guide, and mind map

**Goal.** When generating flashcards, study guides, or mind maps, let the user **select which
explanations** to use as input (default: all). This enables focused artifacts from a subset of
unit content.

**Note:** This is "explanations as sources for artifacts" — different from Q2 (document sources
for generation grounding). The selector here is a list of the unit's existing **explanations**,
not uploaded documents.

**Backend**
- `routes/flashcards.js` — `POST /api/units/:unitId/flashcards/generate`: accept optional
  `{ explanationIds: string[] }` in body. If provided and non-empty, `SELECT` only those
  explanations; otherwise fall back to all explanations for the unit (current behaviour).
- `routes/study.js` — same: both `POST /api/units/:unitId/study-guide` and
  `POST /api/units/:unitId/mindmap` accept optional `{ explanationIds: string[] }`.

**Frontend**
- `views/flashcards.js` — Generate Flashcards section: add an **"Explanations to use"**
  multi-select checklist above the Generate button. Populate from `state.unit.explanations`
  (already loaded). State: `state.unit.flashcardExplanationIds = []` (empty = all).
  Pass `explanationIds` in the API call when non-empty.
- `views/study.js` — same pattern for both Study Guide and Mind Map generate buttons.
  State: `state.unit.studyExplanationIds = []`.
- Checklist UX: a compact list of explanation titles with checkboxes; a "Select all / None"
  toggle. When all are unchecked, treat as "use all" (do not send the field).

**Verify.** Unit with ≥ 3 explanations: check only 2 → generate flashcards → confirm the LLM
prompt only includes those 2 explanations' content; generate with none checked → all are used.

---

### Q4 — Enhanced exam: full-unit coverage + open-ended questions with LLM grading

**Goal.** The exam should (a) draw from **all** unit explanations (not a bare prompt), and
(b) include some **written-response questions** alongside the existing MCQ, with the LLM
grading the written answers at the end and returning an overall score + brief justification.

**Design decisions.**
- Ratio: ~60 % MCQ + ~40 % written (e.g. 6 MCQ + 4 written for a 10-question exam). Configurable
  via a `writtenCount` param (default 4) or leave it for the LLM to decide inside the prompt.
- Written questions are graded by the LLM **after** the student finishes all questions (not
  per-question during the exam). MCQ grading stays immediate (client-side, no change).
- `exams` table already stores `questions_json`; extend the question schema to support a
  `type` field: `"mcq"` (existing) or `"written"`. For `written`, `correctAnswer` holds the
  model answer / rubric used in the grading prompt; `options` is null.
- `submissions` table: add a `written_feedback_json` column (array of `{id, score, feedback}`)
  and `written_score` (0–100 weighted contribution). Also add `total_score`.
- No new tables required.

**Backend**
- `routes/content.js` — `POST /api/units/:unitId/exam`:
  - Gather **all** unit explanations; concatenate into a `## Unit content` block (truncate if
    very long — keep ~6 000 tokens; summarise oldest if needed).
  - Update the JSON prompt to request both MCQ and written questions:
    ```
    Return JSON: { questions: [ { id, type:'mcq'|'written', question, options?:[A-D],
    correctAnswer, explanation } ] }
    ```
  - `parseLooseJSON()` as before; persist to `exams` table; return to client.
- `routes/content.js` — new sub-route `POST /api/submissions/:submissionId/grade-written`:
  - Retrieve the submission + its exam + written questions.
  - Build a grading prompt: for each written question send `{question, modelAnswer, studentAnswer}`;
    instruct the LLM to return `{ gradedAnswers: [{id, score:0-10, feedback}], overallFeedback, totalScore:0-100 }`.
  - Parse with `parseLooseJSON()`; update `submissions` row with `written_feedback_json`,
    `written_score`, `total_score`; return the graded result.
- `db.js`: `ensureColumn('submissions', 'written_feedback_json', 'TEXT')`;
  `ensureColumn('submissions', 'written_score', 'REAL')`;
  `ensureColumn('submissions', 'total_score', 'REAL')`.

**Frontend**
- `views/unitView.js` — Exam tab / take-exam flow:
  - For `type:'mcq'` questions: existing radio-button UI, unchanged.
  - For `type:'written'` questions: render a `<textarea>` instead of radio buttons.
    State: extend `state.unit.examAnswers` to hold written text per question id.
  - **Submit exam** flow:
    1. Score MCQ immediately (client-side, as today).
    2. POST to `/api/submissions/:id/grade-written` with `{ writtenAnswers: {[id]: text} }`.
    3. Show a **"Grading your written answers…"** spinner while the LLM grades.
    4. Render the results page: MCQ score (existing) + written score + overall score; per written
       question show the student answer, LLM feedback, and per-question score; keep the existing
       per-MCQ-wrong-answer AI feedback.
  - Add `writtenGrading: false`, `writtenFeedback: null` to `defaultUnitState()`.

**Verify.** Generate exam → confirm mix of MCQ and written questions appear; answer all; submit →
spinner → results show both MCQ score and written-answer grading with feedback; overall total score displayed.

---

---

## 11. LLM robustness improvements (F1–F4) — DONE (2026-06-11)

> Four phases implemented to normalise behaviour across heterogeneous local and cloud models
> (qwen3:8b, qwen3:14b, gemma4:12b-it-qat, qwen3.6:27b, mistral-medium-latest).
> All changes are in `server/services/llm/` and the route files; no frontend changes required.

### F1 — Output robustness

**Problem:** Qwen3 emits `<think>...</think>` blocks before answering, breaking JSON parse.
Some models needed multiple manual retries to return well-formed JSON.

**Changes:**
- `json.js` — `parseLooseJSON()` now strips `<think>...</think>` blocks before any other processing.
- `index.js` — new `generateJSON({ prompt, system, validate, maxRetries=2, task })`:
  generates → parses with `parseLooseJSON` → runs optional validator → on failure sends a
  **repair prompt** (appends the bad response + error as a follow-up user turn, drops temperature
  to 0.1) and retries up to `maxRetries` times automatically.
- Validators added per task: `validateExam` (4 options, `correctAnswer` must match verbatim),
  `validateGrading` (scores 0–10), inline validator for flashcards (`cards` array non-empty).
- `content.js`, `flashcards.js`, `llm.js` routes migrated to `generateJSON`.

### F2 — Model profiles (input normalisation)

**Problem:** Each model has different behaviour around system role, `response_format`, temperature
defaults, and effective context size. A hardcoded 24 000-char content cap silently broke small models.

**Changes:**
- `profiles.js` (new) — table of three named profiles (`qwen3`, `gemma`, `mistral`) plus a
  `DEFAULT_PROFILE`. Fields: `noThink` (append `/no_think` to last user turn), `systemRole`
  (`native` | `merge` — merge system into first user message), `jsonMode` (`response_format` |
  `prompt-only`), `temperature`, `maxInputChars`.
- `index.js` — `applyProfile()` transforms messages before every call; `getActiveProfile()`
  exported for routes; `generate()` and `generateJSON()` apply profile and pass temperature.
- `openai.js` — if `response_format` triggers a 400, retries once without it (handles local
  models that claim but don't implement OpenAI JSON mode).
- `content.js`, `flashcards.js`, `study.js` — content caps replaced with `getActiveProfile().maxInputChars`.

### F3 — Centralised prompt templates

**Problem:** Prompt strings were inlined in five different route files, with format instructions
scattered throughout and the language directive at inconsistent positions.

**Changes:**
- `prompts.js` (new) — six functions returning `{ system, prompt }`:
  `examPrompt`, `gradeWrittenPrompt`, `flashcardsPrompt`, `studyGuidePrompt`, `mindmapPrompt`,
  `chatSystem`. Convention in every template: context/material first → task instructions →
  output schema or format → language directive last (small models follow the final instruction best).
  Role description in `system`; `applyProfile` merges it into user for models that need it.
- `content.js`, `flashcards.js`, `study.js`, `chat.js` — all inline prompt strings replaced
  with calls to the corresponding `prompts.js` function.

### F4 — Call logging (model benchmarking)

**Problem:** No data on which model succeeds reliably for which task; assessment was anecdotal.

**Changes:**
- `schema.sql` — new table `llm_log(id, model, task, attempts, ok, latency_ms, created_at)`.
- `index.js` — `logCall()` writes a row at the end of every `generateJSON` call (success or failure).
  `task` label (`exam` / `flashcards` / `grading` / `json`) passed by callers.
- `llm.js` — three new endpoints:
  - `GET /api/llm/log` — aggregated stats grouped by model + task: `success_pct`, `avg_attempts`, `avg_latency_ms`.
  - `GET /api/llm/log/recent` — last 200 raw rows for detailed inspection.
  - `DELETE /api/llm/log` — clears the log.

---

## 12. Bloom's taxonomy gap analysis & improvements (B1–B6)

> Requested 2026-06-26. A deliberate pass through **Bloom's revised taxonomy** (Remember →
> Understand → Apply → Analyze → Evaluate → Create) over the existing feature set, to find
> which cognitive levels Aura Learn actually exercises and where the highest-leverage additions
> are. Triggered by the user's own idea — record yourself explaining a concept, transcribe it,
> get AI feedback on how accurate the explanation was (the **Feynman technique** / teach-back) —
> used below as the flagship feature (B1). Status: **B1 DONE (2026-06-26)** · B2–B6 roadmap only.

**Where the app sits today:**

| Level | Current feature(s) | Coverage |
|---|---|---|
| **Remember** | Flashcards + SM-2 SRS | Strong |
| **Understand** | Explanations, Study guides, Mind maps, RAG chat | Strong |
| **Apply** | Written exam questions (partial — mostly "explain X", not "use X in a new situation") | Partial |
| **Analyze** | — | Missing |
| **Evaluate** | AI evaluates the *student* (exam/written grading) — but the student never practices judging/critiquing work, and never self-assesses before seeing the answer | Missing (one-directional) |
| **Create** | — (written exam answers are graded against a fixed rubric, not open-ended original work) | Missing |

**Finding.** The app is heavily weighted toward the two lowest Bloom levels (Remember,
Understand) because that's what flashcards and explanations naturally produce, and weak on the
three highest (Analyze, Evaluate, Create) — which is exactly where deeper retention and transfer
come from. The user's teach-back idea is the single highest-leverage addition: articulating a
concept out loud forces Understand (recall it correctly) + Apply (phrase it, generate your own
examples) simultaneously, and grading the transcript against source material adds an Evaluate
signal — one feature touching three gaps at once.

Build order: **B1 → B2**, then B3–B6 independent/optional (B3 is folded into B2, see below).

---

### B1 — Teach-back ("explain it out loud") — flagship feature

**Goal.** Pick an explanation (or the whole unit) → record a short voice explanation → transcribe
→ AI compares the transcript against the source material and returns accuracy/completeness
scores, concrete gaps, and a suggestion. Re-attempts are logged so progress is visible.

**Reuses.**
- The existing **scaffolded `audio` table** (`id, unit_id, kind, script, file_path, provider,
  created_at` — see §4, currently unused). Add `kind='teachback'`, plus `ensureColumn()`
  migrations for `explanation_ids TEXT`, `score REAL`, `feedback_json TEXT`. No new table needed.
- The **grade-written pattern** already implemented in `routes/content.js`
  (`POST /exams/:examId/grade-written`): gather rubric text → `generateJSON()` with a
  validator → store structured feedback. Same shape, new prompt.
- The **explanation-checklist pattern** from Q3 (`flashcardExplanationIds` /
  `studyExplanationIds`) for letting the user pick which explanation(s) to be quizzed on.
- The `services/llm/prompts.js` convention (context → task → JSON schema → language last): add
  `teachbackPrompt({ sourceContent, transcript, language })`.

**New: pluggable STT layer**, mirroring the **TTS plugin pattern already designed for R4**
(`tts_providers` table, opt-in local Chatterbox) rather than inventing a new architecture:
- `services/stt/index.js` facade, two backends:
  1. **Active LLM's multimodal model** — send audio inline to the already-configured server's
     `multimodal_model` (the `servers` table already has this column, currently unused).
     Requires extending `gemini.js` (`inlineData` audio part) and `openai.js` (audio-capable
     model / Whisper endpoint) — these adapters currently only send text; no audio support
     exists yet anywhere in `server/services/llm/`.
  2. **Local Whisper** (whisper.cpp / faster-whisper HTTP server the user runs themselves) —
     registered exactly like Chatterbox: just a `base_url`, opt-in, off by default. Fully local,
     consistent with the project's existing "no data leaves the machine" decision (§7).
  Browser **Web Speech API** is a zero-setup fallback but is flagged explicitly: in Chrome it
  sends audio to Google's recognition servers, which contradicts the project's local-first
  decision if the active LLM server is local — documented as an opt-in convenience, not default.
- Settings gets a small "Speech-to-text" panel mirroring the Server/TTS-provider manager.

**Backend** — `server/routes/teachback.js`:
- `POST /api/units/:unitId/teachback` — multipart audio + optional `explanationIds[]` →
  save to `data/audio/teachback/<id>.webm` → `services/stt` → `generateJSON()` with
  `teachbackPrompt()` + a validator (score fields present, 0–100) → persist in `audio` table →
  return `{ id, transcript, score, accuracy, completeness, feedback }`.
- `GET /api/units/:unitId/teachback` (history, no binary) · `DELETE /api/teachback/:id`.

**Frontend** — new unit tab "Teach-back" (mic icon), `viewMode='teachback'` in `unitView.js`
(tab bar + dispatch, same pattern as the existing 6 tabs around lines 554–569): record via
`MediaRecorder`/`getUserMedia` (no existing usage in the repo — net new), playback preview,
submit → spinner ("Transcribing… / Evaluating…") → result card (score, strengths, gaps,
suggestion) → history list below. New `defaultUnitState()` fields: `teachbackLoaded`,
`teachbackHistory`, `teachbackExplanationIds`, `recording`, `recordedBlobUrl`,
`submittingTeachback`, `teachbackResult`, `teachbackError`.

**Verify.** Explain a known concept correctly → high accuracy + sensible feedback; explain it
wrong/incompletely → lower score + feedback correctly names the missing point; confirm the
audio file lands under `data/audio/teachback/` and the transcript/score persist across restart.

---

### B2 — Bloom-level tagging + coverage indicator (ties the rest together)

**Goal.** Tag every generated exam question with a `bloomLevel` (one of the 6 levels); instruct
the exam prompt to actively skew toward the underrepresented levels (Apply/Analyze/Evaluate);
show a small per-unit coverage bar so gaps are visible to the student, not just in this analysis.

**Approach.** No schema change — `bloomLevel` lives inside the existing `questions_json` blob.
Extend `examPrompt()` in `prompts.js` to require the field per question and to explicitly ask
for a few Apply-level "use this in a new scenario" questions (this is **B3**, folded in here —
it's the same prompt edit, not separate engineering). Loosen `validateExam()` to default missing
or invalid `bloomLevel` to `'understand'` rather than hard-failing (stay robust to flaky models,
per the existing F1 robustness philosophy). New `GET /api/units/:unitId/bloom-coverage`
aggregates counts by parsing each exam's `questions_json` in JS (no SQL aggregation needed).
Frontend: a small 6-segment bar in the Exam tab header with counts per level.

**Verify.** Generate an exam → questions carry varied `bloomLevel` values including `apply`;
coverage bar reflects the counts and updates after each new exam.

---

### B4 — Analyze-level micro-drill ("spot the difference / spot the error")

**Goal.** Short free-text drill, separate from full exams: AI either contrasts two similar unit
concepts and asks for the key differences, or presents a deliberately flawed explanation and
asks what's wrong. Grades the student's free-text answer against the known list of
distinctions/errors.

**Approach.** Shares B1's text-grading machinery (no audio/STT involved) — implemented as a
second mode inside the same "Teach-back" tab, renamed **"Practice"** with a mode switch
("Explain it back" vs "Spot it"), to avoid tab sprawl. New prompt functions
`analyzeDrillPrompt()` (generation) and reuse of the `generateJSON` + validator grading pattern.

**Verify.** Drill correctly flags the planted error/difference when the student names it; gives
specific feedback pointing to the real flaw when the student misses it.

---

### B5 — Evaluate-level: confidence calibration

**Goal.** Before revealing AI feedback on written exam answers or a teach-back attempt, ask the
student to self-predict their score (a simple 0–100 slider). Judging your own work against
criteria *before* seeing the answer is itself an Evaluate-level act, and the predicted-vs-actual
gap is a well-evidenced metacognition signal.

**Approach.** One column each on two existing tables — `ensureColumn('exam_results',
'self_predicted_score', 'REAL')` and the same on the `audio` table — no new tables. Minor UI
addition to two existing submit flows: a slider before "Submit", then a predicted-vs-actual
comparison alongside the existing result view.

**Verify.** Submit a written exam answer with a self-prediction → result view shows predicted
vs. actual score side by side.

---

### B6 — Create-level: student-authored questions ("you be the teacher")

**Goal.** Let the student write their own exam question + answer about the unit — genuinely
Create-level by Bloom's definition, and currently the one level with zero coverage anywhere in
the app. AI critiques it (clear? tests the intended level? suggested improvement) and optionally
folds good ones into the unit's question bank for future exams.

**Approach.** New table `student_questions(id, unit_id, question, answer, intended_bloom_level,
critique_json, quality_score, created_at)`. New endpoint `POST /api/units/:unitId/student-questions`
using the same `generateJSON` critique pattern as everywhere else. Small new panel in the Exam
tab: "Write your own question" form + "save to question bank" toggle.

**Verify.** Submit a question → critique + quality score returned and persisted; saved ones
appear in a bank list.

---

## 13. ATEXIS AACF compliance follow-ups (C1–C4)

> From a compliance audit against the ATEXIS AACF (v2.0.1, fetched live via `aacf_fetch` MCP)
> requested 2026-08-31. Scoped as **T1 — Self-Service** (personal, single-user, self-hosted
> study tool — not a corporate T2+ system), per `governance/tier-checklists.md` +
> `governance/guardrails.md`. **Already fixed** (same session): provider `api_key` columns are
> now encrypted at rest (AES-256-GCM, `server/services/crypto.js`); UI prefs (`lang`,
> `speechEnabled`, onboarding flag) moved from `localStorage` to a server-persisted `settings`
> table (HR1 compliance); the regex-based HTML sanitizer in `public/js/ui.js` was replaced with
> vendored **DOMPurify 3.4.14** (`public/vendor/dompurify/`, HR11 compliance). HR9 (destructive
> ops) confirmation copy was checked and is already correct in all 3 languages (`confirm_delete_item`
> explicitly says "and everything inside it… cannot be undone") — only the *soft-delete /
> retain-by-default* half of HR9 remains open (C4 below).
>
> Remaining items are lower-effort-to-value than the above and were deliberately deferred.
> Not built order-dependent; pick any.

### C1 — Vendor the remaining CDN scripts (pin + SRI, or fully local)

**Goal.** `public/index.html` still loads Tailwind (`cdn.tailwindcss.com`, no version) and
`marked` (`https://esm.run/marked`, no version) live from CDN on every page load; `app.js`
dynamically imports `markmap-lib`/`markmap-view` from `esm.run` the same way. No SRI, no pin.
Matches H3 in `security_assessment.md` and AACF HR8 ("nothing hardcoded without version
control") + Guardrail G3 (verifiable dependencies).

**Approach.**
- `marked` and `markmap-*`: same treatment as DOMPurify (§ above) — download the pinned
  ESM build into `public/vendor/<lib>/`, update the importmap / dynamic import path. Low
  effort, same pattern already proven for DOMPurify.
- Tailwind is the open question: `cdn.tailwindcss.com` (the "Play CDN") has no versioned URL to
  pin, and switching to a real build (`@tailwindcss/cli`) means introducing a one-time asset-
  generation step — a small deviation from today's "no build step" decision (§7). Options to
  weigh with the user before picking: (a) accept the Play CDN as a documented exception since
  it's Tailwind's own official distribution, not a third party; (b) run `@tailwindcss/cli`
  once to emit a static `public/css/tailwind.css`, regenerated manually when classes change
  (still no *runtime* build step, just an occasional local command).

**Verify.** Reload the app fully offline (disconnect network) after vendoring — everything
still renders identically; no console errors about failed CDN fetches.

### C2 — Security headers (CSP, X-Frame-Options, X-Content-Type-Options)

**Goal.** No response headers today (H2 in `security_assessment.md`). Add a minimal manual
middleware in `server/index.js` (no need for the `helmet` dependency at this scale — a handful
of `res.set()` calls covers it): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
and a `Content-Security-Policy` with `frame-ancestors 'none'` plus a `script-src` allow-list
for whichever CDN scripts are still live after C1.

**Sequencing note.** Do this *after* (or together with) C1 — a CSP `script-src` written against
today's CDN usage will need editing again the moment C1 vendors more of it; writing it once
against the final set avoids double work.

**Verify.** `curl -I` the running app → headers present; app still loads in a real browser with
no CSP console violations.

### C3 — Design tokens (Layer 1 of `styles/design-system.md`, proportionate scope)

**Goal.** The AACF design system prescribes a 3-layer stack (DTCG tokens → shadcn/Tailwind
component registry → agent enforcement rules). Adopting layers 2–3 would mean abandoning the
vanilla-JS, no-build-step architecture that's a deliberate, already-confirmed decision for this
project (§7) — not proportionate for a personal tool. **Take only Layer 1's spirit**: extract
the hardcoded hex/px values in `public/css/styles.css` into CSS custom properties
(`--color-*`, `--space-*`, `--radius-*`) so there's one place to retheme from, satisfying the
HR0/HR8 "nothing hardcoded" intent without the shadcn migration.

**Approach.** Audit `styles.css` for literal color/spacing values → declare them as `:root`
custom properties → replace usages. While in there, spot-check WCAG 2.2 AA basics the AACF
flags as non-negotiable: contrast on the dark theme's body text, a visible keyboard-focus ring
(currently relies on browser default — confirm it's not suppressed anywhere), and that any
auto-advancing UI (spinners are fine; nothing currently auto-plays content) respects
`prefers-reduced-motion` if one is ever added.

**Verify.** Visual diff before/after (should be pixel-identical — this is a refactor, not a
redesign); toggle OS dark/light + `prefers-reduced-motion` in devtools, confirm no regressions.

### C4 — HR9: soft-delete / trash for courses & subjects (stretch, optional)

**Goal.** AACF HR9 wants destructive deletes to *retain by default*, not just confirm. Today
`DELETE /api/courses/:id` etc. hard-delete immediately (FK cascade) the moment the (already
good, already translated) confirm dialog is accepted — see `server/routes/content.js`. Full
compliance means a trash/undo window, which is real scope, not a quick fix — hence deferred
here rather than bundled into the P0/P1 pass.

**Approach (if picked up later).** Add `deleted_at INTEGER` to `courses`/`subjects` (the two
levels with the highest accidental-loss blast radius — units/explanations cascade from them
anyway). Deletes set `deleted_at = unixepoch()` instead of `DELETE`; list/tree queries add
`WHERE deleted_at IS NULL`; a small "Trash" panel (Settings or a sidebar section) lists
soft-deleted items with **Restore** / **Delete permanently**; a boot-time sweep (mirroring the
existing `backfillExplanationIndex` fire-and-forget pattern in `server/index.js`) purges
anything past a retention window (e.g. 30 days).

**Verify.** Delete a course → disappears from the tree but a row survives in `courses` with
`deleted_at` set → restore from Trash → reappears with all subjects/units/explanations intact
(cascade never touched the children, since nothing was actually `DELETE`d) → permanently delete
→ gone for good.

---

### Pointers
- Original port plan: `C:\Users\jortega\.claude\plans\declarative-crunching-eagle.md`
- Reference projects: PageLM (CaviraOSS), Open Notebook (lfnovo), SurfSense, InsightsLM.
- ATEXIS AACF compliance audit: this session, 2026-08-31 (see §13). Framework fetched live via
  the `aacf_fetch` MCP tool — connection config in `.vscode/mcp.json` (git-ignored; needs an
  API key from ATEXIS Admin Console → API Keys to reconnect).
