// Escola bíblica (EBD): what a material becomes on the screens, and the
// attendance of a class. Plain JS, no imports, so node --test can check it.
//
// A material goes on air like anything else in the console (Prévia, then
// Programa): slides and text as slides, a quiz as a question slide followed
// by its answer slide — so "Revelar resposta" is simply the next slide (→)
// once the question is on air — and video or image through the media layer.
// The teacher's notes (the material's description) stay in the console and
// on the stage screen, never on the projector.

export const AGE_GROUPS = [["children", "Crianças"], ["teens", "Adolescentes"], ["youth", "Jovens"], ["adults", "Adultos"], ["seniors", "Melhor idade"]];
export const ageLabel = (g) => AGE_GROUPS.find(([k]) => k === g)?.[1] || "Turma";
export const MATERIAL_TYPES = [["slides", "Slides", "layers"], ["quiz", "Quiz", "check"], ["text", "Texto", "text"], ["video", "Vídeo", "film"], ["image", "Imagem", "image"]];
export const materialLabel = (t) => MATERIAL_TYPES.find(([k]) => k === t)?.[1] || "Material";
export const materialIcon = (t) => MATERIAL_TYPES.find(([k]) => k === t)?.[2] || "text";
const LETTERS = "ABCDEFGH";

// The questions of a quiz; old rows kept one question in quiz_question.
export function quizQuestions(m) {
    if (Array.isArray(m?.quiz_questions) && m.quiz_questions.length) return m.quiz_questions.filter((q) => q && String(q.question || "").trim());
    if (m?.quiz_question) return [{ question: m.quiz_question, options: m.quiz_options || [], correct: m.quiz_correct ?? 0 }];
    return [];
}

const optionLines = (q, mark) => (q.options || []).map((o, k) => `${mark && k === Number(q.correct) ? "✓ " : ""}${LETTERS[k] || k + 1}) ${o}`).join("\n");

// -> the slides a material shows ([{ text, label, image_url? }]); [] for video and image.
export function materialSlides(m) {
    if (!m) return [];
    if (m.type === "quiz") {
        return quizQuestions(m).flatMap((q, i) => {
            const n = quizQuestions(m).length > 1 ? ` ${i + 1}` : "";
            const question = { text: [q.question, optionLines(q, false)].filter(Boolean).join("\n\n"), label: `Pergunta${n}` };
            const options = q.options || [];
            if (!options.length) return [question];
            const right = options[Number(q.correct)] ?? "";
            return [question, { text: `${q.question}\n\n✓ ${LETTERS[Number(q.correct)] || ""}) ${right}`, label: `Resposta${n}` }];
        });
    }
    if (m.type === "slides" || m.type === "text") {
        return (m.slides || [])
            .filter((s) => s && (String(s.text || "").trim() || s.image_url))
            .map((s, i, all) => ({ text: String(s.text || ""), label: all.length > 1 ? `Slide ${i + 1}` : "", ...(s.image_url ? { image_url: s.image_url } : {}) }));
    }
    return [];
}

// The grey line under a material in a list.
export function materialMeta(m) {
    if (m.type === "quiz") { const n = quizQuestions(m).length; return `Quiz · ${n} ${n === 1 ? "pergunta" : "perguntas"} · Revelar resposta com →`; }
    if (m.type === "video") return m.video_url ? "Vídeo" : "Vídeo · sem arquivo";
    if (m.type === "image") return m.image_url ? "Imagem" : "Imagem · sem arquivo";
    const n = materialSlides(m).length;
    return `${materialLabel(m.type)} · ${n} ${n === 1 ? "slide" : "slides"}`;
}

// The slides as the editor writes them: blocks separated by a blank line.
export const slidesFromText = (text) => String(text || "").split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).map((t) => ({ text: t }));
export const textFromSlides = (slides) => (slides || []).map((s) => s.text || "").join("\n\n");

// -- Attendance ---------------------------------------------------------------
const two = (n) => String(n).padStart(2, "0");
export const dayOf = (d = new Date()) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
export const isPresent = (student, day) => (student?.attendance || []).includes(day);
export function toggleAttendance(student, day) {
    const list = student.attendance || [];
    return { ...student, attendance: list.includes(day) ? list.filter((d) => d !== day) : [...list, day].sort() };
}
// "presente", "última vez dd/mm", "nunca veio"
export function attendanceNote(student, day) {
    if (isPresent(student, day)) return "presente";
    const before = (student?.attendance || []).filter((d) => d < day).sort();
    if (!before.length) return "sem presença";
    const [, m, dd] = before[before.length - 1].split("-");
    return `última vez ${dd}/${m}`;
}
export const presentCount = (cls, day) => (cls?.students || []).filter((s) => isPresent(s, day)).length;
