# Plan de cumplimiento ATEXIS AACF — Aura Learn

| | |
|---|---|
| **Fecha** | 2026-10-09 |
| **Marco** | ATEXIS AI Framework (AACF) **v2.0.1**, obtenido en vivo vía `aacf_fetch` |
| **Documentos AACF consultados** | `rules/atexis-hard-rules.md`, `rules/security.mdc`, `rules/ai-output-safety.mdc`, `rules/javascript.mdc`, `rules/global_rules.md`, `rules/atexis-global.mdc`, `governance/guardrails.md`, `governance/tier-checklists.md`, `governance/security-governance-compliance.md`, `governance/code-review-guidelines.md`, `templates/web-app.md`, `templates/internal-tool.md`, `agents/security-reviewer.agent.md`, `agents/codebase-hardening.agent.md`, `docs/SECURITY_CONTEXT.md` |
| **No consultado** | Corpus de políticas corporativas `idai-policies` (RAG). La clave del usuario no tiene permiso de lectura sobre ese namespace. Es un hueco abierto (ver §6). |
| **Documentos relacionados** | [REQUISITOS_MULTIUSUARIO.md](REQUISITOS_MULTIUSUARIO.md) (evolución a app corporativa multiusuario), [security_assessment.md](../security_assessment.md) (auditoría de junio, parcialmente desactualizada) |

> **Alcance.** Este plan cubre la aplicación **tal como es hoy**: monousuario, en local y escuchando solo en `127.0.0.1`.
> Con esa premisa el tier recomendado es T1. Si la app evoluciona a la versión corporativa multiusuario descrita en
> [REQUISITOS_MULTIUSUARIO.md](REQUISITOS_MULTIUSUARIO.md), pasa a **T2** y algunas de las "excepciones" de la §1
> (HR1/Postgres y autenticación) dejan de serlo: se convierten en requisitos.
>
> **Actualización 2026-10-09 (decisión D-02: migrar a la plantilla AACF).** La app se reescribirá con React/TS + FastAPI + Postgres + Keycloak.
> Por eso **no compensa** aplicar al código actual las fases F2–F4: pasan a ser requisitos de la nueva versión en
> [REQUISITOS_MULTIUSUARIO.md](REQUISITOS_MULTIUSUARIO.md). Mientras se use la app local, sí conviene hacer lo urgente de F1:
> `npm audit fix` (vulnerabilidad crítica), borrar `.env.local` y rotar las claves de Gemini y Firebase.
> La §1.2 (desviación de stack) queda resuelta por la migración.

---

## 1. Decisiones previas

### 1.1 Tier del proyecto

| | **T1 — uso personal en local** | **T2 — herramienta interna compartida** |
|---|---|---|
| Requisitos | Funcionar sin internet, sin datos confidenciales. Guardrails G1, G11 y G12. | Registro IdAI, revisión de IS, registro de auditoría, límite de peticiones, revisión por pares. Guardrails G2, G3, G5, G6, G7 y G10. |
| Choque actual | La app envía material de estudio a LLM **externos** (Gemini/OpenAI). Para T1 habría que usar un modelo autoalojado (Ollama/vLLM, ya compatible vía el adaptador OpenAI). | Exige Keycloak OIDC (`security.mdc`) y Postgres (HR1). |

### 1.2 Desviaciones que hay que documentar o resolver (HR4: no simplificar en silencio)

