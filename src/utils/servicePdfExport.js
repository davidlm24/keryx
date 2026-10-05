import { base44 } from "@/api/base44Client";
import { jsPDF } from "jspdf";

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
    const meta = [
        service.date && `Data: ${service.date}`,
        service.startTime && `Início: ${service.startTime}`,
        service.location && `Local: ${service.location}`,
    ].filter(Boolean);
    meta.forEach(m => { doc.text(m, margin, y); y += 6; });
    y += 4;

    // Buscar conteúdo de cada item
    for (const item of items) {
        if (item.enabled === false) continue;

        // Nova página se necessário
        if (y > pageHeight - 40) { doc.addPage(); y = margin; }

        // Cabeçalho do item
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        const typeLabel = {
            SONG: "🎵 Música", BIBLE: "📖 Bíblia", VIDEO: "🎬 Vídeo",
            IMAGE: "🖼 Imagem", BANNER: "📢 Banner", ANNOUNCEMENT: "📣 Anúncio",
            TEXT: "📝 Texto", TIMER: "⏱ Timer"
        }[item.type] || item.type;
        doc.text(`${typeLabel}: ${item.title || ""}`, margin, y);
        y += 7;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");

        // Buscar conteúdo conforme o tipo
        try {
            const contentId = item.contentId;
            if (item.type === "SONG" && contentId) {
                const song = await base44.entities.Song.get(contentId);
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
                const passage = await base44.entities.BiblePassage.get(contentId);
                if (passage.text) {
                    const lines = doc.splitTextToSize(passage.text, pageWidth - 2 * margin);
                    lines.forEach(line => {
                        if (y > pageHeight - 15) { doc.addPage(); y = margin; }
                        doc.text(line, margin, y);
                        y += 5;
                    });
                }
            } else if (item.notes) {
                const lines = doc.splitTextToSize(`Notas: ${item.notes}`, pageWidth - 2 * margin);
                lines.forEach(line => {
                    if (y > pageHeight - 15) { doc.addPage(); y = margin; }
                    doc.text(line, margin, y);
                    y += 5;
                });
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