import React, { useState } from "react";
import Icon from "./Icon";
import { IconBtn } from "./kx";

// Ver › Editar layout (2026-10-12): the pieces of the edit mode. Where the
// columns and cards go is src/lib/console/arrange.js; these only show the
// handles and report moves.
//   - Each column gets a bar on top: a grip to drag it, its name, and ◀ ▶.
//   - Each card stacked with others gets a grip and ▲ ▼ in its header.
//   - A drag is pointer events with capture on the grip, never HTML5 drag
//     and drop: the Setlist accepts any dragover and clears its own state on
//     every dragend, and a stage drag must never start from a layout move.

// A reorder by dragging a handle along one axis. `ids`: the items in order;
// `find(id)`: the item's element (measured while dragging); `onDrop(id,
// index)`: the item lands at `index` of the final list.
// -> { drag, handleProps(id) }; drag = { id, at, line } while dragging.
export function usePointerReorder({ axis = "x", ids, find, onDrop }) {
    const [drag, setDrag] = useState(null);
    const measure = (id, pos) => {
        const others = ids.filter((x) => x !== id).map((x) => ({ id: x, r: find(x)?.getBoundingClientRect() })).filter((o) => o.r);
        if (!others.length) return { at: 0, line: null };
        const lo = axis === "x" ? "left" : "top";
        const hi = axis === "x" ? "right" : "bottom";
        const at = others.filter((o) => (o.r[lo] + o.r[hi]) / 2 < pos).length;
        const edge = at === 0 ? others[0].r[lo] - 4 : others[at - 1].r[hi] + 4;
        const span = axis === "x"
            ? { top: Math.min(...others.map((o) => o.r.top)), bottom: Math.max(...others.map((o) => o.r.bottom)) }
            : { left: Math.min(...others.map((o) => o.r.left)), right: Math.max(...others.map((o) => o.r.right)) };
        return { at, line: { at: edge, ...span } };
    };
    const handleProps = (id) => ({
        onPointerDown: (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* a pointer that is gone: the drag still works while it stays on the grip */ }
            setDrag({ id, at: ids.indexOf(id), line: null });
        },
        onPointerMove: (e) => {
            if (!drag || drag.id !== id) return;
            setDrag({ id, ...measure(id, axis === "x" ? e.clientX : e.clientY) });
        },
        onPointerUp: () => {
            if (!drag || drag.id !== id) return;
            setDrag(null);
            if (drag.line) onDrop(id, drag.at);
        },
        onPointerCancel: () => setDrag(null),
    });
    return { drag, handleProps };
}

// Where a dragged column or card would land: a line between the others.
export function DropLine({ drag, axis = "x" }) {
    const l = drag?.line;
    if (!l) return null;
    const style = axis === "x"
        ? { left: l.at - 1, top: l.top, height: l.bottom - l.top, width: 2 }
        : { top: l.at - 1, left: l.left, width: l.right - l.left, height: 2 };
    return <div className="arr-line" style={style} aria-hidden="true" />;
}

// On top of a column while editing: grip, name, ◀ ▶.
export function ColumnBar({ name, index, count, onMove, handle, moving }) {
    return (
        <div className={`arr-bar ${moving ? "is-moving" : ""}`} role="group" aria-label={`Coluna ${name}`}>
            <span className="arr-grip" title="Arraste para mudar a coluna de lugar" {...handle}><Icon name="grip" /></span>
            <span className="arr-name">{name}</span>
            <IconBtn small name="chevron-left" title={`Mover ${name} para a esquerda`} disabled={index === 0} onClick={() => onMove(-1)} />
            <IconBtn small name="chevron-right" title={`Mover ${name} para a direita`} disabled={index === count - 1} onClick={() => onMove(1)} />
        </div>
    );
}

// In the header of a stacked card while editing (Panel's `lead`): grip, ▲ ▼.
export function StackLead({ name, index, count, onMove, handle }) {
    return (
        <span className="arr-lead" role="group" aria-label={`${name} na pilha`}>
            <span className="arr-grip" title="Arraste para cima ou para baixo" {...handle}><Icon name="grip" /></span>
            <IconBtn small name="chevron-up" title={`Subir ${name}`} disabled={index === 0} onClick={() => onMove(-1)} />
            <IconBtn small name="chevron-down" title={`Descer ${name}`} disabled={index === count - 1} onClick={() => onMove(1)} />
        </span>
    );
}

// Under the top bar while editing. Never over a monitor (banners never are).
// The culto environment's modules go anywhere (Dock.jsx; `children`: its
// tray); the Bíblia's columns and cards move as before.
export function EditBanner({ env = "culto", onRestore, onDone, children = null }) {
    const hint = env === "culto"
        ? "Arraste pelo nome: na borda de outro módulo divide, no meio vira aba. Clique no nome: Mover para…; × guarda na bandeja. Esc conclui."
        : "Arraste pelo topo da coluna ou use as setas; os cards empilhados sobem e descem. Esc conclui.";
    return (
        <div className="kx-banner arr-banner" role="status">
            <span className="kx-alert-title">Editando a disposição</span>
            <span className="kx-sub">{hint}</span>
            {children}
            <span className="kx-spacer" />
            <button type="button" className="kx-btn kx-t" onClick={onRestore} title="Volta a ordem, as pilhas e as larguras ao padrão">Restaurar posições</button>
            <button type="button" className="kx-btn kx-btn-outline kx-t" onClick={onDone}>Concluir</button>
        </div>
    );
}
