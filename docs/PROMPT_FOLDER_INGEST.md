# Prompt de implementación — «Crear curso completo desde una carpeta de documentación»

> Pega todo lo que hay debajo de la línea en una sesión nueva de Claude Code (Sonnet 5)
> abierta en `c:\AI\aura-learn`. Está escrito para ejecutarse de forma autónoma de
> principio a fin.

---

Eres un ingeniero senior trabajando en `c:\AI\aura-learn`. Implementa, de principio a
fin y de forma autónoma, la funcionalidad descrita más abajo. No me pidas confirmación
entre fases: las decisiones de diseño ya están tomadas y son parte del encargo.

## 0. Contexto del repositorio

Aura Learn es una app de estudio autoalojada y monousuario (estilo NotebookLM), portada
desde un export de Google AI Studio.

- **Frontend:** HTML/CSS/JS **vanilla puro**, sin framework y **sin paso de build**.
  Módulos ES nativos servidos estáticamente desde `public/`. Tailwind y `marked` por CDN.
  Patrón estado → render → delegación de eventos en `public/js/app.js`.
- **Backend:** Node 22+ y Express, persistencia con el `node:sqlite` integrado
  (`data/aura.db`). Arranque: `npm run dev` → http://localhost:8787 (solo loopback).
- **LLM:** multiproveedor tras `server/services/llm/`. Un adaptador compatible con OpenAI
  y otro nativo de Gemini, elegidos según la fila activa de la tabla `servers`. Las claves
  API viven **solo** en el servidor, nunca se envían al navegador.
- Hay un plan general del proyecto en `docs/DEVELOPMENT_PLAN.md`. Léelo por encima.

**Antes de escribir una sola línea, lee estos ficheros completos.** Son el contexto
mínimo imprescindible y la mayoría los vas a modificar:

```
server/schema.sql
server/db.js
server/index.js
server/routes/content.js
server/routes/sources.js
server/services/rag.js
server/services/llm/index.js
server/services/llm/prompts.js
server/services/llm/openai.js
server/services/llm/gemini.js
server/services/llm/profiles.js
public/js/app.js
public/js/api.js
public/js/state.js
public/js/extractors.js
public/js/views/modals.js
public/js/i18n.js
public/js/icons.js
```

## 1. Objetivo

En el modal «Crear curso» debe poder elegirse **una carpeta local** como fuente de
información. Al pulsar «Crear curso», el sistema procesa toda la documentación de esa
carpeta (docx, pdf, pptx, xlsx, md, html, xml, txt, csv, json e **imágenes** vía modelo
multimodal) y genera automáticamente las asignaturas, unidades y explicaciones que
**cubren todo el contenido**, con el texto de cada explicación redactado a partir de los
documentos reales, no del conocimiento general del modelo.

## 2. El problema central: la ventana de contexto

`maxInputChars` en `server/services/llm/profiles.js` va de 8.000 a 20.000 caracteres
según el modelo. Una carpeta de documentación técnica son fácilmente 300.000–1.000.000.
**No cabe en un prompt.** La arquitectura obligatoria es map-reduce:

1. **Map** — un *digest* por documento (título, resumen ≤600 caracteres, lista de temas,
   términos clave). Si el documento excede `maxInputChars`, se trocea con `chunk()` de
   `server/services/rag.js`, se digiere cada trozo y se fusionan los resultados.
2. **Reduce** — el conjunto de digests sí cabe en un prompt: de ahí sale el currículo
   completo **y el mapeo explicación ↔ documento**.
3. **Expand** — cada explicación se redacta con `retrieve()` limitado a los documentos
   que le corresponden.

## 3. Decisiones de diseño ya tomadas (no las cambies)

1. **Selector de carpeta:** `<input type="file" webkitdirectory multiple>`. Los ficheros
   se extraen **en el navegador**, reutilizando `public/js/extractors.js` tal cual. No
   implementes lectura de disco con `fs` en el servidor.
2. **Sí hay paso de previsualización.** El plan generado se muestra al usuario y este lo
   confirma antes de que se cree nada en la base de datos. Son decenas de llamadas al LLM:
   no se lanzan sin visto bueno.
