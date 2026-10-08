import { keryx } from "@/api/keryxClient";
import { jsPDF } from "jspdf";
import { plan, clockAt, span, total, typeLabel, isSection } from "@/lib/console/setlist";

const dateBR = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || "")) ? iso.split("-").reverse().join("/") : iso || "");

/**
 * Exporta um Service completo para PDF — itens, letras e referências bíblicas.
 * @param {object} service - entidade Service
 * @param {array} items - ServiceItems ordenados
 */
export async function exportServiceToPdf(service, items) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let y = margin;

    // Título
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(service.title || "Culto", margin, y);
    y += 10;

    // Metadados
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const p = plan(service, items);
    const meta = [
        service.date && `Data: ${dateBR(service.date)}`,
        `Início: ${service.startTime || service.time || "19:00"} · ${p.count} itens · ${total(p.seconds)} · termina às ${clockAt(p.ends)}`,
        service.location && `Local: ${service.location}`,
    ].filter(Boolean);
    meta.forEach(m => { doc.text(m, margin, y); y += 6; });
    // The team, one line each.
    const team = service.worship_team || [];
    if (team.length) {
        y += 2;
        doc.setFont("helvetica", "bold");
        doc.text("Equipe", margin, y);
        y += 6;
        doc.setFont("helvetica", "normal");
        team.forEach((m) => { doc.text(`${m.member_name || ""}${m.role ? ` · ${m.role}` : ""}`, margin, y); y += 5; });
    }
    y += 4;

    // Buscar conteúdo de cada item
    for (const [i, item] of items.entries()) {
        if (item.enabled === false) continue;

        // Nova página se necessário
        if (y > pageHeight - 40) { doc.addPage(); y = margin; }

        // A section header (Pré-culto, Culto, Pós-culto).
        if (isSection(item)) {
            doc.setFontSize(15);
            doc.setFont("helvetica", "bold");
            doc.text(String(item.title || "Seção").toUpperCase(), margin, y);
            y += 9;
            continue;
        }

        // Cabeçalho do item: the planned time, the kind, the title, the length.
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        const at = p.rows[i]?.at;
        doc.text(`${at != null ? `${clockAt(at)}  ` : ""}${typeLabel(item.type)}: ${item.title || ""}${item.duration ? `  (${span(item.duration)})` : ""}`, margin, y);
        y += 7;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");

        // Buscar conteúdo conforme o tipo
        try {
            const contentId = item.contentId;
            if (item.type === "SONG" && contentId) {
                const song = await keryx.entities.Song.get(contentId);
                if (song.lyrics) {
                    const lines = doc.splitTextToSize(song.lyrics, pageWidth - 2 * margin);
                    lines.forEach(line => {
                        if (y > pageHeight - 15) { doc.addPage(); y = margin; }
                        doc.text(line, margin, y);
                        y += 5;
                    });
                }
                if (song.chords) {
                    y += 3;
                    doc.setFont("helvetica", "italic");
                    const chordLines = doc.splitTextToSize(`Cifra: ${song.chords}`, pageWidth - 2 * margin);
                    chordLines.forEach(line => {
                        if (y > pageHeight - 15) { doc.addPage(); y = margin; }
                        doc.text(line, margin, y);
                        y += 5;
                    });
                    doc.setFont("helvetica", "normal");
                }
            } else if (item.type === "BIBLE" && contentId) {
                const passage = await keryx.entities.BiblePassage.get(contentId);
                if (passage.text) {
                    const lines = doc.splitTextToSize(passage.text, pageWidth - 2 * margin);
                    lines.forEach(line => {
                        if (y > pageHeight - 15) { doc.addPage(); y = margin; }
                        doc.text(line, margin, y);
                        y += 5;
                    });
                }
            }
            if (item.notes) {
                doc.setFont("helvetica", "italic");
                const lines = doc.splitTextToSize(`Notas: ${item.notes}`, pageWidth - 2 * margin);
                lines.forEach(line => {
                    if (y > pageHeight - 15) { doc.addPage(); y = margin; }
                    doc.text(line, margin, y);
                    y += 5;
                });
                doc.setFont("helvetica", "normal");
            }
        } catch (e) {
            // conteúdo não disponível — continuar
        }

        y += 6;
        doc.setDrawColor(200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 8;
    }

    // Notas gerais
    if (service.notes) {
        if (y > pageHeight - 30) { doc.addPage(); y = margin; }
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Notas Gerais:", margin, y);
        y += 6;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        const noteLines = doc.splitTextToSize(service.notes, pageWidth - 2 * margin);
        noteLines.forEach(line => {
            if (y > pageHeight - 15) { doc.addPage(); y = margin; }
            doc.text(line, margin, y);
            y += 5;
        });
    }

    doc.save(`${(service.title || "culto").replace(/\s+/g, "_")}.pdf`);
}