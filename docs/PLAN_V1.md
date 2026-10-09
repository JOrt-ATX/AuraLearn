# Plan de trabajo — Aura Learn v1 (fase de pruebas)

| | |
|---|---|
| **Fecha** | 2026-10-09 |
| **Alcance** | Primera versión según [REQUISITOS_MULTIUSUARIO.md §0.1](REQUISITOS_MULTIUSUARIO.md): plantilla AACF, usuarios propios (etapa 1), cursos ATEXIS y personales, capa personal, exámenes privados, ~10 usuarios de prueba |
| **Fuera** | Keycloak (etapa 2, IT), voz y teach-back (D-09), búsquedas en internet (D-10), funciones del PM (D-16), compartición ampliada y aprobación de la publicación (D-05, D-07) |
| **Estimaciones** | **No hay estimaciones de tiempo ni de esfuerzo**, por la hard rule HR14 (modelo de un solo desarrollador). El plan fija **orden, dependencias y criterios de salida**. |

---

## 0. Principios de ejecución

1. **Rebanadas verticales.** Desde la fase 4, cada función se entrega completa: modelo de datos y migración Alembic, servicio, endpoint con autorización, pantalla, textos i18n (en/es/fr), tests y entrada en la auditoría. No se pasa a la siguiente sin cumplir el criterio de salida (HR2).
2. **El código actual es el oráculo.** Se mantiene en el repositorio mientras se porta. La lógica portada (SM-2, fragmentación, citas, parseo de JSON, validadores, ingesta) se comprueba con **pruebas diferenciales** contra la implementación actual (RNF-13). Al final se elimina (HR13).
3. **Guardrails desde el principio.** El pre-commit y la CI se montan en la fase 1, no al final (G1, G10).
4. **Autorización por defecto denegada.** Ningún endpoint nace sin su política de acceso y su test de acceso denegado (RS-04).
5. **Cada dependencia nueva se verifica antes de instalarla**: que existe, su antigüedad, que está mantenida y sus vulnerabilidades. Queda anotada en el registro de dependencias (G3, G4, RS-20).
6. **Bloqueos a la vista.** Si algo no se puede hacer como está especificado, se para y se escala (HR4); no se simplifica en silencio.

---

## 1. Antes de empezar: lo que necesito de ti o de terceros

| # | Necesidad | Para | Bloquea |
|---|---|---|---|
| N-1 | **Estrategia de repositorio.** Propuesta: mismo repo `ATEXIS/AuraLearn`, rama `v1`, carpetas `frontend/` y `backend/` según la plantilla; la app actual queda en su sitio como oráculo hasta la fase 7. | Fase 1 | Fase 1 |
| N-2 | **URL y credenciales del servidor de IA interno de ATEXIS** y del **entorno Mistral de ALTEN**, con los modelos disponibles (generación, multimodal, embeddings) | Fase 3 | Fase 3 |
| N-3 | **Confirmación del DPA de ALTEN Mistral** (no entrena con nuestros datos, retención de prompts), RC-06 | Usar ALTEN con contenido real | Fase 8 (no el desarrollo) |
| N-4 | Acceso al **registry shadcn de ATEXIS** (`design-system.md`). Si no existe o no hay acceso, se generan los tokens a partir de `branding.md`. | Fase 1 | No (hay alternativa) |
| N-5 | **Permisos de administrador** del repo en GitHub para proteger `main` (G5) | Fase 1 | No (se puede hacer después) |
| N-6 | **VM de pruebas** aprovisionada por IT, con Docker, registro de imágenes aprobado, certificado TLS y nombre DNS interno | Fase 8 | Fase 8 |

---

## 2. Fases

### Fase 0 — Gobierno (en paralelo con las fases 1–3)

No es código, pero va por delante para que no bloquee la fase 8.