3. **Un documento que cubre varias unidades se duplica** como fila en `sources` en cada
   una de ellas. Es la opción simple: cero migraciones, y `retrieve()`, export e import
   siguen funcionando sin tocarlos. No conviertas `sources` a scope de curso.
4. **OCR de PDFs escaneados queda fuera de alcance.** Si `extractPdf` lanza `no_text`, el
   fichero se marca como omitido y se informa en el resumen. No rendericen páginas a canvas.
5. **El pipeline es reanudable y granular.** El cliente orquesta bucles llamando a
   endpoints que procesan **un elemento cada vez**, para que haya progreso visible y para
   que un fallo puntual no tire el proceso entero. No añadas infraestructura de jobs en
   segundo plano, SSE ni websockets: la app no tiene nada de eso y no la vamos a introducir.

## 4. Convenciones que debes respetar

- **Todo el código y los comentarios, en inglés.** Este documento está en español; el
  código del repositorio no.
- Sin frameworks, sin bundler, sin `npm install` de dependencias nuevas en el backend.
  En el frontend se pueden cargar librerías bajo demanda por CDN (`await import('https://…')`),
  como ya hace `extractors.js`.
- Imita la densidad y el estilo de los comentarios existentes: bloques cortos que explican
  **por qué**, no qué. Fíjate en `server/services/rag.js` y `public/js/extractors.js`.
- Prompts al LLM: **todos** viven en `server/services/llm/prompts.js`, cada uno como una
  función que devuelve `{ system, prompt }`. Respeta la convención documentada en la
  cabecera del fichero: contenido primero, instrucción después, esquema JSON tercero,
  idioma al final.
- Toda salida JSON del LLM pasa por `generateJSON({ system, prompt, validate, task })`.
  Escribe siempre un `validate` real: el bucle de reparación con reintentos que ya existe
  depende de él para corregirse solo.
- Migraciones de esquema: `CREATE TABLE IF NOT EXISTS` en `server/schema.sql`; para
  columnas nuevas sobre tablas existentes, `ensureColumn()` en `server/db.js`.
- i18n: hay **tres** idiomas (`en`, `es`, `fr`) en `public/js/i18n.js`, en las secciones
  que empiezan hacia las líneas 15, 183 y 333. Cada clave nueva va en los tres. Nada de
  texto visible incrustado en el código.
- Iconos: usa los que ya existen en `public/js/icons.js` (`folderKanban`, `fileUp`,
  `sparkles`, `loader`, `image`, `checkCircle`, `xCircle`…). Si necesitas uno nuevo,
  añádelo ahí con el mismo formato de path SVG.
- Escapa siempre el contenido del usuario en el HTML con `escapeHtml()` de `public/js/ui.js`.

## 5. Fases

### Fase 1 — Extracción en el navegador

`public/js/extractors.js`:

- Amplía `ACCEPTED_EXTENSIONS` e `isSupportedDocument()` con `txt`, `csv`, `json` (ya caen
  solos en la rama `TextDecoder` de `extractText`) y con las imágenes `png`, `jpg`, `jpeg`,
  `webp`, `gif`. Añade sus MIME a `resolveType()`.
- `export function isImage(file)`.
- `export async function fileToDataUrl(file)` → data URL base64.
- `export async function extractFolder(files, onProgress)`:
  - Filtra rutas irrelevantes por `webkitRelativePath`: cualquier segmento que empiece por
    `.`, y los directorios `node_modules`, `dist`, `build`, `__MACOSX`, `venv`,
    `.git`. Descarta también los ficheros de bloqueo de Office (`~$*`).
  - Salta los no soportados y los que superen **20 MB**.
  - Para imágenes devuelve `{ kind: 'image', imageDataUrl }`; para el resto,
    `{ kind: 'text', text }` vía `extractText(file)`.
  - Captura los errores por fichero: un PDF escaneado (`no_text`) o un docx corrupto se
    registran como omitidos y **no abortan** la carpeta entera.
  - Llama a `onProgress({ done, total, filename })` después de cada fichero.
  - Devuelve `{ docs: [{ path, filename, mime, kind, text?, imageDataUrl? }], skipped: [{ path, reason }] }`.
    `path` es el `webkitRelativePath` (identifica el documento para el usuario).

