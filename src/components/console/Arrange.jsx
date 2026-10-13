import React from "react";

// Ver › Editar disposição: the banner under the top bar while editing, never
// over a monitor (banners never are). Where the modules go is the dock's
// (Dock.jsx, src/lib/console/dock.js); `children`: the tray and, in the
// culto, the named arrangements.
export function EditBanner({ onRestore, onDone, children = null }) {
    return (
        <div className="kx-banner arr-banner" role="status">
            <span className="kx-alert-title">Editando a disposição</span>
            <span className="kx-sub">Arraste pelo nome: na borda de outro módulo divide, no meio vira aba. Clique no nome: Mover para…; × guarda na bandeja. Esc conclui.</span>
            {children}
            <span className="kx-spacer" />
            <button type="button" className="kx-btn kx-t" onClick={onRestore} title="Volta os módulos e os tamanhos ao padrão">Restaurar posições</button>
            <button type="button" className="kx-btn kx-btn-outline kx-t" onClick={onDone}>Concluir</button>
        </div>
    );
}
