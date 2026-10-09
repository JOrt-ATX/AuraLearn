# Aura Learn corporativo — Análisis de delta y requisitos

| | |
|---|---|
| **Fecha** | 2026-10-09 (v3: incorpora las decisiones D-01 a D-17; ver §0 y §11) |
| **Estado** | Borrador para revisión. La planificación se hará más adelante. |
| **Base de comparación** | Código en la rama `initial-import` (commit `01bbe9c`) y [SPEC.txt](SPEC.txt) |
| **Marco normativo** | ATEXIS AACF **v2.0.1**: hard rules, `security.mdc`, `ai-output-safety.mdc`, `python.mdc`, `javascript.mdc`, `templates/web-app.md`, `styles/design-system.md`, `styles/ui-kit.md`, `styles/branding.md`, guardrails, tier checklists, `security-governance-compliance.md`, `docs/SECURITY_CONTEXT.md`, agente `codebase-hardening` |
| **No consultado** | Corpus de políticas corporativas `idai-policies` (sin permiso de lectura). Los requisitos marcados **[POL?]** necesitan confirmarse contra esas políticas. |
| **Relacionado** | [ATEXIS_COMPLIANCE_PLAN.md](ATEXIS_COMPLIANCE_PLAN.md) |

---

## 0. Decisiones tomadas

| # | Decisión | Consecuencia en este documento |
|---|---|---|
| **D-01** | No se integra por ahora la autenticación de Microsoft que usan otras apps; esa integración la hará IT más adelante. La app gestiona **usuarios propios** con cuatro roles: **superadmin**, **instructional designer**, **project manager** y **plain user**. Habrá al menos un superadmin predefinido para crear el resto. | §2 y §5.1. Los usuarios se gestionan primero en la propia BD (D-01b revisada) y después en Keycloak, implantado por IT. |
| **D-02** | **Se migra a la plantilla AACF** (`templates/web-app.md`). | Reescritura completa. El código actual pasa a ser **especificación funcional y oráculo de pruebas** (§10). Desaparece la excepción de stack. |
| **D-03 / D-04** | **No se comparten las notas de los exámenes con nadie.** Desaparece el rol de "responsable formativo" como lector de evaluaciones. | Las evaluaciones son **privadas del alumno** (§5.6). Baja mucho el riesgo regulatorio (§7): ya no hay IA que califique a empleados ante terceros. |
| **D-16** | ⏸ **En suspenso.** Propuesta inicial: el project manager propone cursos y los asigna. Se revisará con RRHH y con el responsable de formación interna. | §5.10 queda como **borrador no planificable**. D-18 a D-22 quedan aparcadas. |
| **D-17** | El **superadmin** también puede crear y publicar cursos ATEXIS. | §2: el superadmin tiene además los permisos de instructional designer. |
| **D-01b** (revisada) | **Sin Keycloak por ahora.** Durante las pruebas en local y el primer testing en el servidor, la app tiene su **propio registro de usuarios en la misma base de datos**. Más adelante IT implantará Keycloak. | §5.1 reescrita. Es una **excepción temporal** al AACF (`security.mdc` exige Keycloak OIDC): queda acotada por RG-11 y la autenticación se diseña para cambiar a OIDC sin rehacer la app (RF-ID-09). |
| **D-05 / D-07** | ⏸ Pendientes de RRHH (alcance de la compartición; aprobación de la publicación). | Se planifica lo mínimo: compartir con usuarios concretos en solo lectura; publica el ID o el superadmin con la revisión registrada. |
| **D-08** | Proveedores de IA: **servidor interno de IA de ATEXIS y Mistral de ALTEN**. | RF-IA-01. Pendiente: modelo de embeddings común y DPA de ALTEN. |
| **D-11 / D-12** | ⏸ Pendientes: clasificación de datos y retención. | Se trabaja con techo Interno y periodos de retención configurables. |
| **D-14** | **No se migran** los datos actuales. | Se retira RF-IO-04. |
| **D-09 / D-10** | ⏸ **Aplazados** a una fase posterior: voz, narración, teach-back y búsquedas en internet. | Fuera de la primera versión. El egress se limita a los proveedores de IA (RS-18). |
| **D-13** | **No** se reutilizan respuestas de IA entre usuarios. | RF-CAP-07: cachés por usuario. |
| **D-15** | Unos **10 usuarios** de prueba. | RNF-19 |
| **D-23** | Imágenes en la capa personal: **subida por el usuario**. Sin generación con IA. | RF-CAP-08, RS-16b |

---

### 0.1 Alcance de la primera versión (fase de pruebas)

| Entra | Fuera (aplazado o en suspenso) |
|---|---|
| Usuarios propios en BD con 4 roles (etapa 1, §5.1) | Keycloak y Microsoft (etapa 2, IT) |
| Cursos ATEXIS (crea y publica el ID o el superadmin) y cursos personales | Propuestas y asignaciones del PM (D-16) |
| Compartir con usuarios concretos en solo lectura | Compartir con grupos o con toda ATEXIS, coedición, aprobación de la publicación (D-05, D-07) |
| Capa personal privada: notas, explicaciones de términos, **imágenes subidas por el usuario** (D-23), explicaciones, fuentes por fichero o texto, chat, flashcards, guías, mapas, infografías, diagramas | Voz: narración TTS, teach-back, Whisper/Chatterbox (D-09) |
| Exámenes con resultados privados | Búsquedas en internet: imágenes Wikimedia/Openverse, citas web, fuentes por URL (D-10) |
| IA: servidor interno de ATEXIS y Mistral de ALTEN | Migración de los datos actuales (D-14) |
| ~10 usuarios de prueba, techo de datos "Interno" | Clasificación y retención definitivas (D-11, D-12) |

> **Imágenes (D-23):** hoy las imágenes de términos se buscan en Wikimedia y Openverse. En la primera versión el usuario **sube sus propias imágenes**; no hay búsqueda en internet (D-10) ni generación con IA (el servidor no tiene modelo de imágenes).
> Los requisitos de las funciones aplazadas (teach-back en RF-EVA-01/05, SSRF en RS-07, etc.) se mantienen en el documento para cuando se reactiven.

## 1. Resumen ejecutivo

**Propuesta.** Aura Learn pasa de ser una app personal en local a un **servicio corporativo para la plantilla de ATEXIS**:
- servidor interno, base de datos común e IA corporativa (servicio de IA de ATEXIS o Mistral de ALTEN);
- **cursos ATEXIS** (oficiales) y **cursos personales** que se pueden compartir;
- **capa personal privada** de cada usuario sobre cualquier curso;
- **evaluaciones privadas** del alumno.

