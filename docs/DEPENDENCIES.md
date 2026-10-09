# Registro de dependencias — Aura Learn v1

Cada paquete directo se verificó antes de añadirlo (G3, G4, RS-20): que **existe** en el registro, su
**antigüedad**, su **mantenimiento** (última versión, mantenedores, descargas) y sus
**vulnerabilidades** (OSV). Verificación inicial: 2026-10-09. Desde entonces la puerta
[`scripts/check_deps.py`](../scripts/check_deps.py) repite existencia, antigüedad y vulnerabilidades
sobre **los dos lockfiles completos** (transitivas incluidas) en cada commit y en la CI.

## Política

| Regla | Dónde se aplica |
|---|---|
| **Cooldown de 30 días**: no se instala nada publicado hace menos de 30 días | npm: `--before=<fecha>` al generar el lock · Python: `[tool.uv] exclude-newer` · `check_deps.py` |
| **Excepción solo para parchear una advisory publicada** que afecta a la versión bloqueada, registrada con su identificador | [`dependency-policy.json`](dependency-policy.json) (una excepción obsoleta o innecesaria hace fallar la puerta) |
| Versiones **exactas** y lockfiles (`package-lock.json`, `uv.lock`) | `.npmrc` (`save-exact`), `==` en `pyproject.toml`; `check_deps.py` |
| Sin scripts de ciclo de vida de npm | `frontend/.npmrc` (`ignore-scripts=true`) |
| Binarios de herramientas con SHA-256 fijado | [`tool-pins.json`](tool-pins.json), `scripts/bootstrap_tools.mjs` |
| Imágenes base fijadas por digest | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` |

**Cómo regenerar el lock npm** (en un contenedor Linux, porque el lock generado en Windows pierde los
peers opcionales de los paquetes WASM): ver `frontend/Dockerfile` y el comentario del commit que lo
introdujo. Con inspección TLS (Zscaler) hay que montar la CA corporativa
(`scripts/export_corporate_ca.ps1`); la verificación TLS **no** se desactiva nunca.

## Excepciones de seguridad vigentes

Ver [`dependency-policy.json`](dependency-policy.json): vite 6.4.4, brace-expansion 2.1.7 / 5.0.12,
source-map-js 1.2.2, @redocly/openapi-core 1.34.20, urllib3 2.8.0, mako 1.4.3, y `uv` 0.12.18
(GHSA-2cv4-cqwr-gwf7, Windows). Se eliminan solas cuando superan el cooldown.

## Riesgos aceptados y desviaciones

| Tema | Decisión |
|---|---|
| **React 18.3.1 y Vite 6** (plantilla `web-app.md`, CLAUDE.md) | Última 18.x, sin publicaciones desde abril de 2024; OSV sin avisos. Vite 6 sigue recibiendo parches. Se mantiene la especificación; subir a React 19 / Vite 8 es una decisión pendiente. |
| **TypeScript 5.9.3** | TS 6 y 7 excluidos: `typescript-eslint` pide `<6.1` y `openapi-typescript` pide `^5`. |
| **ESLint 10 sin `eslint-plugin-jsx-a11y`** | El plugin no soporta ESLint 10 y ESLint 9 está deprecado. La accesibilidad se cubre con axe-core (tests) y el addon a11y de Storybook. |
| **react-router 7** | La 8 exige React ≥ 19.2.7. |
| **plugin-react 5** | La 6 exige Vite 8. |
| **CSP del SPA con `style-src 'unsafe-inline'`** | `sonner` inyecta un `<style>` en ejecución. Los scripts siguen en `'self'`. |

## Python (`backend/pyproject.toml`)

| Paquete | Uso |
|---|---|
| fastapi 0.141.1 | API HTTP y OpenAPI |
| uvicorn 0.52.4 | Servidor ASGI |
| pydantic 2.13.5 · pydantic-settings 2.15.0 | Validación estricta y configuración desde el entorno |
| sqlalchemy 2.0.52 · asyncpg 0.31.0 | ORM 2.0 async y driver PostgreSQL |
| alembic 1.19.2 | Migraciones |
| *dev:* pytest 9.1.1 · pytest-asyncio 1.4.0 · pytest-cov 7.1.0 · httpx 0.28.1 | Tests (httpx como transporte ASGI) |
| *dev:* ruff 0.16.6 · mypy 2.3.1 | Lint, formato y tipos estrictos |
| *dev:* pip-audit 2.10.1 · cyclonedx-bom 7.3.1 | Auditoría y SBOM CycloneDX |

Aplazadas a su fase: argon2-cffi y TOTP (F2), cryptography/Fernet y pgvector para Python (F3),
python-multipart (F5).

## Frontend (`frontend/package.json`)

| Paquete | Uso |
|---|---|
| react, react-dom 18.3.1 · react-router 7.18.3 | UI y enrutado |
| @tanstack/react-query 5.102.8 · zustand 5.0.15 | Estado de servidor / estado de UI |
| use-intl 4.14.2 | i18n (núcleo de next-intl sin Next) |
| openapi-fetch 0.17.0 · *dev:* openapi-typescript 7.13.0 | Cliente API tipado desde OpenAPI |
| radix-ui 1.6.7 · cmdk 1.1.1 · sonner 2.0.8 · lucide-react 1.42.0 | Primitivas shadcn/ui, paleta Ctrl+K, toasts, iconos |
| class-variance-authority 0.7.1 · clsx 2.1.1 · tailwind-merge 3.6.0 · tw-animate-css 1.4.0 | Utilidades de estilo shadcn |
| @fontsource-variable/inter, /jetbrains-mono 5.3.0 | Tipografías empaquetadas (sin CDN, RS-09) |
| *dev:* vite 6.4.4 · @vitejs/plugin-react 5.2.0 · typescript 5.9.3 | Build |
| *dev:* tailwindcss, @tailwindcss/vite 4.3.3 · style-dictionary 5.5.3 | Estilos y tokens DTCG |
| *dev:* eslint 10.10.0 · @eslint/js 10.0.1 · typescript-eslint 8.70.0 · eslint-plugin-react-hooks 7.1.1 · eslint-config-prettier 10.1.8 · globals 17.12.0 · prettier 3.9.6 | Lint y formato |
| *dev:* vitest, @vitest/coverage-v8 5.0.0 · jsdom 29.1.1 · @testing-library/{react 16.3.3, dom 10.4.1, jest-dom 7.0.1, user-event 14.6.7} · axe-core 4.13.0 | Tests y accesibilidad |
| *dev:* @types/react 18.3.31 · @types/react-dom 18.3.7 · @types/node 24.13.3 | Tipos |
| *dev:* storybook, @storybook/react-vite, @storybook/addon-a11y 10.6.0 | Contrato visual |

`shadcn` 4.21.0 se usa con `npx` solo para generar el código de los componentes (no es dependencia).
**Incidente:** el CLI añadió al `package.json` un paquete `cn` (inexistente como dependencia legítima)
y `next-themes`, e importó `cn` desde ese paquete; se revirtió y los imports apuntan a `@/lib/utils`.

## Herramientas, imágenes y acciones

| Elemento | Versión | Nota |
|---|---|---|
| uv | 0.12.18 | Binario de GitHub con SHA-256; excepción de seguridad (Windows) |
| gitleaks | 8.30.1 | Binario con SHA-256 (se usa el binario, no `gitleaks-action`, que exige licencia) |
| Python | 3.12 (gestionado por uv, en `.tools/`) | No se toca el Python del sistema |
| python:3.12-slim · node:24-slim · nginxinc/nginx-unprivileged:stable-alpine · pgvector/pgvector:pg16 | por digest | El registro aprobado por IT (RS-19) sigue pendiente |
