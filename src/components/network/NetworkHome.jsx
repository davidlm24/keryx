import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { byGroup } from "@/lib/console/outputs";
import "./net.css";

const LAST = "keryx.netScreen";

// Remembers what this device showed last, so the next time it is one tap.
export const rememberScreen = (path) => {
    try { localStorage.setItem(LAST, path); } catch { /* private mode */ }
};

// The start page for a tablet, TV or stage monitor on the church network:
// pick what this screen shows, grouped by what it is for (Público, Palco,
// Transmissão). The list comes from the KERYX computer (electron/lan.cjs),
// which only serves these pages. `screens` is only for the dev preview.
export default function NetworkHome({ screens: given = null }) {
    const [screens, setScreens] = useState(given);
    const [error, setError] = useState("");
    const logo = useChurchLogo();
    const last = (() => { try { return localStorage.getItem(LAST); } catch { return null; } })();
    const lastScreen = screens?.find((s) => s.path === last) || null;

    useEffect(() => {
        if (given) return;
        fetch("/api/screens")
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then(setScreens)
            .catch(() => setError("Não foi possível falar com o computador do KERYX. Confira se ele está ligado e na mesma rede que esta tela."));
    }, [given]);

    return (
        <div className="net net-home">
            <div className="net-home-in">
                <header className="net-home-h">
                    {logo && <img src={logo} alt="" />}
                    <h1>KERYX</h1>
                    <p>Escolha o que esta tela vai mostrar.</p>
                </header>
                {error && <p className="net-home-err" role="alert">{error}</p>}
                {!error && !screens && <p className="net-home-f" role="status">Procurando as telas…</p>}
                {lastScreen && (
                    <Link className="net-again" to={lastScreen.path} onClick={() => rememberScreen(lastScreen.path)}>
                        <span>Da última vez: <b>{lastScreen.label}</b></span><em>Abrir de novo</em>
                    </Link>
                )}
                {screens && byGroup(screens, (s) => s.path).map((g) => (
                    <section key={g.key} className="net-group" aria-label={g.label}>
                        <h2 className="net-section">{g.label}</h2>
                        <div className="net-cards">
                            {g.items.map((s) => (
                                <Link key={s.path} className="net-card" to={s.path} onClick={() => rememberScreen(s.path)}>
                                    <b>{s.label}</b>
                                    <span>{s.hint}</span>
                                </Link>
                            ))}
                        </div>
                    </section>
                ))}
                <p className="net-home-f">Toque na tela para usar a tela cheia. Salve esta página nos favoritos para abrir direto.</p>
            </div>
        </div>
    );
}
