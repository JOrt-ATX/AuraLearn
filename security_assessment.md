# Security Assessment — Aura Learn

**Date:** 2026-06-25 (remediation applied 2026-06-26)
**Scope:** Full repository at `c:\AI\aura-learn` (backend, frontend, dependencies, config, legacy code)
**Method:** Manual source review + dependency manifest review. No live CVE database or `npm audit` network access was used — see caveats in Phase 1.

## Remediation Status

| Finding | Status |
|---|---|
| **C1** — Firebase key in `legacy/` | ✅ **FULLY RESOLVED** — `legacy/` deleted + key scrubbed from entire git history (local + GitHub, force-pushed) |
| **C2** — Gemini key in plaintext `.env.local` | ⏳ **DEFERRED** — left as-is for now, by request |
| **C3** — No auth + binds all interfaces | ✅ **RESOLVED** — server now binds to `127.0.0.1` by default |
| **M5** — `legacy/dist` not gitignored | ✅ **RESOLVED** — moot, `legacy/` no longer exists |
| H1, H2, H3, M1–M4, L1–L5 | Still open — see Phase 2/3 below |

---

## Architecture Summary

- **Stack (confirmed from source):** Node.js (≥22, uses built-in `node:sqlite`) + Express 4 backend; vanilla JS frontend (no framework/bundler); SQLite file at `data/aura.db`. `package.json`: *"Self-hosted, multi-provider AI study app (NotebookLM-style). Vanilla frontend + Node/SQLite backend."*
- **Entry point:** [server/index.js](server/index.js). Mounts `/api/*` routers, then serves `public/` statically with SPA fallback.
- **No authentication or authorization anywhere.** No login, no session, no API key/token check on any route. `server/schema.sql` states this is intentional: *"Single-user, no auth."*
- **Network binding:** [server/index.js:43](server/index.js#L43) — `app.listen(PORT, () => {...})` with **no host argument**. This makes Node listen on all interfaces (`0.0.0.0`/`::`), not just loopback — contradicting the "self-hosted, nothing leaves your machine" framing. Anyone on the same LAN/Wi-Fi can reach the full unauthenticated API.
- **AI/LLM integration:** multi-provider — OpenAI-compatible (`server/services/llm/openai.js`) and native Gemini (`server/services/llm/gemini.js`). Provider keys are stored server-side in SQLite and never sent to the browser (`server/routes/servers.js` strips `api_key` to a boolean `hasKey`).
- **Legacy app:** `legacy/` was the original React + Firebase version, unused by the running app. It has been **deleted** (local + GitHub) as part of remediating C1 — see Remediation Status above.

---

## Phase 1 — Dependency CVE Audit

### Manifests found
- [package.json](package.json) / [package-lock.json](package-lock.json) — the only manifests; this is a pure Node.js project (no Python/Go/Rust/Java manifests present).
- `dist/aura-learn-portable/package.json` is a generated build artifact, not a source of truth, and not git-tracked.

### Direct dependencies
```json
"dependencies": {
  "express": "^4.21.2",
  "jszip": "^3.10.1"
}
```
No `devDependencies`. Tests use Node's built-in `node:test` runner directly.

Resolved versions per lockfile: **express 4.22.2**, **jszip 3.10.1**.

| Package | Version | Known historical CVE pattern | Confidence | Contextual risk |
|---|---|---|---|---|
| express | 4.22.2 | Historical Express 4.x CVEs lived in transitive deps (`path-to-regexp` ReDoS pre-0.1.10, `serve-static`/`send` open-redirect issues, old `qs`). Lockfile shows `path-to-regexp@0.1.13`, `send@0.19.2`, `serve-static@1.16.3`, `qs@6.15.2`, `cookie@0.7.2` — all past the vulnerable ranges I'm aware of. | I cannot confirm or deny unpatched CVEs in this exact, very recent patch release without live CVE-feed access — flagging as low-confidence rather than citing a fabricated ID. | **LOW** — even unpatched ReDoS-class issues in routing/parsing would cause DoS, not data exposure, on this single-process app. |
| jszip | 3.10.1 | Older jszip lines (2.x/early 3.x) had minor prototype-pollution and XSS-via-unsanitized-filename notes; I have no confident CVE ID for current 3.10.1. | Low confidence — do not have a verified CVE for this exact version. | **MEDIUM**, but not from a CVE — from usage pattern: `JSZip.loadAsync()` parses **untrusted, user-uploaded zip files** in the import flow with no decompressed-size limit (zip-bomb risk — see M3 in Phase 2). |

**No outdated/abandoned transitive packages identified.** All transitive deps (body-parser, send, serve-static, qs, path-to-regexp, finalhandler, cookie, pako, lie, immediate, readable-stream, setimmediate) are recent versions.

**Recommendation:** Run `npm audit` and `npm outdated` against the live registry for an authoritative, current check — this review could not query a live CVE database and deliberately avoided inventing CVE IDs.

---

## Phase 2 — Code-Level Security Findings

### CRITICAL

#### C1 — Real Firebase API key committed to git, pushed to a GitHub remote — ✅ FULLY RESOLVED
- **File (removed):** `legacy/firebaseConfig.ts` — was tracked by git. Also baked into the untracked compiled bundle `legacy/dist/assets/index-BK2-_lta.js`.
- **Details:** Full Firebase config including a real `apiKey`, `projectId: "auralearn-7cec7"`, `authDomain`, `appId`. Confirmed tracked via `git ls-files`; remote is `https://github.com/JOrt-ATX/AuraLearn.git` (visibility not verified — confirm whether public or private).
- **Impact:** This legacy build used Firebase Auth + Firestore. Anyone with read access to the repo could use this key against that Firebase project's Auth/Firestore endpoints.
- **Remediation applied (two steps):**
  1. The entire `legacy/` directory (source + untracked `dist/` build) was deleted and the deletion committed/pushed to GitHub.
  2. **Git history was rewritten** with `git-filter-repo --replace-text` to scrub the literal key string from every blob across all 15 commits, then force-pushed to `origin/main` (old tip `72aab45` → new tip `cab9f61`). Verified with `git log --all -p | grep` against the key string both locally and on a fresh fetch from `origin/main`: **zero matches remain anywhere in the repo's history.**
- **Residual considerations:**
  - Anyone who had previously cloned/forked this repo still has the old history with the key in their copy — rewriting only protects the canonical GitHub repo going forward, not copies that already exist elsewhere.
  - Rotating the Firebase API key itself (in the Firebase console) was **not done** — the key was only scrubbed from git, not invalidated. If there's any chance this repo was ever public, or a fork/clone exists, rotate the key for full closure.

#### C2 — Live Gemini API key stored in plaintext on disk — ⏳ DEFERRED (no action taken yet, by request)
- **File:** [.env.local:1](.env.local#L1) — `GEMINI_API_KEY='<redacted — see file>'`.
- **Details:** Correctly excluded from git (`.gitignore` matches `*.local`; confirmed `git ls-files | grep -i env` returns nothing). Not network- or git-exposed. However, `.claude/settings.local.json` (also untracked) contains a permission rule that reads/extracts this exact key, proving it has been actively used by local tooling.
- **Impact:** Contained to this machine, but it's a real, billable key sitting in cleartext outside any OS-level secret store. Any future change to `.gitignore`, or syncing/backing up this directory, risks exposing it.
- **Fix:** Rotate as a precaution. Consider a local secrets manager or at least OS keychain storage instead of a plaintext `.env.local` for an app that otherwise has no auth boundary at all.

#### C3 — No authentication anywhere, combined with the server listening on all network interfaces — ✅ RESOLVED
- **File:** [server/index.js:42-46](server/index.js#L42-L46) — previously `app.listen(PORT, ...)` with no host argument; zero auth across all 9 route files (`servers.js`, `llm.js`, `sources.js`, `chat.js`, `flashcards.js`, `study.js`, `terms.js`, `notes.js`, `export.js`, `import.js`, `content.js`) remains unchanged (no auth was added — see below).
- **Impact (before fix):** Any device on the same network segment as the host could read/write/delete all course data, view/trigger use of stored LLM provider keys (billed to the owner), trigger arbitrary server-side URL fetches (SSRF, see H1), and upload/import arbitrary zip files — with zero credentials.
- **Remediation applied:** The server now binds explicitly to `127.0.0.1` by default (overridable via the `HOST` env var for anyone who deliberately wants LAN access):
  ```js
  const HOST = process.env.HOST || '127.0.0.1';
  app.listen(PORT, HOST, () => { ... });
  ```
  This restores the "nothing leaves your machine" guarantee the app's docs describe. **No authentication layer was added** — the app remains no-auth by design, which is now safe because it's no longer network-reachable. If LAN/remote access is ever wanted, real authentication must be added first before overriding `HOST`.

### HIGH

#### H1 — Server-Side Request Forgery (SSRF) via user-supplied URL
- **Files:** [server/services/extract.js:6-19](server/services/extract.js#L6-L19) (`fetchUrlText(url)` does a raw `fetch(url, { redirect: 'follow' })` with no validation), called from [server/routes/sources.js:34-37](server/routes/sources.js#L34-L37) with `url` taken directly from `req.body.url`. Related, lower-risk gaps in [server/services/llm/websearch.js:25-73](server/services/llm/websearch.js#L25-L73) (`verifyUrl`, `fetchOgImage`).
- **Impact:** Now that C3 is fixed (server is loopback-only), this is only reachable from processes on the same machine, not the network — significantly reduced exposure. Still worth fixing in case `HOST` is ever overridden, or another local process is compromised.
- **Status:** Open — `redirect: 'follow'` also defeats any future allowlist unless redirects are re-validated per hop.
- **Fix:** Validate scheme is `http(s)`; resolve the hostname and reject private/loopback/link-local ranges (RFC1918, 127.0.0.0/8, 169.254.0.0/16, ::1, fc00::/7) before fetching, and re-validate after each redirect hop.

#### H2 — No CORS policy and no security headers (CSP, X-Frame-Options, X-Content-Type-Options, HSTS)
- **Files:** absence confirmed across `server/` — no `cors`/`helmet` dependency, no manual header-setting anywhere.
- **Impact:** No wildcard-CORS exposure (browser same-origin policy still applies), but the total absence of `X-Frame-Options`/`frame-ancestors` allows the unauthenticated UI to be embedded in a hostile iframe (clickjacking — e.g., tricking a user into triggering a destructive action). Absence of CSP also removes a fallback layer if the XSS sanitizer (M1) is ever bypassed.
- **Fix:** Add `helmet` or manual headers: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, and a script-src CSP (would need entries for the CDN scripts in H3, ideally replaced by vendoring instead).

#### H3 — Unpinned, integrity-unchecked third-party CDN scripts
- **Files:** [public/index.html:7](public/index.html#L7) (`<script src="https://cdn.tailwindcss.com">`, no version/SRI), [public/index.html:9-15](public/index.html#L9-L15) (import map → `https://esm.run/marked`, no version/SRI), [public/js/app.js:869-870](public/js/app.js#L869-L870) (dynamic import of `esm.run/markmap-lib`/`markmap-view`), and `public/__test.html` (same pattern).
- **Impact:** Every page load executes live, unpinned third-party JS with no Subresource Integrity check and no CSP fallback. A CDN compromise or malicious upstream push would get full DOM access and could drive the unauthenticated backend API (C3) to exfiltrate or delete study data.
- **Fix:** Pin exact versions in CDN URLs and add `integrity`/`crossorigin` attributes, or — better, given the app's "nothing leaves your machine" goal — vendor these libraries locally under `public/vendor/` so the app needs zero external network calls and works fully offline.

### MEDIUM

#### M1 — Regex-based HTML sanitizer is not a robust XSS defense
- **File:** [public/js/ui.js:11-21](public/js/ui.js#L11-L21) — `sanitizeHtml()` strips `<script>` tags, `on*` handlers, and constrains inline `style` via three sequential regexes; used by `renderMarkdown()`/`renderMarkdownInline()` ahead of `marked.parse()` output insertion.
- **Impact:** Regex-based filtering doesn't catch `<iframe>`, `<object>`, `<embed>`, `<form>`, `<base>`, `<meta http-equiv="refresh">`, or `javascript:`/`data:` URIs in `href`/`src`. Mitigated by: (1) content is LLM output configured by the same single user, not third-party multi-tenant content; (2) the highest-risk content type (LLM-generated infographic HTML) bypasses this path entirely and is rendered in a sandboxed `<iframe sandbox>` with no `allow-scripts` (`public/js/app.js:961-963`, `public/js/views/study.js:59`).
- **Fix:** Replace the hand-rolled sanitizer with a maintained library (e.g., DOMPurify) for defense-in-depth, especially since fetched web content (H1) and chat answers both flow through `renderMarkdown`.

#### M2 — Prompt injection via fetched source content (RAG context)
- **Files:** [server/routes/sources.js](server/routes/sources.js) (URL/pasted text becomes RAG "source" content), [server/routes/chat.js:41-54](server/routes/chat.js#L41-L54) (retrieved chunk text concatenated verbatim into the LLM system prompt's `context`).
- **Impact:** Because `fetchUrlText()` (H1) ingests arbitrary remote content as a trusted "source," a malicious page could include instruction-injection text that influences chat responses. Bounded impact since the LLM has no tool-calling/execution capability here — worst case is a misleading answer, not code execution.
- **Fix:** Wrap retrieved context in clear delimiters with an explicit "this is data, not instructions" system directive; consider visually flagging which citations came from external fetches.

#### M3 — Decompression-bomb / unbounded memory on ZIP import
- **Files:** [server/routes/import.js:15](server/routes/import.js#L15) caps the **compressed** upload at 100MB (`express.raw({ type: 'application/zip', limit: '100mb' })`); [server/services/exportImport.js:131-147](server/services/exportImport.js#L131-L147) (`parseImportZip`) calls `JSZip.loadAsync()` then reads every entry with no cap on **decompressed** size.
- **Impact:** Now loopback-only (post-C3 fix), so only the local user could trigger this against themselves — still worth a real fix, just no longer attacker-reachable.
- **Fix (still open):** Track cumulative decompressed bytes while iterating entries and abort past a sane ceiling (e.g., 500MB); cap per-file extracted size too.

#### M4 — In-memory unauthenticated import-token store
- **File:** [server/routes/import.js:12-27](server/routes/import.js#L12-L27) — two-step import (`/api/import/analyze` → `/api/import/commit/:token`) stores parsed bundles in a module-level `Map` keyed by `crypto.randomUUID()`, 10-minute TTL, max 10 pending. Comment explicitly says this is "fine" because the server is "local + single-user."
- **Impact:** That assumption now holds in practice since C3 is fixed (loopback-only) — design is reasonable as-is. **Effectively resolved as a side effect of the C3 fix**, no separate action needed.

#### M5 — `legacy/dist` build artifact (with secrets baked in) not explicitly gitignored by name — ✅ RESOLVED
- **Moot:** `legacy/` (including the untracked `dist/` build) was deleted entirely as part of the C1 fix, so this finding no longer applies.

### LOW

#### L1 — Test/debug harness served publicly
- **File:** [public/__test.html](public/__test.html) — manual browser test harness for i18n/rendering, served at `/__test.html` by the catch-all static server in every deployment including the portable build.
- **Impact:** No secrets or destructive actions; just unintended debug-surface exposure.
- **Fix:** Exclude `__*.html` from the portable-build copy step or move it outside `public/`.

#### L2 — Gemini API key sent as a URL query parameter
- **Files:** [server/services/llm/gemini.js:30,49,65,85](server/services/llm/gemini.js#L30) — `?key=${encodeURIComponent(server.api_key)}` appended to every request URL.
- **Impact:** This mirrors Google's own documented Gemini REST API auth scheme — not a code defect, but query-string secrets are more prone to capture in logs/proxies than an `Authorization` header. The app's own LLM call-log table (`llm_log`) logs only model/task/timing, not the URL, so no compounding risk was found.
- **Fix:** None required beyond awareness; inherent to the third-party API design.

#### L3 — No rate limiting on any endpoint
- **Impact:** Now loopback-only (post-C3 fix), so this is a self-inflicted risk only (e.g. a buggy frontend retry loop), not a network financial-abuse vector.
- **Fix (still open, lower urgency now):** Add `express-rate-limit` on `/api/llm/*` and generation routes as defense-in-depth.

#### L4 — No file-type/extension allowlist on imported attachments
- **File:** [server/services/exportImport.js:183-189](server/services/exportImport.js#L183-L189) (`writeAttachment`) — writes to `DATA_DIR/sources/<fresh-uuid><extname-of-declared-name>`. Not exploitable as path traversal (fixed directory, fresh UUID basename), but no extension allowlist exists.
- **Fix:** Allowlist expected source-attachment extensions on import.

#### L5 — Upload size limits (informational, not a finding)
- [server/index.js:20](server/index.js#L20) sets an explicit 25MB JSON body limit; import's raw zip body is separately capped at 100MB. Good practice, noted for completeness since the audit explicitly asked about upload limits.

### Checked, no findings
- **SQL injection:** Every DB call across all route/service files uses parameterized `db.prepare(...).run()/get()/all()` with `?` placeholders. The only string-built SQL is in `server/db.js`'s migration helpers, which only ever interpolate fixed, hardcoded column/table names from source — never user input.
- **Command injection:** No `child_process`, `exec`, `execSync`, `spawn`, or `eval()` anywhere in `server/` or `public/`.
- **Cryptography:** No MD5/SHA1/DES for security purposes. All IDs use `crypto.randomUUID()`. No password hashing exists because there is no auth system.
- **Error handling:** All route handlers return `{ error: e.message }`, never `e.stack` — no stack-trace leakage found.
- **Path traversal:** The only file-path read-back (`resolveAttachmentPath`) only ever operates on paths the app itself wrote via `writeAttachment`, never directly on user input.

---

## Phase 3 — Contextual Risk Assessment

| Finding | Reachable from | Auth required? | Existing mitigation | Net risk **now** (post-remediation) |
|---|---|---|---|---|
| C1 — Firebase key in git | ~~Anyone with GitHub repo read access~~ | — | `legacy/` deleted + history scrubbed (force-pushed) | ✅ Fully resolved (key not rotated, see residual note in C1) |
| C2 — Gemini key in plaintext on disk | Local filesystem only | OS file permissions | Correctly gitignored | Unchanged — deferred by request |
| C3 — No auth + binds all interfaces | ~~LAN~~ → now loopback-only | None (now moot — not network reachable) | `HOST=127.0.0.1` default | ✅ Resolved |
| H1 — SSRF via source-URL fetch | Local processes only (post-C3) | None | Loopback binding | Low — still worth fixing in depth |
| H2 — No CORS/security headers | Browser-based clickjacking against the UI | None | Same-origin policy still applies | Moderate — independent of C3 |
| H3 — Unpinned CDN scripts | Every page load | N/A | None | Moderate — independent of C3 |
| M1 — Weak HTML sanitizer | Any rendered LLM/markdown content | N/A | Infographic path is iframe-sandboxed | Low-moderate — independent of C3 |
| M2 — Prompt injection via fetched sources | Any URL-added source | None | None beyond model behavior | Low-moderate — independent of C3 |
| M3 — Zip decompression bomb | Local only (post-C3) | None | 100MB compressed-size cap only | Low — self-inflicted only now |
| M4 — Import token store | Local only (post-C3) | None | TTL + max-pending bound | ✅ Effectively resolved by C3 |
| L1–L5 | Mostly local-only or low-impact | None | Partial | Low |

**Bottom line:** C3 has been fixed — the server now binds to `127.0.0.1` only, which was the single highest-leverage change since it was amplifying H1, H2, M3, M4, and L3. Those findings remain technically open but are now low-risk, self-inflicted-only concerns rather than network-attacker-reachable ones. H2 (clickjacking/headers) and H3 (unpinned CDN scripts) are independent of network exposure and still warrant fixing. C1 is resolved (secret removed from current repo state); C2 remains open by explicit user choice — not yet rotated or secured at rest.

---

## Explicit checks performed

- **`.env`/`.env.local` git status:** `.env` is listed in `.gitignore`; `.env.local` matches `.gitignore`'s `*.local` pattern. Confirmed via `git check-ignore -v .env.local` → matched. Confirmed via `git ls-files | grep -i env` → zero results. **No `.env*` file is tracked by git.**
- **Committed secrets search** (patterns: `sk-`, `AIza`, `Bearer `, `api[_-]?key=`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `password=`):
  - `legacy/firebaseConfig.ts` (was tracked) — real key, see C1 — **file deleted, see Remediation Status**.
  - `legacy/firebaseConfig copy.ts` (was tracked) — placeholder key only (`AIzaSyXXXX...`), no finding — also deleted along with `legacy/`.
  - `.env.local` (untracked) — real key, see C2 — still present, deferred by request.
  - `.claude/settings.local.json` (untracked) — references the Gemini key extraction; one entry already redacted to a placeholder.
  - No `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` env vars found — this app stores provider keys per-server in SQLite via the UI, not via env vars.
- **`node_modules`** excluded from manual review per standard practice. `package.json` uses caret (`^`) ranges — standard practice; the lockfile is the source of truth for exact resolved versions (captured in Phase 1).

---

## Prioritized Remediation Plan

1. ~~**Bind the server to `127.0.0.1` explicitly**~~ — ✅ **DONE** ([server/index.js:42-46](server/index.js#L42-L46)).
2. ~~**Delete `legacy/` and remove the Firebase key from the current repo state**~~ — ✅ **DONE** (local + GitHub).
3. ~~**Purge the Firebase key from git history**~~ — ✅ **DONE** (`git-filter-repo --replace-text` + force-push; verified zero matches in history, local and remote).
   - **Still optional:** rotate the Firebase API key in the Firebase console — history was scrubbed, but the key itself was never invalidated. Worth doing if there's any chance a fork/clone with the old history exists elsewhere.
4. **Rotate the Gemini API key** (C2) — **deferred by explicit request, no action taken.**
5. **Add basic SSRF guarding** to `fetchUrlText()` (H1) — reject private/loopback/link-local IP ranges. Lower urgency now that the server is loopback-only, but still good defense-in-depth.
6. **Add `helmet`** for security headers (H2) and pin/vendor the CDN scripts (H3) — both independent of the C3 fix, still open.
7. Defense-in-depth, lower urgency: swap the regex HTML sanitizer for DOMPurify (M1), cap decompressed zip size (M3), add rate limiting on LLM/generation routes (L3), remove `__test.html` from shipped builds (L1).
