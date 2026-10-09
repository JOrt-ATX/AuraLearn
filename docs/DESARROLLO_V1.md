# Desarrollo de Aura Learn v1

Guía de arranque de la rama `v1` (fase 1). La app antigua (`server/`, `public/`) no se toca: es el oráculo.

## Primera vez

```bash
node scripts/bootstrap_tools.mjs      # uv, Python 3.12 y gitleaks en .tools/ (hashes verificados) + hooks de git
cp .env.example .env                  # y pon una contraseña real en POSTGRES_PASSWORD
cd frontend && npm ci && npm run tokens
```

Nada se instala fuera del proyecto: ni el Python del sistema, ni `~/.local/bin`, ni el registro de Windows.
Usa siempre `node scripts/uv.mjs ...` en lugar de `uv`, para que sus rutas queden dentro de `.tools/`.

## Arrancar

| Qué | Comando |
|---|---|
| Todo el stack (BD, migración, API, web) | `docker compose up -d --build` → http://localhost:8080 |
| Solo la BD para desarrollar | `docker compose up -d db` (queda en `127.0.0.1:5432`) |
| API con recarga | `cd backend && node ../scripts/uv.mjs run python -m app` (variable `AURA_DATABASE_URL`) |
| Frontend con recarga | `cd frontend && npm run dev` → http://localhost:5173 (proxy de `/api`) |
| Storybook | `cd frontend && npm run storybook` |

Detrás de **Zscaler** (inspección TLS) el build de la imagen web necesita la CA corporativa:
`powershell -File scripts/export_corporate_ca.ps1`. La verificación TLS nunca se desactiva.

## Comprobaciones (las mismas que la CI)

```bash
# Backend (desde backend/; AURA_TEST_DATABASE_URL apunta a una BD desechable, p. ej. aura_test)
node ../scripts/uv.mjs run ruff check . && node ../scripts/uv.mjs run mypy && node ../scripts/uv.mjs run pytest --cov
# Frontend (desde frontend/)
npm run typecheck && npm run lint && npm run test:cov && npm run build && npm run build-storybook
# Cadena de suministro (desde la raíz)
node scripts/uv.mjs run --project backend python scripts/check_deps.py
```

## Contrato OpenAPI

El cliente tipado sale de `backend/openapi.json`. Si cambias la API:
`node ../scripts/uv.mjs run python -m app.export_openapi openapi.json` (en `backend/`) y `npm run api:types` (en `frontend/`).
Un test y la CI fallan si el JSON o los tipos quedan desfasados.

## Dependencias

Antes de añadir cualquier paquete lee [DEPENDENCIES.md](DEPENDENCIES.md): cooldown de 30 días, versiones exactas,
excepciones solo para parchear una advisory publicada (registradas en `dependency-policy.json`).
El lock de npm se regenera en Linux (`docker run node:24-slim ... npm install --package-lock-only --before=<fecha>`),
porque el generado en Windows pierde los peers opcionales de los paquetes WASM.

## Guardrails

- **pre-commit** (`.githooks/`): gitleaks, ruff, mypy, patrones prohibidos por AST, prettier, eslint, tsc y, si cambian
  manifiestos, la puerta de dependencias. Un commit con un secreto, `localStorage`, `from __future__ import annotations`,
  truncado de contenido o `time.sleep` se rechaza.
- **pre-push**: rechaza cualquier push a `main` (G5).
- Para suprimir el aviso de truncado en algo que **no** es contenido (HR6): `# hr6-ok: motivo` (Python) o
  `// eslint-disable-next-line no-restricted-syntax -- motivo` (TypeScript).
