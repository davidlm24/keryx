import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MonitorSmartphone } from "lucide-react";
import { defaultLogoUrl } from "@/lib/backgrounds";
import { byGroup } from "@/lib/console/outputs";

// The start page for a tablet, TV or stage monitor on the church network:
// pick what this screen shows, grouped by what it is for (Público, Palco,
// Transmissão). The list comes from the KERYX computer (electron/lan.cjs),
// which only serves these pages.
export default function NetworkHome() {
    const [screens, setScreens] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch("/api/screens")
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then(setScreens)
            .catch(() => setError("Não foi possível falar com o computador do KERYX. Confira se está ligado na mesma rede."));
    }, []);

    return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
            <div className="w-full max-w-2xl">
                <div className="text-center mb-8 space-y-3">
                    <img src={defaultLogoUrl()} alt="" className="w-16 h-16 mx-auto rounded-full object-cover" />
                    <h1 className="text-2xl font-heading font-semibold flex items-center justify-center gap-2">
                        <MonitorSmartphone className="w-6 h-6 text-accent" /> KERYX
                    </h1>
                    <p className="text-muted-foreground">Escolha o que esta tela vai mostrar.</p>
                </div>
                {error && <p className="text-center text-destructive">{error}</p>}
                {screens && byGroup(screens, (s) => s.path).map((g) => (
                    <section key={g.key} className="mb-6">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{g.label}</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {g.items.map((s) => (
                            <Link
                                key={s.path}
                                to={s.path}
                                className="rounded-lg border border-border bg-card px-4 py-4 text-card-foreground hover:border-accent transition-colors"
                            >
                                <span className="block font-medium">{s.label}</span>
                                <span className="block text-sm text-muted-foreground">{s.hint}</span>
                            </Link>
                        ))}
                    </div>
                    </section>
                ))}
                <p className="text-center text-xs text-muted-foreground mt-8">
                    Dica: toque na tela para usar a tela cheia. Salve esta página nos favoritos para abrir direto.
                </p>
            </div>
        </div>
    );
}
