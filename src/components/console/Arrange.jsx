import React from "react";
import Icon from "./Icon";

// Ver › Editar painéis: the banner under the top bar while editing, never
// over a monitor. It stays in the flow — a mode, not an alert: floating it
// would cover the panel headers you drag (A4 = A, 2026-11-14, mockup
// "Avisos flutuantes"; the state alerts float as cards, Alerts.jsx). Where
// the modules go is the dock's (Dock.jsx, src/lib/console/dock.js);
// `children`: the tray and the compact controls (Tamanhos, Divisão as a
// menu, No ar, Travar, Painéis). One tighter line where it fits (32 px;
// the hint only in the title's tooltip); it wraps only when it must.
export function EditBanner({ onRestore, onDone, children = null }) {
    return (
        <div className="kx-banner is-edit arr-banner" role="status">
            <Icon name="panels" className="kx-banner-i" />
            <span className="kx-alert-title" title="Arraste um painel pelo título: na borda de outro divide, no meio vira aba, na Bandeja sai do console. Clique no nome: Mover para…; ⧉ destaca numa janela própria; × tira para a bandeja. Esc conclui.">Editando os painéis</span>
            {children}
            <span className="kx-spacer" />
            <button type="button" className="kx-btn kx-t" onClick={onRestore} title="Restaurar posições: volta os módulos e os tamanhos ao padrão">Restaurar</button>
            <button type="button" className="kx-btn kx-banner-main kx-t" onClick={onDone}>Concluir</button>
        </div>
    );
}
