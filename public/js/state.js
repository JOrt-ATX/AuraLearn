// Tiny observable app state (replaces React component state).
const listeners = new Set();

export function defaultUnitState() {
  return {
    viewMode: 'explanations',   // explanations | generator | exam
    inputMode: 'simple',        // simple | context | pdf
    prompt: '',
    contextText: '',
    pdfName: '',
    pdfText: '',
    parsingPdf: false,
    generating: false,
    generatingExam: false,
    generatingFeedback: false,
    error: '',
    answers: {},                // { [questionIndex]: optionString }
    openExplanations: {},       // { [explanationId]: true } — expanded accordion items
    regeneratingId: null,       // explanation id currently being regenerated
    generatingAudioIds: {},     // { [explanationId|artifactId]: true } — audio narration in progress

    // Quick term explanations — select text inside an open explanation to ask
    // "explain this briefly". Results are cached server-side per explanation+term,
    // marked inline at every occurrence ([n]) and listed as chips below the content.
    termExplanations: {},       // { [explanationId]: [{ id, term, content }] }
    termExplanationsLoaded: {}, // { [explanationId]: true }
    selection: null,            // { explanationId, text, x, y } — floating "Explain" trigger after a text selection

    // Term illustrations — same idea as term explanations, but a real (Wikimedia)
    // image instead of AI text. Cached server-side per explanation+term.
    termImages: {},             // { [explanationId]: [{ id, term, url, pageUrl, attribution, license }] }
    termImagesLoaded: {},       // { [explanationId]: true }

    // User notes — free-form annotations on an explanation, shown as chips below
    // the content. May be anchored to the selected fragment above and tagged
    // with a quick label; see editingNote (root state) for the add/edit modal.
    notes: {},                  // { [explanationId]: [{ id, content, anchorText, label }] }
    notesLoaded: {},             // { [explanationId]: true }

    // R1 — Sources & Chat (RAG). Loaded lazily when the tab is first opened.
    ragLoaded: false,
    sources: [],                // [{ id, filename, mime, chunkCount }]
    selectedSourceIds: [],      // Q2: source ids checked in the generator "Ground in sources" panel
    flashcardExplanationIds: [], // Q3: explanation ids selected for flashcard generation (empty = all)
    studyExplanationIds: [],     // Q3: explanation ids selected for study-guide/mindmap generation (empty = all)
    chatMessages: [],           // [{ role, content, citations }]
    sourceMode: 'text',         // text | url | pdf — add-source input mode
    sourceText: '',
    sourceUrl: '',
    sourcePdfName: '',
    sourcePdfText: '',
    parsingSourcePdf: false,
    addingSource: false,
    chatInput: '',
    chatBusy: false,
    ragError: '',

    // R2 — Flashcards + SRS. Loaded lazily when the tab is first opened.
    flashcardsLoaded: false,
    flashcards: [],             // [{ id, front, back, dueAt, interval, ease, reps }]
    generatingCards: false,
    fcError: '',
    review: { active: false, queue: [], pos: 0, flipped: false, graded: 0 },

    // R3 — Study materials (guides + mind maps + infographics). Loaded lazily on tab open.
    studyLoaded: false,
    artifacts: [],              // [{ id, kind, title, content, createdAt }]
    openArtifacts: {},          // { [artifactId]: true } — expanded items
    generatingGuide: false,
    generatingMindmap: false,
    generatingInfographic: false,
    generatingDiagram: false,
    studyError: '',

    // Q4 — Written-question grading (set while the LLM grades after submit).
    writtenGrading: false,

    // B1 — Teach-back (Feynman). Loaded lazily when the tab is first opened.
    teachbackLoaded: false,
    teachbackHistory: [],         // [{ id, transcript, score, feedback, explanationIds, createdAt }]
    openTeachback: {},            // { [teachbackId]: true } — expanded history items
    teachbackExplanationIds: [],  // explanation ids selected as grading context (empty = whole unit)
    recording: false,             // MediaRecorder currently capturing
    convertingTeachback: false,   // re-encoding the webm recording to WAV (Web Audio API) before upload
    recordedBlob: null,           // Blob captured after stop, before upload (WAV, ready to upload)
    recordedBlobUrl: '',          // URL.createObjectURL(recordedBlob) for the <audio> preview
    recordSeconds: 0,             // live timer while recording (UI feedback only)
    uploadingTeachback: false,    // step 1: uploading + transcribing
    gradingTeachback: false,      // step 2: grading the transcript
    teachbackPendingId: null,     // audio row id once transcribed, before/while grading
    teachbackResult: null,        // last graded result, shown in the result card
    teachbackError: '',

    // Multi-exam accordion — which exam is currently open for taking/reviewing.
    activeExamId: null,
  };
}

