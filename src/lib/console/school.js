// Escola bíblica (EBD): what a material becomes on the screens, and the
// attendance of a class. Plain JS (its one import is plain too), so node
// --test can check it.
//
// A material goes on air like anything else in the console (Prévia, then
// Programa): slides and text as slides, video and image through the media
// layer, and the activities (owner 2026-10-16, Rodada E4) as slides that
// carry one (slide.activity, shared/live-state.mjs): a quiz question with
// its options as cards, a Verdadeiro ou falso, a verse to complete, a verse
// to memorize, a discussion with its timer. "Revelar" (content.reveal, and
// → on air) walks the activity without changing slide. The teacher's notes
// (the material's description, and each question's own) stay in the
// console and on the stage screen, never on the projector.
import { memorizeOrder, wordCount, wordsOf, LETTERS } from "../activity.js";

export const AGE_GROUPS = [["children", "Crianças"], ["teens", "Adolescentes"], ["youth", "Jovens"], ["adults", "Adultos"], ["seniors", "Melhor idade"]];
export const ageLabel = (g) => AGE_GROUPS.find(([k]) => k === g)?.[1] || "Turma";
// [type, name, icon, what it does] — the editor's type cards read the last.
export const MATERIAL_TYPES = [
    ["slides", "Slides", "layers", "Texto e imagens, um slide por bloco"],
    ["quiz", "Quiz", "list", "Pergunta com até 8 opções; Revelar acende a certa"],
    ["truefalse", "Verdadeiro ou falso", "check", "Afirmações; Revelar acende V ou F"],
    ["blanks", "Complete a frase", "edit", "Um versículo com lacunas; cada clique revela uma palavra"],
    ["memorize", "Versículo para memorizar", "book", "Cada clique apaga mais algumas palavras"],
    ["discussion", "Discussão com timer", "clock", "Pergunta aberta com o timer na tela"],
    ["text", "Texto", "text", "Um texto corrido, um slide por bloco"],
    ["video", "Vídeo", "film", "Um vídeo da Mídia ou do computador"],
    ["image", "Imagem", "image", "Uma imagem da Mídia ou do computador"],
];
export const materialLabel = (t) => MATERIAL_TYPES.find(([k]) => k === t)?.[1] || "Material";
export const materialIcon = (t) => MATERIAL_TYPES.find(([k]) => k === t)?.[2] || "text";
// Where each type keeps its items: questions, or slides (a verse, a
// discussion question) with the type's own fields.
export const QUESTION_TYPES = ["quiz", "truefalse"];
export const VERSE_TYPES = ["blanks", "memorize", "discussion"];
export const MAX_OPTIONS = 8;
export const MEMORIZE_ROUNDS = [3, 4, 5, 6, 8];
export const DISCUSSION_MINUTES = [1, 2, 3, 5, 10, 15];
// A fresh material, seeded with the class it is made from (the Material
// page and the Escola's "Novo material" share it).
export const blankMaterial = (classRow) => ({ title: "", type: "slides", subject: "", class_id: classRow?.id || "", class_name: classRow?.name || "", age_group: classRow?.age_group || "all", slides: [], quiz_questions: [], video_url: "", image_url: "", description: "", text_color: "#ffffff", background_color: "", background_image: "" });
// A new item of each list the editor builds.
export const blankQuestion = (type) => (type === "truefalse" ? { question: "", correct: 0, explain: "", notes: "" } : { question: "", options: ["", ""], correct: 0, explain: "", notes: "" });
export const blankVerse = (type) => ({ text: "", ref: "", notes: "", ...(type === "blanks" ? { blanks: [] } : type === "memorize" ? { rounds: 4 } : type === "discussion" ? { minutes: 5 } : {}) });

// The questions of a quiz; old rows kept one question in quiz_question.
export function quizQuestions(m) {
    if (Array.isArray(m?.quiz_questions) && m.quiz_questions.length) return m.quiz_questions.filter((q) => q && String(q.question || "").trim());
    if (m?.quiz_question) return [{ question: m.quiz_question, options: m.quiz_options || [], correct: m.quiz_correct ?? 0 }];
    return [];
}
const verses = (m) => (m?.slides || []).filter((s) => s && String(s.text || "").trim());

// A question's options without the empty ones, the right one followed.
export function cleanOptions(q) {
    const all = (q?.options || []).slice(0, MAX_OPTIONS).map((o) => String(o ?? "").trim());
    const right = Number(q?.correct) || 0;
    const options = all.filter(Boolean);
    const correct = all[right] ? all.slice(0, right).filter(Boolean).length : 0;
    return { options, correct };
}

