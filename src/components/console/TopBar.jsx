import React from "react";
import Icon from "./Icon";
import { Seg, IconBtn } from "./kx";

const two = (n) => String(n).padStart(2, "0");
const elapsed = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
};

// The top bar: the KERYX menu, the service and its clock, Culto | Bíblia,
// Ensaio | Ao vivo, the search field (the command palette), the outputs
// status and the four screen controls as bare glyphs.
export default function TopBar({ c, service, env, setEnv, open, setOpen, outsLabel, outsState, compact, drawerOpen, toggleDrawer, logoUrl }) {
    const { live, now, isLive, cur } = c;
    const since = live?.session?.startedAt;
    const clock = new Date(now).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const toggle = (name) => setOpen(open === name ? null : name);
    return (
        <div className="topbar">
            <button type="button" className={`markbtn kx-t ${open === "menu" ? "is-on" : ""}`} onClick={() => toggle("menu")} aria-haspopup="menu" aria-expanded={open === "menu"} title="Menu">
                {logoUrl ? <img src={logoUrl} alt="" style={{ width: 16, height: 16, borderRadius: 999, objectFit: "cover" }} /> : <span className="kx-mark" />}KERYX
            </button>
            <div className="svc">
                <b>{service?.title || "Sem culto escolhido"}</b>
                {service?.date && <span className="kx-meta">{service.date.split("-").reverse().join("/")}{service.startTime ? ` · ${service.startTime}` : ""}</span>}
                <span className="kx-clock">{clock}</span>
            </div>
            <Seg value={env} onChange={setEnv} options={[["culto", "Culto"], ["biblia", "Bíblia"]]} />
            <Seg
                mode
                value={isLive ? "live" : "ensaio"}
                onChange={(v) => (v === "ensaio" ? c.goEnsaio() : setOpen("arm"))}
                options={[
                    ["ensaio", <>{!isLive && <i className="kx-dot" />}Ensaio</>, { title: "Ensaiar sem mudar as telas" }],
                    ["live", <>{isLive && <i className="kx-dot" />}Ao vivo{since ? ` · ${elapsed(now - since)}` : ""}</>, { title: "Saídas armadas" }],
                ]}
            />
            <div className="grow" />
            <div className="kx-field kx-t" onClick={() => setOpen("palette")} title="Buscar ou comandar · /" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setOpen("palette"); }}>
                <Icon name="search" /><input placeholder="Buscar em tudo" aria-label="Buscar em tudo" readOnly /><kbd>/</kbd>
            </div>
            <div className="grow" />
            {compact && <IconBtn name="layers" title="Camadas e Roteiro" on={drawerOpen} onClick={toggleDrawer} />}
            <button type="button" className={`kx-status kx-t ${outsState ? `is-${outsState}` : ""}`} onClick={() => toggle("outs")} title="Telas e saídas" aria-expanded={open === "outs"}>
                <i className="kx-dot" />{outsLabel}
            </button>
            <IconBtn name="black" title="Tela preta · B (na hora)" on={cur?.screen === "black"} onClick={() => c.toggleScreen("black")} />
            <IconBtn name="logo" title="Mostrar logo · L" on={cur?.screen === "logo"} onClick={() => c.toggleScreen("logo")} />
            <IconBtn name="eraser" title="Limpar texto · C" onClick={c.clearText} />
            <IconBtn name="stop" title="Encerrar · Esc (pergunta antes)" onClick={() => setOpen("encerrar")} />
        </div>
    );
}