| Tarea | Ref. |
|---|---|
| Comunicar a IS la **excepción temporal de autenticación** (etapa 1) y sus condiciones | RG-11 |
| Comunicar a IS la **clave de administrador expuesta** en `agents/codebase-hardening.agent.md` del AACF | [Plan de cumplimiento §4](ATEXIS_COMPLIANCE_PLAN.md) |
| Pedir **acceso de lectura a `idai-policies`** para resolver los [POL?] | RG-10 |
| **Registrar la iniciativa en IdAI** y en el **AI Tool Registry** | RG-01, RG-03 |
| **Análisis previo de DPIA** con el DPO y **clasificación EU AI Act** (riesgo limitado o mínimo, con el invariante RF-EVA-07) | RC-01, RC-02 |
| **Modelo de amenazas** inicial (STRIDE; MITRE ATLAS para la parte de IA): fronteras de confianza, entradas, fuga entre usuarios por el RAG, inyección de prompt, subida de ficheros | RG-08 |

**Salida:** IS conoce la excepción y ha respondido; iniciativa registrada; modelo de amenazas escrito en `docs/`.

---

### Fase 1 — Esqueleto y guardrails

| Tarea | Ref. |
|---|---|
| Estructura de la plantilla: `frontend/` (components, pages, services, stores, hooks, types) y `backend/app/` (api, db, services, auth, config.py, main.py), `docker-compose.yml` | RNF-01 |
| **Backend**: Python 3.12 con `uv` + `pyproject.toml` + `uv.lock`; FastAPI con `health` y `ready`; logs JSON; gestor central de errores sin filtrar detalles al cliente | RNF-02, RS-17 |
| **Base de datos**: Postgres 16 + pgvector en compose; SQLAlchemy 2.0 async + asyncpg; Alembic con la migración base | RNF-03, RNF-01 |
| **Configuración**: módulo de configuración con **fusión profunda** (HR10), secretos solo por entorno y validación al arrancar | HR0, HR8, HR10, RS-12 |
| **Frontend**: React 18 + Vite 6 + TS `strict`; Tailwind 4 + shadcn; **tokens ATEXIS** (DTCG → Style Dictionary → CSS vars); Inter; layout con sidebar plegable, migas de pan y Ctrl+K; React Query + Zustand; cliente API tipado (generado desde OpenAPI) | RNF-04..07 |
| **i18n** en/es/fr con la librería equivalente a `next-intl` (verificada, G4); se migran las claves útiles de [i18n.js](../public/js/i18n.js); utilidad para humanizar textos (HR21) | RNF-08 |
| **Cabeceras de seguridad** y CORS limitado | RS-08 |
| **Pre-commit** (G1): gitleaks, ruff, mypy, eslint, prettier y bloqueo de patrones prohibidos (`localStorage`, `sessionStorage`, `from __future__ import annotations` en rutas, `.slice(0,` / `[:N]` sobre contenido) | G1, HR1, HR6, RS-21 |
| **CI** (G10): pytest, tests de frontend, CodeQL, `pip-audit` + `npm audit`, gitleaks, SBOM CycloneDX y build de imágenes; las críticas bloquean | G2, G3, G10, RS-20 |
| **Contenedores** sin root, imagen base mínima, sin secretos en capas, healthcheck | RS-19 |
| Protección de `main` (cuando haya permisos, N-5) | G5 |
| Storybook con los componentes base | RNF-10 |

**Salida:** `docker compose up` arranca BD, API y frontend; la página vacía sale con el tema ATEXIS en los 3 idiomas; la CI pasa en verde; un commit con un secreto o con `localStorage` es rechazado.

---

### Fase 2 — Identidad, autorización y auditoría (etapa 1)

| Tarea | Ref. |
|---|---|
| Tablas `users` (con `external_sub` nulo), `user_roles`, `sessions` y `audit_log` | §4, RF-ID-09 |
| Hash **argon2id**; política de contraseñas configurable; lista de contraseñas comunes | RF-ID-07 |
| Login y logout con **sesión en servidor** y cookie HTTP-only/Secure/SameSite; identificador nuevo tras el login; timeout de 30 min por inactividad; máximo 4 sesiones; **CSRF** | RS-01..03, RF-ID-12 |
| **Bloqueo progresivo** y límite de peticiones en el login, con aviso al superadmin | RF-ID-08 |
| **Superadmin inicial** desde el entorno, idempotente; cambio de contraseña obligatorio | RF-ID-03 |
| **Marco de autorización**: dependencia FastAPI con rol + política por objeto, **denegada por defecto**; utilidad de tests "acceso denegado" | RS-04 |
| Consola de usuarios: alta con contraseña temporal, edición, roles, desactivar/reactivar, restablecer contraseña; protección del **último superadmin** | RF-ID-04..06, RF-ID-10, RF-ID-14, RF-ADM-02 |
| Perfil: cambio de contraseña, preferencias por usuario (idioma) | RF-ID-10 |
| **Auditoría** de todos los eventos de identidad; visor básico de metadatos (sin contenido) | RF-ID-15, RF-ADM-06 |
| MFA TOTP para superadmin | RF-ID-11 (R) |
| Autenticación aislada en `backend/app/auth/` (el resto solo conoce `user_id` y roles) | RF-ID-09 |

