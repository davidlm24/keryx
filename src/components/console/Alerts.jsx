import React, { useEffect, useState } from "react";
import Icon from "./Icon";
import { CHIP_MS } from "@/lib/console/alerts";

// The floating state cards at the console's top right (owner 2026-11-14,
// mockup "Avisos flutuantes"; the words and rules in
// src/lib/console/alerts.js, the look .kx-acard in bundle.css, the stack
// .kx-alerts in console.css). The chip is CSS: `is-chip` hides the title
// and the buttons unless the card is pointed at or holds the focus; a
// click pins the card open until the state changes. `onAct(name)` runs
// the console's own actions.
function AlertCard({ card, onAct, openMenu }) {
    const [small, setSmall] = useState(false);
    useEffect(() => {
        setSmall(false);
        if (!card.chip) return undefined;
        const t = setTimeout(() => setSmall(true), CHIP_MS);
        return () => clearTimeout(t);
    }, [card.id, card.chip]);
    const more = card.menu && ((e) => openMenu(e, { items: card.menu.map((m) => ({ label: m.label, title: m.title, onSelect: () => onAct(m.act) })) }));
    return (
        <div className={`kx-acard is-${card.state}${small ? " is-chip" : ""}`} role={card.role} title={card.tip} onClick={() => { if (small) setSmall(false); }}>
            <Icon name={card.icon} className="kx-banner-i" />
            {card.chip && <span className="kx-acard-w">{card.chip}</span>}
            <span className="kx-alert-title">{card.title}</span>
            <button type="button" className="kx-btn kx-banner-main kx-t" onClick={() => onAct(card.main.act)}>{card.main.label}</button>
            {more && <button type="button" className="kx-btn kx-acard-more kx-t" aria-haspopup="menu" aria-label="Mais ações" title="Mais ações" onClick={more}><Icon name="more" /></button>}
        </div>
    );
}

export default function Alerts({ cards, onAct, openMenu, inert }) {
    if (!cards.length) return null;
    return (
        <div className="kx-alerts" inert={inert}>
            {cards.map((card) => <AlertCard key={card.id} card={card} onAct={onAct} openMenu={openMenu} />)}
        </div>
    );
}
