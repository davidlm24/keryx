import React, { useState } from "react";
import { Btn, Empty, Seg } from "../kx";
import { useBridge, usePoll, FormRow, Switch, formatBytes, formatWhen, desktopOnly, Reading, CfgGroup } from "./parts";
import { onAir } from "@/lib/console/updates";
import { dataSummary, updatesSummary } from "@/lib/console/cfgSummaries";
import { MENU_LABELS } from "@/lib/console/menuLabels";
import { useReport, mailReport, DIAGNOSTIC_SAVED } from "../ReportDialog";
import { queueSummary } from "@shared/support.mjs";

const KEEPS = [["7", "7"], ["14", "14"], ["30", "30"], ["60", "60"]];

// What restarts the KERYX (and so blanks every screen) asks twice while
// something is on air.
const RESTARTS = {
    updateInstall: "Instalar e reiniciar fecha o KERYX e apaga as telas",
    restoreBackup: "Restaurar reinicia o KERYX e apaga as telas",
    importAll: "Importar reinicia o KERYX e apaga as telas",
};

// Backup e atualizações: backups, moving everything to another computer, the
// data folder, a diagnostics file for support, and updates
// (electron/system.cjs).
export default function DadosSection({ c }) {
    const system = useBridge("system");
    const openReport = useReport();
    const [info, refresh, setInfo, readError] = usePoll(() => system?.call("info"), 4000);
    // Relatar um problema's queue (electron/reportQueue.cjs): reports this
    // computer could not send yet, shown only while there are some.
    const [queue, refreshQueue] = usePoll(() => system?.call("reportQueue"), 10000);
    // The e-mail reserve for the oldest; the dialog shows the text when no
    // e-mail program opens.
    const mailOldest = async () => {
        const first = queue?.[0];
        if (!first) return;
        const shown = await mailReport(system, first.id, c.say);
        refreshQueue();
        if (shown) openReport(shown);
    };
    const [busy, setBusy] = useState("");
    const [confirm, setConfirm] = useState(null);
    // The backups to restore from, listed on demand (Restaurar um backup…).
    const [restoreList, setRestoreList] = useState(null);
    const toggleRestore = async () => {
        if (restoreList) { setRestoreList(null); return; }
        const res = await system.call("backupList");
        if (res?.error) c.say(`Restaurar: ${res.error.message}`);
        else setRestoreList(res.data);
    };
    if (!system) return <Empty icon="save" title="Backup e atualizações">{desktopOnly}</Empty>;
    if (!info) return <Reading what="os dados" error={readError} />;

    // busyKey: which button says "…ando" (one restore row, not all of them).
    const run = async (op, label, onDone, args, busyKey = op) => {
        if (RESTARTS[op] && onAir(c.live) && confirm !== busyKey) {
            setConfirm(busyKey);
            c.say(`Há algo no ar: ${RESTARTS[op]}. Clique de novo para continuar.`);
            return;
        }
        setConfirm(null);
        setBusy(busyKey);
        try {
            const res = await system.call(op, args);
            if (res?.error) c.say(`${label}: ${res.error.message}`);
            else if (res?.data?.canceled) { /* the operator closed the folder picker */ }
            else {
                if (res?.data?.dataDir) setInfo(res.data);
                const message = onDone ? onDone(res?.data) : "";
                if (message) c.say(message);
            }
        } catch (err) {
            c.say(`${label}: ${err?.message || "não foi possível."}`);
        } finally {
            setBusy("");
            refresh();
        }
    };
    const { backup, update } = info;
    const any = Boolean(busy);

    return (
        <>
            <CfgGroup id="backup.backup" k="Backup" fold={false}>
            <div className="frm">
                <FormRow k="Fazer backup">
                    <Btn kind="outline" disabled={any} onClick={() => run("backupNow", "Backup", (r) => (r?.backup?.media?.enabled ? "Backup feito · copiando as mídias novas." : "Backup feito."))}>{busy === "backupNow" ? "Fazendo…" : "Fazer backup agora"}</Btn>
                    <span className="kx-meta">{backup.last ? `último: ${formatWhen(backup.last.modified)} · ${formatBytes(backup.last.size)} · ${backup.count} ${backup.count === 1 ? "salvo" : "salvos"}` : "ainda não há backups nesta pasta"}</span>
                </FormRow>
                <FormRow k="Backup automático">
                    <Switch on={backup.enabled !== false} disabled={any} label="Backup automático" onChange={(on) => run("backupSet", "Backup", () => (on ? "Backup automático ligado." : "Backup automático desligado: faça backups à mão."), { enabled: on })} />
                    {backup.enabled !== false
                        ? <span className="kx-meta">ao abrir e ao fechar o KERYX, um por dia{backup.media.enabled ? " · as mídias novas são copiadas ao abrir" : ""}</span>
                        : <span className="kx-warn">desligado · só os backups feitos em Fazer backup agora</span>}
                </FormRow>
                <FormRow k="Manter os últimos">
                    <Seg small label="Quantos backups manter" value={String(backup.keep)} options={KEEPS.some(([v]) => v === String(backup.keep)) ? KEEPS : [...KEEPS, [String(backup.keep), String(backup.keep)]]}
                        onChange={(v) => {
                            const n = Number(v);
                            if (n < backup.keep && backup.count > n && confirm !== `keep:${n}`) { setConfirm(`keep:${n}`); c.say(`Com ${n}, os backups mais antigos que ${n} dias são apagados no próximo backup. Escolha ${n} de novo para confirmar.`); return; }
                            setConfirm(null);
                            run("backupSet", "Backup", () => `Ficam os últimos ${n} dias com backup.`, { keep: n });
                        }} />
                    <span className="kx-meta">dias com backup · o mais antigo sai quando chega um novo</span>
                </FormRow>
                <FormRow k="Mídias no backup">
                    {backup.media.enabled
                        ? <span className="kx-meta">{backup.media.running ? "copiando as mídias novas…" : `${backup.media.files} ${backup.media.files === 1 ? "arquivo" : "arquivos"} · ${formatBytes(backup.media.bytes)}${backup.media.last ? ` · última cópia ${formatWhen(backup.media.last.at)}${backup.media.last.copied ? ` (${backup.media.last.copied} ${backup.media.last.copied === 1 ? "nova" : "novas"})` : ""}` : ""}`}</span>
                        : <span className="kx-meta">escolha uma pasta de backup fora deste disco (pen drive, outro disco ou uma pasta do Google Drive) para salvar também vídeos, imagens e o logo</span>}
                </FormRow>
                {backup.media.error && <FormRow k=""><span className="kx-warn">Mídias: {backup.media.error} · veja o registro em Salvar diagnóstico</span></FormRow>}
                <FormRow k="Pasta de backup">
                    <span className="kx-content cfg-path" title={backup.dir}>{backup.dir}</span>
                    <Btn disabled={any} onClick={() => run("chooseBackupDir", "Pasta de backup", () => "Pasta alterada e backup feito.")}>Escolher…</Btn>
                    {backup.custom && <Btn disabled={any} onClick={() => run("resetBackupDir", "Pasta de backup")}>Usar a padrão</Btn>}
                    <Btn disabled={any} onClick={() => run("openBackupDir", "Abrir pasta")}>Abrir</Btn>
                </FormRow>
                {backup.fallback && <FormRow k=""><span className="kx-warn">A pasta escolhida não está disponível · usando a pasta padrão</span></FormRow>}
                <FormRow k="Restaurar">
                    <Btn disabled={any} on={Boolean(restoreList)} onClick={toggleRestore}>{restoreList ? "Fechar a lista" : "Restaurar um backup…"}</Btn>
                    <span className="kx-meta">volta músicas, setlists, avisos e anotações a como estavam num dia · os dados de hoje ficam salvos à parte</span>
                </FormRow>
                {restoreList && (
                    <FormRow k="">
                        <div className="cfg-restore">
                            {!restoreList.backups.length && <span className="kx-meta">Nenhum backup nesta pasta ainda.</span>}
                            {restoreList.backups.map((b) => (
                                <div key={b.name} className="cfg-restore-row">
                                    <span className="kx-content">{b.day.split("-").reverse().join("/")}</span>
                                    <span className="kx-meta">salvo {formatWhen(b.modified)} · {formatBytes(b.size)}</span>
                                    <Btn small kind={confirm === `restore:${b.name}` ? "air" : "outline"} disabled={any} onClick={() => run("restoreBackup", "Restaurar", () => "", { name: b.name }, `restore:${b.name}`)}>{busy === `restore:${b.name}` ? "Preparando…" : confirm === `restore:${b.name}` ? "Restaurar mesmo" : "Restaurar"}</Btn>
                                </div>
                            ))}
                            {restoreList.backups.length > 0 && (
                                <span className="kx-meta">{restoreList.mirror.files
                                    ? `As mídias vêm de hoje; as apagadas desde então voltam da cópia no backup (${restoreList.mirror.files} ${restoreList.mirror.files === 1 ? "arquivo" : "arquivos"}).`
                                    : "As mídias vêm de hoje: esta pasta não tem cópia das mídias."}</span>
                            )}
                        </div>
                    </FormRow>
                )}
            </div>
            </CfgGroup>
            <CfgGroup id="backup.dados" k="Dados" defaultOpen={false} summary={dataSummary(formatBytes(info.dataBytes))}>
            <div className="frm">
                <FormRow k="Outro computador">
                    <Btn disabled={any} onClick={() => run("exportAll", "Exportar", (r) => (r ? `Exportado: ${r.media} ${r.media === 1 ? "arquivo" : "arquivos"} de mídia, ${formatBytes(r.bytes)}.` : ""))}>{busy === "exportAll" ? "Exportando…" : "Exportar tudo…"}</Btn>
                    <Btn kind={confirm === "importAll" ? "air" : ""} disabled={any} onClick={() => run("importAll", "Importar")}>{busy === "importAll" ? "Importando…" : confirm === "importAll" ? "Importar mesmo" : "Importar…"}</Btn>
                    <span className="kx-meta">um zip com o banco e as mídias · ao importar, os dados atuais ficam salvos à parte</span>
                </FormRow>
                <FormRow k="Pasta de dados">
                    <span className="kx-content cfg-path" title={info.dataDir}>{info.dataDir}</span>
                    <span className="kx-meta">{formatBytes(info.dataBytes)}</span>
                    <Btn disabled={any} onClick={() => run("openDataDir", "Abrir pasta")}>Abrir</Btn>
                </FormRow>
                <FormRow k="Suporte">
                    <Btn disabled={any} onClick={() => run("diagnostics", "Diagnóstico", (r) => (r ? DIAGNOSTIC_SAVED : ""))}>Salvar diagnóstico…</Btn>
                    <Btn disabled={any} onClick={openReport}>{MENU_LABELS.relatar.label}</Btn>
                    <span className="kx-meta">registros recentes e dados do sistema, sem músicas, mídias nem senhas</span>
                </FormRow>
                {queue?.length > 0 && (
                    <FormRow k="Relatos na fila">
                        <span className="cfg-queue">{queueSummary(queue)}</span>
                        {queue.some((r) => !r.refused) && <Btn disabled={any} onClick={() => run("reportRetry", "Relatos", (r) => { refreshQueue(); return r?.some((x) => !x.refused) ? "Ainda sem conexão com o suporte." : "Relatos enviados."; })}>{busy === "reportRetry" ? "Enviando…" : "Tentar agora"}</Btn>}
                        <Btn disabled={any} onClick={mailOldest}>Mandar por e-mail…</Btn>
                    </FormRow>
                )}
            </div>
            </CfgGroup>
            <CfgGroup id="backup.atualizacoes" k="Atualizações" summary={updatesSummary(info)}>
            <div className="frm">
                <FormRow k="Versão">
                    <span className="kx-content">KERYX {info.version}</span>
                    {update.status !== "disabled" && <Btn disabled={any || update.status === "checking" || update.status === "downloading"} onClick={() => run("updateCheck", "Atualizações")}>Verificar atualização</Btn>}
                    {update.status === "available" && <Btn kind="outline" disabled={any} onClick={() => run("updateDownload", "Atualizações")}>Baixar a versão {update.version}</Btn>}
                    {update.status === "downloaded" && <Btn kind={confirm === "updateInstall" ? "air" : "outline"} disabled={any} onClick={() => run("updateInstall", "Atualizações")}>{confirm === "updateInstall" ? "Reiniciar mesmo" : "Instalar e reiniciar"}</Btn>}
                    <span className="kx-meta">{update.message || "instale fora do horário do culto: o KERYX fecha para atualizar"}</span>
                </FormRow>
                <FormRow k="Atualizar automaticamente">
                    <Switch on={Boolean(update.auto)} disabled={any || update.status === "disabled"} label="Atualizar automaticamente"
                        onChange={(on) => run("updateSetAuto", "Atualizações", () => (on ? "Atualização automática ligada." : "Atualização automática desligada."), { on })} />
                    <span className="kx-meta">{update.status === "disabled"
                        ? "indisponível nesta instalação"
                        : update.auto
                            ? "baixa sozinho; ao abrir o KERYX, instala com uma barra de progresso e reinicia (nunca com algo no ar)"
                            : "desligado: o sino avisa e você atualiza pelo menu do KERYX › Atualizar agora"}</span>
                </FormRow>
            </div>
            </CfgGroup>
        </>
    );
}
