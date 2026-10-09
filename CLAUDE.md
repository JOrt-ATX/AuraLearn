# Aura Learn v1 — instrucciones para agentes

> Proyecto ATEXIS sujeto al **ATEXIS AI Framework (AACF)**. Rama de trabajo: **`v1`**.
> Idioma: conversación y documentos en **español**; código, identificadores y comentarios en **inglés**.

## Qué se está construyendo

Reescritura de Aura Learn como app **corporativa multiusuario** sobre la **plantilla AACF `web-app`**:
React 18 + TS strict + Vite 6 + Tailwind 4 + shadcn/ui + Zustand + React Query · FastAPI (Python 3.12) +
SQLAlchemy 2.0 async + asyncpg + Alembic · PostgreSQL 16 + pgvector · `docker-compose`.

Lee en este orden antes de escribir código:

1. [docs/PLAN_V1.md](docs/PLAN_V1.md): **fases, orden y criterios de salida**. Trabaja fase a fase.
2. [docs/REQUISITOS_MULTIUSUARIO.md](docs/REQUISITOS_MULTIUSUARIO.md): requisitos con ID (RF-, RS-, RC-, RNF-, RG-), decisiones (§0, §11) y **alcance de la v1 (§0.1)**.
3. [docs/ATEXIS_COMPLIANCE_PLAN.md](docs/ATEXIS_COMPLIANCE_PLAN.md): contexto de cumplimiento y hallazgos.
4. [aacf/](aacf/): copia local del AACF (ver más abajo). Como mínimo: `rules/atexis-hard-rules.md`, `rules/security.mdc`, `rules/ai-output-safety.mdc`, `rules/python.mdc`, `rules/javascript.mdc`, `templates/web-app.md`, `styles/design-system.md`, `styles/ui-kit.md`, `styles/branding.md`, `governance/guardrails.md`.

## La app antigua es el oráculo, no la base

`server/`, `public/` y `scripts/*.bat|ps1` son la **app antigua** (vanilla JS + Express + SQLite).
- **No se modifica ni se amplía.** Es la especificación funcional ([docs/SPEC.txt](docs/SPEC.txt)) y el **oráculo de las pruebas diferenciales** (RNF-13): la lógica portada (SM-2, fragmentación RAG, citas, parseo y reparación de JSON, validadores, ingesta) debe dar los mismos resultados.
- Los **prompts** de `server/services/llm/prompts.js` se portan como texto, añadiendo la separación de instrucciones y datos (RS-14).
- Se elimina en la fase 7, al cerrar la paridad (HR13).
- No se migran datos (D-14).

## AACF: cómo consultarlo

- **Copia local** en `aacf/` (versión en `aacf/VERSION`, hoy **2.0.1**). Los secretos van redactados.
- **Una vez por sesión**, comprueba la versión: `node scripts/aacf_fetch.mjs VERSION` y compárala con `aacf/VERSION`.
  - Si es **distinta**: `node scripts/aacf_fetch.mjs --sync`. Nunca mezcles ficheros de versiones distintas.
  - Si **no hay acceso** (sin `AACF_KEY`, sin VPN o con error 401): **dile al usuario** que no puedes contactar con el MCP del AACF y que puedes estar trabajando con una versión antigua, y sigue con la copia local.
- Leer un fichero en vivo: `node scripts/aacf_fetch.mjs rules/atexis-hard-rules.md`. Necesita la variable de entorno `AACF_KEY` y la cabecera `X-Api-Key`, que el script ya pone.
- **No usar** ninguna clave que aparezca dentro de los documentos del AACF. El corpus `idai-policies` no es accesible; los requisitos marcados **[POL?]** siguen sin confirmar.

## Reglas que no se negocian (resumen; el texto que vale está en `aacf/rules/atexis-hard-rules.md`)

