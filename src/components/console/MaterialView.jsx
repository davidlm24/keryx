import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import { uploadFile } from "@/lib/mediaImport";
import Icon from "./Icon";
import { Panel, Btn, IconBtn, Field, Seg, WinBar, useUnloadGuard } from "./kx";
import { stageFromMaterial } from "@/lib/console/stage";
import { MATERIAL_TYPES, VERSE_TYPES, MAX_OPTIONS, MEMORIZE_ROUNDS, DISCUSSION_MINUTES, quizQuestions, textFromSlides, slidesFromEdit, materialSlides, blankMaterial, blankQuestion, blankVerse, moveItem, remapBlanks } from "@/lib/console/school";
import { wordsOf, LETTERS } from "@/lib/activity";
import { parseReference, formatReference } from "@/lib/bibleBooks";
import { readChapter } from "@/lib/bibleText";
import { bibleVersionWanted } from "./BibleEnv";
import BgChip from "./library/BgChip";
import { useConfirm, deleteQuestion } from "./ConfirmDialog";

const EMPTY = [];
const CLASSES = ["console", "bibleClasses"];
const MATERIALS = ["console", "bibleMaterials"];

// A material of the Escola bíblica, as a page of THE window (Rodada C,
// fase c: it used to swap the Escola's middle column and Esc dropped the
// draft in silence): "← Escola bíblica" goes back to the list, the bar
// holds Salvar/Cancelar/Excluir, and leaving with changes asks. The kind
// (cards that say what each one does), title, lesson and class, the content
// of that kind — slides, or the activities of Rodada E4: quiz questions with
// up to 8 options, Verdadeiro ou falso, a verse with blanks chosen word by
// word, a verse to memorize, discussion questions with their timer; each
// question with its own explanation (on screen) and note (the teacher's),
// reordered with ↑ ↓ — the teacher's notes and the colours; saving puts it
// in the Prévia and goes back.
export default function MaterialView({ c, materialId = null, classId = "", media, onClose, escRef, active = true }) {
    const client = useQueryClient();
    useEffect(() => keryx.entities.BibleSchoolClass.subscribe(() => client.invalidateQueries({ queryKey: CLASSES })), [client]);
    useEffect(() => keryx.entities.BibleMaterial.subscribe(() => client.invalidateQueries({ queryKey: MATERIALS })), [client]);
    const fileRef = useRef(null);
    const classes = useQuery({ queryKey: CLASSES, queryFn: () => keryx.entities.BibleSchoolClass.list("name") }).data ?? EMPTY;
    const materials = useQuery({ queryKey: MATERIALS, queryFn: () => keryx.entities.BibleMaterial.list("-created_date") }).data ?? EMPTY;
    const ask = useConfirm();
    const isNew = !materialId;
    const [draft, setDraft] = useState(() => (isNew ? blankMaterial(null) : null));
    const orig = useRef(isNew ? JSON.stringify(blankMaterial(null)) : null);
    // A new material seeded with the class it came from, once the classes load.
    useEffect(() => {
        if (!isNew || !classId || draft?.class_id) return;
        const k = classes.find((x) => x.id === classId);
        if (!k) return;
        const d = blankMaterial(k);
        setDraft(d);
        orig.current = JSON.stringify(d);
    }, [classes, classId, isNew]); // eslint-disable-line react-hooks/exhaustive-deps
    // An existing one: the row as the list has it (realtime keeps it fresh).
    useEffect(() => {
        if (isNew || draft) return;
        const m = materials.find((x) => x.id === materialId);
        if (!m) return;
        const d = { ...blankMaterial(null), ...m, slides: m.slides || [], quiz_questions: quizQuestions(m) };
        setDraft(d);
        orig.current = JSON.stringify(d);
    }, [materials, materialId, isNew, draft]);
    const dirty = useMemo(() => draft && JSON.stringify(draft) !== orig.current, [draft]);
    // Detached (/Janela), unsaved changes hold the window: closing it asks.
    useUnloadGuard(dirty);
    const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
    const [slidesText, setSlidesText] = useState(null);
    useEffect(() => { if (draft && slidesText === null) setSlidesText(textFromSlides(draft.slides)); }, [draft, slidesText]);

    // One save at a time: a held Ctrl+S or a double click created a new
    // material twice before the page closed.
    const [busy, setBusy] = useState(false);
    const saving = useRef(false);
    const save = async () => {
        if (!draft.title.trim()) { c.say("Dê um título ao material."); return; }
        if (saving.current) return;
        saving.current = true;
        setBusy(true);
        const { id, created_date: _c, updated_date: _u, created_by_id: _b, ...row } = draft;
        const klass = classes.find((k) => k.id === row.class_id);
        const data = { ...row, title: row.title.trim(), class_name: klass?.name || "", age_group: klass?.age_group || "all" };
        try {
            const saved = id ? await keryx.entities.BibleMaterial.update(id, data) : await keryx.entities.BibleMaterial.create(data);
            client.invalidateQueries({ queryKey: MATERIALS });
            c.setPrev(stageFromMaterial(saved));
            c.say("Material salvo · está na Prévia.");
            orig.current = JSON.stringify(draft);
            onClose();
        } catch (err) { c.say(err?.message || "Não foi possível."); }
        saving.current = false;
        setBusy(false);
    };
    const remove = async () => {
        if (!(await ask(deleteQuestion("o material", draft.title || "Novo material")))) return;
        try { await keryx.entities.BibleMaterial.delete(draft.id); client.invalidateQueries({ queryKey: MATERIALS }); c.say("Material excluído."); onClose(); } catch (err) { c.say(err?.message || "Não foi possível."); }
    };
    const leave = async (all = false) => {
        if (dirty && !(await ask({ title: "Descartar as mudanças?", text: `O material "${draft.title?.trim() || "Novo material"}" tem mudanças não salvas.`, ok: "Descartar" }))) return;
        onClose(all);
    };

    // Esc comes routed from the console (keys.js ESC_ORDER "window"): leave,
    // asking if it changed; the (x) leaves the whole stack the same way.
    // Ctrl+S saves — the page's own key; it defers to a dialog over the
    // page and sleeps while another page covers this one.
    if (escRef) escRef.current = (mode) => leave(mode === "all");
    const keysRef = useRef(null);
    keysRef.current = (e) => {
        if (!(draft && active && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s")) return;
        if (document.querySelector(".console .scrim:not(.win-scrim)")) return;
        e.preventDefault(); e.stopPropagation();
        if (e.repeat || busy) return;
        save();
    };
    useEffect(() => {
        const onKey = (e) => keysRef.current(e);
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    const bar = (title) => (
        <WinBar title="Material" sub={title} actions={draft ? <>
            {draft.id && <Btn small onClick={remove}>Excluir…</Btn>}
            <Btn small onClick={() => c.setPrev(stageFromMaterial({ ...draft, id: draft.id || "rascunho" }))} title="Ver como fica, na Prévia do console">Pôr na prévia</Btn>
            <Btn small onClick={() => leave()}>Cancelar</Btn>
            <Btn small kind="brand" disabled={busy} onClick={save} title="Ctrl+S">{busy ? "Salvando…" : "Salvar material"}</Btn>
        </> : null} />
    );
    if (!draft) return <>{bar("Abrindo…")}<div className="win-body" /></>;

    const qs = draft.quiz_questions || [];
    const setQ = (i, patch) => set({ quiz_questions: qs.map((q, k) => (k === i ? { ...q, ...patch } : q)) });
    const vs = draft.slides || [];
    const setV = (i, patch) => set({ slides: vs.map((v, k) => (k === i ? { ...v, ...patch } : v)) });
    const files = media.filter((m) => !m.missing && (draft.type === "video" ? m.type === "video" : m.type === "image" || m.type === "gif"));
    const upload = async (file) => {
        if (!file) return;
        try { const { file_url } = await uploadFile(file); set(draft.type === "video" ? { video_url: file_url } : { image_url: file_url }); } catch (err) { c.say(err?.message || "Não foi possível copiar o arquivo."); }
    };
    // Switching to Slides or Texto shows the slides as they are now.
    const setType = (type) => {
        set({ type });
        if (type === "slides" || type === "text") setSlidesText(textFromSlides(draft.slides));
    };
    // The text from the slides' blocks: each picture stays with its slide
    // (slidesFromEdit matches the text, not the position).
    const editSlides = (text) => { setSlidesText(text); set({ slides: slidesFromEdit(draft.slides, text) }); };
    const pictures = vs.filter((s) => s && (String(s.text || "").trim() || s.image_url)).map((s, i) => ({ s, n: i + 1 })).filter(({ s }) => s.image_url);
    const dropPicture = (s) => set({ slides: String(s.text || "").trim() ? vs.map((x) => (x === s ? { ...x, image_url: "" } : x)) : vs.filter((x) => x !== s) });
    // A verse's text from the Bíblia (the edition chosen there), by its reference.
    const fromBible = async (i) => {
        const r = parseReference(vs[i]?.ref);
        if (!r) { c.say("Escreva a referência primeiro, como João 3:16."); return; }
        try {
            const got = await readChapter(bibleVersionWanted(), r.book, r.chapter);
            const verses = r.verseStart ? got.verses.filter((v) => v.number >= r.verseStart && v.number <= (r.verseEnd || r.verseStart)) : got.verses;
            if (!verses.length) throw new Error(`${formatReference(r)} não existe na ${got.version}.`);
            const text = verses.map((v) => v.text).join(" ");
            setV(i, { text, ref: formatReference(r), ...(draft.type === "blanks" ? { blanks: remapBlanks(vs[i].text, text, vs[i].blanks) } : {}) });
        } catch (err) { c.say(err?.message || "Não foi possível buscar o versículo."); }
    };
    // Moving, taking out: the same small tools on every list.
    const tools = (listKey, list, i, what) => (
        <>
            <IconBtn name="chevron-up" small title={`Subir ${what}`} disabled={i === 0} onClick={() => set({ [listKey]: moveItem(list, i, -1) })} />
            <IconBtn name="chevron-down" small title={`Descer ${what}`} disabled={i === list.length - 1} onClick={() => set({ [listKey]: moveItem(list, i, 1) })} />
            <IconBtn name="x" small title={`Tirar ${what}`} onClick={() => set({ [listKey]: list.filter((_, k) => k !== i) })} />
        </>
    );
    const extras = (value, onExplain, onNotes, explainHint) => (
        <div className="sv-q-sub">
            <Field icon={null} value={value.explain || ""} onChange={onExplain} placeholder={explainHint} inputProps={{ spellCheck: true }} />
            <Field icon={null} value={value.notes || ""} onChange={onNotes} placeholder="Nota do professor · só no console e no palco" inputProps={{ spellCheck: true }} />
        </div>
    );
    const verseNames = { blanks: ["a frase", "Frase", "O versículo ou a frase"], memorize: ["o versículo", "Versículo", "O versículo"], discussion: ["a pergunta", "Pergunta", "A pergunta para a turma discutir"] };

    return (
        <>
            {bar(`${draft.id ? draft.title || "Material" : "Novo material"}${dirty ? " · não salvo" : ""}`)}
            <div className="win-body">
            <div className="col" style={{ flex: "1 1 auto", maxWidth: 760, minWidth: 0, margin: "0 auto" }}>
                <Panel noHead bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className="sv-scroll">
                        <div className="frm sv-frm sv-ed">
                            <span className="k">Tipo</span>
                            <div className="sv-types" role="radiogroup" aria-label="Tipo do material">
                                {MATERIAL_TYPES.map(([k, label, icon, hint]) => (
                                    <button key={k} type="button" role="radio" aria-checked={draft.type === k} className={`sv-type kx-t ${draft.type === k ? "is-on" : ""}`} onClick={() => setType(k)} title={hint}>
                                        <b><Icon name={icon} size={14} />{label}</b>
                                        <small>{hint}</small>
                                    </button>
                                ))}
                            </div>
                            <span className="k">Título</span><Field label="Título" icon={null} value={draft.title} onChange={(v) => set({ title: v })} placeholder="Ex.: Pergunta · o filho pródigo" inputProps={{ autoFocus: !draft.id }} />
                            <span className="k">Lição</span><Field label="Lição" icon={null} value={draft.subject || ""} onChange={(v) => set({ subject: v })} placeholder="Ex.: Lição 12 · Parábolas" />
                            <span className="k">Turma</span>
                            <select className="pl-input" value={draft.class_id || ""} onChange={(e) => set({ class_id: e.target.value })} aria-label="Turma"><option value="">Todas as turmas</option>{classes.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
                            {(draft.type === "slides" || draft.type === "text") && (
                                <>
                                    <span className="k">{draft.type === "text" ? "Texto" : "Slides"}</span>
                                    <div>
                                        <textarea className="ed-text sv-slides" value={slidesText ?? ""} onChange={(e) => editSlides(e.target.value)} placeholder={"Cada bloco é um slide.\n\nDeixe uma linha em branco entre eles."} aria-label="Slides" />
                                        <span className="kx-meta">{materialSlides(draft).length} {materialSlides(draft).length === 1 ? "slide" : "slides"} · uma linha em branco separa os slides</span>
                                        {pictures.length > 0 && (
                                            <div className="sv-imgs">
                                                {pictures.map(({ s, n }) => (
                                                    <div key={`${n}${s.image_url}`} className="nv-inline">
                                                        <Icon name="image" size={14} />
                                                        <span className="kx-meta">Slide {n} · {String(s.text || "").trim() ? `imagem com "${String(s.text).trim().split("\n")[0].slice(0, 40)}"` : "só a imagem"}</span>
                                                        <IconBtn name="x" small title={String(s.text || "").trim() ? "Tirar a imagem do slide" : "Tirar o slide"} onClick={() => dropPicture(s)} />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                            {draft.type === "quiz" && (
                                <>
                                    <span className="k">Perguntas</span>
                                    <div className="sv-quiz">
                                        {qs.map((q, i) => {
                                            const opts = (q.options || []).length >= 2 ? q.options : [...(q.options || []), "", ""].slice(0, 2);
                                            const correct = Number(q.correct) || 0;
                                            const setOpt = (k, v) => { const o = [...opts]; o[k] = v; setQ(i, { options: o }); };
                                            const dropOpt = (k) => setQ(i, { options: opts.filter((_, j) => j !== k), correct: correct === k ? 0 : correct > k ? correct - 1 : correct });
                                            return (
                                                <div key={i} className="sv-q">
                                                    <div className="sv-q-head"><b className="kx-meta">{i + 1}.</b><Field icon={null} value={q.question || ""} onChange={(v) => setQ(i, { question: v })} placeholder="A pergunta" style={{ flex: 1 }} inputProps={{ spellCheck: true }} />{tools("quiz_questions", qs, i, "a pergunta")}</div>
                                                    {opts.map((o, k) => (
                                                        <div key={k} className="nv-inline sv-opt">
                                                            <button type="button" className={`sv-right kx-t ${correct === k ? "is-on" : ""}`} onClick={() => setQ(i, { correct: k })} title="Marcar como a resposta certa" aria-pressed={correct === k}>{LETTERS[k]}</button>
                                                            <Field icon={null} value={o || ""} onChange={(v) => setOpt(k, v)} placeholder={`Opção ${LETTERS[k]}`} style={{ flex: 1 }} inputProps={{ spellCheck: true }} />
                                                            {opts.length > 2 && <IconBtn name="x" small title="Tirar a opção" onClick={() => dropOpt(k)} />}
                                                        </div>
                                                    ))}
                                                    {opts.length < MAX_OPTIONS && <div className="sv-opt"><Btn small onClick={() => setQ(i, { options: [...opts, ""] })}><Icon name="plus" />Opção</Btn></div>}
                                                    {extras(q, (v) => setQ(i, { explain: v }), (v) => setQ(i, { notes: v }), "Referência ou explicação · na tela ao revelar")}
                                                </div>
                                            );
                                        })}
                                        <Btn small onClick={() => set({ quiz_questions: [...qs, blankQuestion("quiz")] })}><Icon name="plus" />Pergunta</Btn>
                                        <span className="kx-meta">Cada pergunta é um slide com as opções em cartões. Revelar (ou →) acende a certa no mesmo slide.</span>
                                    </div>
                                </>
                            )}
                            {draft.type === "truefalse" && (
                                <>
                                    <span className="k">Afirmações</span>
                                    <div className="sv-quiz">
                                        {qs.map((q, i) => (
                                            <div key={i} className="sv-q">
                                                <div className="sv-q-head"><b className="kx-meta">{i + 1}.</b><Field icon={null} value={q.question || ""} onChange={(v) => setQ(i, { question: v })} placeholder="A afirmação" style={{ flex: 1 }} inputProps={{ spellCheck: true }} />{tools("quiz_questions", qs, i, "a afirmação")}</div>
                                                <div className="nv-inline sv-tf"><span className="kx-meta">A resposta</span><Seg small label="A resposta" value={Number(q.correct) === 1 ? "F" : "V"} onChange={(v) => setQ(i, { correct: v === "F" ? 1 : 0 })} options={[["V", "Verdadeiro"], ["F", "Falso"]]} /></div>
                                                {extras(q, (v) => setQ(i, { explain: v }), (v) => setQ(i, { notes: v }), "Referência ou explicação · na tela ao revelar")}
                                            </div>
                                        ))}
                                        <Btn small onClick={() => set({ quiz_questions: [...qs, blankQuestion("truefalse")] })}><Icon name="plus" />Afirmação</Btn>
                                        <span className="kx-meta">Cada afirmação é um slide com V e F. Revelar (ou →) acende a resposta.</span>
                                    </div>
                                </>
                            )}
                            {VERSE_TYPES.includes(draft.type) && (
                                <>
                                    <span className="k">{verseNames[draft.type][1]}s</span>
                                    <div className="sv-quiz">
                                        {vs.map((v, i) => {
                                            const words = wordsOf(v.text);
                                            const blanks = v.blanks || [];
                                            return (
                                                <div key={i} className="sv-q">
                                                    <div className="sv-q-head"><b className="kx-meta">{i + 1}.</b><span style={{ flex: 1 }} />{tools("slides", vs, i, verseNames[draft.type][0])}</div>
                                                    <div className="sv-tf">
                                                        <textarea className="ed-text" rows={draft.type === "discussion" ? 2 : 3} value={v.text || ""} placeholder={verseNames[draft.type][2]} aria-label={verseNames[draft.type][2]}
                                                            onChange={(e) => setV(i, { text: e.target.value, ...(draft.type === "blanks" ? { blanks: remapBlanks(v.text, e.target.value, blanks) } : {}) })} />
                                                    </div>
                                                    {draft.type === "blanks" && (
                                                        <>
                                                            <div className="sv-words" aria-label="Palavras">
                                                                {words.map((w, k) => (
                                                                    <button key={k} type="button" className={`sv-word kx-t ${blanks.includes(k) ? "is-on" : ""}`} aria-pressed={blanks.includes(k)}
                                                                        onClick={() => setV(i, { blanks: blanks.includes(k) ? blanks.filter((x) => x !== k) : [...blanks, k].sort((a, b) => a - b) })}>{w}</button>
                                                                ))}
                                                            </div>
                                                            <span className="kx-meta sv-tf">{blanks.length ? `${blanks.length} ${blanks.length === 1 ? "lacuna" : "lacunas"} · cada clique em Revelar traz uma de volta` : "Clique nas palavras que a turma vai completar."}</span>
                                                        </>
                                                    )}
                                                    {draft.type === "memorize" && <div className="nv-inline sv-tf"><span className="kx-meta">Cliques até sumir tudo</span><Seg small label="Cliques até sumir tudo" value={String(v.rounds || 4)} onChange={(n) => setV(i, { rounds: Number(n) })} options={MEMORIZE_ROUNDS.map((n) => [String(n), String(n)])} /></div>}
                                                    {draft.type === "discussion" && <div className="nv-inline sv-tf"><span className="kx-meta">Timer</span><Seg small label="Timer" value={String(v.minutes || 5)} onChange={(n) => setV(i, { minutes: Number(n) })} options={DISCUSSION_MINUTES.map((n) => [String(n), `${n} min`])} /></div>}
                                                    <div className="sv-q-sub">
                                                        <span className="nv-inline" style={{ flexWrap: "nowrap" }}>
                                                            <Field icon={null} value={v.ref || ""} onChange={(x) => setV(i, { ref: x })} placeholder={draft.type === "discussion" ? "Texto base (opcional) · ex.: Efésios 2:8" : "Referência · ex.: João 3:16"} style={{ flex: 1 }} />
                                                            {draft.type !== "discussion" && <IconBtn name="book" small title="Trazer o texto da Bíblia, pela referência" onClick={() => fromBible(i)} />}
                                                        </span>
                                                        <Field icon={null} value={v.notes || ""} onChange={(x) => setV(i, { notes: x })} placeholder="Nota do professor · só no console e no palco" inputProps={{ spellCheck: true }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <Btn small onClick={() => set({ slides: [...vs, blankVerse(draft.type)] })}><Icon name="plus" />{verseNames[draft.type][1]}</Btn>
                                        <span className="kx-meta">{{ blanks: "Na tela, as palavras escolhidas viram lacunas; Revelar (ou →) traz uma de cada vez.", memorize: "Na tela, o versículo inteiro; cada Revelar (ou →) apaga mais algumas palavras, até a turma dizer de cor.", discussion: "Na tela, a pergunta com o timer embaixo; Revelar (ou →) inicia o timer, e o sino toca no fim." }[draft.type]}</span>
                                    </div>
                                </>
                            )}
                            {(draft.type === "video" || draft.type === "image") && (
                                <>
                                    <span className="k">{draft.type === "video" ? "Vídeo" : "Imagem"}</span>
                                    <div className="sv-file">
                                        <select className="pl-input" value={(draft.type === "video" ? draft.video_url : draft.image_url) || ""} onChange={(e) => set(draft.type === "video" ? { video_url: e.target.value } : { image_url: e.target.value })} aria-label="Arquivo">
                                            <option value="">Escolha da Mídia…</option>
                                            {files.map((m) => <option key={m.id} value={m.file_url}>{m.title}</option>)}
                                            {(draft.type === "video" ? draft.video_url : draft.image_url) && !files.some((m) => m.file_url === (draft.type === "video" ? draft.video_url : draft.image_url)) && <option value={draft.type === "video" ? draft.video_url : draft.image_url}>Arquivo atual</option>}
                                        </select>
                                        <Btn small onClick={() => fileRef.current?.click()}><Icon name="folder" />Do computador…</Btn>
                                        <input ref={fileRef} type="file" hidden accept={draft.type === "video" ? "video/*" : "image/*"} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
                                    </div>
                                </>
                            )}
                            <span className="k">Notas</span>
                            <textarea className="ed-text" rows={3} value={draft.description || ""} onChange={(e) => set({ description: e.target.value })} placeholder="Para o professor: só no console e no palco, nunca no telão" aria-label="Notas do professor" />
                            {draft.type !== "video" && draft.type !== "image" && (
                                <>
                                    <span className="k">Cores</span>
                                    <span className="nv-inline">
                                        <label className="nv-color">Texto<input type="color" className="ed-color" value={draft.text_color || "#ffffff"} onChange={(e) => set({ text_color: e.target.value })} /></label>
                                    </span>
                                    <span className="k">Fundo</span>
                                    <span className="nv-inline">
                                        <BgChip accept={["image", "color"]} title="Fundo do material" empty="o do tema"
                                            value={draft.background_image ? { kind: "image", value: draft.background_image } : /^#[0-9a-f]{6}$/i.test(draft.background_color || "") ? { kind: "color", value: draft.background_color } : null}
                                            noneLabel={draft.background_image || draft.background_color ? "Fundo do tema" : undefined}
                                            onPick={(spec) => set(spec?.kind === "image" ? { background_image: spec.value, background_color: "" } : spec?.kind === "color" ? { background_color: spec.value, background_image: "" } : { background_image: "", background_color: "" })} />
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </Panel>
            </div>
            </div>
        </>
    );
}
