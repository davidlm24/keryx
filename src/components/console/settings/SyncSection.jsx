import React, { useState } from "react";
import Icon from "../Icon";
import { Btn, Empty } from "../kx";
import { useConfirm } from "../ConfirmDialog";
import { useLibrary } from "../useConsoleData";
import { FormRow, CfgKey, CfgGroup, useBridge, desktopOnly } from "./parts";
import { useSyncStatus, setSyncStatus } from "@/hooks/useSyncStatus";
import { useLiveNow } from "@/hooks/useLiveState";
import { signInWithGoogle, cancelGoogleSignIn, reopenGoogleSignIn, useGoogleQuota } from "@/hooks/useGoogleSync";
import { googlePage, driveProgress, quotaView, deviceRows, pageProblems, OFFLINE_TEXT, QUOTA_WARN_TEXT, GOOGLE_GOES, GOOGLE_STAYS, GOOGLE_TRAVEL_SUMMARY } from "@/lib/console/syncView";
import SyncFolderSteps from "./SyncFolderSteps";
import SyncDuplicates from "./SyncDuplicates";

// Configurações › Sincronização (Google Drive direto, PR 3; the owner's
// mockup "Sincronização · conta Google", 2026-10-26, marks G1–G5 = A): the
// computers of the church stay the same through the church's Google
// account, in a hidden folder only KERYX reads (electron/googleAuth.cjs,
// syncStore/drive.cjs; the main side is electron/syncControl.cjs over
// keryx:sync). Five pages, by googlePage (syncView.js): Entrar com Google,
// Termine a entrada no navegador, the account (with its problems on top),
// the folder of before under its banner (G4), and the browser preview's
// "only on the computer".
export default function SyncSection({ c }) {
    const sync = useBridge("sync");
    const st = useSyncStatus();
    // "há 40 s" counts by the second on the section's own clock.
    useLiveNow(1000, Boolean(st));
    const { songs } = useLibrary();
    const [busy, setBusy] = useState("");
    const page = googlePage(st);
    const quota = useGoogleQuota(page === "on" && Boolean(st?.google?.signedIn));

    if (!sync || page === "unavailable") return <Empty icon="cloud" title="Sincronização">{desktopOnly}</Empty>;

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
            return data;
        } catch (err) {
            c.say(`${label || "Sincronização"}: ${err?.message || "não foi possível."}`);
            return null;
        } finally {
            setBusy("");
        }
    };
    const enter = () => signInWithGoogle({ say: c.say, songsHere: songs.length, status: st });

    if (page === "signing") return <Signing c={c} />;
    if (page === "none") return <NoAccount onEnter={enter} />;
    if (page === "folder") {
        return (
            <>
                <Migration st={st} onEnter={enter} />
                <SyncFolderSteps c={c} st={st} sync={sync} busy={busy} run={run} />
            </>
        );
    }
    return <Account c={c} st={st} quota={quota} busy={busy} run={run} onEnter={enter} />;
}

const GoogleBtn = ({ onEnter, small }) => (
    <Btn kind="brand" small={small} onClick={onEnter}>Entrar com Google</Btn>
);

// O que vai e o que fica, the Google page's two lines (board 1).
function TravelLines() {
    return (
        <div className="cfg-sync-lines">
            <span>{GOOGLE_GOES}</span>
            <span>{GOOGLE_STAYS}</span>
        </div>
    );
}

// Board 1 · Sem conta.
function NoAccount({ onEnter }) {
    return (
        <>
            <p className="cfg-sync-intro">Os computadores da igreja ficam iguais pela conta Google da igreja: músicas, cultos, temas e mídia vão e vêm sozinhos.</p>
            <CfgKey k="Entrar com Google" className="cfg-sync-hero">
                <span className="cfg-sync-hero-i" aria-hidden="true"><Icon name="cloud" size={28} /></span>
                <div className="cfg-sync-hero-b">
                    <span className="cfg-sync-hero-t">Entre com a conta Google da igreja</span>
                    <span className="cfg-sync-hero-d">O navegador abre para você entrar. O KERYX guarda tudo numa pasta oculta só dele no Drive dessa conta e não vê os outros arquivos.</span>
                    <span className="kx-meta">Use a mesma conta em todos os computadores da igreja. Se este computador já tem músicas, elas se juntam às da conta: nada é apagado.</span>
                </div>
                <GoogleBtn onEnter={onEnter} />
            </CfgKey>
            <div className="cfg-sync-travel">
                <CfgKey k="O que vai e o que fica" className="listhead"><span className="kx-section">O que vai e o que fica</span></CfgKey>
                <TravelLines />
            </div>
        </>
    );
}