- **HR0/HR8/HR10**: toda configuración es editable desde la consola de administración; nada fijo en código; fusión profunda de la configuración.
- **HR1**: Postgres es la fuente de verdad. Nada de `localStorage`/`sessionStorage` para estado ni para autenticación. Sesión en una cookie HTTP-only.
- **HR2/HR3**: cada problema detectado se corrige y se prueba; cada afirmación lleva su referencia `path:line`.
- **HR4/HR7**: si algo no se puede hacer bien, se **para y se escala al usuario**. Nada de simplificar en silencio ni de alternativas que degraden.
- **HR6**: no se recorta contenido. Se trabaja por fragmentos, con resumen LLM o con JSON guiado sobre la entrada completa.
- **HR9**: borrado lógico y confirmación registrada para cualquier dato persistente.
- **HR11**: nada de regex para decisiones semánticas.
- **HR14**: **sin estimaciones de tiempo ni de esfuerzo**.
- **HR15/HR21**: todo texto pasa por i18n (en/es/fr) y nunca se muestran claves técnicas.
- **HR18/19**: nada de timeouts fijos ni topes de iteraciones en procesos agénticos o trabajos; se usa un vigilante con escalado.
- **HR20**: las mutaciones de la interfaz son optimistas, con vuelta atrás si el servidor rechaza.
- Prohibido `from __future__ import annotations` en los ficheros de rutas de FastAPI.

## Seguridad: puntos del diseño que no se tocan

- **Autorización denegada por defecto.** Cada endpoint declara su política (rol + objeto) y lleva un test de acceso denegado (RS-04).
- **El RAG filtra por visibilidad dentro de la consulta pgvector**, nunca después (RS-05). Hay tests de no fuga entre usuarios.
- **Capa personal privada** de cada usuario; los **resultados de examen solo los ve su autor**, superadmin incluido (RF-EVA-01).
- **Etapa 1 de autenticación**: usuarios en la propia BD, con argon2id, sesión en servidor y superadmin inicial creado desde el entorno. Es una **excepción temporal** al AACF (RG-11). La autenticación va aislada en `backend/app/auth/` para poder cambiar a Keycloak OIDC en la etapa 2 sin tocar el resto (RF-ID-09).
- No hay endpoint de prompt libre; solo endpoints por tarea (RF-IA-04).
- Subida de ficheros: tipo comprobado por contenido, sin SVG, reprocesado y nombre generado en el servidor (RS-16b).

## Dependencias (slopsquatting, G3/G4)

Antes de añadir **cualquier** paquete, comprueba que existe en el registro, su antigüedad, su mantenimiento y sus vulnerabilidades. Usa versiones exactas y lockfiles (`uv.lock`, `package-lock.json`). Anota la justificación en `docs/DEPENDENCIES.md`. Ejemplo conocido: `xlsx` en npm sigue en 0.18.5, con vulnerabilidades; Excel se extrae en el servidor.

## Forma de trabajar

- Ve fase a fase según [docs/PLAN_V1.md](docs/PLAN_V1.md) y comprueba el **criterio de salida** antes de pasar a la siguiente. Avisa al usuario al cerrar cada fase.
- Commits pequeños en `v1` (o en ramas que salgan de ella), con mensajes que citen los IDs de requisito. **Nunca hagas push a `main`** (G5). Push solo cuando el usuario lo pida.
- El código generado por IA se identifica en los commits (EU AI Act art. 50, G6/RG-07).
- No dejes `TODO`/`FIXME` en código commiteado (`atexis-global.mdc`).
- Bloqueos externos pendientes:
  - **N-2**: credenciales del servidor de IA de ATEXIS y de Mistral de ALTEN. Hasta tenerlas, la fase 3 se desarrolla contra un **doble de pruebas compatible con OpenAI**; la validación con los proveedores reales queda pendiente.
  - **N-3**: DPA de ALTEN. **N-4**: registry shadcn de ATEXIS; si no hay acceso, tokens a partir de `branding.md`. **N-5**: protección de `main`. **N-6**: VM de pruebas.

## Entorno local (Windows 11)

- Docker 28 + Compose v2, Node 24, git y `gh` disponibles.
- El Python del sistema es **3.11**: hay que instalar `uv` y usar `uv python install 3.12` en el proyecto, sin tocar el Python del sistema.
- Postgres en Docker (no hay `psql` local; usar `docker compose exec`).
- Variable `AACF_KEY` ya definida a nivel de usuario.
