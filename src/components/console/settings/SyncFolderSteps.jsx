import React, { useEffect, useState } from "react";
import { Btn } from "../kx";
import { useConfirm } from "../ConfirmDialog";
import { FormRow, CfgGroup, Switch } from "./parts";
import { syncStep, syncState, computerRows, sinceLine, ago, syncSummary, SYNC_GOES, SYNC_STAYS, SYNC_TRAVEL_SUMMARY, SYNC_MIRROR_HINT, SYNC_SHARED_HINT } from "@/lib/console/syncView";
import { parseCode, codeMessage } from "@shared/syncCode.mjs";
import SyncDuplicates from "./SyncDuplicates";

// Sincronização by the shared folder (the owner's picks of 2026-10-16),
// what a computer that synced by it before still shows under the banner
// "A sincronização agora é pela conta Google" (Google Drive direto, PR 3;
// G4 = A) until someone enters with the account there. PR 4 takes it out
// with the church's code. A new computer never gets here: it enters with
// the account (SyncSection.jsx).
export default function SyncFolderSteps({ c, st, sync, busy, run }) {
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

    const runHere = async (op, args, label) => {
        const data = await run(op, args, label);
        if (data?.inspect) setInspect(data.inspect);
        return data;
    };
    const props = { c, st, busy, run: runHere, setMade };
    return (
        <>
            {made && <MadeCode made={made} c={c} onDone={() => setMade(null)} />}
            {step === "code" ? <CodeStep {...props} inspect={inspect} /> : <OnStep {...props} />}
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

// O que vai e o que fica (Rodada G7): the two short lists and the hints
// about the folder, a group, closed (Rodada H1).
function Travel() {
    return (
        <CfgGroup id="sync.travel" k="O que vai e o que fica" defaultOpen={false} summary={SYNC_TRAVEL_SUMMARY}>
          <div className="cfg-sync-travel">
            <div className="kx-row">
                <div className="kx-row-main">
                    <div className="kx-row-title">Vai para o outro computador</div>
                    <div className="kx-row-meta">{SYNC_GOES}</div>
                </div>
            </div>
            <div className="kx-row">
                <div className="kx-row-main">
                    <div className="kx-row-title">Fica em cada computador</div>
                    <div className="kx-row-meta">{SYNC_STAYS}</div>
                </div>
            </div>
            <div className="cfg-note">
                <span><b>Dica:</b> {SYNC_MIRROR_HINT}<br />{SYNC_SHARED_HINT}</span>
            </div>
          </div>
        </CfgGroup>
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
        <>
            <CfgGroup id="sync.andamento" k="Andamento" fold={false}>
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
                <FormRow k="Sair">
                    <Btn kind="outline" disabled={any} onClick={leave}>Sair da sincronização…</Btn>
                    <span className="kx-meta">este computador para; os outros continuam e nada é apagado</span>
                </FormRow>
            </div>
            </CfgGroup>
            <Travel />
            <CfgGroup id="sync.codigo" k="Código da igreja" defaultOpen={false} summary={syncSummary(st)}>
                <div className="frm">
                    <FormRow k="Código">
                        <span className="kx-content cfg-path cfg-sync-codeshown">{shown || "••••-••••"}</span>
                        {st.canShowCode && <Btn disabled={any} onClick={showCode}>{shown ? "Esconder" : "Mostrar"}</Btn>}
                        {shown && <Btn disabled={any} onClick={() => copy(shown)}>Copiar</Btn>}
                        <Btn kind="outline" disabled={any} onClick={rotate}>{busy === "rotate" ? "Trocando…" : "Trocar o código…"}</Btn>
                    </FormRow>
                </div>
            </CfgGroup>
            <SyncDuplicates c={c} confirm={confirm} />
        </>
    );
}