// Board 2 · the browser is open on Google's page. googleAuth gives up by
// itself after 5 minutes; the page then goes back to board 1.
function Signing({ c }) {
    return (
        <>
            <div className="cfg-sync-hero is-col" role="status">
                <span className="cfg-sync-hero-t"><i className="cfg-sync-spin" aria-hidden="true" />Termine a entrada no navegador</span>
                <span className="cfg-sync-hero-d">O navegador abriu a página do Google. Escolha a conta da igreja e permita o acesso à pasta do KERYX. Depois, volte aqui.</span>
                <span className="kx-meta">O navegador não abriu? <button type="button" className="cfg-sync-link kx-t" onClick={() => reopenGoogleSignIn(c.say)}>Abrir de novo</button></span>
                <div><Btn kind="outline" onClick={cancelGoogleSignIn}>Cancelar</Btn></div>
            </div>
            <p className="kx-meta cfg-sync-foot">Se ninguém terminar em 5 minutos, o KERYX desiste sozinho e volta para &ldquo;Entrar com Google&rdquo;.</p>
        </>
    );
}

// Board 5 · a computer that synced by the folder (G4 = A): the banner on top,
// the folder's rows under it until someone enters here.
function Migration({ st, onEnter }) {
    return (
        <CfgKey k="Conta Google" className="cfg-sync-banner">
            <span className="cfg-sync-banner-t">A sincronização agora é pela conta Google</span>
            <span>Este computador sincronizava pela pasta <b>{st.folder}</b> (Google Drive para computador). O KERYX agora entra direto na conta Google da igreja e não precisa mais desse programa nem da pasta.</span>
            <ol className="cfg-sync-steps">
                <li>Entre com a <b>mesma conta</b> que tem a pasta, em cada computador da igreja.</li>
                <li>Cada um junta o que tem: <b>nada é apagado</b>, e as músicas que existem nos dois lados viram uma só.</li>
                <li>Depois que todos tiverem entrado, a pasta antiga pode ser apagada (o KERYX não lê mais).</li>
            </ol>
            <div className="cfg-sync-acts is-center">
                <GoogleBtn onEnter={onEnter} />
                <span className="kx-meta">Até entrar, este computador continua sincronizando pela pasta.</span>
            </div>
        </CfgKey>
    );
}

const DOT = { ok: "is-ok", wait: "is-wait", need: "is-need", off: "is-off" };
const KEPT = "keryx.sync.accountOk";
const keptEmail = () => { try { return localStorage.getItem(KEPT) || ""; } catch { return ""; } };

