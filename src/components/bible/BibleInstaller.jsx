import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Check, Download, FileUp, Loader2, RefreshCw } from "lucide-react";
import { BIBLE_VERSIONS } from "@/lib/bibleBooks";
import { forgetInstalledVersions } from "@/lib/bibleText";

const INSTALLABLE = BIBLE_VERSIONS.filter((v) => v.install);

// Desktop: Bible versions stored on this computer, so verses are looked up and
// projected without internet. The texts are not shipped with KERYX (they are
// copyrighted editions); each one is downloaded once, or installed from a JSON
// file someone downloaded elsewhere.
//
// onlyWhenEmpty: render nothing once any version is installed (used as a
// first-run prompt above the verse search).
export default function BibleInstaller({ onlyWhenEmpty = false }) {
    // contextBridge returns a fresh object per access; read it once or the
    // effect below would re-run on every render.
    const bridgeRef = useRef(null);
    if (!bridgeRef.current) bridgeRef.current = window.keryxDesktop.bible;
    const bridge = bridgeRef.current;
    const [installed, setInstalled] = useState(null);
    const [busy, setBusy] = useState("");
    const [message, setMessage] = useState("");

    const refresh = useCallback(async () => {
        const res = await bridge.status();
        setInstalled(res.error ? {} : res.data);
    }, [bridge]);

    useEffect(() => { refresh(); }, [refresh]);

    const run = async (version, fromFile) => {
        setBusy(version);
        setMessage("");
        try {
            const res = fromFile ? await bridge.installFromFile(version) : await bridge.install(version);
            if (res.error) setMessage(res.error.message);
            else if (res.data) setMessage(`${version} instalada: ${res.data.verses.toLocaleString("pt-BR")} versículos.`);
            forgetInstalledVersions();
            await refresh();
        } finally {
            setBusy("");
        }
    };

    if (!installed) return null;
    const anyInstalled = Object.keys(installed).length > 0;
    if (onlyWhenEmpty && anyInstalled) return null;

    return (
        <Card className="bg-card border-border">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-card-foreground text-lg">
                    <BookOpen className="w-5 h-5" />
                    {onlyWhenEmpty ? "Instale uma Bíblia para usar sem internet" : "Bíblias instaladas"}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                    Cada versão é baixada uma vez (cerca de 4 MB) e fica neste computador: a busca e a projeção de
                    versículos passam a funcionar sem internet. Sem internet aqui, use “Do arquivo” com o JSON da versão
                    baixado em outro computador.
                </p>
                <ul className="divide-y divide-border rounded-lg border border-border">
                    {INSTALLABLE.map((v) => {
                        const count = installed[v.id];
                        const working = busy === v.id;
                        return (
                            <li key={v.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground">{v.id} — {v.name}</p>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        {count
                                            ? <><Check className="w-3 h-3" /> Instalada · {count.toLocaleString("pt-BR")} versículos</>
                                            : "Não instalada"}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" variant={count ? "outline" : "default"} disabled={Boolean(busy)} onClick={() => run(v.id, false)}>
                                        {working ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : count ? <RefreshCw className="w-4 h-4 mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                                        {count ? "Reinstalar" : "Baixar"}
                                    </Button>
                                    <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => run(v.id, true)}>
                                        <FileUp className="w-4 h-4 mr-2" /> Do arquivo
                                    </Button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
                {message && <p className="text-sm text-foreground">{message}</p>}
                <p className="text-xs text-muted-foreground">
                    Outras versões (ARA, ARC, NAA, NTLH, BKJ 1611) continuam disponíveis só com internet.
                </p>
            </CardContent>
        </Card>
    );
}