### Fase 2 — Multimodal para imágenes

Estrena la columna `servers.multimodal_model`, que ya existe en el esquema y hoy no se usa.

- `server/services/llm/openai.js`: permite que `messages[].content` sea un array de partes.
  Añade `openaiVisionChat(server, { prompt, images })` que construye
  `{ role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: dataUrl } }] }`
  y usa `server.multimodal_model || server.model`.
- `server/services/llm/gemini.js`: añade `geminiVisionChat(server, { prompt, images })` con
  `parts: [{ text }, { inline_data: { mime_type, data } }]` (base64 sin el prefijo
  `data:…;base64,`), sobre `server.multimodal_model || server.model`.
- `server/services/llm/index.js`: `export async function describeImage({ dataUrl, mime, filename, language })`,
  que enruta por `server.type`. Si no hay servidor activo, el mismo error que usan
  `generate`/`embed`. Si el servidor no tiene `multimodal_model`, cae al `model` general y
  deja que el proveedor falle con su propio mensaje (algunos modelos generales ya son
  multimodales).
- `server/services/llm/prompts.js`: `imageDescriptionPrompt({ filename, language })`. Debe
  pedir: primero **transcribir literalmente todo el texto visible**, después describir
  diagramas, esquemas y tablas conservando la información didáctica (relaciones, flujos,
  ejes, etiquetas). Nada de valoraciones estéticas.

### Fase 3 — Tabla de staging

En `server/schema.sql`, al final, con su índice:

```sql
-- ---- Folder ingest: staging area for a course built from a documentation folder.
-- Holds the extracted text of every file so the corpus can be re-planned without
-- re-uploading. Cascades away with the course.
CREATE TABLE IF NOT EXISTS ingest_docs (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  filename    TEXT NOT NULL,
  mime        TEXT,
  kind        TEXT NOT NULL DEFAULT 'text',      -- text | image
  text        TEXT NOT NULL DEFAULT '',
  digest_json TEXT,                              -- {title, summary, topics[], terms[]}
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | digested | failed
  error       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_ingest_docs_course ON ingest_docs(course_id, status);
```

No modifiques `sources` ni `chunks`.

### Fase 4 — Pipeline en el backend

Nuevos: `server/services/ingest.js` (lógica) y `server/routes/ingest.js` (rutas). Monta el
router en `server/index.js` **antes** de `contentRouter`, igual que los demás routers de
features, y con el mismo prefijo `/api`.

| Método y ruta | Responsabilidad |
|---|---|
| `POST /api/courses/:id/ingest/docs` | Inserta un lote de documentos en `ingest_docs`. Los `kind: 'image'` pasan por `describeImage()` y su descripción se guarda en `text` (a partir de ahí son un documento más). Devuelve `{ inserted: [{ id, path }], failed: [{ path, error }] }`. |
| `POST /api/ingest/docs/:docId/digest` | Digiere **un** documento **sin ningún LLM** (rediseñado — ver nota). `heuristicDigest()` extrae título/resumen/temas del texto crudo con regex, no con IA. Si ya está `digested`, responde sin recalcular. Guarda `digest_json` y `status`. |
| `POST /api/courses/:id/ingest/plan` | Paso reduce. **No persiste nada.** Devuelve el plan propuesto. |
| `POST /api/courses/:id/ingest/commit` | Recibe el plan (posiblemente editado) y lo materializa. |
| `POST /api/explanations/:id/generate-grounded` | Redacta **una** explicación a partir de las fuentes de su unidad. |

**Detalles de `plan` (rediseñado — ver nota al final de esta sección).** Construye un mapa
compacto del corpus a partir de los digests —`filename — resumen + temas`, sin ningún id—
que es lo único suficientemente pequeño para caber en un prompt. Una llamada a
`generateJSON` con `curriculumFromDocsPrompt({ courseName, corpusMap, limits, language })`.
El LLM solo diseña la **forma** del currículo (nombres de asignatura/unidad/explicación);
nunca tiene que referenciar un documento concreto. Forma de la respuesta:

