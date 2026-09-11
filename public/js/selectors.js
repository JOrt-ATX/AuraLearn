import { state } from './state.js';

export const selectedCourse = () => state.tree.find((c) => c.id === state.sel.courseId);
export const selectedSubject = () => selectedCourse()?.subjects.find((s) => s.id === state.sel.subjectId);
export const selectedUnit = () => selectedSubject()?.units.find((u) => u.id === state.sel.unitId);
