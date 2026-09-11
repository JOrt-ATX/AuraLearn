// Centralised prompt templates. Each function returns { system, prompt } so the
// caller can pass both to generate() / generateJSON() — the profile layer in
// index.js handles merging system into user for models that don't support it.
//
// Structure convention: content/context first (models read top-to-bottom),
// task instructions second, JSON schema or output format third, language last
// (small models comply best with the final instruction they read).

// ── Exam generation ──────────────────────────────────────────────────────────

export function examPrompt({ content, language = 'English' }) {
  const system =
    'You are an expert educator. Respond ONLY with a valid JSON object — no prose, no markdown fences.';
  const prompt =
`UNIT CONTENT:
${content}

---

Generate a 10-question exam from the content above.
Include 6 multiple-choice questions (type "mcq") and 4 written-response questions (type "written").

MCQ rules: exactly 4 options; one correct answer that matches an option verbatim; include a brief explanation.
Written rules: open-ended question testing deeper understanding; correctAnswer holds the model answer/rubric; options is null.

Return ONLY this JSON object:
{"questions":[{"id":"q1","type":"mcq","questionText":"...","options":["A","B","C","D"],"correctAnswer":"A","explanation":"..."},{"id":"q7","type":"written","questionText":"...","correctAnswer":"model answer / rubric","options":null}]}

Write all questions in ${language}.`;
  return { system, prompt };
}

// ── Written-answer grading ────────────────────────────────────────────────────

export function gradeWrittenPrompt({ qLines, language = 'English' }) {
  const system =
    'You are a fair and encouraging teacher. Respond ONLY with a valid JSON object — no prose, no markdown fences.';
  const prompt =
`${qLines}

---

Grade each written answer above. For each, provide a score 0–10 and brief constructive feedback.
Be encouraging and specific.

Return ONLY this JSON object:
{"gradedAnswers":[{"id":"...","score":0,"feedback":"..."}],"overallFeedback":"...","totalScore":0}

Provide all feedback in ${language}.`;
  return { system, prompt };
}

// ── Teach-back grading (B1 — Feynman technique) ───────────────────────────────

export function teachbackPrompt({ sourceContent, transcript, language = 'English' }) {
  const system =
    'You are a fair and encouraging teacher assessing a spoken explanation (Feynman technique). ' +
    'Respond ONLY with a valid JSON object — no prose, no markdown fences.';
  const prompt =
`SOURCE MATERIAL (what the student was supposed to explain):
${sourceContent}

---

STUDENT'S SPOKEN EXPLANATION (transcribed automatically, may contain speech-to-text errors —
be lenient about phrasing, filler words and punctuation; focus on the conceptual content):
${transcript}

---

Compare the student's explanation against the source material. Assess:
- accuracy (0-100): how factually correct is what they said, ignoring things they simply didn't mention.
- completeness (0-100): how much of the key content from the source they covered.
- gaps: a short list of concrete, specific points from the source they missed or got wrong.
- suggestion: one or two sentences of actionable advice for their next attempt.
- strengths: a short list of things they explained well (can be empty).

Be encouraging but specific. Do not penalize normal speech-to-text transcription noise.

Return ONLY this JSON object:
{"accuracy":0,"completeness":0,"gaps":["..."],"suggestion":"...","strengths":["..."]}

Provide all feedback in ${language}.`;
  return { system, prompt };
}

// ── Flashcard generation ──────────────────────────────────────────────────────

export function flashcardsPrompt({ material, count, language }) {
  const system =
    'You are a study-card creator. Respond ONLY with a valid JSON object — no prose, no markdown fences.';
  const langLine = language ? `\n\nWrite all cards in ${language}.` : '';
  const prompt =
`MATERIAL:
${material}

---

Create ${count} study flashcards from the material above.
Each card has a concise "front" (a question or term) and a "back" (the answer or explanation).
Cover the key concepts and avoid duplicates.

Return ONLY this JSON object:
{"cards":[{"front":"...","back":"..."}]}${langLine}`;
  return { system, prompt };
}