**Tamaño del delta.** Hay dos cambios a la vez:
1. **Cambio de modelo**: de un usuario sin autenticación a varios usuarios con roles, propietario y visibilidad. Hoy ninguna de las 23 tablas tiene propietario y ninguno de los 92 endpoints comprueba quién llama ([schema.sql:1](../server/schema.sql#L1); SPEC §1 "Non-goals").
2. **Cambio de stack**:

   | Capa | Hoy | Plantilla AACF |
   |---|---|---|
   | Frontend | Vanilla JS + Tailwind CDN | React 18 + TypeScript + Vite 6 + Tailwind 4 + shadcn/ui + Zustand |
   | Backend | Node + Express + SQLite | Python 3.12 + FastAPI + SQLAlchemy 2.0 async + PostgreSQL 16 + Keycloak OIDC |

   **No se reaprovecha código.** Lo que se reaprovecha es el **conocimiento**: prompts, algoritmos, validaciones, flujos y tests como referencia.

**Clasificación propuesta según el AACF:**

| Eje | Valor | Justificación |
|---|---|---|
| Tier | **T2 — IS-Approved (herramienta interna)** | Servidor compartido para la plantilla (`tier-checklists.md`). Pasaría a **T3** si los cursos usaran datos del data warehouse o confidenciales. |
| Modo de despliegue | **A — Interno** | Solo empleados, dentro de la red o por VPN (`codebase-hardening` Step 0) |
| Nivel ASVS | **L2** | Valor por defecto del AACF (control 1.9) |
| Datos personales | **Sí, de riesgo moderado**: cuentas, actividad, chats y notas privadas, autoevaluaciones privadas | Hace falta un análisis previo de DPIA con el DPO (§7) |
| EU AI Act | **Probablemente riesgo limitado o mínimo** tras D-03/D-04 | La IA ayuda al estudio y la autoevaluación no la ve nadie más. Hay que documentar la clasificación (controles 5.1–5.2). **Invariante de diseño**: cualquier función futura que exponga resultados a terceros obliga a reclasificar. |

---

## 2. Roles (D-01)

| Rol | Puede | No puede |
|---|---|---|
| **Superadmin** | Gestionar usuarios y roles; toda la configuración de plataforma (HR0): proveedores de IA, modelos, cuotas, límites, retención, funciones; auditoría; kill switch. **Además todo lo de instructional designer (D-17)** y de plain user. | Ver la capa personal, cursos personales no compartidos ni evaluaciones de otros usuarios (§5.6) |
| **Instructional designer** | Crear, editar, publicar y retirar **cursos ATEXIS** con todas las herramientas de autoría con IA; **atender las propuestas de curso** de los PM. Además todo lo de plain user. | Administrar la plataforma; ver datos personales de otros |
| **Project manager** | ⏸ **Funciones propias en suspenso (D-16).** Mientras tanto, el rol existe y tiene los mismos permisos que plain user. | Ver evaluaciones de nadie (D-03/04); publicar cursos ATEXIS |
| **Plain user** | Ver cursos ATEXIS publicados; crear cursos personales; compartirlos; capa personal; estudiar (chat, flashcards, guías, exámenes, teach-back) | Publicar cursos ATEXIS; administrar |

Reglas comunes:
- Un usuario puede tener **varios roles**. Los permisos se suman.
- **Siempre tiene que existir al menos un superadmin activo.** No se puede borrar, desactivar ni quitar el rol al último.

---

## 3. Delta por componente

| Aspecto | Hoy | Objetivo | Delta |
|---|---|---|---|
| Frontend | Vanilla ES modules sin build, Tailwind CDN, módulos desde `esm.run`/`esm.sh` | React 18 + **TS strict** + Vite 6, Tailwind 4 + **shadcn/ui (registry ATEXIS)**, Zustand + React Query, react-hook-form + zod, TanStack Table, Storybook | **Reescritura**. Desaparece el problema de los CDN: todo va empaquetado y con versión fija. |
| Backend | Express 4 sobre Node 22 | **FastAPI** + Pydantic + inyección de dependencias, Python 3.12 | **Reescritura** de los 92 endpoints, ahora con autorización |
| Base de datos | SQLite embebida (`node:sqlite`, experimental) | **PostgreSQL 16** + SQLAlchemy 2.0 async + asyncpg + **Alembic** | **Nuevo** esquema con propietario y visibilidad; migraciones versionadas |
| Búsqueda semántica (RAG) | Embeddings en JSON y coseno en JS | **pgvector**, con filtrado por visibilidad antes de recuperar | **Nuevo** (OWASP LLM08) |
| Identidad | No hay | **Fase de pruebas**: registro de usuarios propio en Postgres, con 4 roles y sesión en el servidor. **Producción**: Keycloak OIDC implantado por IT (con Microsoft detrás). | **Nuevo**, en dos etapas |
| Autorización | No hay | Control de acceso por rol y por objeto en cada endpoint | **Nuevo** (OWASP A01) |
| Ficheros | Disco local `data/…` | Almacenamiento compartido con control de acceso | **Nuevo** |
| Proveedores de IA | El usuario configura cualquiera, incluidos externos | Solo los aprobados (IA ATEXIS / Mistral ALTEN), configurados por el superadmin | **Cambio**. Se porta la lógica de perfiles y reparación de JSON. |
| Endpoints LLM genéricos | `/api/llm/generate`, `/json`, `/embed` con prompts que monta el navegador ([app.js:501](../public/js/app.js#L501)) | Solo endpoints por tarea | **Se eliminan** (LLM01/LLM10) |
| Tareas largas | Bucles que lanza el navegador | Cola de trabajos **persistente** en el servidor con vigilante | **Nuevo** (HR18/19) |
| Exámenes | Nota calculada en el navegador; un resultado global por examen | Nota en el servidor; intentos por usuario, privados | **Rediseño** |
| Interfaz | Tema oscuro slate/cyan | **Sistema de diseño ATEXIS** (tokens DTCG → CSS vars, Inter, `#2E74B5`, WCAG 2.2 AA) | **Nuevo** |
| Idiomas | en/es/fr con `t()` | Capa i18n de React (en/es/fr). Se migran las claves de [i18n.js](../public/js/i18n.js). | Se porta |
| Despliegue | `npm start` en el PC | `docker-compose` con frontend, API, Postgres, Keycloak y worker en una VM interna | **Nuevo** |

---

## 4. Modelo de propiedad y visibilidad

Cada dato pertenece a una de **tres capas**:

- **Contenido de curso**: lo que forma el curso. Lo ve todo el que tenga acceso al curso.
- **Capa personal**: lo que un usuario añade sobre un curso. **Solo lo ve su autor.**
- **Evaluación**: resultados del usuario. **Solo los ve el propio usuario** (D-03/D-04).

| Entidad (tabla actual) | Hoy | Capa objetivo | Cambio |
|---|---|---|---|
| `courses` | Global | Contenido. `kind` = ATEXIS / personal, `owner_id`, `status` (borrador/publicado/retirado), `deleted_at` | Columnas nuevas, ciclo de publicación |
| `subjects`, `units` | Global | Contenido (heredan del curso) | `deleted_at` |
| `explanations` | Global | **Mixto**: las del curso son contenido; las que añade un usuario a un curso ajeno son capa personal | `author_id`, `layer`; versionado (RF-ATX-04) |
| `term_explanations` | Caché única por (explicación, término) | Capa personal | Clave única con `user_id` |
| `term_images` (+ fichero) | Única por (explicación, término) | Capa personal | Clave única con `user_id`; fichero protegido |
| `notes` (+ embedding) | Global | Capa personal | `user_id`; el RAG solo recupera las notas propias |
| `sources` + `chunks` | Por unidad | Contenido o capa personal | `author_id`, `layer`; filtrado en el RAG |
| `explanation_chunks` | Por explicación | Igual que su explicación | Filtrado por visibilidad |
| `chat_messages` | **Hilo único por unidad, compartido** | Capa personal | `user_id` |
| `flashcards` | Estado SM-2 **dentro de la tarjeta** | Tarjetas: contenido o personales. Estado de repaso: **por usuario**. | Tabla `flashcard_reviews(user_id, card_id, …)` |
| `artifacts` | Por unidad | Capa personal (o contenido si lo publica un instructional designer) | `author_id`, `layer` |
| `audio` tipo TTS | Por unidad | Caché de contenido o personal | `author_id` |
| `audio` tipo teach-back | Por unidad | **Evaluación** (privada) | `user_id` |
| `exams` | Por unidad | Contenido (oficiales) o personal (autogenerados) | `author_id`, `layer` |
| `exam_results` | **`UNIQUE(exam_id)`: un resultado global** | **Evaluación** (privada), por intento | `user_id`, `attempt` |
| `submissions` | Antigua | — | No se migra (HR13) |
| `ingest_docs` | Por curso | Del autor | `author_id` |
| `servers`, `stt_providers`, `tts_providers` | Los configura el usuario | Configuración de superadmin | Solo superadmin |
| `settings` | Global | Preferencias por usuario y configuración de plataforma | Dos tablas |
| `llm_log` | Global | Consumo por usuario | `user_id`, tokens |
| *(nuevas)* | — | `users` (id interno, email, nombre, estado, `password_hash` temporal, `external_sub` para el futuro OIDC), `user_roles`, `sessions`, `course_shares`, `notifications`, `audit_log`, `jobs`, `quotas`, `explanation_versions`. ⏸ En suspenso con D-16: `course_proposals`, `course_assignments`, `teams` / `team_members`. | Nuevas |

---

## 5. Requisitos funcionales (RF)

Prioridad: **D** = Debe, **R** = Debería, **P** = Podría. Estado actual: ✅ existe, ⚠️ parcial, ❌ no existe. Con D-02 todo se reimplementa, así que "✅" significa **que existe la funcionalidad de referencia que hay que portar**.

### 5.1 Identidad, usuarios y sesión (D-01, D-01b revisada)

**Etapa 1, la actual (pruebas en local y primer testing en el servidor):** registro de usuarios propio en Postgres.
**Etapa 2 (producción, la implanta IT):** Keycloak OIDC con Microsoft detrás.

Los requisitos marcados **[E1]** se retiran o se sustituyen en la etapa 2.

| ID | Requisito | Prio | Origen | Hoy |
|---|---|---|---|---|
| RF-ID-01 | **[E1]** Registro de usuarios en la **misma base de datos** (tabla `users` + `user_roles`). **No hay autorregistro**: solo el superadmin crea cuentas. | D | D-01b revisada | ❌ |
| RF-ID-02 | Los 4 roles (§2) se guardan en BD, un usuario puede tener varios y la API los valida en cada petición | D | D-01, SECURITY_CONTEXT (RBAC) | ❌ |
| RF-ID-03 | **Superadmin inicial**: se crea en el primer arranque a partir de credenciales en variables de entorno o el almacén de secretos, **nunca** en código, migraciones ni imagen. **Cambio de contraseña obligatorio** en el primer acceso. Si ya existe un superadmin, el arranque no hace nada. | D | D-01, regla global 2, HR8 | ❌ |
| RF-ID-04 | El superadmin crea, edita, desactiva y reactiva usuarios y asigna roles desde la consola de administración | D | HR0 | ❌ |
| RF-ID-05 | No se puede borrar, desactivar ni quitar el rol al **último superadmin activo** | D | D-01 | ❌ |
| RF-ID-06 | **[E1]** Alta con **contraseña temporal** que el usuario debe cambiar en su primer acceso; el superadmin no conoce la contraseña definitiva | D | ASVS V2 | ❌ |
| RF-ID-07 | **[E1]** Contraseñas con hash **argon2id** (o bcrypt), nunca reversibles; longitud mínima de 12 caracteres y comprobación contra una lista de contraseñas comunes, todo configurable (HR0) | D | ASVS V2, `security.mdc` | ❌ |
| RF-ID-08 | **[E1]** **Bloqueo progresivo** tras intentos fallidos y límite de peticiones en el login, con aviso al superadmin en lugar de un bloqueo silencioso permanente | D | ASVS V2, HR18/19 | ❌ |
| RF-ID-09 | **Preparado para OIDC**: la autenticación está aislada en un módulo, y el resto de la app solo conoce `user_id` y roles. `users.external_sub` (nulo en la etapa 1) servirá para enlazar con Keycloak. El paso a la etapa 2 elimina `password_hash` y las pantallas de contraseña **sin tocar** permisos, cursos ni datos. | D | D-01b revisada, HR13 | ❌ |
| RF-ID-10 | **[E1]** El superadmin puede **restablecer la contraseña** de un usuario (genera una temporal); el usuario cambia la suya desde su perfil | D | Operación | ❌ |
| RF-ID-11 | **[E1]** MFA (TOTP) para superadmin | R | SECURITY_CONTEXT | ❌ |
| RF-ID-12 | Cierre de sesión que invalida la sesión en el servidor | D | ASVS V3 | ❌ |
| RF-ID-13 | Buscador de usuarios activos (nombre o correo) para compartir | D | Compartición | ❌ |
| RF-ID-14 | Desactivar un usuario corta su acceso al momento (se invalidan sus sesiones); sus datos se tratan según la retención (RC-05) | D | ISO A.5.15, GDPR | ❌ |
| RF-ID-15 | Altas, bajas, cambios de rol, restablecimientos, inicios de sesión fallidos y bloqueos quedan registrados en la auditoría | D | G7, regla global 4 | ❌ |

### 5.2 Catálogo y visibilidad

| ID | Requisito | Prio | Origen | Hoy |
|---|---|---|---|---|
| RF-CAT-01 | El catálogo muestra, separados: **cursos ATEXIS** publicados, **mis cursos** y **compartidos conmigo** | D | Usuario | ❌ (`GET /api/tree` devuelve todo) |
| RF-CAT-02 | Un usuario solo ve (en la interfaz, la API y el RAG) los cursos ATEXIS publicados, los suyos y los compartidos con él | D | Usuario, OWASP A01 | ❌ |
| RF-CAT-03 | Catálogo paginado (10/25/50), con búsqueda y filtros | D | Regla global 10, `ui-kit.md` | ❌ |
| RF-CAT-04 | Los cursos ATEXIS muestran autor, versión y fecha de publicación | R | Derivado | ❌ |

### 5.3 Cursos ATEXIS (instructional designer)

| ID | Requisito | Prio | Origen | Hoy |
|---|---|---|---|---|
| RF-ATX-01 | Solo el **instructional designer** y el **superadmin** (D-17) crean, editan, publican y retiran cursos ATEXIS | D | D-01, D-17 | ❌ |
| RF-ATX-02 | Ciclo de vida **borrador → publicado → retirado**; los plain users solo ven los publicados | D | Derivado | ❌ |
| RF-ATX-03 | Herramientas de autoría actuales: estructura con IA, objetivos, explicaciones (simple, contexto, PDF, fundamentada en fuentes), ingesta de carpetas, exámenes, flashcards, guías, mapas, infografías, diagramas | D | Paridad funcional | ✅ referencia |
| RF-ATX-04 | Editar o regenerar un curso publicado **no rompe la capa personal**: las explicaciones se versionan y las notas, términos e imágenes siguen asociados | D | HR9 | ❌ |
| RF-ATX-05 | Retirar o borrar es un borrado lógico con confirmación registrada; capas personales y evaluaciones se conservan según la retención | D | HR9 | ❌ |
| RF-ATX-06 | Revisión humana registrada (quién y cuándo) del contenido generado por IA antes de publicar | D | Control 1.7, LLM09, AI Act art. 50 | ❌ |

### 5.4 Cursos personales y compartición

| ID | Requisito | Prio | Origen | Hoy |
|---|---|---|---|---|
| RF-PER-01 | Cualquier usuario crea cursos personales con las herramientas de IA | D | Usuario | ✅ referencia |
| RF-PER-02 | Un curso personal solo lo ve su propietario mientras no lo comparta | D | Usuario | ❌ |
| RF-SHR-01 | Compartir un curso personal con **usuarios concretos** | D | Usuario | ❌ |
| RF-SHR-02 | Compartir con grupos o con toda ATEXIS | R | ⏸ D-05 | *(Pendiente de RRHH)* Compartir: ¿con usuarios, grupos o toda ATEXIS? ¿Solo lectura o coedición? Mientras tanto se planifica lo mínimo: compartir con usuarios concretos en solo lectura (RF-SHR-01/03). | RF-SHR-02/03 |
| RF-SHR-03 | Compartir es **solo lectura** por defecto (la coedición se decide en D-05) | D | Derivado | ❌ |
| RF-SHR-04 | El propietario ve con quién está compartido y puede **revocar** el acceso | D | Derivado | ❌ |
| RF-SHR-05 | El receptor tiene **su propia capa personal** sobre el curso compartido y **no ve** la del propietario | D | Usuario (por analogía) | ❌ |
| RF-SHR-06 | Compartir un curso **nunca** comparte evaluaciones: cada usuario ve solo las suyas | D | D-03/D-04 | — |
| RF-SHR-07 | Al revocar o borrar, el receptor pierde el acceso con aviso; su capa personal se conserva según la retención | R | HR9 | ❌ |
| RF-SHR-08 | Copia propia (fork) de un curso compartido | P | Derivado | ⚠️ (import "copy") |
| RF-SHR-09 | Proponer un curso personal como curso ATEXIS (lo revisa un instructional designer) | P | Derivado | ❌ |
| RF-SHR-10 | Cada compartición, revocación o cambio de visibilidad queda registrado en la auditoría | D | G7, regla global 4 | ❌ |

### 5.5 Capa personal

| ID | Requisito | Prio | Origen | Hoy |
|---|---|---|---|---|
| RF-CAP-01 | El usuario ve el contenido del curso **y además** sus anotaciones, explicaciones adicionales e imágenes | D | Usuario | ❌ |
| RF-CAP-02 | Todo lo que añade (notas, explicaciones de términos, imágenes, explicaciones, fuentes, artefactos, audio) **solo lo ve él** | D | Usuario | ❌ |
| RF-CAP-03 | La interfaz distingue visualmente el contenido oficial del personal | D | Derivado | ❌ |
| RF-CAP-04 | El **chat** es privado de cada usuario y solo recupera contenido del curso y su propia capa | D | Usuario, LLM08 | ❌ (hilo único) |
| RF-CAP-05 | Estado de repaso de las **flashcards** (SM-2) por usuario | D | Derivado | ❌ |
| RF-CAP-06 | El usuario puede borrar (con confirmación) y exportar su capa personal | D | HR9, GDPR arts. 15/20 | ❌ |
| RF-CAP-07 | Cachés de IA (explicaciones de términos, imágenes, etc.) **por usuario**, sin reutilizar respuestas entre usuarios (D-13): el aprendizaje se personaliza | D | Usuario, D-13 | ❌ |
| RF-CAP-08 | **Subida de imágenes propias** asociadas a un término o fragmento de una explicación (sustituye a la búsqueda en Wikimedia/Openverse en la primera versión, D-23). Pie de foto y fuente opcionales. Solo las ve quien las sube. | D | D-23 | ⚠️ referencia (modelo `term_images`: fichero, pie, atribución) |

### 5.6 Exámenes y autoevaluación (D-03/D-04)

| ID | Requisito | Prio | Origen | Hoy |
|---|---|---|---|---|
| RF-EVA-01 | Los resultados (exámenes y teach-back) **solo los ve el usuario que los hizo**. Ningún rol, **superadmin incluido**, los ve en la app. No hay exportaciones ni informes de resultados de otros. | D | D-03/D-04 | ❌ |
| RF-EVA-02 | Cada usuario tiene sus propios intentos de cada examen, con historial | R | Derivado | ❌ (`exam_results.exam_id UNIQUE`) |
| RF-EVA-03 | Nota calculada en el servidor, y las respuestas correctas no se envían al navegador antes de entregar. Baja de prioridad porque el resultado no lo ve nadie más, pero se mantiene por coherencia y para no confiar en el cliente. | R | Integridad, OWASP A04 | ❌ ([app.js:484](../public/js/app.js#L484)) |
| RF-EVA-04 | El feedback por pregunta se genera en el servidor, no con un prompt montado en el navegador | D | LLM01, RF-IA-04 | ❌ ([app.js:501](../public/js/app.js#L501)) |
| RF-EVA-05 | Indicar que la corrección de las preguntas escritas y del teach-back la hace la IA | D | AI Act art. 50 | ❌ |
| RF-EVA-06 | El usuario puede borrar sus resultados (con confirmación) | D | HR9, GDPR art. 17 | ⚠️ (borrado físico) |
| RF-EVA-07 | **Invariante**: no se añaden funciones que expongan resultados individuales a terceros sin reabrir la DPIA y la clasificación EU AI Act (RC-01, RC-02) | D | D-03/D-04 | — |

### 5.7 Administración (superadmin, HR0)

| ID | Requisito | Prio | Origen | Hoy |
|---|---|---|---|---|
| RF-ADM-01 | Consola con **toda** la configuración: proveedores y modelos de IA, límites, cuotas, timeouts del vigilante, retención, funciones activables, destinos de salida permitidos | D | HR0, HR8, HR10 | ⚠️ (servidores, STT, TTS) |
| RF-ADM-02 | Gestión de usuarios y roles (RF-ID-04/05) | D | D-01 | ❌ |
| RF-ADM-03 | Proveedores de IA solo de la lista aprobada | D | Gobernanza IA, GDPR 4.1 | ❌ |
| RF-ADM-04 | Cuotas por usuario y rol, y consumo visible (tokens y llamadas) | D | G12, LLM10 | ❌ |
| RF-ADM-05 | **Kill switch**: desactivar un usuario, una función o un proveedor | D | SECURITY_CONTEXT | ❌ |
| RF-ADM-06 | Consulta del registro de auditoría. Muestra **metadatos** (quién, qué, cuándo), **nunca contenido** de capas personales ni resultados. | D | G7, D-03/D-04 | ❌ |
| RF-ADM-07 | Diagnóstico LLM por modelo y tarea (paridad con `llm_log`) | R | Paridad | ✅ referencia |

### 5.8 IA

| ID | Requisito | Prio | Origen | Hoy |
|---|---|---|---|---|
| RF-IA-01 | Funciona con **ambos** proveedores aprobados (D-08): el **servicio de IA interno de ATEXIS** (Ollama/vLLM, API compatible con OpenAI) y **Mistral de ALTEN**. El superadmin los da de alta y decide cuál está activo para cada tarea. | D | Usuario, D-08 | ⚠️ referencia (adaptador OpenAI y perfil `mistral`) |
| RF-IA-02 | Se portan los **perfiles por modelo**, la reparación de JSON y la validación de salidas estructuradas | D | Paridad | ✅ referencia ([profiles.js](../server/services/llm/profiles.js), [llm/index.js](../server/services/llm/index.js)) |
| RF-IA-03 | Un único modelo de embeddings; cambiarlo lanza una reindexación como trabajo en el servidor | D | Derivado | ❌ |
| RF-IA-04 | Solo endpoints por tarea; **no** existe un endpoint de prompt libre para usuarios | D | LLM01, LLM10 | ❌ |
| RF-IA-05 | Tareas largas (ingesta, expansión, generación masiva) en una **cola persistente** con progreso, reanudación y vigilante con escalado; sin topes silenciosos | D | HR18/19 | ❌ |
| RF-IA-06 | Reparto justo de la capacidad del LLM entre usuarios | R | LLM10 | ❌ |
| RF-IA-07 | Etiqueta visible en todo contenido generado por IA | D | AI Act art. 50 | ❌ |
| RF-IA-08 | Salida estructurada (JSON guiado) calculada sobre la **entrada completa**, sin recortar | D | HR6, `ai-output-safety.mdc` | ❌ (recortes a `maxInputChars`) |

### 5.9 Importar, exportar y migración

| ID | Requisito | Prio | Origen | Hoy |
|---|---|---|---|---|
| RF-IO-01 | Exportar los cursos personales y la capa personal propios (ZIP) | D | GDPR art. 20 | ⚠️ referencia |
| RF-IO-02 | Exportar cursos ATEXIS solo con permiso del rol **[POL?]** | D | Clasificación de datos | ❌ |
| RF-IO-03 | La importación crea siempre **cursos personales** del usuario que importa (los instructional designers pueden importar como borrador ATEXIS) | D | OWASP A01 | ❌ |
| ~~RF-IO-04~~ | ~~Compatibilidad con el ZIP actual para migrar~~. **Retirado (D-14)**: no se migran los datos actuales. El formato de export/import de la nueva versión se diseña desde cero. | — | D-14 | — |
| RF-IO-05 | Límites de tamaño descomprimido, número de entradas y extensiones permitidas | D | M3/L4 | ❌ |

### 5.10 Propuestas y asignaciones de cursos (project manager, D-16) — ⏸ EN SUSPENSO

> **No planificable.** Esta sección recoge la propuesta inicial y se revisará con RRHH y el responsable de formación interna. Hasta entonces no se implementa nada de lo que hay aquí, y las decisiones D-18 a D-22 quedan aparcadas.

| ID | Requisito | Prio | Origen | Hoy |
|---|---|---|---|---|
| RF-PRO-01 | El PM crea una **propuesta de curso**: título, objetivos, público destinatario, motivo o proyecto, y documentación de apoyo opcional | D | D-16 | ❌ |
| RF-PRO-02 | La propuesta puede incluir un **borrador** de curso generado por el PM con las herramientas de IA, o ser solo una solicitud (D-21) | R | D-16 | ❌ |
| RF-PRO-03 | Los instructional designers y superadmins ven la bandeja de propuestas y pueden **aceptarlas** (se convierten en un borrador de curso ATEXIS), **pedir cambios** o **rechazarlas** con un comentario | D | D-16 | ❌ |
| RF-PRO-04 | El PM ve el estado de sus propuestas (enviada, en revisión, aceptada, rechazada, publicada) y recibe aviso de cada cambio | D | D-16 | ❌ |
| RF-PRO-05 | La documentación adjunta a una propuesta solo la ven el PM proponente, los instructional designers y los superadmins | D | OWASP A01, clasificación de datos | ❌ |
| RF-ASG-01 | El PM **asigna cursos** a personas de **su equipo** (lista de miembros, D-20) | D | D-16 | ❌ |
| RF-ASG-02 | El PM asigna cursos a personas **de fuera de su equipo indicando su email** | D | D-16 | ❌ |
| RF-ASG-03 | Cursos asignables: **cursos ATEXIS publicados** y **cursos personales del propio PM**. Asignar un curso personal implica compartirlo en solo lectura con quien lo recibe (RF-SHR-03). | D | Derivado | ❌ |
| RF-ASG-04 | Si el email no corresponde a un usuario existente, el sistema no crea la cuenta solo: avisa al PM y, según D-19, envía una invitación o deja una solicitud de alta para el superadmin | D | D-19, RF-ID-03/06 | ❌ |
| RF-ASG-05 | Quien recibe la asignación ve los cursos en una sección **"Asignados a mí"** del catálogo, con quién se los asignó, la fecha y, si la hay, la fecha objetivo | D | D-16 | ❌ |
| RF-ASG-06 | **Notificación por email** al asignado (y dentro de la app), con texto localizado (HR15) | R | D-16 | ❌ |
| RF-ASG-07 | Fecha objetivo opcional en la asignación | P | Derivado | ❌ |
| RF-ASG-08 | El PM puede **retirar** una asignación; el asignado conserva su capa personal según la retención | D | HR9 | ❌ |
| RF-ASG-09 | **Lo que ve el PM de una asignación** se limita a lo que decida D-18. Por defecto, solo la lista de asignaciones hechas (a quién, qué curso, cuándo). **Nunca** notas de examen ni capa personal (D-03/D-04). | D | D-03/D-04, D-18 | ❌ |
| RF-ASG-10 | Asignar o retirar una asignación, y aceptar o rechazar una propuesta, queda registrado en la auditoría | D | G7, regla global 4 | ❌ |
| RF-ASG-11 | Límite configurable de asignaciones por PM (anti-spam), con escalado al superadmin en lugar de rechazo silencioso | R | HR0, HR18/19 | ❌ |

---

## 6. Requisitos de seguridad (RS)

| ID | Requisito | Prio | Origen AACF | Hoy |
|---|---|---|---|---|
| RS-01 | **Sesión en el servidor** (tabla `sessions` en Postgres) con un identificador aleatorio en una **cookie HTTP-only, Secure, SameSite**. Nada de autenticación en `localStorage` ni tokens en el navegador. En la etapa 2 se mantiene el mismo patrón (BFF): FastAPI hace el flujo OIDC con Keycloak y emite la misma cookie. | D | HR1, `security.mdc`, `javascript.mdc` | ❌ |
| RS-02 | Validación de la sesión **en cada petición**; timeout por inactividad de **30 min**; máximo **4 sesiones** concurrentes (todo configurable, HR0); identificador de sesión nuevo tras el login y tras cambiar la contraseña | D | SECURITY_CONTEXT, `security.mdc` | ❌ |
| RS-03 | Protección **CSRF** en las mutaciones | D | `web-app.md` | ❌ |
| RS-04 | Autorización por rol **y por objeto** (propietario, compartición, capa) como dependencia de FastAPI en **cada** endpoint, con tests de acceso denegado | D | OWASP A01, `python.mdc` | ❌ |
| RS-05 | El RAG filtra por visibilidad **en la consulta SQL o pgvector**, nunca después | D | LLM08 | ❌ |
| RS-06 | Validación con **Pydantic** (API) y **zod** (formularios), en modo estricto: rechazar campos extra y limitar longitudes | D | `security.mdc`, `python.mdc`, `ui-kit.md` | ❌ |
| RS-07 | **SSRF**: validar URLs, bloquear rangos privados y no seguir redirecciones a direcciones internas. Más grave en un servidor interno. | D | `security.mdc` § SSRF | ❌ ([extract.js:6-11](../server/services/extract.js#L6-L11)) |
| RS-08 | Cabeceras: CSP estricta, `frame-ancestors 'none'`, `nosniff`, HSTS, `Referrer-Policy`; CORS limitado a los orígenes conocidos | D | `security.mdc`, `web-app.md` | ❌ |
| RS-09 | Todas las dependencias del frontend empaquetadas con Vite y con versión fija (marked, mermaid, markmap, pdf.js, xlsx…); **nada** desde CDN | D | LLM03, G3 | ❌ |
| RS-10 | TLS 1.3 de extremo a extremo (gateway, Keycloak, Postgres, LLM) | D | SECURITY_CONTEXT | ❌ |
| RS-11 | Límite de peticiones en el gateway (referencia: 30 req/min, ráfaga 10) y cuotas en la app | D | SECURITY_CONTEXT, G12 | ❌ |
| RS-12 | Secretos (BD, LLM, superadmin inicial y, en la etapa 2, Keycloak) en el almacén aprobado o en variables de entorno; secretos guardados en BD cifrados (el AACF menciona **Fernet**) | D | `security.mdc`, regla global 2 **[POL?]** | ⚠️ (AES-GCM con clave en disco) |
| RS-13 | Cifrado en reposo de la BD y los ficheros | D | `atexis-global.mdc`, ISO A.8.24 | ❌ |
| RS-14 | Separar instrucciones y datos en todos los prompts con contenido de usuario o externo | D | LLM01 | ❌ |
| RS-15 | La salida de la IA se trata como no confiable: sanitizado (DOMPurify o equivalente), infografías en iframe sin scripts, mermaid en modo `strict`, sin `dangerouslySetInnerHTML` sin sanitizar | D | LLM05, `security.mdc` § XSS | ⚠️ referencia |
| RS-16 | Ficheros servidos solo tras comprobar la autorización, sin rutas predecibles | D | OWASP A01 | ❌ |
| RS-16b | **Imágenes subidas**: lista de formatos permitidos (PNG, JPEG, WebP, GIF) comprobada por **contenido** (no por extensión ni tipo MIME declarado); **SVG no permitido** (puede llevar scripts); tamaño máximo y dimensiones máximas configurables (HR0); **reprocesado** en el servidor (decodificar y volver a codificar) para eliminar metadatos EXIF y contenido incrustado; nombre de fichero generado por el servidor; se sirven con `Content-Type` fijo, `nosniff` y `Content-Disposition` seguro; cuota de almacenamiento por usuario | D | `security.mdc` (validación, nombres de fichero), OWASP A04/A05 | ❌ |
| RS-17 | Errores al cliente sin detalles internos; logs estructurados en JSON con el detalle; nunca contraseñas, tokens ni contenido personal en los logs | D | Regla global 5, `python.mdc` | ⚠️ |
| RS-18 | Control de **egress**: en la primera versión el servidor solo sale hacia los proveedores de IA aprobados (servidor interno de ATEXIS y Mistral de ALTEN). **Sin búsquedas en internet** (D-10 aplazada) y sin descarga de URLs. | D | SECURITY_CONTEXT, D-10 **[POL?]** | ❌ |
| RS-19 | Contenedores sin root, imagen base mínima de un registro aprobado, sin secretos en capas, sistema de ficheros de solo lectura, healthcheck | D | Hardening dominio 6 | ❌ |
| RS-20 | Dependencias Python y npm: versiones exactas, lockfiles (`uv.lock` / `package-lock.json`), comprobación de existencia y antigüedad antes de añadirlas, SBOM CycloneDX en cada build | D | G3, G4, LLM03, `python.mdc` | ❌ |
| RS-21 | Prohibido `from __future__ import annotations` en los ficheros de rutas de FastAPI | D | Hard rules (pitfall) | — |
| RS-22 | ⏸ (Solo si se reactiva D-16 o se añaden notificaciones por correo.) Email a través del **relay SMTP corporativo** (en la lista de destinos permitidos), con credenciales en el almacén de secretos; plantillas sin inyección de cabeceras ni HTML de usuario sin escapar; solo a direcciones de dominios corporativos permitidos **[POL?]** | D | RS-18, `security.mdc`, regla global 2 | ❌ |

---

## 7. Privacidad y cumplimiento (RC)

| ID | Requisito | Prio | Origen | Hoy |
|---|---|---|---|---|
| RC-01 | **Análisis previo de DPIA** con el DPO. Tras D-03/D-04 el riesgo baja, pero sigue habiendo datos personales (cuentas, actividad, chats, autoevaluaciones privadas). El DPO decide si hace falta una DPIA completa. | D | GDPR art. 35, control 4.3, checklist T2 | ❌ |
| RC-02 | **Clasificación EU AI Act** documentada: probablemente riesgo limitado o mínimo. Recoger expresamente que los resultados **no** se usan para evaluar a empleados (RF-EVA-07). | D | Controles 5.1, 5.2 | ❌ |
| RC-03 | Aviso de privacidad y uso de IA dentro de la app | D | GDPR arts. 13–14, AI Act art. 50 | ❌ |
| RC-04 | Derechos del interesado: acceso, exportación y borrado de sus propios datos | D | GDPR arts. 15–22 | ❌ |
| RC-05 | **Política de retención** por tipo de dato (capa personal, chats, resultados, usuarios desactivados; auditoría ≥ 90 días) | D | GDPR art. 5(1)(e), SECURITY_CONTEXT **[POL?]** | ❌ |
| RC-06 | No enviar datos personales a modelos externos. Para Mistral de ALTEN: confirmar el DPA, que no entrena con nuestros datos y la retención de prompts. | D | GDPR art. 28, controles 4.1/4.7 | ❌ |
| RC-07 | Registro del tratamiento (RoPA) actualizado | D | GDPR art. 30 | ❌ |
| RC-08 | Clasificación de datos de la app con techo "Interno" para T2; documentación confidencial de proyectos o clientes, solo con controles de T3 | D | Regla global 3 **[POL?]** | ❌ |
| RC-09 | Confirmar con Legal/RRHH que, sin compartir resultados, **no** hace falta informar a la representación de los trabajadores | R | Derecho laboral | ❌ |
| RC-10 | Formación (AI literacy) previa al acceso, si la política lo exige | R | AI Act art. 4 | ❌ |

---

## 8. Requisitos no funcionales (RNF)

| ID | Requisito | Prio | Origen | Hoy |
|---|---|---|---|---|
| RNF-01 | Estructura de proyecto de la plantilla: `frontend/` (components, pages, services, stores, hooks, types) y `backend/app/` (api, db, services, auth, config.py, main.py), `docker-compose.yml` | D | `web-app.md` | ❌ |
| RNF-02 | Backend: Python 3.12, type hints y docstrings en las funciones públicas, `async` en la E/S, `pathlib`, excepciones específicas, `logging` en JSON, `pyproject.toml` + `uv` | D | `python.mdc` | ❌ |
| RNF-03 | Datos: SQLAlchemy 2.0 async + asyncpg + Alembic; **sin SQL directo en los handlers**; lógica de negocio en servicios | D | `python.mdc`, `atexis-global.mdc` | ❌ |
| RNF-04 | Frontend: TS `strict`, tipos de retorno explícitos, `unknown` en lugar de `any`, componentes funcionales, cliente API centralizado y tipado, estado de servidor con React Query (sin duplicarlo en Zustand) | D | `javascript.mdc` | ❌ |
| RNF-05 | **Sistema de diseño ATEXIS**: tokens DTCG → CSS vars (Style Dictionary), registry shadcn ATEXIS, Inter, `#2E74B5`, solo colores semánticos | D | `design-system.md`, `branding.md` | ❌ |
| RNF-06 | **WCAG 2.2 AA**, `prefers-reduced-motion`, responsive hasta móvil | D | `design-system.md` | ❌ |
| RNF-07 | Patrones de `ui-kit.md`: sidebar plegable, migas de pan, pestañas, paleta de comandos Ctrl+K, DataTable paginada, formularios con la etiqueta encima | D | `ui-kit.md` | ❌ |
| RNF-08 | i18n en/es/fr para todo el texto (HR15) y sin claves técnicas visibles (HR21). La norma cita `next-intl`; en Vite se usa el equivalente verificado. | D | HR15, HR21 | ✅ referencia |
| RNF-09 | Mutaciones optimistas con vuelta atrás si el servidor rechaza | D | HR20 | ❌ |
| RNF-10 | Storybook como contrato visual de los componentes | R | `design-system.md` | ❌ |
| RNF-11 | API documentada con OpenAPI (FastAPI la genera) | D | Regla global 9 | ❌ |
| RNF-12 | Tests: **pytest + pytest-asyncio** (backend) y tests de frontend; integración de cada endpoint **incluyendo el acceso denegado**; cobertura ≥ 80 % | D | Regla global 8, `python.mdc` | ⚠️ |
| RNF-13 | **Pruebas diferenciales** contra la implementación actual en la lógica portada (SM-2, fragmentación, citas, parseo de JSON, validación de exámenes, ingesta): los tests de `server/services/*.test.js` son el oráculo | D | Hardening dominio 9 | ✅ referencia |
| RNF-14 | Despliegue con `docker-compose` en una VM aprovisionada por IT, mediante script (HR5), comprobando que no hay otro despliegue en marcha (HR16) | D | `internal-tool.md`, checklist T2 | ❌ |
| RNF-15 | Entornos dev / test / prod separados | D | ISO A.8.31 | ❌ |
| RNF-16 | `health` y `ready`; logs y auditoría enviados al SIEM con la retención de la política | D | Hardening dominio 10, G7 | ❌ |
| RNF-17 | Copia de seguridad de Postgres, ficheros y Keycloak, con restauración probada | D | Operación | ❌ |
| RNF-18 | Sin estado en memoria del proceso (varios workers o réplicas posibles) | D | Robustez | ❌ |
| RNF-19 | Fase de pruebas: unos **10 usuarios** (D-15). Arquitectura sin estado (RNF-18) para crecer sin rediseño; dimensionado y pruebas de carga para toda la plantilla antes de abrirla (etapa 2). | D | Regla global 10, D-15 | ❌ |

---

## 9. Gobernanza y proceso (RG)

| ID | Requisito | Prio | Origen | Hoy |
|---|---|---|---|---|
| RG-01 | Iniciativa registrada en **IdAI** | D | Checklist T2 | ❌ |
| RG-02 | **Revisión de IS** y evaluación de riesgo LOW/STANDARD | D | Checklist T2 | ❌ |
| RG-03 | Alta en el **AI Tool Registry** | D | Checklist T2 | ❌ |
| RG-04 | Revisión mensual de uso y trimestral en IdAI | D | Checklist T2 | ❌ |
| RG-05 | Controles ISO 27001 mapeados | D | Checklist T2 | ❌ |
| RG-06 | Guardrails T2: G1 pre-commit, G2 escaneo de secretos como puerta de merge, G3 allowlist de dependencias y lockfile, G5 protección de `main`, G6 aprobación humana, G7 auditoría al SIEM, G10 SAST/SCA/DAST en CI, G11 grounding y temperatura baja, G12 cuotas | D | `guardrails.md` | ❌ |
| RG-07 | Revisión por pares (1 revisor), con el código de IA identificado | D | `code-review-guidelines.md` | ❌ |
| RG-08 | Modelo de amenazas (STRIDE y MITRE ATLAS) antes de construir | D | Control 2.9 | ❌ |
| RG-09 | Revisión final con `security-reviewer` e informe de hardening (GO / GO-WITH-CONDITIONS / NO-GO) | D | Agentes AACF | ❌ |
| RG-10 | Acceso a `idai-policies` para validar los requisitos **[POL?]** | D | Hardening Step 1 | ❌ |
| RG-11 | **Excepción temporal documentada** a `security.mdc` (Keycloak OIDC): autenticación local **solo** para pruebas en local y el primer testing en el servidor, con **usuarios de prueba acotados** y sin datos confidenciales. **Condición de salida:** la etapa 2 (Keycloak, implantado por IT) es **requisito previo** para abrir la app al conjunto de la plantilla. Comunicar la excepción a IS antes del testing en el servidor. | D | D-01b revisada, HR4 | ❌ |
| RG-12 | **[E2]** Coordinar con IT el alta de Aura Learn en Keycloak: cliente OIDC, los 4 roles, política de MFA y federación con Microsoft. Migrar los usuarios de la etapa 1 enlazando `external_sub`. | D | Etapa 2 | ❌ |

---

## 10. Qué se reaprovecha (D-02: conocimiento, no código)

| Activo actual | Uso en la nueva versión |
|---|---|
| Prompts ([prompts.js](../server/services/llm/prompts.js)) | Se **copian como texto** a Python. Son el activo de más valor. |
| Perfiles por modelo, reparación de JSON y validadores ([llm/](../server/services/llm/)) | Se portan a Python; los tests actuales son el oráculo |
| SM-2 ([srs.js](../server/services/srs.js)), fragmentación y citas ([rag.js](../server/services/rag.js), [citations.js](../server/services/citations.js)), ingesta ([ingest.js](../server/services/ingest.js)) | Se portan con **pruebas diferenciales** (RNF-13) |
| Reglas de validación de exámenes, estructura y teach-back | Se pasan a modelos Pydantic |
| Claves y textos de i18n en/es/fr ([i18n.js](../public/js/i18n.js)) | Se convierten a ficheros de traducción |
| Flujos de usuario y [SPEC.txt](SPEC.txt) | Especificación funcional de paridad |
| Formato ZIP de export (`manifest.json` v1) | Solo como referencia de diseño del nuevo export/import (no se migran datos, D-14) |
| [PROMPT_FOLDER_INGEST.md](PROMPT_FOLDER_INGEST.md) | Diseño de la ingesta, pasado a trabajos en el servidor |

---

## 11. Decisiones abiertas

| # | Pregunta | Afecta a |
|---|---|---|
| ~~D-01~~ | ✅ Usuarios propios con 4 roles; IT federará Microsoft más adelante | §2, §5.1 |
| ~~D-01b~~ | ✅ (revisada) Registro de usuarios propio en BD durante las pruebas; Keycloak lo implantará IT más adelante | §5.1, RG-11/12 |
| ~~D-02~~ | ✅ Migrar a la plantilla AACF | Todo |
| ~~D-03 / D-04 / D-06~~ | ✅ No se comparten evaluaciones | §5.6 |
| D-05 | Compartir: ¿con usuarios, grupos o toda ATEXIS? ¿Solo lectura o coedición? | RF-SHR-02/03 |
| ⏸ D-07 | *(Pendiente de RRHH)* ¿El instructional designer publica directamente o hace falta la aprobación de otro? Mientras tanto, el ID o el superadmin publican directamente, con la revisión humana registrada (RF-ATX-06). | RF-ATX-02/06 |
| ~~D-08~~ | ✅ **Ambos**: servidor interno de IA de ATEXIS y Mistral de ALTEN. Queda pendiente: elegir **un** modelo de embeddings común (RF-IA-03) y confirmar el DPA del entorno ALTEN (RC-06). | RF-IA-01/03, RC-06 |
| ⏸ D-09 | **Aplazado a una fase posterior**: voz (Whisper/Chatterbox), narración TTS y teach-back. No entran en la primera versión. | Alcance |
| ⏸ D-10 | **Aplazado a una fase posterior**: búsquedas en internet (imágenes de Wikimedia/Openverse, citas web, fuentes por URL). No entran en la primera versión. | RS-18 |
| ⏸ D-11 | *(Pendiente)* ¿Qué clasificación de datos tendrán los cursos (Interno vs Confidencial)? Mientras tanto se trabaja con techo **Interno** y sin datos confidenciales (RC-08, RG-11). | Tier T2 vs T3 |
| ⏸ D-12 | *(Pendiente)* Retención: ¿cuánto se guarda cada tipo de dato? ¿Qué pasa con los datos de un usuario desactivado? Los periodos serán configurables (HR0) para no bloquear el desarrollo. | RC-05 |
| ~~D-13~~ | ✅ **No** se reutilizan respuestas de IA entre usuarios: cada usuario hace consultas distintas y se quiere personalizar el aprendizaje | RF-CAP-07 |
| D-14 | ¿Los cursos actuales se migran como cursos personales del autor o como borradores ATEXIS? | RF-IO-04 |
| ~~D-15~~ | ✅ Unos **10 usuarios** en la fase de pruebas. El dimensionado para toda la plantilla se revisa antes de la etapa 2. | RNF-19 |
| ~~D-23~~ | ✅ Imágenes: el usuario **sube las suyas**; el servidor no genera imágenes | RF-CAP-08, RS-16b |
| D-16 | ⏸ **En suspenso**: funciones del PM (propuestas y asignaciones). Se revisará con RRHH y con el responsable de formación interna. | §2, §5.10 |
| ~~D-17~~ | ✅ El superadmin también crea y publica cursos ATEXIS | §2, RF-ATX-01 |
| ⏸ D-18 | *(Aparcada con D-16)* **¿Qué ve el PM de una asignación?** Opciones: (a) solo que la hizo; (b) si el asignado ha **abierto** o **completado** el curso; (c) nada más. Ver el avance es un dato personal sobre la actividad de un empleado: con (b) habría que pasar por la DPIA y por Legal/RRHH (RC-01, RC-09). Se recomienda **(a)**. | RF-ASG-09, RC-01 |
| ⏸ D-19 | Si el email del asignado no tiene cuenta: ¿se envía una invitación (alta automática con rol plain user) o se crea una solicitud para que la apruebe el superadmin? | RF-ASG-04 |
| ⏸ D-20 | ¿Qué es "el equipo" de un PM? ¿Lo mantiene el propio PM, lo asigna el superadmin o vendrá del directorio cuando IT integre Microsoft? | RF-ASG-01 |
| ⏸ D-21 | ¿La propuesta del PM es solo una solicitud (título, objetivos, documentación) o puede ser un borrador de curso completo hecho con la IA? | RF-PRO-02 |
| ⏸ D-22 | **Para IT**: ¿los empleados ya existen en el Keycloak corporativo? Si es así, no hay que crear usuarios, solo asignar roles, y el superadmin inicial se define en Keycloak. | RF-ID-01/03/04 |
