import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Archive, Download, FolderOpen, HardDriveDownload, LifeBuoy, Loader2, RefreshCw, Save, Upload } from "lucide-react";

const POLL_MS = 4000;

const formatBytes = (n) => {
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
};
const formatWhen = (iso) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function Group({ title, children }) {
    return (
        <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {children}
        </div>
    );
}

// Desktop only: backups, moving data between computers, support and updates.
export default function SystemSection({ isMobile }) {
    // contextBridge hands out a fresh object on every access; read it once.
    const bridgeRef = useRef(null);
    if (!bridgeRef.current) bridgeRef.current = window.keryxDesktop.system;
    const bridge = bridgeRef.current;

    const [info, setInfo] = useState(null);
    const [busy, setBusy] = useState("");
    const [notice, setNotice] = useState("");

    const refresh = useCallback(async () => {
        const res = await bridge.call("info");
        if (!res.error) setInfo(res.data);
    }, [bridge]);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, POLL_MS);
        return () => clearInterval(interval);
    }, [refresh]);

    const run = async (op, label, onDone) => {
        setBusy(op);
        setNotice("");
        try {
            const res = await bridge.call(op);
            if (res.error) setNotice(`${label}: ${res.error.message}`);
            else {
                if (res.data && res.data.dataDir) setInfo(res.data);
                const message = onDone ? onDone(res.data) : "";
                if (message) setNotice(message);
            }
        } finally {
            setBusy("");
            refresh();
        }
    };

    if (!info) return null;
    const { backup, update } = info;
    const working = (op) => busy === op;
    const anyBusy = Boolean(busy);

    return (
        <Card className="bg-card border-border">
            <CardHeader className={isMobile ? "p-4" : ""}>
                <CardTitle className={`text-card-foreground flex items-center gap-2 ${isMobile ? "text-base" : "text-lg"}`}>
                    <HardDriveDownload className="w-5 h-5" />
                    Dados, backup e atualizações
                </CardTitle>
            </CardHeader>
            <CardContent className={`space-y-6 ${isMobile ? "p-4 pt-0" : ""}`}>
                <Group title="Backup automático">
                    <p className="text-sm text-muted-foreground">
                        O KERYX salva uma cópia do banco de dados ao abrir e ao fechar (uma por dia; ficam as últimas {backup.keep}).
                        Para ter uma cópia fora deste computador, escolha uma pasta do OneDrive, do Google Drive ou de um pendrive.
                    </p>
                    <p className="text-sm text-foreground break-all">
                        <span className="text-muted-foreground">Pasta: </span>{backup.dir}
                        {backup.fallback && (
                            <span className="block text-destructive">A pasta escolhida não está disponível; usando a pasta padrão.</span>
                        )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        {backup.last
                            ? `Último backup: ${formatWhen(backup.last.modified)} (${formatBytes(backup.last.size)}) · ${backup.count} salvo(s)`
                            : "Ainda não há backups nesta pasta."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={anyBusy} onClick={() => run("backupNow", "Backup", () => "Backup feito.")}>
                            {working("backupNow") ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            Fazer backup agora
                        </Button>
                        <Button size="sm" variant="outline" disabled={anyBusy} onClick={() => run("chooseBackupDir", "Pasta de backup", () => "Pasta alterada e backup feito.")}>
                            <FolderOpen className="w-4 h-4 mr-2" /> Escolher pasta…
                        </Button>
                        {backup.custom && (
                            <Button size="sm" variant="outline" disabled={anyBusy} onClick={() => run("resetBackupDir", "Pasta de backup")}>
                                Usar a pasta padrão
                            </Button>
                        )}
                        <Button size="sm" variant="outline" disabled={anyBusy} onClick={() => run("openBackupDir", "Abrir pasta")}>
                            Abrir pasta
                        </Button>
                    </div>
                </Group>

                <Group title="Levar tudo para outro computador">
                    <p className="text-sm text-muted-foreground">
                        “Exportar tudo” cria um arquivo zip com o banco de dados e todas as mídias. “Importar” substitui os dados
                        deste computador pelos do arquivo (os dados atuais ficam salvos numa pasta “before-import-…”).
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" disabled={anyBusy} onClick={() => run("exportAll", "Exportar", (r) => (r ? `Exportado: ${r.media} arquivo(s) de mídia, ${formatBytes(r.bytes)}.` : ""))}>
                            {working("exportAll") ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Archive className="w-4 h-4 mr-2" />}
                            Exportar tudo…
                        </Button>
                        <Button size="sm" variant="outline" disabled={anyBusy} onClick={() => run("importAll", "Importar")}>
                            {working("importAll") ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                            Importar…
                        </Button>
                    </div>
                </Group>

                <Group title="Pasta de dados">
                    <p className="text-sm text-foreground break-all">
                        {info.dataDir} <span className="text-muted-foreground">· {formatBytes(info.dataBytes)}</span>
                    </p>
                    <Button size="sm" variant="outline" disabled={anyBusy} onClick={() => run("openDataDir", "Abrir pasta")}>
                        <FolderOpen className="w-4 h-4 mr-2" /> Abrir pasta de dados
                    </Button>
                </Group>

                <Group title="Suporte">
                    <p className="text-sm text-muted-foreground">
                        Salva um arquivo com os registros recentes e informações do sistema (sem músicas, mídias nem senhas)
                        para enviar a quem ajuda com o KERYX.
                    </p>
                    <Button size="sm" variant="outline" disabled={anyBusy} onClick={() => run("diagnostics", "Diagnóstico", (r) => (r ? "Diagnóstico salvo." : ""))}>
                        <LifeBuoy className="w-4 h-4 mr-2" /> Salvar diagnóstico…
                    </Button>
                </Group>

                <Group title={`KERYX ${info.version}`}>
                    <p className="text-sm text-muted-foreground">{update.message}</p>
                    <div className="flex flex-wrap gap-2">
                        {update.status !== "disabled" && (
                            <Button size="sm" variant="outline" disabled={anyBusy || update.status === "checking" || update.status === "downloading"} onClick={() => run("updateCheck", "Atualizações")}>
                                <RefreshCw className="w-4 h-4 mr-2" /> Verificar atualizações
                            </Button>
                        )}
                        {update.status === "available" && (
                            <Button size="sm" disabled={anyBusy} onClick={() => run("updateDownload", "Atualizações")}>
                                <Download className="w-4 h-4 mr-2" /> Baixar a versão {update.version}
                            </Button>
                        )}
                        {update.status === "downloaded" && (
                            <Button size="sm" disabled={anyBusy} onClick={() => run("updateInstall", "Atualizações")}>
                                Reiniciar e instalar
                            </Button>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">Instale atualizações fora do horário do culto: o KERYX fecha para atualizar.</p>
                </Group>

                {notice && <p className="text-sm text-foreground" role="status">{notice}</p>}
            </CardContent>
        </Card>
    );
}
