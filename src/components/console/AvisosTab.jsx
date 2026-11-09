import React, { useMemo, useState } from "react";
import Icon from "./Icon";
import { Row, Btn, IconBtn, Field, Empty, SelBar, RowMark } from "./kx";
import { QuickAlert } from "./QuickTools";
import { stageDragProps as dragProps } from "./dragGhost";
import { useMultiSelect } from "./useMultiSelect";
import { pickedOf, selectionCount } from "@/lib/console/multiSelect";
import { deleteSeveral } from "./bulkActions";
import { useContextMenu } from "./ContextMenu";
import { useConfirm } from "./ConfirmDialog";
import { usePackages } from "./packages";
import { keyHint } from "@/lib/console/keys";
import { menuItem } from "@/lib/console/menuLabels";
import { mmss } from "@/lib/console/libraryRows";
import { stageFromPiece, stageFromPieceList, liveStageId } from "@/lib/console/stage";
import { noticeLabel, noticeIcon } from "@/lib/console/notice";

// Searching shows only past this many avisos (the palette, /, finds them too).
const SEARCH_FROM = 8;
const NONE = [];
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Painel › Avisos (owner 2026-11-09, mockup "Avisos · um lugar só", A1 = A):
// the one place the avisos live. The Aviso rápido on top (it goes straight to
// the screens), then the church's avisos: a click puts one in the Prévia, a
// double click sends it, a drag takes it to the Prévia, the Programa or the
// Setlist, Editar opens the editor of avisos, Novo aviso makes one, Tocar
// todos plays them in a loop. The Biblioteca no longer lists them.
export default function AvisosTab({ c, data, onPrepare, onGo, onEditNotice }) {
    const [q, setQ] = useState("");
    const [picking, setPicking] = useState(false);
    const menu = useContextMenu();
    const confirm = useConfirm();
    const { exportItems } = usePackages();
    const pieces = data.pieces || NONE;
    const ql = fold(q.trim());
    const shown = useMemo(() => (ql ? pieces.filter((p) => [p.title, p.text, p.subtext].some((t) => fold(t).includes(ql))) : pieces), [pieces, ql]);

    const airId = liveStageId(c.cur);
    const prevId = c.prev?.id;
    const state = (id) => (id === airId ? "is-air" : id === prevId ? "is-prev" : "");

    // Selecting several, as the Biblioteca does (multiSelect.js; M1 = A: a
    // plain click still prepares; I3 = A: the mode turns on by itself).
    const order = useMemo(() => shown.map((p) => p.id), [shown]);
    const existing = useMemo(() => pieces.map((p) => p.id), [pieces]);
    const ms = useMultiSelect({ order, existing, mode: "air", picking, onPicking: setPicking, autoPick: true });
    const picked = pickedOf(ms.sel, shown);
    const marked = (id) => (ms.has(id) ? "is-marked" : "");
    const rowClick = (id, prepare) => (e) => { if (!ms.click(id, e)) prepare(); };
    const removeRows = (rows) => deleteSeveral({ confirm, say: c.say, rows, entity: "CommunicationVideo", kind: "notice", nameOf: (p) => p.title || p.text || "sem título" })
        .catch((err) => c.say(err?.message || "Não foi possível excluir."));
    const exportRows = (rows) => exportItems("notices", rows);
    const dragOf = (p) => dragProps(stageFromPiece(p), p.duration ? mmss(p.duration) : "", () => (picked.length > 1 && ms.has(p.id) ? picked.map(stageFromPiece) : null));
    const rowMenu = (p) => (e) => {
        if (picked.length > 1 && ms.has(p.id)) {
            menu(e, { title: selectionCount(picked.length), items: [
                menuItem("exportar", { label: `Exportar ${picked.length}…`, onSelect: () => exportRows(picked) }),
                menuItem("excluir", { label: `Excluir ${picked.length}…`, kbd: keyHint("delete"), onSelect: () => removeRows(picked) }),
                { label: "Limpar a seleção", icon: "x", onSelect: ms.clear },
            ] });
            return;
        }
        menu(e, { title: p.title || p.text, items: [
            menuItem("porNaPrevia", { onSelect: () => onPrepare(stageFromPiece(p)) }),
            onEditNotice && menuItem("editar", { onSelect: () => onEditNotice(p.id) }),
            menuItem("selecionarVarios", { onSelect: () => ms.pickFrom(p.id) }),
            menuItem("exportar", { onSelect: () => exportRows([p]) }),
            menuItem("excluir", { onSelect: () => removeRows([p]) }),
            onGo && menuItem("enviarAoAr", { air: true, onSelect: () => onGo(stageFromPiece(p)) }),
        ] });
    };

    return (
        <div className="avisos-tab">
            <div className="listhead"><span className="kx-section">Aviso rápido <span className="kx-count">· vai direto às telas</span></span></div>
            <QuickAlert c={c} data={data} />
            <div className="listhead">
                <span className="kx-section">Avisos <span className="kx-count">· {pieces.length}</span></span>
                <span style={{ flex: 1 }} />
                {/* Glyphs, so the heading keeps its count in a narrow Painel; the words in the tooltip. */}
                {shown.length > 1 && <IconBtn name="play" small title="Tocar todos: pôr na prévia todos os avisos desta lista, um depois do outro, em loop" aria-label="Tocar todos" onClick={() => onPrepare(stageFromPieceList(shown))} />}
                {onEditNotice && <IconBtn name="plus" small title="Novo aviso: abre o editor de aviso" aria-label="Novo aviso" onClick={() => onEditNotice("new")} />}
            </div>
            {pieces.length > SEARCH_FROM && <div className="searchrow"><Field value={q} onChange={setQ} placeholder="Buscar aviso…" /></div>}
            <div className="kx-acts-list avisos-list" role="list" onKeyDown={(e) => ms.keyDown(e, { onDelete: () => removeRows(picked) })}>
                {!shown.length && data.loaded?.pieces !== false && <Empty icon="megaphone" title={ql ? `Nenhum aviso com "${q}"` : "Nenhum aviso"}>{ql ? "Procure pelo título ou pelo texto." : "Use Novo aviso para criar contagens, anúncios e avisos."}</Empty>}
                {shown.map((p) => (
                    <Row key={p.id} icon={noticeIcon(p.type)} title={p.title || p.text} meta={[noticeLabel(p.type), p.duration && mmss(p.duration)].filter(Boolean).join(" · ")}
                        state={`${state(`piece:${p.id}`)} ${marked(p.id)}`} lead={ms.picking ? <RowMark /> : null}
                        onClick={rowClick(p.id, () => onPrepare(stageFromPiece(p)))}
                        onDoubleClick={onGo && (() => { if (!ms.picking) onGo(stageFromPiece(p)); })}
                        dragProps={dragOf(p)} item onContextMenu={rowMenu(p)}
                        actions={onEditNotice && <Btn onClick={(e) => { e.stopPropagation(); onEditNotice(p.id); }} title="Abrir no editor de aviso" aria-label={`Editar ${p.title || p.text}`}><span className="kx-act-i"><Icon name="edit" /></span><span className="kx-act-l">Editar</span></Btn>} />
                ))}
            </div>
            <SelBar count={picked.length} total={order.length} onAll={ms.all} onClear={ms.clear}>
                <Btn small onClick={() => exportRows(picked)} title="Exportar num pacote do KERYX, com os arquivos que usam">Exportar…</Btn>
                <Btn small onClick={() => removeRows(picked)} title={`Excluir · ${keyHint("delete")}`}>Excluir…</Btn>
            </SelBar>
        </div>
    );
}
