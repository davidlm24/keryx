import React, { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Copy, KeyRound, Loader2, Power, Wifi } from "lucide-react";

const POLL_MS = 3000;

// Desktop only: let tablets, smart TVs and stage monitors on the church Wi-Fi
// open the screen pages (electron/lan.cjs). Off until turned on here.
export default function NetworkSection({ isMobile }) {
    // contextBridge hands out a fresh object on every access; read it once.
    const bridgeRef = useRef(null);
    if (!bridgeRef.current) bridgeRef.current = window.keryxDesktop.network;
    const bridge = bridgeRef.current;

    const [info, setInfo] = useState(null);
    const [pin, setPin] = useState("");
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const [copied, setCopied] = useState("");

    const refresh = useCallback(async () => {
        const res = await bridge.call("info");
        if (!res.error) setInfo(res.data);
    }, [bridge]);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, POLL_MS);
        return () => clearInterval(interval);
    }, [refresh]);

    const run = async (op, args, done) => {
        setBusy(true);
        setNotice("");
        try {
            const res = await bridge.call(op, args);
            if (res.error) setNotice(res.error.message);
            else {
                setInfo(res.data);
                if (done) setNotice(done);
            }
        } finally {
            setBusy(false);
        }
    };

    const copy = (url) => {
        navigator.clipboard.writeText(url);
        setCopied(url);
        setTimeout(() => setCopied(""), 2000);
    };

    if (!info) return null;
    const main = info.urls[0];

    return (
        <Card className="bg-card border-border">
            <CardHeader className={isMobile ? "p-4" : ""}>
                <CardTitle className={`text-card-foreground flex items-center gap-2 ${isMobile ? "text-base" : "text-lg"}`}>
                    <Wifi className="w-5 h-5" />
                    Telas na rede (tablets, TVs e palco)
                </CardTitle>
            </CardHeader>
            <CardContent className={`space-y-5 ${isMobile ? "p-4 pt-0" : ""}`}>
                <p className="text-sm text-muted-foreground">
                    Tablets, smart TVs e o monitor do palco ligados à mesma rede Wi-Fi abrem as telas do KERYX no navegador,
                    sem instalar nada. Só as telas de projeção ficam acessíveis; os painéis de controle continuam apenas neste computador.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                    <Button
                        size="sm"
                        variant={info.enabled ? "outline" : "default"}
                        disabled={busy}
                        onClick={() => run("setEnabled", !info.enabled)}
                    >
                        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Power className="w-4 h-4 mr-2" />}
                        {info.enabled ? "Desligar" : "Ligar telas na rede"}
                    </Button>
                    <span className="text-sm text-foreground">
                        {info.running
                            ? `Ligado · ${info.clients.length} tela(s) conectada(s)`
                            : info.enabled ? "Ligado, mas não está funcionando" : "Desligado"}
                    </span>
                </div>
                {info.error && <p className="text-sm text-destructive">{info.error}</p>}

                {info.running && (
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                        {main && (
                            <div className="bg-white p-3 rounded-lg self-center sm:self-start">
                                <QRCode value={main.url} size={148} />
                            </div>
                        )}
                        <div className="space-y-2 min-w-0">
                            <p className="text-sm text-muted-foreground">No navegador do tablet ou da TV, abra:</p>
                            {info.urls.length === 0 && (
                                <p className="text-sm text-destructive">Este computador não está ligado a nenhuma rede local.</p>
                            )}
                            {info.urls.map((u, i) => (
                                <div key={u.url} className="flex items-center gap-2">
                                    <code className={`text-foreground ${i === 0 ? "text-lg" : "text-sm text-muted-foreground"}`}>{u.url}</code>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(u.url)} aria-label={`Copiar ${u.url}`}>
                                        <Copy className="w-3.5 h-3.5" />
                                    </Button>
                                    {copied === u.url && <span className="text-xs text-muted-foreground">Copiado</span>}
                                    {i > 0 && <span className="text-xs text-muted-foreground">({u.name})</span>}
                                </div>
                            ))}
                            <p className="text-xs text-muted-foreground">
                                Telas disponíveis: {info.screens.map((s) => s.label).join(", ")}.
                            </p>
                        </div>
                    </div>
                )}

                <div className="space-y-2">
                    <p className="text-sm text-foreground flex items-center gap-2">
                        <KeyRound className="w-4 h-4" />
                        {info.hasPin
                            ? "PIN ativo: cada aparelho pede o PIN uma vez."
                            : "Sem PIN: qualquer aparelho na rede pode abrir as telas (só para ver, nunca para editar)."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Input
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                            inputMode="numeric"
                            placeholder="Novo PIN (4 a 8 números)"
                            className="w-56"
                        />
                        <Button size="sm" variant="outline" disabled={busy || pin.length < 4} onClick={() => run("setPin", pin, "PIN salvo. Os aparelhos já conectados vão pedir o PIN novo.").then(() => setPin(""))}>
                            Salvar PIN
                        </Button>
                        {info.hasPin && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => run("setPin", "", "PIN removido.")}>
                                Remover PIN
                            </Button>
                        )}
                    </div>
                </div>

                {info.running && info.clients.length > 0 && (
                    <div className="space-y-1">
                        <p className="text-sm text-foreground">Conectadas agora:</p>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                            {info.clients.map((c) => (
                                <li key={`${c.ip}-${c.since}`}>
                                    {c.ip} · desde {new Date(c.since).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <p className="text-xs text-muted-foreground">
                    Na primeira vez, o Windows pergunta se o KERYX pode usar a rede: escolha permitir em redes privadas.
                    Se os aparelhos não abrirem o endereço, confira se estão na mesma rede Wi-Fi que este computador.
                </p>
                {notice && <p className="text-sm text-foreground" role="status">{notice}</p>}
            </CardContent>
        </Card>
    );
}