```json
{"objectives":"- …\n- …",
 "subjects":[{"name":"…","units":[{"name":"…",
   "explanations":[{"title":"…"}]}]}]}
```

El validador `validateCurriculumShape` solo comprueba la forma (`subjects[]` no vacío, cada
`unit` con `name` y `explanations[]`, cada `explanation` con `title`) — no hay `docId` que
validar.

Qué documento respalda qué unidad se decide **después**, por similitud de embeddings
(`assignDocsToUnits` en `ingest.js`): se embebe el texto de cada unidad (nombre + títulos de
sus explicaciones) y el **texto completo de cada documento, troceado con `chunk()` y
promediado** (`meanVector`) — igual que `indexSource()` hace para una fuente normal, sin
ninguna llamada generativa — y se asigna cada documento a su unidad más afín por similitud
coseno (con un margen para que un documento pueda cubrir varias unidades). Esto sustituye a
un diseño anterior en el que el LLM debía copiar `docId`s exactos en el JSON — en la
práctica, varios modelos (incluidos algunos de tamaño medio) fallaban al reproducir esos ids
de forma fiable en corpus con más de un puñado de documentos, inventando su propio esquema o
corrompiendo la referencia. La cobertura total («todo documento acaba en alguna unidad»)
ahora es una garantía **programática** (todo documento recibe su mejor unidad por similitud;
toda unidad que no gane ningún documento recibe el más parecido), no algo que dependa de que
el LLM lo haga bien. Como consecuencia, ya no hace falta planificar en dos niveles (agrupar
en asignaturas y luego generar unidades por asignatura): una única llamada de diseño de forma
es suficiente, con el truncado habitual de `buildCorpusMap` como salvaguarda para corpus
enormes.

**Detalles de `digest` (rediseñado por segunda vez — ver nota).** `heuristicDigest()` no hace
ninguna llamada al LLM: extrae encabezados Markdown (`#`/`##`/`###`) como `topics` y el primer
párrafo que no sea en sí mismo un encabezado como `summary` (recortado a 600 caracteres), con
el nombre de fichero como `title` de respaldo. Primero se intentó un digest por LLM trocado
(uno por cada ~800 caracteres) y después uno por documento sobre una muestra recortada;
ninguno de los dos aguantó en la práctica: contra el mismo modelo local, el digest de un
documento tardó 2 s y el de otro, de tamaño similar, 144 s — la latencia depende del
**contenido** (cuánto "piensa" un modelo de razonamiento), no del tamaño del prompt, así que
recortarlo tampoco lo arregla. Como la cobertura real ya la garantiza `assignDocsToUnits` por
embeddings, el digest solo necesita ser una etiqueta razonable para el prompt de diseño de
forma — no hace falta IA para eso.

**Detalles de `commit`.** Todo dentro de una transacción (`db.exec('BEGIN')` / `COMMIT` /
`ROLLBACK` como en `indexSource`):
1. `UPDATE courses SET objectives = ?`.
2. Inserta asignaturas, unidades y explicaciones **con `content` vacío**, exactamente igual
   que hace `POST /courses/:id/generate-structure` en `server/routes/content.js`.
3. Por cada unidad y cada `docId` mapeado, inserta una fila en `sources`
   (`filename` = `doc.path`, `text` = `doc.text`, `mime` = el del documento).
4. **Fuera de la transacción**, `await indexSource(sourceId, text)` para cada fuente nueva.
   Los embeddings son llamadas de red: no las metas dentro de un `BEGIN`.
   Si no hay modelo de embeddings configurado, no falles el commit: devuelve
   `{ sourcesIndexed: false, indexError }` y sigue. La generación de la fase siguiente
   tiene una vía alternativa sin embeddings.
5. Devuelve el árbol de ids creados, incluidos los `explanationIds` en orden, que es lo
   que el cliente necesita para el último bucle.

**Detalles de `generate-grounded`.** Para la explicación indicada:
- Contexto: `retrieve(unitId, explanation.prompt, 8)` de `server/services/rag.js`. Si
  devuelve vacío o los embeddings no están disponibles, cae a concatenar el texto de las
  fuentes de la unidad recortado a `getActiveProfile().maxInputChars`.