- **HR1.** El texto de la norma dice "Postgres es la fuente de verdad" y la app usa SQLite (`node:sqlite`). La parte de no guardar estado en el navegador sí se cumple ([state.js:129](../public/js/state.js#L129)).
- **Stack.** `templates/web-app.md` pide React 18 + TS + Vite, FastAPI, Zustand, shadcn y Keycloak. La app es vanilla JS + Express. `javascript.mdc` pide además TypeScript en modo estricto.

---

## 2. Estado actual verificado (2026-10-09)

### 2.1 Seguridad

| # | Estado | Evidencia |
|---|---|---|
| Dependencias | ❌ `npm audit`: **1 crítica** (proxy-addr GHSA-jqcg-44mw-7w3h) y 3 moderadas (qs, body-parser, express). Se arreglan con `npm audit fix`. | `package-lock.json` |
| H1 SSRF | ❌ Abierto: `fetch(url, {redirect:'follow'})` sin validar el destino | [extract.js:6-11](../server/services/extract.js#L6-L11), [websearch.js:62](../server/services/llm/websearch.js#L62) |
| H2 Cabeceras | ❌ No hay CSP, `frame-ancestors` ni `nosniff` | [server/index.js](../server/index.js) |
| H3 CDN | ❌ Tailwind CDN, `esm.run` (marked, markmap, mermaid, pdfjs) y `esm.sh` (jszip, xlsx), sin versión fija ni SRI | [index.html:7-12](../public/index.html#L7-L12), [extractors.js:45-91](../public/js/extractors.js#L45-L91), [app.js:1453-1485](../public/js/app.js#L1453-L1485) |
| M1 Sanitizado | ✅ DOMPurify incluido en el proyecto | [ui.js:2](../public/js/ui.js#L2) |
| M2 Inyección de prompt | ❌ Las fuentes entran en el prompt sin delimitadores ni la indicación "esto son datos, no instrucciones" | [prompts.js:405-412](../server/services/llm/prompts.js#L405-L412), [llm.js:21](../server/routes/llm.js#L21) |
| M3 Bomba ZIP | ❌ No hay límite de tamaño descomprimido | [exportImport.js:132](../server/services/exportImport.js#L132) |
| L1 | ❌ `__test.html` se sirve en producción | `public/__test.html` |
| L3 | ❌ No hay límite de peticiones | — |
| C2 | ❌ Clave de Gemini en texto plano en `.env.local`, que el servidor no lee (resto antiguo) | `.env.local` |
| Secretos en BD | ✅ Cifrados con AES-256-GCM | [crypto.js](../server/services/crypto.js) |
| SQL | ✅ Consultas parametrizadas | — |

### 2.2 Hard Rules

| HR | Estado | Evidencia |
|---|---|---|
| HR1 | ⚠️ Sin estado en el navegador ✅, pero usa SQLite en lugar de Postgres ❌ | [schema.sql](../server/schema.sql) |
| HR0/HR8 | ❌ Unas 20 constantes fijas en el código y modelos por defecto fijos. PORT/HOST/DATA_DIR/CSE solo por variables de entorno. | [gemini.js:20,51,70,109](../server/services/llm/gemini.js#L20), [index.js:59-62](../server/index.js#L59-L62) |
| HR6 | ❌ Recortes de contenido | [llm.js:21](../server/routes/llm.js#L21) (fuentes a 4000 caracteres), [ingest.js:139-140](../server/services/ingest.js#L139-L140), [chat.js:66](../server/routes/chat.js#L66), [unitView.js:73](../public/js/views/unitView.js#L73), [wikimedia.js:70](../server/services/images/wikimedia.js#L70) |
| HR7 | ⚠️ Revisar los modelos por defecto que se aplican sin avisar y el "best-effort" de la reindexación | [gemini.js:20](../server/services/llm/gemini.js#L20) |
| HR9 | ❌ La norma exige **borrado lógico y confirmación registrada**. Hoy hay `DELETE` directo con `confirm()` en el navegador, sin registro. | `server/routes/*.js`, [app.js:369](../public/js/app.js#L369) |
| HR10 | ⚠️ No existe fusión profunda de configuración | — |
| HR11 | ⚠️ Revisar las regex semánticas | [ingest.js](../server/services/ingest.js), [extract.js](../server/services/extract.js), [profiles.js](../server/services/llm/profiles.js) |
| HR13 | ⚠️ Tabla `submissions` antigua, `.env.local`, `advanced-ai-technologies.zip` en el repo | [schema.sql](../server/schema.sql) |
| HR15/HR21 | ✅ Base i18n (`t()`, en/es/fr). Falta una pasada de verificación. | [i18n.js](../public/js/i18n.js) |
| HR18/19 | ❌ Timeouts fijos de 7, 5 y 4 segundos y un tope de reintentos | [http.js:5](../server/services/images/http.js#L5), [websearch.js:25,55](../server/services/llm/websearch.js#L25), [llm/index.js:102](../server/services/llm/index.js#L102) |
| HR20 | ❌ Las mutaciones esperan la respuesta del servidor | p. ej. [app.js:1031-1038](../public/js/app.js#L1031-L1038) |
| Regla global 4 (auditoría) | ❌ No hay registro de auditoría de operaciones | — |
| Regla global 8 (tests) | ⚠️ Solo hay tests de servicios; faltan tests de integración de la API | `server/services/*.test.js` |

---

## 3. Fases

### F1 — Seguridad (aplica en cualquier tier)
1. `npm audit fix` y usar `npm ci`.
2. SSRF: aceptar solo http(s), bloquear rangos privados/loopback/link-local y volver a validar cada redirección (`security.mdc` § SSRF).
3. Cabeceras: CSP, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`.
4. LLM01: separar instrucciones y datos con delimitadores en todos los prompts con contenido externo.
5. ZIP: límite descomprimido por archivo y total, y lista de extensiones permitidas en los adjuntos.
6. Validar con un esquema las entradas de la API y rechazar campos inesperados (`security.mdc` § Input Validation).
7. Límites y cuotas en las rutas del LLM con vigilante y escalado (G12, LLM10, HR18/19).
8. Borrar `.env.local` (con confirmación) y rotar la clave de Gemini. Rotar también la clave de Firebase (C1 residual).
9. Quitar `__test.html` de lo que se sirve.

### F2 — Cadena de suministro (LLM03, G3/G4, regla global 6)
- Incluir en `public/vendor/`, con versión fija y hash, marked, mermaid, markmap, pdfjs, jszip y xlsx.
- Precompilar Tailwind con el binario standalone (sin Node en el frontend).
- Generar el SBOM (`npm sbom` / CycloneDX) en cada build.

### F3 — Guardrails automáticos
- **G1**: pre-commit con escaneo de secretos, lint y bloqueo de patrones prohibidos (`localStorage`, `.slice(0,N)` sobre contenido…).
- **G5**: protección de rama en `ATEXIS/AuraLearn` `main` (requiere admin del repo).
- **G10**: CI con CodeQL, `npm audit`, gitleaks y tests.

### F4 — Hard Rules en el código
- HR9: borrado lógico (`deleted_at`) y tabla de auditoría de confirmaciones (sirve también para la regla global 4 y G7).
- HR6: sustituir los recortes por resúmenes del LLM, recuperación por fragmentos o recorte visual con CSS.
- HR0/HR8/HR10: llevar las constantes y los modelos por defecto a configuración editable en la interfaz de administración, con fusión profunda.
- HR18/19: vigilante con escalado en lugar de timeouts y topes fijos.
- HR20: mutaciones optimistas con vuelta atrás si el servidor rechaza el cambio.
- HR7/HR11/HR13: revisión de valores por defecto silenciosos, regex semánticas y código antiguo.
- Regla global 8: tests de integración de la API.

### F5 — Gobernanza según el tier
- Documento de excepciones (HR1, stack), clasificación EU AI Act y nota GDPR sobre el envío a LLM externos.
- En T2: registro en IdAI y en el AI Tool Registry y revisión de IS.

### F6 — Cierre
- Revisión con el checklist del agente `security-reviewer` (veredicto pass / pass-with-fixes / block).
- Actualizar [security_assessment.md](../security_assessment.md).

---

## 4. Hallazgo en el propio AACF (para comunicar a IS)

`agents/codebase-hardening.agent.md` (AACF v2.0.1, §Step 1) contiene **en texto plano una clave de administrador** del gateway RAG (`sk-admin-…`). El documento se sirve a cualquier poseedor de una clave AACF. El propio texto lo justifica como "excepción deliberada a HR8", pero contradice LLM02, la regla global 2 y G2. Se recomienda **rotarla** y sacarla del documento. No se ha usado en este análisis.

## 5. Errata en las instrucciones

En `VIBE_CODING_INSTRUCTIONS.md` (v2.0.1) los ejemplos de Claude Code, Continue y curl usan `Authorization: Bearer`. En las pruebas el servidor respondió `401 Missing API key. Provide X-Api-Key header.` a una petición sin clave. La copia local del repo ya usa `X-Api-Key`.

## 6. Huecos abiertos

- **Políticas corporativas (`idai-policies`)**: sin acceso de lectura. Hay que pedir permiso a IS para comprobar los requisitos de clasificación de datos, el almacén de secretos aprobado, el estándar de identidad, la retención de logs y los modelos de IA aprobados.