**Salida:** se puede entrar como superadmin, crear un usuario de cada rol y entrar con él; todos los endpoints exigen sesión; los tests cubren login, bloqueo, expiración, CSRF, último superadmin y acceso denegado por rol.

---

### Fase 3 — Plataforma de IA, configuración y trabajos

| Tarea | Ref. |
|---|---|
| **Consola de configuración de plataforma** (HR0): proveedores, modelos, límites, cuotas, parámetros del vigilante, retención, funciones activables | RF-ADM-01 |
| **Proveedores de IA**: alta por el superadmin del servidor de IA interno y de Mistral ALTEN (con N-2); proveedor activo por tarea; claves cifradas | RF-IA-01, RF-ADM-03, RS-12 |
| **Portar la capa LLM** a Python: adaptador compatible con OpenAI, **perfiles por modelo**, reparación de JSON y validadores, con **pruebas diferenciales** contra [llm/](../server/services/llm/) | RF-IA-02, RNF-13 |
| **Portar los prompts** ([prompts.js](../server/services/llm/prompts.js)) con **separación de instrucciones y datos** (delimitadores y salida estructurada) | RS-14, LLM01 |
| **Sin recortes**: la entrada que supere el contexto se trata por fragmentos o con resumen LLM, nunca cortando | RF-IA-08, HR6 |
| **Embeddings**: elegir **un** modelo común (con N-2); tablas con `vector`; índice pgvector | RF-IA-03, RNF-02 |
| **Cola de trabajos persistente** en Postgres: progreso, reanudación, **vigilante con escalado** (sin topes silenciosos), reparto justo entre usuarios | RF-IA-05, RF-IA-06, HR18/19 |
| **Consumo y cuotas** por usuario (`llm_log` ampliado); diagnóstico por modelo y tarea | RF-ADM-04, RF-ADM-07, G12 |
| **Kill switch** (usuario, función, proveedor) | RF-ADM-05 |
| Solo endpoints por tarea, sin endpoint genérico de prompt | RF-IA-04 |

**Salida:** el superadmin da de alta los dos proveedores y los prueba desde la consola; un trabajo de prueba se encola, avanza, sobrevive a un reinicio y escala si se atasca; las pruebas diferenciales de la capa LLM pasan.

---

### Fase 4 — Cursos: autoría, catálogo y compartición

| Tarea | Ref. |
|---|---|
| Modelo `courses` / `subjects` / `units` / `explanations` con `kind`, `owner_id`, `status`, `deleted_at`, `layer` y **versiones de explicaciones** | §4, RF-ATX-04 |
| **Catálogo** con tres secciones (ATEXIS publicados, mis cursos, compartidos conmigo), paginado, con búsqueda y filtros | RF-CAT-01..04 |
| **Autoría con IA** (port de la funcionalidad actual): objetivos, estructura (curso, asignatura, unidad), explanations simples, con contexto o fundamentadas en fuentes | RF-ATX-03, RF-PER-01 |
| **Fuentes por fichero o texto**: extracción **en el servidor** (PDF, DOCX, XLSX, TXT/MD) como trabajo; fragmentación (port con oráculo) e indexado | RF-ATX-03, RNF-13 |
| **Ingesta de carpeta** como trabajo de servidor (mapa → plan → vista previa → confirmar → expandir), siguiendo [PROMPT_FOLDER_INGEST.md](PROMPT_FOLDER_INGEST.md) | RF-ATX-03, RF-IA-05 |
| **Ciclo de publicación** borrador → publicado → retirado, con **revisión humana registrada**; lo hacen el ID y el superadmin | RF-ATX-01/02/06, D-17 |
| **Borrado lógico** con confirmación registrada | RF-ATX-05, HR9 |
| **Compartir** cursos personales con usuarios concretos en solo lectura; listar y revocar; auditoría | RF-PER-02, RF-SHR-01/03/04/07/10 |
| Mutaciones **optimistas** con vuelta atrás | RNF-09, HR20 |
| Etiqueta "generado por IA" | RF-IA-07 |

