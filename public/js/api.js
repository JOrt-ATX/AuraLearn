// Thin fetch wrapper over the backend REST API (replaces the old lib/database.ts
// Firestore calls). All AI requests go through the backend too, so no API key
// ever lives in the browser.
async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg;
    try { msg = (await res.json()).error; } catch { msg = res.statusText; }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  // settings (server-persisted UI prefs — language, speech opt-in, onboarding flag)
  getSettings: () => req('GET', '/api/settings'),
  updateSettings: (patch) => req('PUT', '/api/settings', patch),

  // content
  getTree: () => req('GET', '/api/tree'),
  addCourse: (name) => req('POST', '/api/courses', { name }),
  addSubject: (courseId, name) => req('POST', '/api/subjects', { courseId, name }),
  addUnit: (subjectId, name) => req('POST', '/api/units', { subjectId, name }),
  generateCourseObjectives: (payload) => req('POST', '/api/courses/generate-objectives', payload),
  generateCourseStructure: (id, payload) => req('POST', `/api/courses/${id}/generate-structure`, payload),
  generateSubjectStructure: (id, payload) => req('POST', `/api/subjects/${id}/generate-structure`, payload),
  generateUnitStructure: (id, payload) => req('POST', `/api/units/${id}/generate-structure`, payload),
  addExplanation: (unitId, prompt, content, citations) => req('POST', `/api/units/${unitId}/explanations`, { prompt, content, citations }),
  updateExplanation: (id, data) => req('PUT', `/api/explanations/${id}`, data),
  deleteExplanation: (id) => req('DELETE', `/api/explanations/${id}`),
  getTermExplanations: (explanationId) => req('GET', `/api/explanations/${explanationId}/terms`),
  explainTerm: (explanationId, term, aiLanguage) => req('POST', `/api/explanations/${explanationId}/terms`, { term, aiLanguage }),
  deleteTermExplanation: (id) => req('DELETE', `/api/terms/${id}`),
  getTermImages: (explanationId) => req('GET', `/api/explanations/${explanationId}/term-images`),
  searchTermImages: (explanationId, term, aiLanguage) => req('POST', `/api/explanations/${explanationId}/term-images/search`, { term, aiLanguage }),
  illustrateTerm: (explanationId, term, candidate) => req('POST', `/api/explanations/${explanationId}/term-images`, { term, candidate }),
  deleteTermImage: (id) => req('DELETE', `/api/term-images/${id}`),
  getNotes: (explanationId) => req('GET', `/api/explanations/${explanationId}/notes`),
  addNote: (explanationId, data) => req('POST', `/api/explanations/${explanationId}/notes`, data),
  updateNote: (id, data) => req('PUT', `/api/notes/${id}`, data),
  deleteNote: (id) => req('DELETE', `/api/notes/${id}`),
  generateExam: (unitId, payload = {}) => req('POST', `/api/units/${unitId}/exam`, payload),
  saveExamResult: (examId, submission) => req('PUT', `/api/exams/${examId}/result`, { submission }),
  deleteExamResult: (examId) => req('DELETE', `/api/exams/${examId}/result`),
  gradeWritten: (examId, writtenAnswers, aiLanguage) => req('POST', `/api/exams/${examId}/grade-written`, { writtenAnswers, aiLanguage }),
  deleteCourse: (id) => req('DELETE', `/api/courses/${id}`),
  deleteSubject: (id) => req('DELETE', `/api/subjects/${id}`),
  deleteUnit: (id) => req('DELETE', `/api/units/${id}`),

  // servers
  getServers: () => req('GET', '/api/servers'),
  addServer: (s) => req('POST', '/api/servers', s),
  updateServer: (id, s) => req('PUT', `/api/servers/${id}`, s),
  deleteServer: (id) => req('DELETE', `/api/servers/${id}`),
  activateServer: (id) => req('POST', `/api/servers/${id}/activate`),
  testServer: (id) => req('POST', `/api/servers/${id}/test`),
  listModels: (payload) => req('POST', '/api/servers/models', payload),

  // llm
  generate: (payload) => req('POST', '/api/llm/generate', payload),
  generateJSON: (payload) => req('POST', '/api/llm/json', payload),

  // sources & chat (R1 — RAG)
  getSources: (unitId) => req('GET', `/api/units/${unitId}/sources`),
  addSource: (unitId, payload) => req('POST', `/api/units/${unitId}/sources`, payload),
  deleteSource: (id) => req('DELETE', `/api/sources/${id}`),
  getChat: (unitId) => req('GET', `/api/units/${unitId}/chat`),
  sendChat: (unitId, message, aiLanguage) => req('POST', `/api/units/${unitId}/chat`, { message, aiLanguage }),
  clearChat: (unitId) => req('DELETE', `/api/units/${unitId}/chat`),

  // flashcards (R2 — SRS)
  getFlashcards: (unitId) => req('GET', `/api/units/${unitId}/flashcards`),
  generateFlashcards: (unitId, payload) => req('POST', `/api/units/${unitId}/flashcards/generate`, payload),
  addFlashcard: (unitId, card) => req('POST', `/api/units/${unitId}/flashcards`, card),
  updateFlashcard: (id, card) => req('PUT', `/api/flashcards/${id}`, card),
  reviewFlashcard: (id, grade) => req('POST', `/api/flashcards/${id}/review`, { grade }),
  deleteFlashcard: (id) => req('DELETE', `/api/flashcards/${id}`),

  // study materials (R3 — guides + mind maps + infographics)
  getArtifacts: (unitId) => req('GET', `/api/units/${unitId}/artifacts`),
  generateStudyGuide: (unitId, payload) => req('POST', `/api/units/${unitId}/study-guide`, payload),
  generateMindmap: (unitId, payload) => req('POST', `/api/units/${unitId}/mindmap`, payload),
  generateInfographic: (unitId, payload) => req('POST', `/api/units/${unitId}/infographic`, payload),
  generateDiagram: (unitId, payload) => req('POST', `/api/units/${unitId}/diagram`, payload),
  deleteArtifact: (id) => req('DELETE', `/api/artifacts/${id}`),

  // export / import (zip)
  exportUrl: (type, id, formats) => `/api/export/${type}/${id}?formats=${formats.join(',')}`,
  importAnalyze: async (file) => {
    const res = await fetch('/api/import/analyze', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
  importCommit: (token, payload) => req('POST', `/api/import/commit/${token}`, payload),

  // speech-to-text providers (B1 — local Whisper)
  getSttProviders: () => req('GET', '/api/stt-providers'),
  addSttProvider: (p) => req('POST', '/api/stt-providers', p),
  updateSttProvider: (id, p) => req('PUT', `/api/stt-providers/${id}`, p),
  deleteSttProvider: (id) => req('DELETE', `/api/stt-providers/${id}`),
  activateSttProvider: (id) => req('POST', `/api/stt-providers/${id}/activate`),
  testSttProvider: (id) => req('POST', `/api/stt-providers/${id}/test`),

  // folder ingest (build a whole course from a documentation folder)
  ingestDocs: (courseId, docs, aiLanguage) => req('POST', `/api/courses/${courseId}/ingest/docs`, { docs, aiLanguage }),
  ingestDigest: (docId, aiLanguage) => req('POST', `/api/ingest/docs/${docId}/digest`, { aiLanguage }),
  ingestPlan: (courseId, payload) => req('POST', `/api/courses/${courseId}/ingest/plan`, payload),
  ingestCommit: (courseId, plan) => req('POST', `/api/courses/${courseId}/ingest/commit`, { plan }),
  generateGrounded: (explanationId, payload) => req('POST', `/api/explanations/${explanationId}/generate-grounded`, payload),

  // teach-back (B1)
  getTeachback: (unitId) => req('GET', `/api/units/${unitId}/teachback`),
  uploadTeachbackAudio: async (unitId, blob, explanationIds) => {
    const qs = explanationIds?.length ? `?explanationIds=${explanationIds.join(',')}` : '';
    const res = await fetch(`/api/units/${unitId}/teachback/audio${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': blob.type },
      body: blob,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
  gradeTeachback: (id, aiLanguage) => req('POST', `/api/teachback/${id}/grade`, { aiLanguage }),
  deleteTeachback: (id) => req('DELETE', `/api/teachback/${id}`),

  // text-to-speech providers (local Chatterbox) — audio narration for explanations/study guides
  getTtsProviders: () => req('GET', '/api/tts-providers'),
  addTtsProvider: (p) => req('POST', '/api/tts-providers', p),
  updateTtsProvider: (id, p) => req('PUT', `/api/tts-providers/${id}`, p),
  deleteTtsProvider: (id) => req('DELETE', `/api/tts-providers/${id}`),
  activateTtsProvider: (id) => req('POST', `/api/tts-providers/${id}/activate`),
  testTtsProvider: (id) => req('POST', `/api/tts-providers/${id}/test`),
  generateExplanationAudio: (id, payload) => req('POST', `/api/explanations/${id}/audio`, payload),
  generateArtifactAudio: (id, payload) => req('POST', `/api/artifacts/${id}/audio`, payload),
  deleteAudio: (id) => req('DELETE', `/api/audio/${id}`),
};