// Board 3 · Conectado, with board 4's problems at the top of its first group.
function Account({ c, st, quota, busy, run, onEnter }) {
    const confirm = useConfirm();
    const [kept, setKept] = useState(keptEmail);
    const prog = driveProgress(st);
    const space = quotaView(quota);
    const problems = pageProblems(st, quota, kept);
    const email = st.google?.email || "";
    const any = Boolean(busy);
    const offline = st.engine?.state === "offline";

    const keepAccount = () => {
        try { localStorage.setItem(KEPT, email); } catch { /* private window */ }
        setKept(email);
    };
    const switchAccount = async () => {
        const out = await run("googleSignOut", undefined, "Trocar de conta");
        if (out) onEnter();
    };
    const signOut = async () => {
        if (!(await confirm({ title: "Sair da conta?", text: "Este computador para de sincronizar até alguém entrar de novo com a conta da igreja. Nada é apagado aqui nem na conta.", ok: "Sair da conta" }))) return;
        const r = await run("googleSignOut", undefined, "Sair da conta");
        if (r) c.say("Este computador saiu da conta da igreja.");
    };
    const disconnect = async (row) => {
        if (!(await confirm({ title: `Desconectar ${row.name}?`, text: "Ele para de sincronizar até alguém entrar de novo nele com a conta da igreja. O que ele já mandou continua, e nada é apagado nele.", ok: "Desconectar" }))) return;
        const r = await run("remove", { pc: row.pc }, "Desconectar");
        if (r) c.say(`${row.name} foi desconectado.`);
    };
    const letBack = async (row) => {
        const r = await run("restore", { pc: row.pc }, "Deixar voltar");
        if (r) c.say(`${row.name} pode sincronizar de novo.`);
    };

    return (
        <>
            <CfgGroup id="sync.conta" k="Conta Google" fold={false}>
                {problems.includes("auth") && (
                    <div className="cfg-sync-box is-warn" role="alert">
                        <span className="cfg-sync-box-t">Entre de novo com a conta da igreja</span>
                        <span>O Google não aceita mais a entrada deste computador (a senha mudou ou o acesso foi tirado em myaccount.google.com). As mudanças daqui esperam e vão quando entrar.</span>
                        <div><GoogleBtn onEnter={onEnter} /></div>
                    </div>
                )}
                {problems.includes("removed") && (
                    <div className="cfg-sync-box" role="alert">
                        <span className="cfg-sync-box-t">Este computador foi desconectado da sincronização</span>
                        <span>Alguém o desconectou em outro computador. Nada foi apagado aqui. Para voltar a sincronizar, entre de novo com a conta da igreja.</span>
                        <div><GoogleBtn onEnter={onEnter} /></div>
                    </div>
                )}
                {problems.includes("account") && (
                    <div className="cfg-sync-box is-row" role="status">
                        <span className="cfg-sync-box-s"><b>{email} ainda não tem nada do KERYX.</b> <span className="kx-meta">Se os outros computadores usam outra conta, saia e entre com ela.</span></span>
                        <Btn kind="outline" disabled={any} onClick={switchAccount}>Trocar de conta</Btn>
                        <Btn kind="brand" disabled={any} onClick={keepAccount}>É esta mesmo</Btn>
                    </div>
                )}
                <div className="frm">
                    <FormRow k="Conta">
                        <span className="cfg-sync-avatar" aria-hidden="true">{(email[0] || "?").toUpperCase()}</span>
                        <span className="kx-content">{email || "—"}</span>
                        <span className="kx-meta">· conta Google da igreja</span>
                    </FormRow>
                    <FormRow k="Andamento">
                        <i className={`cfg-sync-dot ${DOT[prog.tone]}`} aria-hidden="true" />
                        <span className={prog.tone === "ok" ? "kx-content" : "kx-warn"}>{prog.label}</span>
                        {prog.detail && <span className="kx-meta">· {prog.detail}</span>}
                        <Btn kind="outline" className="cfg-sync-end" disabled={any || prog.tone === "need"} onClick={() => run("now", undefined, offline ? "Tentar agora" : "Sincronizar agora")}>
                            {busy === "now" ? "Sincronizando…" : offline ? "Tentar agora" : "Sincronizar agora"}
                        </Btn>
                        {offline && <span className="kx-meta cfg-sync-full">{OFFLINE_TEXT}</span>}
                    </FormRow>
                    <FormRow k="Espaço da conta">
                        <div className="cfg-sync-space">
                            <span className={`cfg-sync-bar ${space?.warn ? "is-warn" : ""}`} role="img" aria-label={space ? space.line : "O espaço aparece quando o Google responder"}>
                                <i className="is-mine" style={{ width: `${space?.minePct || 0}%` }} />
                                <i className="is-other" style={{ width: `${space?.otherPct || 0}%` }} />
                            </span>
                            {space?.warn && <span className="cfg-sync-space-warn">{space.warnLine}</span>}
                            <span className="kx-meta">{space ? space.line : "o espaço aparece quando o Google responder"}</span>
                            {space?.warn && <span className="kx-meta">{QUOTA_WARN_TEXT}</span>}
                        </div>
                    </FormRow>
                </div>
            </CfgGroup>
            <CfgGroup id="sync.dispositivos" k="Dispositivos conectados" fold={false}>
                <div className="cfg-sync-devs">
                    {deviceRows(st).map((row) => (
                        <div key={row.pc} className={`cfg-sync-dev ${row.stale || row.removed ? "is-dim" : ""}`}>
                            <Icon name="monitor" className="cfg-sync-dev-i" />
                            <span className="cfg-sync-dev-t">
                                <b>{row.name}</b>
                                <span className={row.stale ? "kx-warn" : "kx-meta"}>{row.meta}</span>
                            </span>
                            {!row.self && !row.removed && <Btn kind="outline" small disabled={any} onClick={() => disconnect(row)}>Desconectar…</Btn>}
                            {row.removed && <Btn small disabled={any} onClick={() => letBack(row)}>Deixar voltar</Btn>}
                        </div>
                    ))}
                </div>
            </CfgGroup>
            <CfgGroup id="sync.travel" k="O que vai e o que fica" defaultOpen={false} summary={GOOGLE_TRAVEL_SUMMARY}>
                <TravelLines />
            </CfgGroup>
            <SyncDuplicates c={c} confirm={confirm} />
            <CfgKey k="Sair da conta" className="cfg-sync-out">
                <span className="kx-meta">Sair tira a conta deste computador: ele para de sincronizar. Nada é apagado aqui nem na conta.</span>
                <Btn kind="outline" disabled={any} onClick={signOut}>Sair da conta…</Btn>
            </CfgKey>
        </>
    );
}