> **Dependencia a revisar:** el paquete `xlsx` (SheetJS) de npm está anclado en una versión antigua con vulnerabilidades conocidas, y las versiones nuevas solo se distribuyen fuera de npm. Por eso la extracción de XLSX se hace en el servidor con una librería Python verificada (G4).

**Salida:** un ID crea un curso con IA (también desde una carpeta), lo publica y un plain user lo ve en el catálogo; un plain user crea un curso personal, lo comparte con otro y este lo ve en solo lectura; los tests de acceso denegado cubren los cursos ajenos, los borradores y las comparticiones revocadas.

---

### Fase 5 — Estudio y capa personal

| Tarea | Ref. |
|---|---|
| **Visor de explicaciones** con la capa personal superpuesta y diferenciada visualmente | RF-CAP-01..03 |
| **Herramientas de selección**: explicar término (caché por usuario), nota (con etiqueta y ancla), **subir imagen** | RF-CAP-02, RF-CAP-07, RF-CAP-08 |
| **Subida de imágenes segura**: formato por contenido, sin SVG, reprocesado sin EXIF, límites, cuota, entrega con cabeceras seguras | RS-16, RS-16b |
| **Explicaciones y fuentes personales** sobre cursos ajenos | RF-CAP-02 |
| **Chat RAG privado** con **filtrado por visibilidad en la consulta pgvector**; citas (port con oráculo) | RF-CAP-04, RS-05 |
| **Batería de tests de no fuga** entre usuarios en el RAG, la API y los ficheros (usuarios A/B, curso compartido y revocado, borrador) | RS-05, OWASP LLM08 |
| **Flashcards**: generación, alta manual y repaso con **SM-2 por usuario** (port con oráculo) | RF-CAP-05, RNF-13 |
| **Materiales de estudio**: guía, mapa mental (markmap), infografía (iframe sin scripts), diagrama (mermaid en modo `strict`), con salida sanitizada | RS-15 |
| **Exportar e importar** el nuevo formato: cursos personales y capa personal; la importación crea cursos personales; límites del ZIP | RF-IO-01..03, RF-IO-05, RF-CAP-06 |

**Salida:** dos usuarios estudian el mismo curso ATEXIS y ninguno ve nada del otro (comprobado por los tests de no fuga); flashcards y artefactos funcionan con paridad respecto a la app actual.

---

### Fase 6 — Exámenes privados

| Tarea | Ref. |
|---|---|
| Generar exámenes (6 de opción múltiple + 4 de respuesta escrita) con validación (port con oráculo); exámenes oficiales del curso y personales | RF-EVA-09 (referencia), RNF-13 |
| **Intentos por usuario** con historial | RF-EVA-02 |
| **Corrección en el servidor**: las respuestas correctas no llegan al navegador antes de entregar; nota y feedback calculados en el servidor | RF-EVA-03, RF-EVA-04 |
| Corrección de las preguntas escritas con LLM en el servidor, con la etiqueta "corregido por IA" | RF-EVA-05 |
| **Resultados privados**: tests que demuestran que ningún rol, superadmin incluido, ve resultados ajenos | RF-EVA-01, RF-EVA-07 |
| El usuario borra sus resultados con confirmación | RF-EVA-06 |

**Salida:** ciclo completo de examen; manipular la petición no cambia la nota; los tests de privacidad pasan.

---

### Fase 7 — Cumplimiento, endurecimiento y cierre de paridad