// Shared instruction appended to study-guide/mindmap/infographic prompts: the model
// must lead with a short, content-specific title line before the actual output, so
// generating several artifacts of the same kind for a unit (e.g. from different
// explanation selections) doesn't leave them all sharing the unit's name as their
// title (see extractTitle() in routes/study.js, which parses this line back out).
const TITLE_LINE_INSTRUCTION =
  'Before that, output exactly one line first: "TITLE: " followed by a short, specific title ' +
  '(max 6 words) describing what THIS content actually covers — not the unit name verbatim. ' +
  'Then a line containing only <<<BODY>>>, then the content described above, with nothing before the TITLE line.';

// ── Study guide ───────────────────────────────────────────────────────────────

export function studyGuidePrompt({ unitName, material, language }) {
  const system =
    'You are a study guide writer. Return ONLY Markdown content plus the required title line below — ' +
    'no other preamble, no code fences.';
  const langLine = language ? `\n\nWrite it in ${language}.` : '';
  const prompt =
`MATERIAL:
${material}

---

Create a comprehensive but concise study guide in Markdown for the unit "${unitName}".
Use "##" section headings, subheadings, bullet points, **bold** key terms, and end with a short summary.
Base it ONLY on the material above.${langLine}

${TITLE_LINE_INSTRUCTION}`;
  return { system, prompt };
}

// ── Audio narration summary ─────────────────────────────────────────────────────
// Deliberately NOT a read-aloud of the source text: narrating the same content a
// student can already see on screen risks the redundancy effect (simultaneous
// identical text + narration hurts retention). This condenses to a short, distinct
// spoken recap instead — a few sentences of plain prose, not a restatement.

export function ttsSummaryPrompt({ text, language }) {
  const system =
    'You write short spoken-style recaps meant to be read aloud by a text-to-speech engine. ' +
    'Return ONLY the recap as plain flowing prose — no markdown, no headers, no bullet points, ' +
    'no numbering, no preamble like "here is a summary". Just the sentences to speak.';
  const langLine = language ? `\n\nWrite it in ${language}.` : '';
  const prompt =
`SOURCE CONTENT:
${text}

---

Condense the source content above into a short spoken recap (3-5 sentences) covering only the
most important ideas — not a restatement of every sentence, a distinct summary someone could
listen to instead of reading the full text.${langLine}`;
  return { system, prompt };
}

// ── Mind map ──────────────────────────────────────────────────────────────────

export function mindmapPrompt({ unitName, material, language }) {
  const system =
    'You are a mind map creator. Return ONLY a nested Markdown outline plus the required title line below — ' +
    'no other commentary, no code fences.';
  const langLine = language ? `\n\nWrite all labels in ${language}.` : '';
  const prompt =
`MATERIAL:
${material}

---

Create a mind map of the key concepts from the material above as a nested Markdown outline.
Use "# ${unitName}" as the root node, "##" for main branches, and "-" bullet lists
(indent sub-points with two spaces) for details. Keep every label short (a few words).
Base it ONLY on the material above.${langLine}

${TITLE_LINE_INSTRUCTION}`;
  return { system, prompt };
}

// ── Diagram (Mermaid) ────────────────────────────────────────────────────────
// Text→diagram instead of an image-generation model: for processes/hierarchies
// a deterministic Mermaid diagram is far more reliable than asking a diffusion
// model to render a diagram (those routinely botch labels/text inside images).

export function diagramPrompt({ unitName, material, language }) {
  const system =
    'You are a technical diagram author. Return ONLY valid Mermaid diagram syntax plus the required ' +
    'title line below — no other commentary, no code fences, no explanation of the diagram.';
  const langLine = language ? `\n\nWrite all labels in ${language}.` : '';
  const prompt =
`MATERIAL:
${material}

---

Create a single Mermaid diagram that best represents the structure of the material above for the unit
"${unitName}". Choose whichever diagram type fits the content: "flowchart TD" for a process or sequence of
steps, "classDiagram" or an indented "flowchart TD" for a hierarchy/taxonomy, "sequenceDiagram" for interactions
between actors, "erDiagram" for relationships between entities. Keep node labels short. Use ONLY steps, entities
and relationships explicitly present in the material — never invent ones that aren't there. Output only the
Mermaid code, nothing else.${langLine}

${TITLE_LINE_INSTRUCTION}`;
  return { system, prompt };
}

// ── Infographic ───────────────────────────────────────────────────────────────

