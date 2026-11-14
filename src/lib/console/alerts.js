// The floating state cards at the console's top right (owner 2026-11-14,
// mockup "Avisos flutuantes", A1–A3 = A): they replaced the in-flow
// banners, which pushed the whole dock down. One card per state — the
// output banner outputHealth picks (outputs.js: one output at a time) and
// Telas travadas — each one line: the state's glyph, a short title, the
// filled main action and a "⋯" menu with the rest; the old explanation is
// the card's tooltip (`tip`). After CHIP_MS the card shrinks to a chip of
// one word (`chip`; pointing or focusing opens it back, a click pins it);
// a card with chip null never shrinks (Reconectando is a live alert). A
// new `id` enters as the full card again. The actions are names the
// console wires (Alerts.jsx): black, logo, outs, reopen, forget, unlock.
export const CHIP_MS = 10000;

const telas = (n) => `${n} ${n === 1 ? "tela" : "telas"}`;

export function alertCards({ banner = null, tries = 0, lastOkAt = 0, hhmm = () => "—", problems = 0, locked = false } = {}) {
    const out = [];
    if (banner?.kind === "reconnecting") {
        out.push({
            id: `rec:${banner.row.id}`, state: "warn", role: "alert", icon: "warn",
            title: `${banner.row.name} · Reconectando… tentativa ${tries}`,
            tip: `ATENÇÃO · ${banner.row.key === "/Projection" ? `última conexão boa às ${hhmm(lastOkAt)} · ` : ""}o monitor escolhido não está ligado`,
            chip: null,
            main: { label: "Ver saídas", act: "outs" },
            menu: [{ label: "Tela preta", act: "black" }, { label: "Mostrar logo", act: "logo" }],
        });
    } else if (banner) {
        const closed = banner.kind === "closed";
        out.push({
            id: `out:${banner.row.id}:${banner.row.droppedAt || 0}`, state: "warn", role: "alert", icon: "warn",
            title: `${banner.title}${banner.more ? ` · e mais ${banner.more}` : ""}`,
            tip: banner.sub,
            chip: telas(Math.max(1, problems)),
            main: closed ? { label: "Reabrir", act: "reopen" } : { label: "Ver saídas", act: "outs" },
            menu: [
                closed ? { label: "Ver saídas", act: "outs" } : null,
                { label: "Esquecer", act: "forget", title: "Não avisar mais sobre esta saída nesta sessão" },
            ].filter(Boolean),
        });
    }
    if (locked) {
        out.push({
            id: "locked", state: "rh", role: "status", icon: "lock",
            title: "Telas travadas",
            tip: "Nada novo vai às telas · prepare à vontade; Tela preta, Logo, Limpar e Esc continuam valendo.",
            chip: "Travadas",
            main: { label: "Destravar", act: "unlock" },
            menu: null,
        });
    }
    return out;
}