| Tarea | Ref. |
|---|---|
| **Aviso de privacidad y de uso de IA**; exportación y borrado de los datos propios | RC-03, RC-04 |
| **Retención configurable** con un trabajo de purga, sin borrar datos sin confirmación registrada | RC-05, HR9 |
| **Barrido de hard rules** con la checklist del agente `codebase-hardening`: HR0, HR6, HR7, HR11, HR13, HR15, HR18/19, HR20, HR21 | CL-HR* |
| **WCAG 2.2 AA**: teclado, contraste, foco, `prefers-reduced-motion`, responsive | RNF-06 |
| **Cobertura ≥ 80 %** del código nuevo | RNF-12 |
| **DAST** (OWASP ZAP) contra la instancia en compose | G10, hardening dominio 7 |
| **Revisión con `security-reviewer`** y **informe de hardening** (GO / GO-WITH-CONDITIONS / NO-GO) | RG-09 |
| **Eliminar la app antigua** del árbol (queda en el historial de git) una vez cerrada la paridad | HR13 |
| Actualizar [SPEC.txt](SPEC.txt), [security_assessment.md](../security_assessment.md) y el README; documentación OpenAPI publicada | RNF-11 |

**Salida:** veredicto GO o GO-WITH-CONDITIONS sin hallazgos críticos ni altos abiertos.

---

### Fase 8 — Despliegue de pruebas en el servidor

| Tarea | Ref. |
|---|---|
| **Script de despliegue** (HR5) que comprueba que no hay otro despliegue en marcha (HR16) | RNF-14 |
| Entornos **dev / test** separados con credenciales propias | RNF-15 |
| **TLS** en el gateway y hacia la IA | RS-10 |
| **Egress** limitado a los dos proveedores de IA | RS-18 |
| Rate limiting en el gateway | RS-11 |
| **Copia de seguridad y restauración probada** de Postgres y ficheros | RNF-17 |
| Logs y auditoría hacia el **SIEM** (o almacén aprobado) | RNF-16, G7 |
| Cifrado en reposo (volumen o BD, según lo que aporte IT) | RS-13 |
| Alta de los **~10 usuarios de prueba**; confirmación de IS de la excepción RG-11; DPA de ALTEN confirmado (N-3) antes de usar contenido real | RG-11, RC-06 |
| Canal de feedback de los usuarios de prueba | — |

**Salida:** 10 usuarios usando la app en el servidor interno, con copia de seguridad probada y auditoría en marcha.

---

## 3. Dependencias y camino crítico

```
F0 Gobierno ─────────────────────────────────────────────────┐ (en paralelo)
F1 Esqueleto ─► F2 Identidad ─► F3 IA/trabajos ─► F4 Cursos ─► F5 Estudio ─► F6 Exámenes ─► F7 Cierre ─► F8 Servidor
                                   ▲ N-2                                                               ▲ N-3, N-6, RG-11
```

- **Camino crítico:** F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8.
- **N-2** (accesos a la IA) es el primer bloqueo externo: hay que tenerlo antes de la fase 3.
- **N-6** (VM), **N-3** (DPA de ALTEN) y la respuesta de IS a la **RG-11** bloquean la fase 8. Por eso la fase 0 empieza ya.
- F5 y F6 dependen de F4, pero no entre sí; se pueden alternar.

## 4. Riesgos

| Riesgo | Mitigación |
|---|---|
| Fuga de datos entre usuarios a través del RAG | Filtrar en la consulta (RS-05) y batería de tests de no fuga como criterio de salida de F5 |
| Pérdida de comportamiento al portar de JS a Python | Pruebas diferenciales con el código actual como oráculo (RNF-13) |
| Los modelos del servidor interno se comportan distinto que los usados hasta ahora | Perfiles por modelo y reparación de JSON portados; pruebas en F3 con N-2 |
| Capacidad del LLM compartido con 10 usuarios | Cola de trabajos con reparto justo y cuotas (RF-IA-06, G12) |
| No hay acceso al registry shadcn de ATEXIS | Tokens generados a partir de `branding.md` (N-4) |
| IS no acepta la excepción de autenticación para las pruebas | Se sabe en F0; la autenticación aislada (RF-ID-09) permite adelantar Keycloak si fuera necesario |
| Dependencias abandonadas o vulnerables (p. ej. `xlsx` en npm) | Verificación G4 y registro de dependencias antes de cada alta |

## 5. Después de la v1 (etapa 2 y siguientes)

Keycloak y Microsoft (IT) · retirada de las contraseñas locales · decisiones de RRHH (D-05, D-07, D-16) · voz y teach-back (D-09) · búsquedas en internet con SSRF (D-10) · clasificación y retención definitivas (D-11, D-12) · dimensionado y pruebas de carga para toda la plantilla (RNF-19).
