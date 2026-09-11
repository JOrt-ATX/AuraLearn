# Aura Learn — self-hosted AI course/study creator

A private, self-hosted study app: create Courses → Subjects → Units, generate
explanations and exams with **your own** LLM servers, and keep everything in a
**local SQLite file**. No cloud, no accounts, no data leaving your machine.

- **Frontend:** vanilla HTML/CSS/JS (no framework, no build step). Tailwind +
  `marked` via CDN.
- **Backend:** small Node/Express server + built-in `node:sqlite`. Proxies all
  AI calls so **API keys stay on the server, never in the browser**.
- **AI:** multi-provider — any **OpenAI-compatible** endpoint (Ollama, LM Studio,
  vLLM, OpenRouter, OpenAI, Groq…) **or native Gemini**. Add several servers and
  switch between them.

> Ported from a Google AI Studio export that was hardwired to Firebase + a single
> bundled Gemini key.

## Requirements

- Node.js 22+ (uses the built-in `node:sqlite`; developed on Node 24).

## Run

```bash
npm install      # backend deps (express)
npm run dev      # or: npm start   →  http://localhost:8787
```

`npm run dev` restarts the server on changes; `npm start` runs it normally.
Override the port with `PORT=3000 npm start`.

## Configure your AI server(s)

1. Open the app, click **Settings** (sidebar) → **Add server**.
2. Choose a type and fill in the details:
   - **OpenAI-compatible** — Base URL e.g. `http://localhost:11434/v1` (Ollama)
     or `https://api.openai.com/v1`; set Model and (if needed) API key.
   - **Gemini** — Base URL `https://generativelanguage.googleapis.com/v1beta`,
     Model e.g. `gemini-2.5-flash`, and your API key.
3. Click **Use** to make a server active, and the ✓ button to test it.

Keys are stored only in the local database, and the active server handles all
generation. Add as many servers as you like and switch anytime.

## Where your data lives

- `data/aura.db` — all courses/subjects/units/explanations/exams + server configs
  (a single portable SQLite file; back it up by copying it).
- Override location with `DB_PATH` / `DATA_DIR` env vars.

## Project layout

```
server/   Node/Express API + node:sqlite (db.js, schema.sql, routes/, services/)
public/   Vanilla frontend (index.html, css/, js/ with views/)
data/     SQLite database (gitignored)
```

## Roadmap

NotebookLM-style features are planned on top of this foundation: source-grounded
RAG chat, flashcards + spaced repetition, mind maps / study guides, and audio
overviews via a pluggable TTS layer (incl. a local **Chatterbox** plugin).

**The full kickoff plan for these is in [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)** —
current state, architecture, conventions, data model, and a per-feature (R1–R4)
implementation plan. Start a new session there. Feature tables are already
scaffolded in `server/schema.sql`.