const trim = (v) => String(v ?? "").trim();
const counted = (list, i, name) => `${name}${list.length > 1 ? ` ${i + 1}` : ""}`;

// -> the slides a material shows ([{ text, label, image_url?, activity?,
// notes? }]); [] for video and image. `notes` is the teacher's note of that
// slide: materialStage takes it out before anything goes on air.
export function materialSlides(m) {
    if (!m) return [];
    const withNotes = (slide, notes) => (trim(notes) ? { ...slide, notes: trim(notes) } : slide);
    if (m.type === "quiz") {
        return quizQuestions(m).map((q, i, all) => {
            const { options, correct } = cleanOptions(q);
            const slide = { text: trim(q.question), label: counted(all, i, "Pergunta") };
            // Fewer than two options: an open question, plain text.
            if (options.length >= 2) slide.activity = { kind: "choice", options, correct, ...(trim(q.explain) ? { explain: trim(q.explain) } : {}) };
            return withNotes(slide, q.notes);
        });
    }
    if (m.type === "truefalse") {
        return quizQuestions(m).map((q, i, all) => withNotes({ text: trim(q.question), label: counted(all, i, "Afirmação"), activity: { kind: "truefalse", correct: Number(q.correct) === 1 ? 1 : 0, ...(trim(q.explain) ? { explain: trim(q.explain) } : {}) } }, q.notes));
    }
    if (VERSE_TYPES.includes(m.type)) {
        const names = { blanks: "Frase", memorize: "Versículo", discussion: "Discussão" };
        return verses(m).map((s, i, all) => {
            const text = trim(s.text);
            const slide = { text, label: counted(all, i, names[m.type]) };
            const explain = trim(s.ref) ? { explain: trim(s.ref) } : {};
            const n = wordCount(text);
            if (m.type === "blanks") {
                const blanks = [...new Set((s.blanks || []).filter((k) => Number.isInteger(k) && k >= 0 && k < n))].sort((a, b) => a - b);
                if (blanks.length) slide.activity = { kind: "blanks", blanks, ...explain };
            } else if (m.type === "memorize") {
                if (n) slide.activity = { kind: "memorize", order: memorizeOrder(text), rounds: Number(s.rounds) || 4, ...explain };
            } else {
                slide.activity = { kind: "discussion", minutes: Number(s.minutes) || 5, ...explain };
            }
            return withNotes(slide, s.notes);
        });
    }
    if (m.type === "slides" || m.type === "text") {
        return (m.slides || [])
            .filter((s) => s && (String(s.text || "").trim() || s.image_url))
            .map((s, i, all) => ({ text: String(s.text || ""), label: all.length > 1 ? `Slide ${i + 1}` : "", ...(s.image_url ? { image_url: s.image_url } : {}) }));
    }
    return [];
}

// The slides as they go on air (no teacher's notes in them) and each
// slide's note apart, for content.stage.slide_notes (the console and the
// Palco). slideNotes is [] when no slide has one.
export function materialStage(m) {
    const all = materialSlides(m);
    const slides = all.map(({ notes: _n, ...s }) => s);
    const slideNotes = all.some((s) => s.notes) ? all.map((s) => s.notes || "") : [];
    return { slides, slideNotes };
}

// The grey line under a material in a list.
export function materialMeta(m) {
    const n = materialSlides(m).length;
    const of = (one, many) => `${n} ${n === 1 ? one : many}`;
    if (m.type === "quiz") return `Quiz · ${of("pergunta", "perguntas")}`;
    if (m.type === "truefalse") return `Verdadeiro ou falso · ${of("afirmação", "afirmações")}`;
    if (m.type === "blanks") return `Complete a frase · ${of("frase", "frases")}`;
    if (m.type === "memorize") return `Para memorizar · ${of("versículo", "versículos")}`;
    if (m.type === "discussion") return `Discussão · ${of("pergunta", "perguntas")}`;
    if (m.type === "video") return m.video_url ? "Vídeo" : "Vídeo · sem arquivo";
    if (m.type === "image") return m.image_url ? "Imagem" : "Imagem · sem arquivo";
    return `${materialLabel(m.type)} · ${of("slide", "slides")}`;
}