export const state = {
  loading: true,
  tree: [],                     // courses → subjects → units
  servers: [],
  sttProviders: [],              // B1: speech-to-text providers (local Whisper)
  sttProviderForm: null,         // working copy when adding/editing an STT provider
  ttsProviders: [],              // audio narration: text-to-speech providers (local Chatterbox)
  ttsProviderForm: null,         // working copy when adding/editing a TTS provider
  sel: { courseId: null, subjectId: null, unitId: null },
  modal: null,                  // 'course' | 'subject' | 'unit' | 'settings' | 'server' | 'stt-provider' | 'tts-provider' | 'export' | 'import-preview' | 'ingest-preview'
  serverForm: null,             // working copy when adding/editing a server
  editingExplanation: null,     // { id, prompt, content } when editing an explanation
  editingFlashcard: null,       // { id, front, back } when editing a flashcard
  termExplain: null,            // { id, explanationId, term, content, loading, error } shown in the 'term-explain' modal
  termImage: null,              // { id, explanationId, term, url, pageUrl, attribution, license, loading, error } shown in the 'term-image' modal
  editingNote: null,            // { id, explanationId, content, anchorText, label } when adding/editing a note
  exportTarget: null,           // { type, id, name } — entity targeted by the 'export' modal
  importPreview: null,          // { token, scope, name, counts, conflict, mode, targetCourseId, targetSubjectId, newCourseName, newSubjectName, busy, error } for 'import-preview'
  // Folder-ingest plan preview (course creation, "Documentation (folder)" source) — user can
  // uncheck units/explanations before committing. `excluded` keys are "subjectIdx:unitIdx" or
  // "subjectIdx:unitIdx:explIdx". See handleCreateCourseFromFolder / submitIngestCommit in app.js.
  ingestPreview: null,          // { courseId, courseName, plan, skippedDocs, excluded, busy, error }
  // AI auto-generate structure status shown inside the course/subject/unit modal — also drives
  // the folder-ingest progress bar (course modal, "Documentation (folder)" source): phase/done/total
  // are only set by the folder-ingest flow, so the AI-only flow renders the same plain spinner as before.
  structureGen: null,           // { busy, phase, done, total, label, detail, error } — detail: current document/explanation name
  serverModels: { generative: [], embedding: [] }, // models fetched via "Load models"
  serverModelsStatus: '',       // status text under the Load models button
  sidebarOpen: false,
  // Defaults until applySettings() runs after the server-persisted settings load
  // (see app.js init()) — the server is the source of truth, not localStorage.
  lang: 'en',
  aiLanguage: 'English',        // derived from `lang`
  speechEnabled: false,         // master switch for Speech-to-text / Teach-back (off by default — opt-in)
  ttsEnabled: false,            // master switch for audio narration / Text-to-speech (off by default — opt-in)
  welcomed: false,              // first-run onboarding shown already?
  settingsTab: 'general',       // active tab in the Settings modal: 'general' | 'servers' | 'speech' | 'tts'
  settingsForm: null,           // working copy of the Settings form ({ lang, speechEnabled, ttsEnabled }) while the modal is open
  unit: defaultUnitState(),
};

// Applies the server-persisted settings blob (GET /api/settings — { lang?, speechEnabled?, welcomed? })
// onto state. Called once at boot (app.js init()), which then derives aiLanguage from lang.
// Guards the stored lang to the supported set (a legacy/unknown value falls back to English).
export function applySettings(settings = {}) {
  state.lang = ['en', 'es', 'fr'].includes(settings.lang) ? settings.lang : 'en';
  state.speechEnabled = settings.speechEnabled === '1';
  state.ttsEnabled = settings.ttsEnabled === '1';
  state.welcomed = settings.welcomed === '1';
}

export function emit() { for (const fn of listeners) fn(); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Merge a patch into top-level state and re-render.
export function setState(patch) { Object.assign(state, patch); emit(); }
// Merge a patch into the transient unit view-state and re-render.
export function setUnit(patch) { Object.assign(state.unit, patch); emit(); }
