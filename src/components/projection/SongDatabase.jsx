import React, { useState } from "react";
import { keryx } from "@/api/keryxClient";
import { Download, Upload, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function SongDatabase({ songs }) {
    const colors = useThemeColors();
    const [importing, setImporting] = useState(false);
    const [message, setMessage] = useState("");
    const queryClient = useQueryClient();

    const handleExport = () => {
        if (!songs || songs.length === 0) {
            alert("Nenhuma música para exportar.");
            return;
        }
        const exportData = {
            exported_at: new Date().toISOString(),
            app: "KERYX",
            count: songs.length,
            songs: songs.map(s => {
                const { id, created_date, updated_date, created_by_id, ...rest } = s;
                return rest;
            })
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `keryx_musicas_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setMessage(`${songs.length} músicas exportadas.`);
        setTimeout(() => setMessage(""), 3000);
    };

    const handleImport = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);
        setMessage("");
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const songList = Array.isArray(data) ? data : data.songs;
            if (!Array.isArray(songList) || songList.length === 0) {
                alert("Ficheiro inválido: nenhum música encontrada.");
                return;
            }
            const valid = songList.filter(s => s.title && s.lyrics);
            if (valid.length === 0) {
                alert("Nenhuma música válida (título e letra obrigatórios).");
                return;
            }
            const result = await keryx.entities.Song.bulkCreate(valid);
            queryClient.invalidateQueries({ queryKey: ["songs"] });
            const count = Array.isArray(result) ? result.length : valid.length;
            setMessage(`${count} músicas importadas com sucesso!`);
        } catch (err) {
            console.error("Erro ao importar:", err);
            alert("Erro ao importar o ficheiro. Verifique o formato JSON.");
        } finally {
            setImporting(false);
            e.target.value = "";
        }
    };

    return (
        <>
            <button
                type="button"
                className="mc-control"
                onClick={handleExport}
                disabled={!songs || songs.length === 0}
                title="Exportar todas as músicas para JSON"
            >
                <Download />
                Exportar
            </button>
            <label className="mc-control" title="Importar músicas de ficheiro JSON">
                {importing ? <Loader2 className="animate-spin" /> : <Upload />}
                {importing ? "Importando..." : "Importar"}
                <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>
            {message && (
                <span className="text-[10px] px-2 break-words" style={{ color: colors.primary }}>{message}</span>
            )}
        </>
    );
}