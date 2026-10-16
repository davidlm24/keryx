import React, { useEffect, useMemo, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { Btn, Empty } from "../kx";
import { useConfirm } from "../ConfirmDialog";
import { useLibrary } from "../useConsoleData";
import { FormRow, Switch, useBridge, formatWhen, desktopOnly } from "./parts";
import { useSyncStatus, setSyncStatus } from "@/hooks/useSyncStatus";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { syncStep, syncState, computerRows, sinceLine, ago } from "@/lib/console/syncView";
import { parseCode, codeMessage } from "@shared/syncCode.mjs";
import { duplicateSongs, keepPairs, mergePlan } from "@shared/syncDuplicates.mjs";

// Configurações › Sincronização (docs/desktop-architecture.md §8b; the
// owner's picks of 2026-10-16): the church's content kept the same on every
// computer through a folder Google Drive para computador (or OneDrive,
// Dropbox) keeps in step. This computer's folder and code; the main process
// does the work (electron/syncControl.cjs, keryx:sync). Three steps: choose
// the folder, make or type the church's code, then the status.
export default function SyncSection({ c }) {
    const sync = useBridge("sync");
    const st = useSyncStatus();
    const [busy, setBusy] = useState("");
    const [made, setMade] = useState(null);
    const [inspect, setInspect] = useState(null);
    const step = syncStep(st);
    const unpaired = step === "code" && st?.engine?.state !== "mismatch" && st?.engine?.state !== "removed" && !st?.keyLost;

    // What the folder holds (a code or not, the computers in it) while this
    // computer has none yet.
    useEffect(() => {
        if (!sync || !unpaired) return undefined;
        let live = true;
        sync.call("inspect").then((res) => { if (live && res?.data) setInspect(res.data); }).catch(() => {});
        return () => { live = false; };
    }, [sync, unpaired, st?.folder]);

    if (!sync) return <Empty icon="cloud" title="Sincronização">{desktopOnly}</Empty>;

    // One action at a time; its answer is the new status.
    const run = async (op, args, label) => {
        setBusy(op);
        try {
            const res = await sync.call(op, args);
            if (res?.error) {
                c.say(`${label || "Sincronização"}: ${res.error.message}`);
                return null;
            }
            const data = res?.data || null;
            if (data && "available" in data) setSyncStatus(data);
            if (data?.inspect) setInspect(data.inspect);
            return data;
        } catch (err) {
            c.say(`${label || "Sincronização"}: ${err?.message || "não foi possível."}`);
            return null;
        } finally {
            setBusy("");
        }
    };

    const props = { c, st, sync, busy, run, setMade };
    let body;
    if (step === "unavailable") body = <FolderStep {...props} preview />;
    else if (step === "folder") body = <FolderStep {...props} />;
    else if (step === "code") body = <CodeStep {...props} inspect={inspect} />;
    else body = <OnStep {...props} />;
    return (
        <>
            {made && <MadeCode made={made} c={c} onDone={() => setMade(null)} />}
            {body}
        </>
    );
}

// The code just made (here, or changed): big, once, with Copiar.
function MadeCode({ made, c, onDone }) {
    const copy = () => navigator.clipboard?.writeText(made.code).then(() => c.say("Código copiado."), () => c.say("Selecione o código e copie com Ctrl+C."));
    return (
        <div className="cfg-sync-made" role="status">
            <span className="kx-meta">{made.changed ? "O código novo da igreja" : "O código da igreja"}</span>
            <span className="cfg-sync-bigcode" aria-label={`Código ${made.code.split("").join(" ")}`}>{made.code}</span>
            <span className="kx-meta">{made.changed
                ? "Digite este código nos computadores que devem continuar sincronizando. Ele fica guardado aqui: Mostrar, em Código da igreja."
                : "Anote ou copie: os outros computadores pedem este código. Ele fica guardado aqui: Mostrar, em Código da igreja."}</span>
            <div className="cfg-sync-acts"><Btn onClick={copy}>Copiar</Btn><Btn kind="outline" onClick={onDone}>Pronto</Btn></div>
        </div>
    );
}

function Travel() {
    return (
        <div className="cfg-sync-travel">
            <div><b>Vai para os outros</b>músicas, setlists, avisos, temas, fundos e suas categorias, mídias, Escola bíblica, anotações da Bíblia, timers e as preferências da igreja</div>
            <div><b>Fica em cada computador</b>as telas e saídas, as Bíblias instaladas, a disposição do console, o que está no ar</div>
        </div>
    );
}

function FolderStep({ busy, run, preview }) {
    return (
        <>
            <p className="cfg-sync-intro">Deixe as músicas, os cultos, os avisos, os temas e as mídias iguais em todos os computadores da igreja, por uma pasta do <b>Google Drive para computador</b>, do OneDrive ou do Dropbox. Sem conta no KERYX e sem internet no culto: cada computador trabalha sozinho e acerta com os outros quando a pasta sincroniza.</p>
            <div className="frm">
                <FormRow k="Pasta">
                    <Btn kind="outline" disabled={preview || Boolean(busy)} onClick={() => run("choose", undefined, "Pasta")}>{busy === "choose" ? "Escolhendo…" : "Escolher a pasta…"}</Btn>
                    <span className="kx-meta">{preview ? "na prévia do navegador não há pasta: a sincronização funciona no KERYX do computador" : "a mesma pasta em todos os computadores, por exemplo G:\\Meu Drive\\KERYX"}</span>
                </FormRow>
            </div>
            <Travel />
        </>
    );
}

// A folder and no code here yet, or a code that no longer opens the folder:
// make the church's code (the folder has none) or type it.
function CodeStep({ c, st, busy, run, setMade, inspect }) {
    const confirm = useConfirm();
    const [typed, setTyped] = useState("");
    const e = st.engine || {};
    const checked = parseCode(typed);
    const hint = typed ? (checked.error ? codeMessage(checked) : "Código completo. Agora Entrar.") : "";
    const pcs = inspect?.computers?.length || 0;
    const removedBy = e.state === "removed" && e.removed ? computerRows(st).find((r) => r.pc === e.removed.by)?.name : null;
    let why = null;
    if (e.state === "removed") why = <span className="kx-warn">Este computador foi tirado da sincronização{removedBy ? ` por ${removedBy}` : ""}{e.removed?.at ? `, ${ago(e.removed.at)}` : ""}. Digite o código da igreja para voltar; as mudanças daqui esperam.</span>;
    else if (e.state === "mismatch") why = <span className="kx-warn">O código da igreja mudou nesta pasta. Digite o código novo; as mudanças daqui esperam.</span>;
    else if (st.keyLost) why = <span className="kx-warn">A chave guardada não abre neste computador (as configurações vieram de outro). Digite o código da igreja de novo.</span>;
    const canType = !(inspect && inspect.code === "missing" && !why);

    const join = async () => {
        if (checked.error) { c.say(codeMessage(checked)); return; }
        const done = await run("join", { code: typed }, "Código");
        if (done) { setTyped(""); c.say("Código certo: este computador está sincronizando."); }
    };
    const create = async () => {
        const done = await run("create", undefined, "Código");
        if (done?.code) setMade({ code: done.code });
    };
    const cancel = async () => {
        if (st.paired && !(await confirm({ title: "Sair da sincronização?", text: "Este computador para de enviar e receber mudanças. Nada é apagado aqui nem na pasta.", ok: "Sair" }))) return;
        run("leave", undefined, "Sincronização");
    };

    return (
        <div className="frm">
            <FormRow k="Pasta">
                <span className="kx-content cfg-path" title={st.folder}>{st.folder}</span>
                <Btn disabled={Boolean(busy)} onClick={() => run("choose", undefined, "Pasta")}>Trocar…</Btn>
                <Btn disabled={Boolean(busy)} onClick={cancel}>Cancelar</Btn>
            </FormRow>
            {why && <FormRow k="">{why}</FormRow>}
            {!why && inspect?.code === "missing" && (
                <FormRow k="Código da igreja">
                    <span className="kx-content">Esta pasta ainda não tem a sincronização.</span>
                    <Btn kind="outline" disabled={Boolean(busy)} onClick={create}>{busy === "create" ? "Criando…" : "Criar o código da igreja"}</Btn>
                    <span className="kx-meta">o primeiro computador cria; os outros digitam</span>
                </FormRow>
            )}
            {!why && inspect?.code === "bad" && (
                <FormRow k="">
                    <span className="kx-warn">O arquivo do código ainda está chegando pela pasta.</span>
                    <Btn disabled={Boolean(busy)} onClick={() => run("choose", undefined, "Pasta")}>Tentar de novo</Btn>
                </FormRow>
            )}
            {canType && (
                <FormRow k="Código da igreja">
                    {!why && inspect?.code === "ok" && <span className="kx-content cfg-sync-full">Esta pasta já é da igreja{pcs ? ` · ${pcs} ${pcs === 1 ? "computador" : "computadores"}` : ""}.</span>}
                    <input className={`cfg-sync-codein ${typed && checked.error ? "is-err" : typed ? "is-ok" : ""}`} value={typed} onChange={(ev) => setTyped(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") join(); }}
                        placeholder="XXXX-XXXX" aria-label="Código da igreja" autoComplete="off" spellCheck={false} maxLength={14} />
                    <Btn kind="outline" disabled={Boolean(busy) || !typed} onClick={join}>{busy === "join" ? "Conferindo…" : "Entrar"}</Btn>
                    <span className={typed && checked.error && checked.error !== "short" ? "kx-warn" : "kx-meta"} aria-live="polite">{hint || "o código tem 8 letras e números; veja em Mostrar num computador que já sincroniza"}</span>
                </FormRow>
            )}
        </div>
    );
}

const TONE = { ok: "is-ok", wait: "is-wait", off: "is-off" };

function OnStep({ c, st, busy, run, setMade }) {
    const confirm = useConfirm();
    const [shown, setShown] = useState(null);
    const state = syncState(st);
    const e = st.engine || {};
    const rows = computerRows(st);
    const any = Boolean(busy);

    const showCode = async () => {
        if (shown) { setShown(null); return; }
        const r = await run("showCode", undefined, "Código");
        if (r?.code) setShown(r.code);
    };
    const copy = (code) => navigator.clipboard?.writeText(code).then(() => c.say("Código copiado."), () => c.say("Selecione o código e copie com Ctrl+C."));
    const rotate = async () => {
        if (!(await confirm({ title: "Trocar o código da igreja?", text: "Os outros computadores param de sincronizar até alguém digitar o código novo neles. Use para cortar de vez um computador que não deve mais sincronizar.", ok: "Trocar o código", danger: true }))) return;
        const r = await run("rotate", undefined, "Código");
        if (r?.code) { setShown(null); setMade({ code: r.code, changed: true }); }
    };
    const changeFolder = async () => {
        if (!(await confirm({ title: "Usar outra pasta?", text: "Este computador deixa a pasta atual e vai pedir o código da igreja na nova. Nada é apagado.", ok: "Escolher a pasta" }))) return;
        run("choose", undefined, "Pasta");
    };
    const leave = async () => {
        if (!(await confirm({ title: "Sair da sincronização?", text: "Este computador para de enviar e receber mudanças. Nada é apagado aqui nem na pasta, e os outros continuam com o que ele já mandou.", ok: "Sair" }))) return;
        const r = await run("leave", undefined, "Sincronização");
        if (r) c.say("Este computador saiu da sincronização.");
    };
    const takeOut = async (row) => {
        if (!(await confirm({ title: `Tirar ${row.name} da sincronização?`, text: "Ele para de enviar e receber mudanças até alguém digitar o código da igreja nele. O que ele já mandou continua. Para cortar de vez, use Trocar o código.", ok: "Tirar" }))) return;
        const r = await run("remove", { pc: row.pc }, "Tirar");
        if (r) c.say(`${row.name} foi tirado da sincronização.`);
    };
    const letBack = async (row) => {
        const r = await run("restore", { pc: row.pc }, "Deixar voltar");
        if (r) c.say(`${row.name} pode sincronizar de novo.`);
    };

    return (
        <div className="frm">
            <FormRow k="Sincronizar">
                <Switch on={!st.paused} disabled={any} label="Sincronizar" onChange={(on) => run("setPaused", { paused: !on }, "Sincronizar")} />
                <span className={st.paused ? "kx-warn" : "kx-meta"}>{st.paused ? "pausada · as mudanças deste computador esperam e vão quando ligar de novo" : "ligado · desligado, as mudanças deste computador esperam e vão depois"}</span>
            </FormRow>
            <FormRow k="Pasta">
                <span className="kx-content cfg-path" title={st.folder}>{st.folder}</span>
                <Btn disabled={any} onClick={() => run("open", undefined, "Abrir pasta")}>Abrir</Btn>
                <Btn disabled={any} onClick={changeFolder}>Trocar…</Btn>
            </FormRow>
            <FormRow k="Estado">
                <i className={`cfg-sync-dot ${TONE[state.tone]}`} aria-hidden="true" />
                <span className={state.tone === "wait" ? "kx-warn" : "kx-content"}>{state.label}</span>
                {state.detail && <span className="kx-meta">· {state.detail}</span>}
                <Btn disabled={any || st.paused} onClick={() => run("now", undefined, "Sincronizar agora")}>{busy === "now" ? "Sincronizando…" : e.state === "offline" ? "Tentar agora" : "Sincronizar agora"}</Btn>
            </FormRow>
            <FormRow k="Desde que abriu">
                <span className="kx-meta">{sinceLine(st)}{e.rejected ? ` · ${e.rejected} ignoradas de computadores sem o código` : ""}</span>
            </FormRow>
            <FormRow k="Mídias">
                <span className="kx-meta">{e.state === "ok" ? (e.missingMedia ? `${e.missingMedia} ainda chegando pela pasta · as outras aqui` : "todas aqui") : "—"}{st.since?.collected ? ` · ${st.since.collected} sem uso há 7 dias ${st.since.collected === 1 ? "saiu" : "saíram"} da pasta (continuam em cada computador)` : ""}</span>
            </FormRow>
            <FormRow k="Computadores">
                <div className="cfg-sync-pcs">
                    {rows.map((row) => (
                        <div key={row.pc} className={`cfg-sync-pc ${row.tone === "wait" ? "is-bad" : ""}`}>
                            <i className={`cfg-sync-dot ${TONE[row.tone]}`} aria-hidden="true" />
                            <span className="cfg-sync-pc-t"><b>{row.name}</b> <span className="kx-meta">{row.detail}</span></span>
                            {row.tag && <span className={`cfg-sync-tag ${row.tag === "verificado" || row.tag === "este" ? "is-ok" : row.tag === "sem o código" ? "is-warn" : ""}`}>{row.tag}</span>}
                            {!row.self && !row.removed && <Btn small disabled={any} onClick={() => takeOut(row)}>Tirar…</Btn>}
                            {row.removed && <Btn small disabled={any} onClick={() => letBack(row)}>Deixar voltar</Btn>}
                        </div>
                    ))}
                    {rows.length === 1 && <span className="kx-meta">nenhum outro computador nesta pasta ainda: escolha a mesma pasta em outro computador e digite o código da igreja</span>}
                </div>
            </FormRow>
            <FormRow k="Código da igreja">
                <span className="kx-content cfg-path cfg-sync-codeshown">{shown || "••••-••••"}</span>
                {st.canShowCode && <Btn disabled={any} onClick={showCode}>{shown ? "Esconder" : "Mostrar"}</Btn>}
                {shown && <Btn disabled={any} onClick={() => copy(shown)}>Copiar</Btn>}
                <Btn kind="outline" disabled={any} onClick={rotate}>{busy === "rotate" ? "Trocando…" : "Trocar o código…"}</Btn>
            </FormRow>
            <Duplicates c={c} confirm={confirm} />
            <FormRow k="Sair">
                <Btn kind="outline" disabled={any} onClick={leave}>Sair da sincronização…</Btn>
                <span className="kx-meta">este computador para; os outros continuam e nada é apagado</span>
            </FormRow>
        </div>
    );
}

// Músicas repetidas (shared/syncDuplicates.mjs): the same title and lyrics in
// different songs, each computer having had its own. Juntar em uma keeps
// the newest and points the setlists at it; Manter as duas keeps them, on
// every computer (User.song_duplicates_kept, a church field).
function Duplicates({ c, confirm }) {
    const { songs } = useLibrary();
    const prefs = usePrefs();
    const groups = useMemo(() => duplicateSongs(songs, prefs.song_duplicates_kept), [songs, prefs.song_duplicates_kept]);
    const [open, setOpen] = useState(false);
    const [uses, setUses] = useState({});
    const [busy, setBusy] = useState("");
    const n = groups.length;

    // How many setlist items use each song, for the list.
    useEffect(() => {
        if (!open || !n) return undefined;
        let live = true;
        keryx.entities.ServiceItem.filter({ type: "SONG" }).then((items) => {
            if (!live) return;
            const count = {};
            for (const it of items || []) if (it.contentId) count[it.contentId] = (count[it.contentId] || 0) + 1;
            setUses(count);
        }).catch(() => {});
        return () => { live = false; };
    }, [open, n]);

    const merge = async (g) => {
        const [keep, ...rest] = g.songs;
        const others = rest.length;
        if (!(await confirm({
            title: `Juntar "${g.title}" em uma?`,
            text: `Fica a editada por último (${formatWhen(keep.updated_date)}). As setlists e os modelos de culto passam a usar ela, e ${others === 1 ? "a outra cópia é excluída" : `as outras ${others} cópias são excluídas`}.`,
            ok: "Juntar",
            danger: true,
        }))) return;
        setBusy(g.key);
        try {
            const [serviceItems, templates, history] = await Promise.all([
                keryx.entities.ServiceItem.filter({ type: "SONG" }),
                keryx.entities.ServiceTemplate.list(),
                keryx.entities.SongHistory.list(),
            ]);
            const plan = mergePlan(g, { serviceItems, templates, history });
            for (const u of plan.items) await keryx.entities.ServiceItem.update(u.id, u.patch);
            for (const u of plan.templates) await keryx.entities.ServiceTemplate.update(u.id, u.patch);
            for (const u of plan.history) await keryx.entities.SongHistory.update(u.id, u.patch);
            for (const id of plan.remove) await keryx.entities.Song.delete(id);
            c.say(`"${g.title}": ficou uma.`);
        } catch (err) {
            c.say(`Juntar: ${err?.message || "não foi possível."}`);
        } finally {
            setBusy("");
        }
    };
    const keepBoth = async (g) => {
        setBusy(g.key);
        try {
            await updateUser({ song_duplicates_kept: [...new Set([...(prefs.song_duplicates_kept || []), ...keepPairs(g.songs)])] });
            c.say(g.songs.length === 2 ? "As duas ficam." : "Todas ficam.");
        } finally {
            setBusy("");
        }
    };

    return (
        <>
            <FormRow k="Músicas repetidas">
                <span className="kx-meta">{n ? `${n} ${n === 1 ? "parece repetida" : "parecem repetidas"} · mesmo título e mesma letra` : "nenhuma"}</span>
                {n > 0 && <Btn on={open} onClick={() => setOpen((o) => !o)}>{open ? "Fechar a lista" : "Ver…"}</Btn>}
            </FormRow>
            {open && n > 0 && (
                <FormRow k="">
                    <div className="cfg-sync-dups">
                        {groups.map((g) => (
                            <div key={g.key} className="cfg-sync-dup">
                                <span className="cfg-sync-dup-t">{g.title}</span>
                                {g.songs.map((s, i) => (
                                    <span key={s.id} className="cfg-sync-dup-v">
                                        <span>{i === 0 ? "a mais recente" : "cópia"}{s.artist ? ` · ${s.artist}` : ""}{uses[s.id] ? ` · em ${uses[s.id]} ${uses[s.id] === 1 ? "item de setlist" : "itens de setlist"}` : ""}</span>
                                        <span className="kx-meta">{s.updated_date ? formatWhen(s.updated_date) : ""}</span>
                                    </span>
                                ))}
                                <div className="cfg-sync-acts">
                                    <Btn kind="outline" small disabled={Boolean(busy)} onClick={() => merge(g)}>{busy === g.key ? "Juntando…" : "Juntar em uma"}</Btn>
                                    <Btn small disabled={Boolean(busy)} onClick={() => keepBoth(g)}>{g.songs.length === 2 ? "Manter as duas" : "Manter todas"}</Btn>
                                </div>
                            </div>
                        ))}
                    </div>
                </FormRow>
            )}
        </>
    );
}
