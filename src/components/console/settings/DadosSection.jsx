import React, { useState } from "react";
import { Btn, Empty } from "../kx";
import { useBridge, usePoll, FormRow, formatBytes, formatWhen, desktopOnly } from "./parts";

// Dados e atualizações: backups, moving everything to another computer, the
// data folder, a diagnostics file for support, and updates
// (electron/system.cjs).
export default function DadosSection({ c }) {
    const system = useBridge("system");
    const [info, refresh, setInfo] = usePoll(() => system?.call("info"), 4000);
    const [busy, setBusy] = useState("");
    if (!system) return <Empty icon="save" title="Dados e atualizações">{desktopOnly}</Empty>;
    if (!info) return <Empty title="Lendo os dados…" />;

    const run = async (op, label, onDone) => {
        setBusy(op);
        try {
            const res = await system.call(op);
            if (res?.error) c.say(`${label}: ${res.error.message}`);
            else {
                if (res?.data?.dataDir) setInfo(res.data);
                const message = onDone ? onDone(res?.data) : "";
                if (message) c.say(message);
            }
        } finally {
            setBusy("");
            refresh();
        }
    };
    const { backup, update } = info;
    const any = Boolean(busy);

    return (
        <>
            <div className="frm">
                <FormRow k="Backup">
                    <Btn kind="outline" disabled={any} onClick={() => run("backupNow", "Backup", (r) => (r?.backup?.media?.enabled ? "Backup feito · copiando as mídias novas." : "Backup feito."))}>{busy === "backupNow" ? "Fazendo…" : "Fazer backup agora"}</Btn>
                    <span className="kx-meta">{backup.last ? `último: ${formatWhen(backup.last.modified)} · ${formatBytes(backup.last.size)} · ${backup.count} ${backup.count === 1 ? "salvo" : "salvos"}` : "ainda não há backups nesta pasta"}</span>
                </FormRow>
                <FormRow k="Backup automático">
                    <span className="kx-meta">ao abrir e ao fechar o KERYX, um por dia · ficam os últimos {backup.keep}{backup.media.enabled ? " · as mídias novas são copiadas ao abrir" : ""}</span>
                </FormRow>
                <FormRow k="Mídias no backup">
                    {backup.media.enabled
                        ? <span className="kx-meta">{backup.media.running ? "copiando as mídias novas…" : `${backup.media.files} ${backup.media.files === 1 ? "arquivo" : "arquivos"} · ${formatBytes(backup.media.bytes)}${backup.media.last ? ` · última cópia ${formatWhen(backup.media.last.at)}${backup.media.last.copied ? ` (${backup.media.last.copied} ${backup.media.last.copied === 1 ? "nova" : "novas"})` : ""}` : ""}`}</span>
                        : <span className="kx-meta">escolha uma pasta de backup fora deste disco (pen drive, outro disco ou uma pasta do Google Drive) para guardar também vídeos, imagens e o logo</span>}
                </FormRow>
                {backup.media.error && <FormRow k=""><span className="kx-warn">Mídias: {backup.media.error} · veja o registro em Salvar diagnóstico</span></FormRow>}
                <FormRow k="Pasta de backup">
                    <span className="kx-content cfg-path" title={backup.dir}>{backup.dir}</span>
                    <Btn disabled={any} onClick={() => run("chooseBackupDir", "Pasta de backup", () => "Pasta alterada e backup feito.")}>Escolher…</Btn>
                    {backup.custom && <Btn disabled={any} onClick={() => run("resetBackupDir", "Pasta de backup")}>Usar a padrão</Btn>}
                    <Btn disabled={any} onClick={() => run("openBackupDir", "Abrir pasta")}>Abrir</Btn>
                </FormRow>
                {backup.fallback && <FormRow k=""><span className="kx-warn">A pasta escolhida não está disponível · usando a pasta padrão</span></FormRow>}
                <FormRow k="Outro computador">
                    <Btn disabled={any} onClick={() => run("exportAll", "Exportar", (r) => (r ? `Exportado: ${r.media} ${r.media === 1 ? "arquivo" : "arquivos"} de mídia, ${formatBytes(r.bytes)}.` : ""))}>{busy === "exportAll" ? "Exportando…" : "Exportar tudo…"}</Btn>
                    <Btn disabled={any} onClick={() => run("importAll", "Importar")}>{busy === "importAll" ? "Importando…" : "Importar…"}</Btn>
                    <span className="kx-meta">um zip com o banco e as mídias · ao importar, os dados atuais ficam guardados à parte</span>
                </FormRow>
                <FormRow k="Pasta de dados">
                    <span className="kx-content cfg-path" title={info.dataDir}>{info.dataDir}</span>
                    <span className="kx-meta">{formatBytes(info.dataBytes)}</span>
                    <Btn disabled={any} onClick={() => run("openDataDir", "Abrir pasta")}>Abrir</Btn>
                </FormRow>
                <FormRow k="Suporte">
                    <Btn disabled={any} onClick={() => run("diagnostics", "Diagnóstico", (r) => (r ? "Diagnóstico salvo." : ""))}>Salvar diagnóstico…</Btn>
                    <span className="kx-meta">registros recentes e dados do sistema, sem músicas, mídias nem senhas</span>
                </FormRow>
                <FormRow k="Versão">
                    <span className="kx-content">KERYX {info.version}</span>
                    {update.status !== "disabled" && <Btn disabled={any || update.status === "checking" || update.status === "downloading"} onClick={() => run("updateCheck", "Atualizações")}>Verificar atualização</Btn>}
                    {update.status === "available" && <Btn kind="outline" disabled={any} onClick={() => run("updateDownload", "Atualizações")}>Baixar a versão {update.version}</Btn>}
                    {update.status === "downloaded" && <Btn kind="outline" disabled={any} onClick={() => run("updateInstall", "Atualizações")}>Reiniciar e instalar</Btn>}
                    <span className="kx-meta">{update.message || "instale fora do horário do culto: o KERYX fecha para atualizar"}</span>
                </FormRow>
            </div>
        </>
    );
}
