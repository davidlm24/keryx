import React from "react";
import Icon from "./Icon";
import { Seg, IconBtn } from "./kx";

const two = (n) => String(n).padStart(2, "0");
const elapsed = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
};

// The top bar, a menu bar: the KERYX menu (the mark), the environments
// KERYX | Bíblia as tabs, the search, Ensaio | Ao vivo, a compact clock, the
// outputs status and the screen controls as bare glyphs. Nothing wraps: as
// the window narrows the bar drops the clock, then shortens the outputs
// label and the search (container queries in console.css). Tela preta and
// Mostrar logo act on the real screens in every mode.
export default function TopBar({ c, env, setEnv, open, setOpen, outsLabel, outsCount, outsState, logoUrl }) {
    const { live, now, mode } = c;
    const since = live?.session?.startedAt;
    const clock = new Date(now).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const toggle = (name) => setOpen(open === name ? null : name);
    const envTab = (value, label, title) => (
        <button type="button" role="tab" aria-selected={env === value} className={`kx-t ${env === value ? "is-on" : ""}`} title={title} onClick={() => setEnv(value)}>{label}</button>
    );
    return (
        <div className="topbar">
            <div className="tb-l">
                <button type="button" className={`markbtn kx-t ${open === "menu" ? "is-on" : ""}`} onClick={() => toggle("menu")} aria-haspopup="menu" aria-expanded={open === "menu"} title="Menu" aria-label="Menu">
                    {logoUrl ? <img src={logoUrl} alt="" /> : <span className="kx-mark" />}
                </button>
                <div className="kx-tabs envtabs" role="tablist" aria-label="Ambiente">
                    {envTab("culto", "KERYX", "Projeção: músicas, mídia, setlist")}
                    {envTab("biblia", "Bíblia", "Bíblia · digite a referência")}
                </div>
            </div>
            <div className="tb-c">
                <div className="kx-field kx-t tb-search" onClick={() => setOpen("palette")} title="Buscar ou comandar · /" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setOpen("palette"); }}>
                    <Icon name="search" /><input placeholder="Buscar em tudo" aria-label="Buscar em tudo" readOnly tabIndex={-1} /><kbd>/</kbd>
                </div>
            </div>
            <div className="tb-r">
                {(
                    <Seg
                        mode
                        value={mode === "live" ? "live" : "ensaio"}
                        onChange={(v) => (v === "ensaio" ? c.goEnsaio() : setOpen("arm"))}
                        options={[
                            ["ensaio", <>{mode === "ensaio" && <i className="kx-dot" />}Ensaio</>, { title: "Ensaiar sem mudar as telas" }],
                            ["live", <>{mode === "live" && <i className="kx-dot" />}Ao vivo{since && mode === "live" ? <span className="tb-el"> · {elapsed(now - since)}</span> : ""}</>, { title: "Saídas armadas" }],
                        ]}
                    />
                )}
                <span className="tb-clock" title="Hora">{clock}</span>
                <button type="button" className={`kx-status kx-t ${outsState ? `is-${outsState}` : ""}`} onClick={() => toggle("outs")} title={`Telas e saídas · ${outsLabel}`} aria-expanded={open === "outs"}>
                    <i className="kx-dot" /><span className="tb-outs-l">{outsLabel}</span><span className="tb-outs-s">{outsCount}</span>
                </button>
                <span className="tb-sep" />
                <IconBtn name="black" title="Tela preta · B · nas telas, na hora" on={live?.screen === "black"} onClick={() => c.toggleScreen("black")} />
                <IconBtn name="logo" title="Mostrar logo · L · nas telas" on={live?.screen === "logo"} onClick={() => c.toggleScreen("logo")} />
                <IconBtn name="eraser" title="Limpar texto · C" onClick={c.clearText} />
                <IconBtn name="stop" title="Encerrar a projeção (pergunta antes) · Esc encerra na hora" onClick={() => setOpen("encerrar")} />
            </div>
        </div>
    );
}