export function infographicPrompt({ unitName, material, language }) {
  const system =
    'You are an infographic designer. Return ONLY a self-contained HTML fragment plus the required ' +
    'title line below — no other preamble, no markdown fences, no <html>/<body>/<head> wrapper.';
  const langLine = language ? `\n\nWrite all text in ${language}.` : '';
  const prompt =
`MATERIAL:
${material}

---

Design a visually engaging infographic summarising the key concepts from the material above,
for the unit "${unitName}".

Return a single root <div> containing an inline <style> block plus the markup. Requirements:
- Use CSS flexbox/grid for layout (positioning via floats or absolute coordinates is not reliable — avoid it).
- Use a modern, legible design: clear headings, short labels, generous spacing, a cohesive pastel/modern colour palette.
- You may use inline <svg> elements for icons or simple decorative shapes, but layout (position/size) must come from HTML/CSS, not SVG coordinates.
- Design for a fixed canvas width of about 720px; height can grow to fit the content.
- Scope all CSS class names with a short unique prefix to avoid collisions with other content.
- Base it ONLY on the material above.${langLine}

${TITLE_LINE_INSTRUCTION}`;
  return { system, prompt };
}

// ── Quick term explanation (select text in an explanation, ask "what's this?") ─

export function quickExplainPrompt({ term, context, language = 'English' }) {
  const system =
    'You are a helpful tutor. Answer in 2-3 short sentences — plain prose, no headers, no markdown fences.';
  const prompt =
`CONTEXT:
${context}

---

Briefly explain "${term}" as it is used in the context above.

Write the explanation in ${language}.`;
  return { system, prompt };
}

// ── Training objectives (course creation, before structure generation) ───────

export function objectivesPrompt({ name, level, focus, audience, language = 'English' }) {
  const system =
    'You are an instructional designer. Return ONLY a Markdown bullet list — no preamble, no headers, no code fences.';
  const prompt =
`Course name: "${name}"
Learner level: ${level}
Focus: ${focus}
Target audience: ${audience}

---

Write 4 to 6 concise learning objectives for this course. Each bullet must start with an action verb
(e.g. "Understand…", "Apply…", "Analyze…", "Build…") and describe something the learner will know or
be able to do by the end of the course. Tailor them to the level, focus and audience above.

Write the objectives in ${language}.`;
  return { system, prompt };
}

// ── Image description (folder ingest — multimodal transcription) ────────────

export function imageDescriptionPrompt({ filename, language = 'English' }) {
  const system =
    'You are a meticulous transcriber preparing image content for a study corpus. No aesthetic commentary.';
  const prompt =
`Image file: "${filename}"

Describe this image as study material, in two steps:
1. Transcribe ALL visible text verbatim, exactly as written (labels, captions, numbers, code, axis titles…).
2. Describe any diagrams, schematics, charts or tables, preserving their didactic content — relationships,
   flows, sequences, axes, units and labels — so someone who can't see the image still learns from it.

Do not comment on colors, layout or visual design. Only the informational content matters.

Write the description in ${language}.`;
  return { system, prompt };
}

// ── Auto-generated curriculum structure (course/subject/unit creation) ───────

export function structurePrompt({ kind, name, counts, language = 'English', objectives }) {
  const system =
    'You are an expert curriculum designer. Respond ONLY with a valid JSON object — no prose, no markdown fences.';

  const schemaByKind = {
    course: '{"subjects":[{"name":"...","units":[{"name":"...","explanations":["...","..."]}]}]}',
    subject: '{"units":[{"name":"...","explanations":["...","..."]}]}',
    unit: '{"explanations":["...","..."]}',
  };

  const instructionByKind = {
    course:
`Design the curriculum for the course "${name}".
Generate exactly ${counts.numSubjects} subjects. For each subject, generate exactly ${counts.numUnitsPerSubject} units. For each unit, generate exactly ${counts.numExplanationsPerUnit} explanation titles (short topic titles a student would study within that unit).`,
    subject:
`Design the curriculum for the subject "${name}".
Generate exactly ${counts.numUnits} units. For each unit, generate exactly ${counts.numExplanationsPerUnit} explanation titles (short topic titles a student would study within that unit).`,
    unit:
`Design the study plan for the unit "${name}".
Generate exactly ${counts.numExplanations} explanation titles (short topic titles a student would study within this unit).`,
  };

  const objectivesBlock = kind === 'course' && objectives
    ? `TRAINING OBJECTIVES (use these to guide the topics you choose):\n${objectives}\n\n`
    : '';

  const prompt =
`${objectivesBlock}${instructionByKind[kind]}

Return ONLY this JSON object:
${schemaByKind[kind]}

Write all names and titles in ${language}.`;
  return { system, prompt };
}