- Nuevo `groundedExplanationPrompt({ courseObjectives, unitName, title, sources, language })`
  en `prompts.js`: fuentes numeradas primero, y la instrucción de basarse **solo** en ellas
  y de indicarlo explícitamente si el material no cubre algún aspecto del título. Salida en
  Markdown, mismo estilo que las explicaciones que ya genera la app (encabezados, negritas,
  listas).
- Guarda con `UPDATE explanations SET content = ?` y después `await indexExplanation(id, content)`,
  igual que hace `PUT /explanations/:id`.
- Devuelve `{ ok: true, content }` o, en error, 200 con `{ ok: false, error }` para no
  romper el bucle del cliente.

Este endpoint es útil **fuera** de este flujo: hoy el botón «Regenerar» de
`public/js/app.js` (`regenerateExplanation`) redacta solo a partir del título, sin usar las
fuentes de la unidad. Cuando termines la fase 6, cambia ese botón para que use
`generate-grounded` si la unidad tiene fuentes, y el camino actual si no las tiene.

### Fase 5 — API del cliente

En `public/js/api.js`, junto al resto y con su comentario de sección:

```js
// folder ingest (build a whole course from a documentation folder)
ingestDocs: (courseId, docs) => req('POST', `/api/courses/${courseId}/ingest/docs`, { docs }),
ingestDigest: (docId) => req('POST', `/api/ingest/docs/${docId}/digest`),
ingestPlan: (courseId, payload) => req('POST', `/api/courses/${courseId}/ingest/plan`, payload),
ingestCommit: (courseId, plan) => req('POST', `/api/courses/${courseId}/ingest/commit`, { plan }),
generateGrounded: (explanationId, payload) => req('POST', `/api/explanations/${explanationId}/generate-grounded`, payload),
```

### Fase 6 — UI y orquestación

**Modal de creación de curso** (`public/js/views/modals.js`, función `nameForm`, rama
`kind === 'course'`): añade un selector de origen con dos opciones —«Solo IA» (el
comportamiento actual) y «Documentación (carpeta)»—. Con carpeta seleccionada:

- `<input type="file" webkitdirectory multiple class="sr-only" data-action="pick-folder">`
  dentro de un `<label>` con borde discontinuo, siguiendo el patrón visual del bloque
  `pdfBlock` de `public/js/views/unitView.js`.
- Debajo, resumen de lo seleccionado: número de ficheros soportados, tamaño total y
  desglose por tipo.
- Los sliders existentes pasan de ser cantidades exactas a **máximos orientativos** (la
  documentación manda sobre la cifra pedida). Ajusta las etiquetas i18n en consecuencia.
- El bloque de objetivos de formación se oculta: en este modo los objetivos los deriva el
  paso `plan` a partir del corpus.

**Estado.** `state.structureGen` pasa de `{ busy, error }` a
`{ busy, phase, done, total, label, error }`, y el modal pinta una barra de progreso en
lugar del spinner único actual. Fases a mostrar: extracción, subida, análisis de documentos,
diseño del currículo, creación, redacción de explicaciones.

⚠️ El `FileList` **no** va en `state`: los `File` no son serializables y cualquier cambio de
`state` dispara un re-render. Guárdalo en una variable de ámbito de módulo en
`public/js/app.js`, como ya se hace con `recordTimer`.

**Modal de previsualización del plan.** Nuevo caso en `renderModals()`, modelado sobre
`importPreviewModal()`, que ya resuelve este mismo problema. Muestra el árbol propuesto
(asignaturas → unidades → títulos de explicación) con el recuento de documentos asignados a
cada unidad, y los documentos omitidos en la fase 1. Botones: confirmar y cancelar. Como
mínimo debe permitir **desmarcar** unidades o explicaciones antes de confirmar; renombrar
en línea es deseable pero no bloqueante.

**Orquestación** en `public/js/app.js`, dentro de `onSubmit` → `case 'form-course'`. Si el
origen es carpeta, después de `api.addCourse(name)`:

```
extractFolder()                         → progreso por fichero
  → api.ingestDocs() en lotes           → ~4 MB por lote (el límite de express.json es 25 MB)
  → bucle api.ingestDigest()            → uno por documento, en serie
  → api.ingestPlan()
  → modal de previsualización           → el usuario confirma
  → api.ingestCommit()
  → bucle api.generateGrounded()        → uno por explicación, en serie
  → loadTree()
```