// The Escola's Revelar button for the slide on air: what a click does now
// (`to`: the step it goes to) — one step on, and from the last back to the
// start. `max` is activitySteps(slide), `step` revealStep(content).
export function revealAction(activity, step, max) {
    if (!activity || !max) return null;
    const done = step >= max;
    const to = done ? 0 : step + 1;
    if (activity.kind === "choice" || activity.kind === "truefalse") return { label: done ? "Esconder a resposta" : "Revelar resposta", to, done };
    if (activity.kind === "blanks") return { label: done ? "Esconder as palavras" : `Revelar a próxima palavra · ${step}/${max}`, to, done };
    if (activity.kind === "memorize") return { label: done ? "Mostrar o versículo" : `Apagar mais palavras · ${step}/${max}`, to, done };
    return { label: done ? "Zerar o timer" : "Iniciar o timer", to, done };
}

// Where a slide's activity stands, for the Escola's list of questions.
export function revealNote(activity, step, max) {
    if (!activity || !step) return "";
    if (activity.kind === "discussion") return "timer correndo";
    if (activity.kind === "blanks" || activity.kind === "memorize") return step >= max ? (activity.kind === "blanks" ? "completa" : "toda apagada") : `${step}/${max}`;
    return "revelada";
}

// Complete a frase: the blanks chosen follow their words when the verse is
// edited (the second "mundo" stays the second "mundo"); a word that is gone
// takes its blank with it.
export function remapBlanks(before, after, blanks) {
    const a = wordsOf(before);
    const b = wordsOf(after);
    const out = [];
    for (const k of blanks || []) {
        const w = a[k];
        if (w === undefined) continue;
        const n = a.slice(0, k).filter((x) => x === w).length;
        let seen = 0;
        const j = b.findIndex((x) => x === w && seen++ === n);
        if (j >= 0) out.push(j);
    }
    return [...new Set(out)].sort((x, y) => x - y);
}

// An item of a list one place up (d -1) or down (d 1).
export function moveItem(list, i, d) {
    const j = i + d;
    if (!Array.isArray(list) || i < 0 || i >= list.length || j < 0 || j >= list.length) return list;
    const out = [...list];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
}

// The slides as the editor writes them: blocks separated by a blank line.
export const slidesFromText = (text) => String(text || "").split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).map((t) => ({ text: t }));
// A slide with only a picture has no block of its own.
export const textFromSlides = (slides) => (slides || []).filter((s) => String(s?.text || "").trim()).map((s) => s.text).join("\n\n");

// The slides after the text was edited: each block keeps what its slide had
// (its picture) by matching the text (the longest run of blocks that did
// not change), not by position — a block added or taken out above no longer
// moves every picture down or up. A block whose text changed keeps the
// picture of the slide it replaced; a slide that is only a picture (no
// block of its own) stays after the slide it followed.
export function slidesFromEdit(old, text) {
    const blocks = slidesFromText(text);
    const prior = (old || []).filter((s) => s && (String(s.text || "").trim() || s.image_url));
    const textual = prior.filter((s) => String(s.text || "").trim());
    const a = textual.map((s) => String(s.text).trim());
    const b = blocks.map((s) => s.text);
    // Longest common subsequence of the texts.
    const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const match = new Array(b.length).fill(-1);
    const pairs = [];
    for (let i = 0, j = 0; i < a.length && j < b.length;) {
        if (a[i] === b[j]) { match[j] = i; pairs.push([i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
    }
    // Between two matches, the changed blocks take the replaced slides in order.
    const bounds = [[-1, -1], ...pairs, [a.length, b.length]];
    for (let k = 0; k + 1 < bounds.length; k++) {
        const [i0, j0] = bounds[k];
        const [i1, j1] = bounds[k + 1];
        for (let d = 1; i0 + d < i1 && j0 + d < j1; d++) match[j0 + d] = i0 + d;
    }
    // Picture-only slides follow the text slide before them (or open the list).
    const after = new Map();
    let anchor = -1;
    for (const s of prior) {
        if (String(s.text || "").trim()) { anchor = textual.indexOf(s); continue; }
        let at = anchor;
        while (at >= 0 && !match.includes(at)) at--;
        if (!after.has(at)) after.set(at, []);
        after.get(at).push(s);
    }
    const out = [...(after.get(-1) || [])];
    blocks.forEach((blk, j) => {
        const was = match[j] >= 0 ? textual[match[j]] : null;
        out.push(was ? { ...was, text: blk.text } : blk);
        if (was) out.push(...(after.get(match[j]) || []));
    });
    return out;
}

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
export { LETTERS };