// ── Folder ingest: curriculum from a documentation corpus ──────────────────
// The per-document digest is a fast heuristic (no LLM call — see
// heuristicDigest in ingest.js), so the only LLM-facing prompt left here is
// the curriculum-shape one below.

// Renders the course-creation sliders as a soft guideline.
function limitsBlock(limits) {
  if (!limits) return '';
  const parts = [];
  if (limits.maxSubjects) parts.push(`around ${limits.maxSubjects} subjects`);
  if (limits.maxUnitsPerSubject) parts.push(`around ${limits.maxUnitsPerSubject} units per subject`);
  if (limits.maxExplanationsPerUnit) parts.push(`around ${limits.maxExplanationsPerUnit} explanations per unit`);
  if (!parts.length) return '';
  return `\nGUIDANCE (soft target — good topic coverage always takes priority over this): aim for ${parts.join(', ')}.\n`;
}

// Reduce step: the LLM only designs the curriculum SHAPE (subject/unit/
// explanation names) from the corpus digests — it never has to reference a
// specific document. Which document backs which unit is decided afterwards
// by embedding similarity (see assignDocsToUnits in ingest.js), because
// asking a model to faithfully copy document ids into a large JSON structure
// turned out to be unreliable in practice (models invent their own id scheme
// or garble the reference) — see docs/PROMPT_FOLDER_INGEST.md.

export function curriculumFromDocsPrompt({ courseName, corpusMap, limits, language = 'English' }) {
  const system =
    'You are an expert curriculum designer building a course strictly from an existing documentation corpus. ' +
    'Respond ONLY with a valid JSON object — no prose, no markdown fences.';
  const prompt =
`CORPUS (one line per document — filename — summary (topics: …)):
${corpusMap}

---

Design a complete curriculum for the course "${courseName}" that covers the full breadth of topics in the corpus
above. Group related topics into subjects, subjects into units, and units into explanation titles. Do not invent
topics that aren't represented in the corpus above.
${limitsBlock(limits)}
Also write 4 to 6 concise learning objectives for the whole course, derived from what the corpus actually covers.

Return ONLY this JSON object:
{"objectives":"- ...\\n- ...","subjects":[{"name":"...","units":[{"name":"...","explanations":[{"title":"..."}]}]}]}

Write all names, titles and objectives in ${language}.`;
  return { system, prompt };
}

// Expand step (write one explanation, grounded only in its unit's own sources).

export function groundedExplanationPrompt({ courseObjectives, unitName, title, sources, language = 'English' }) {
  const system =
    'You are an expert educator writing course material strictly grounded in the provided sources. ' +
    'Return ONLY Markdown content — no preamble, no code fences.';
  const objectivesBlock = courseObjectives ? `COURSE OBJECTIVES:\n${courseObjectives}\n\n` : '';
  const prompt =
`${objectivesBlock}SOURCES (numbered — this unit's own material, "${unitName}"):
${sources}

---

Write the explanation titled "${title}" using ONLY the sources above — do not draw on outside knowledge.
If the sources don't fully cover some aspect of the title, say so explicitly rather than filling the gap yourself.
Use Markdown: headers, bold key terms, and lists where helpful, matching the style of a textbook section.

Write it in ${language}.`;
  return { system, prompt };
}

// ── Chat (RAG study assistant) ────────────────────────────────────────────────

export function chatSystem({ context, language }) {
  const langLine = language ? ` Answer in ${language}.` : '';
  return (
    `You are a study assistant. Answer the user's question using ONLY the numbered sources below. ` +
    `Cite the sources you rely on inline with bracketed numbers like [1] or [2]. ` +
    `If the answer is not in the sources, say you don't know based on the provided material — do not use outside knowledge.${langLine}` +
    `\n\nSOURCES:\n${context || '(no relevant sources found)'}`
  );
}