**En serie, no en paralelo.** Los backends locales tipo Ollama se atragantan con las
peticiones concurrentes y algunos proveedores cloud aplican rate limit. Actualiza
`structureGen` entre elementos y emite el re-render.

**Gestión de errores.** Si algo falla a mitad, el curso ya creado se queda en el árbol y es
editable: es exactamente lo que hace hoy `maybeGenerateStructure`. Muestra qué falló y
cuánto se completó; no borres el curso. Los fallos de documento o de explicación
individuales se acumulan y se enseñan al final en un resumen, sin detener el bucle.

### Fase 7 — i18n

Añade todas las claves nuevas a `en`, `es` y `fr` en `public/js/i18n.js`. Cubre: etiquetas
del selector de origen, texto del selector de carpeta, resumen de ficheros, nombres de las
seis fases de progreso, textos de la previsualización, mensajes de error y de omisión, y el
resumen final. Sigue el estilo conciso de las claves existentes y agrúpalas bajo un
comentario de sección propio.

## 6. Tests

Hay tests unitarios con el runner de `node:test`, sin dependencias. Mira
`server/services/rag.test.js` como plantilla: usa un `DB_PATH` temporal para que importar
un módulo que arrastre `db.js` nunca toque los datos reales.

Escribe `server/services/ingest.test.js` cubriendo la **lógica pura**, sin llamadas al LLM:

- `validateIngestPlan`: acepta un plan correcto; rechaza un `docId` desconocido; rechaza un
  plan que deja documentos sin cubrir, y el mensaje de error nombra los que faltan.
- La fusión de digests de un documento troceado.
- La construcción del mapa de corpus (formato estable y truncado según `maxInputChars`).
- El agrupado en lotes de subida por tamaño acumulado.

Ejecuta:

```
node --disable-warning=ExperimentalWarning --test server/services/ingest.test.js
```

y también toda la suite existente, para verificar que no has roto nada:

```
node --disable-warning=ExperimentalWarning --test server/services/
```

## 7. Verificación antes de darlo por terminado

1. La suite completa de tests en verde.
2. `npm run dev` arranca sin errores y sin warnings nuevos en consola.
3. Abre http://localhost:8787 y comprueba en el navegador, con una carpeta de prueba que
   crees tú mismo (mezcla al menos un `.md`, un `.html`, un `.txt` y un `.png`) en el
   directorio scratchpad, **no** dentro del repositorio:
   - el flujo completo termina y crea un curso con contenido real;
   - la consola del navegador no tiene errores;
   - las explicaciones generadas citan contenido que está de verdad en los documentos;
   - la pestaña «Fuentes» de una unidad muestra los documentos asignados con sus chunks;
   - el chat de esa unidad responde citando esas fuentes.
4. Prueba los caminos degradados: carpeta sin ningún fichero soportado; un fichero
   corrupto entre otros válidos; cancelar en la previsualización (no debe quedar nada a
   medias más allá del curso vacío).
5. Comprueba que el modo «Solo IA» del modal sigue funcionando **exactamente** igual que
   antes de tus cambios. Es una regresión fácil de introducir.
6. Repasa tu propio diff buscando texto visible sin i18n, comentarios en español,
   `console.log` olvidados y claves API que se hayan podido filtrar al cliente.

## 8. Fuera de alcance

No hagas nada de esto aunque parezca una mejora natural:

- OCR de PDFs escaneados renderizando páginas a canvas.
- Convertir `sources` a scope de curso o cualquier reconstrucción de tablas existentes.
- Infraestructura de jobs en segundo plano, SSE o websockets.
- Lectura de la carpeta desde el servidor con `fs`.
- Dependencias npm nuevas en el backend.
- Refactorizar código no relacionado con esta funcionalidad.

## 9. Entrega

No hagas commit ni push: deja los cambios en el working tree. Cuando termines, resume en
media página los ficheros tocados, los endpoints añadidos, lo que verificaste y cómo, y
cualquier limitación conocida que quede.
