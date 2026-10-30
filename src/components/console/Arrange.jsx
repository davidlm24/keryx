import React from "react";
import Icon from "./Icon";

// Ver › Editar disposição: the banner under the top bar while editing, never
// over a monitor (banners never are). Where the modules go is the dock's
// (Dock.jsx, src/lib/console/dock.js); `children`: the tray and the compact
// controls (Tamanhos, No ar, Travar, Disposição). One line where it fits
// (Rodada R, owner 2026-10-29, R5); it wraps only when it must.
export function EditBanner({ onRestore, onDone, children = null }) {
    return (
        <div className="kx-banner is-edit arr-banner" role="status">
            <Icon name="panels" className="kx-banner-i" />
            <span className="kx-alert-title" title="Arraste um painel pelo título: na borda de outro divide, no meio vira aba, na Bandeja sai do console. Clique no nome: Mover para…; × tira para a bandeja. Esc conclui.">Editando a disposição</span>
            <span className="kx-sub arr-hint">Arraste pelo título · × tira</span>
            {children}
            <span className="kx-spacer" />
            <button type="button" className="kx-btn kx-t" onClick={onRestore} title="Restaurar posições: volta os módulos e os tamanhos ao padrão">Restaurar</button>
            <button type="button" className="kx-btn kx-banner-main kx-t" onClick={onDone}>Concluir</button>
        </div>
    );
}
