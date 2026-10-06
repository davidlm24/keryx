import React, { useState } from "react";
import { keryx } from "@/api/keryxClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, Loader2, Download } from "lucide-react";
import { useThemeColors } from "@/hooks/useThemeColors";

/**
 * Importa letras via URL — cola link do letras.mus.br ou genius.com
 * e extrai a letra automaticamente com slides formatados.
 */
export default function UrlLyricsImporter({ onImport }) {
    const colors = useThemeColors();
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState(null);

    const handleImport = async () => {
        if (!url.trim()) return;
        setLoading(true);
        setPreview(null);
        try {
            const result = await keryx.integrations.Core.InvokeLLM({
                prompt: `Acesse a URL "${url}" e extraia a letra completa da música.
Retorna em JSON:
- title: título exato da música
- artist: nome do artista
- lyrics_slides: array de slides para projeção, cada um com:
  * text: trecho da letra (2-4 linhas de uma estrofe ou refrão)
  * section: nome da secção (ex: "Verso 1", "Refrão", "Ponte")

REGRAS:
- Respeita a divisão de estrofes e refrões do original
- Não cortar frases no meio
- Refrões repetidos devem aparecer todas as vezes`,
                add_context_from_internet: true,
                response_json_schema: {
                    type: "object",
                    properties: {
                        title: { type: "string" },
                        artist: { type: "string" },
                        lyrics_slides: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    text: { type: "string" },
                                    section: { type: "string" }
                                }
                            }
                        }
                    },
                    required: ["title", "artist", "lyrics_slides"]
                }
            });

            if (result?.lyrics_slides?.length) {
                const slides = result.lyrics_slides.map(s => ({ text: s.text, duration: 12 }));
                const fullLyrics = result.lyrics_slides.map(s => s.text).join("\n\n");
                setPreview({
                    title: result.title,
                    artist: result.artist,
                    slides,
                    lyrics: fullLyrics,
                    slideCount: slides.length,
                });
            } else {
                alert("Não foi possível extrair a letra desta URL.");
            }
        } catch (e) {
            alert("Erro ao importar letra. Verifica a URL.");
        } finally {
            setLoading(false);
        }
    };

    const confirm = () => {
        if (preview) {
            onImport(preview);
            setPreview(null);
            setUrl("");
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: colors.primary }}>
                <Link className="w-4 h-4" />
                Importar via URL
            </div>
            <div className="flex gap-2">
                <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://letras.mus.br/..."
                    className="bg-white/10 text-white placeholder:text-gray-500"
                    style={{ borderColor: `${colors.primary}40` }}
                    disabled={loading}
                />
                <Button
                    onClick={handleImport}
                    disabled={loading || !url.trim()}
                    className="text-white shrink-0"
                    style={{ background: colors.primary }}
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                </Button>
            </div>
            <p className="text-xs text-gray-500">Cola link do letras.mus.br, genius.com ou similar</p>
            {preview && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                        <span className="text-green-300 font-semibold">{preview.title}</span>
                        <span className="text-green-500 text-sm">— {preview.artist}</span>
                    </div>
                    <p className="text-green-400/70 text-xs">{preview.slideCount} slides extraídos</p>
                    <div className="flex gap-2">
                        <Button size="sm" onClick={confirm} className="bg-green-600 hover:bg-green-700 text-white">
                            ✓ Importar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setPreview(null)} className="border-white/20 text-white">
                            Cancelar
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}