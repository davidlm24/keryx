import React from "react";
import Icon from "./Icon";
import { Seg, IconBtn, Btn } from "./kx";

const two = (n) => String(n).padStart(2, "0");
const elapsed = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
};

// The top bar: the KERYX menu, the service and its clock, the three views
// (Preparar · Verificar · Apresentar), Bíblia, Ensaio | Ao vivo (Apresentar
// only), the search field, Mais (Apresentar), the outputs status and the
// screen controls as bare glyphs. Tela preta and Mostrar logo act on the
// real screens in every view.
export default function TopBar({ c, service, view, setView, env, setEnv, open, setOpen, outsLabel, outsState, compact, drawerOpen, toggleDrawer, mais, toggleMais, logoUrl }) {
    const { live, now, mode } = c;
    const since = live?.session?.startedAt;
    const clock = new Date(now).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const toggle = (name) => setOpen(open === name ? null : name);
    const present = view === "apresentar";
    return (
        <div className="topbar">
            <button type="button" className={`markbtn kx-t ${open === "menu" ? "is-on" : ""}`} onClick={() => toggle("menu")} aria-haspopup="menu" aria-expanded={open === "menu"} title="Menu">
                {logoUrl ? <img src={logoUrl} alt="" style={{ width: 16, height: 16, borderRadius: 999, objectFit: "cover" }} /> : <span className="kx-mark" />}KERYX
            </button>
            <div className="svc">
                <b>{service?.title || "Sem culto escolhido"}</b>
                {service?.date && !compact && <span className="kx-meta">{service.date.split("-").reverse().join("/")}{service.startTime ? ` · ${service.startTime}` : ""}</span>}
                <span className="kx-clock">{clock}</span>
            </div>
            <Seg value={view} onChange={setView} options={[["preparar", "Preparar"], ["verificar", "Verificar"], ["apresentar", "Apresentar"]]} />
            {view !== "verificar" && <Btn on={env === "biblia"} onClick={() => setEnv(env === "biblia" ? "culto" : "biblia")} title="Ambiente Bíblia"><Icon name="book" />Bíblia</Btn>}
            {view === "preparar" && <span className="quiet">As telas não mudam enquanto você prepara</span>}
            {present && (
                <Seg
                    mode
                    value={mode === "live" ? "live" : "ensaio"}
                    onChange={(v) => (v === "ensaio" ? c.goEnsaio() : setOpen("arm"))}
                    options={[
                        ["ensaio", <>{mode === "ensaio" && <i className="kx-dot" />}Ensaio</>, { title: "Ensaiar sem mudar as telas" }],
                        ["live", <>{mode === "live" && <i className="kx-dot" />}Ao vivo{since ? ` · ${elapsed(now - since)}` : ""}</>, { title: "Saídas armadas" }],
                    ]}
                />
            )}
            <div className="grow" />
            <div className="kx-field kx-t" onClick={() => setOpen("palette")} title="Buscar ou comandar · /" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setOpen("palette"); }}>
                <Icon name="search" /><input placeholder="Buscar em tudo" aria-label="Buscar em tudo" readOnly tabIndex={-1} /><kbd>/</kbd>
            </div>
            <div className="grow" />
            {present && env === "culto" && <Btn on={mais} onClick={toggleMais} title="Camadas, Letras, Mídia, Avisos e ferramentas">Mais</Btn>}
            {compact && view === "preparar" && <IconBtn name="layers" title="Camadas e Roteiro" on={drawerOpen} onClick={toggleDrawer} />}
            <button type="button" className={`kx-status kx-t ${outsState ? `is-${outsState}` : ""}`} onClick={() => toggle("outs")} title="Telas e saídas" aria-expanded={open === "outs"}>
                <i className="kx-dot" />{outsLabel}
            </button>
            <IconBtn name="black" title="Tela preta · B · nas telas, na hora" on={live?.screen === "black"} onClick={() => c.toggleScreen("black")} />
            <IconBtn name="logo" title="Mostrar logo · L · nas telas" on={live?.screen === "logo"} onClick={() => c.toggleScreen("logo")} />
            <IconBtn name="eraser" title="Limpar texto · C" onClick={c.clearText} />
            <IconBtn name="stop" title="Encerrar · Esc (pergunta antes)" onClick={() => setOpen("encerrar")} />
        </div>
    );
}
