import React from "react";

/**
 * Painel Lateral — estrutura de comandos lateral partilhada,
 * com a mesma linguagem visual da página Músicas (estilos mc-* globais).
 *
 * Props:
 *  - title: título da página (topline)
 *  - actions: botões de comando da barra lateral (className mc-control)
 *  - toplineExtra: conteúdo à direita do título (opcional)
 *  - children: conteúdo principal da página
 */
export default function PagePanel({ title, actions, toplineExtra, children }) {
    return (
        <div className="mc-page p-3 md:p-6">
            <div className="mc-panel mc-panel-2col max-w-7xl mx-auto">
                <aside className="mc-side">
                    <div className="mc-side-sticky">
                        <div className="mc-brand">
                            <strong>KERYX</strong>
                        </div>
                        {actions}
                    </div>
                </aside>
                <div className="mc-main">
                    <div className="mc-topline">
                        <span className="mc-title">{title}</span>
                        {toplineExtra}
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}