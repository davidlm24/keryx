import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Music } from "lucide-react";
import { keryx } from "@/api/keryxClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useThemeColors } from "@/hooks/useThemeColors";
import UrlLyricsImporter from "@/components/projection/UrlLyricsImporter";

export default function SongSearch({ onSongFound }) {
    const colors = useThemeColors();
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [foundResult, setFoundResult] = useState(null);

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;

        setIsSearching(true);
        setFoundResult(null);
        try {
            // Buscar letra e duração real em paralelo
            const [lyricsResult, durationResult] = await Promise.all([
                keryx.integrations.Core.InvokeLLM({
                    prompt: `Acesse o site letras.mus.br e busca a letra COMPLETA da música "${searchQuery}".

Retorna em JSON:
- title: título exato da música
- artist: nome exato do artista/banda
- lyrics_slides: array de slides para projeção. Cada slide deve ter:
  * text: trecho da letra que se canta de uma vez (normalmente 2 a 4 linhas de uma estrofe ou refrão). Respeita EXATAMENTE a divisão de estrofes e refrões do original.
  * section: nome da secção (ex: "Verso 1", "Refrão", "Ponte", "Outro")

REGRAS IMPORTANTES:
- Cada slide deve corresponder a uma unidade musical natural (estrofe ou parte do refrão)
- NÃO cortar uma frase no meio
- Refrões que se repetem devem aparecer todas as vezes que aparecem na música`,
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
                }),
                keryx.integrations.Core.InvokeLLM({
                    prompt: `Pesquisa no Google, Spotify, YouTube Music ou qualquer fonte confiável a duração oficial em segundos da música "${searchQuery}". Retorna apenas o número de segundos totais da música (ex: se a música dura 4:32 retorna 272). Se não encontrares, retorna 0.`,
                    add_context_from_internet: true,
                    response_json_schema: {
                        type: "object",
                        properties: {
                            duration_seconds: { type: "number" },
                            source: { type: "string" }
                        },
                        required: ["duration_seconds"]
                    }
                })
            ]);

            if (lyricsResult && lyricsResult.lyrics_slides && lyricsResult.lyrics_slides.length > 0) {
                const slideCount = lyricsResult.lyrics_slides.length;
                // Duração real da música (ou fallback de 12s por slide)
                const realDuration = durationResult?.duration_seconds > 30 ? durationResult.duration_seconds : slideCount * 12;
                // Distribuir a duração real proporcionalmente por número de slides
                const durationPerSlide = Math.round(realDuration / slideCount);

                const slides = lyricsResult.lyrics_slides.map(s => ({
                    text: s.text,
                    duration: durationPerSlide
                }));
                const fullLyrics = lyricsResult.lyrics_slides.map(s => s.text).join("\n\n");

                const songData = {
                    title: lyricsResult.title || searchQuery,
                    artist: lyricsResult.artist || "",
                    lyrics: fullLyrics,
                    duration: realDuration,
                    slides
                };
                setFoundResult(songData);
            } else {
                alert("Letra não encontrada. Tente com o nome exato da música e artista.");
            }
        } catch (error) {
            console.error("Erro ao buscar música:", error);
            alert("Erro ao buscar letra. Tente novamente.");
        } finally {
            setIsSearching(false);
        }
    };

    const handleSave = () => {
        if (foundResult) {
            onSongFound(foundResult);
            setFoundResult(null);
            setSearchQuery("");
        }
    };

    return (
        <Card className="border" style={{ background: `linear-gradient(to bottom right, ${colors.primary}20, ${colors.secondary}20)`, borderColor: `${colors.primary}50` }}>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2" style={{ color: colors.primary }}>
                    <Search className="w-5 h-5" />
                    Buscar Letra Online (letras.mus.br)
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex gap-3">
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Ex: Thalles Roberto - Deus da Minha Vida"
                        className="bg-white/10 text-white placeholder:text-gray-400"
                        style={{ borderColor: `${colors.primary}50` }}
                        onKeyDown={(e) => e.key === "Enter" && !isSearching && handleSearch()}
                        disabled={isSearching}
                    />
                    <Button
                        onClick={handleSearch}
                        disabled={!searchQuery.trim() || isSearching}
                        className="text-white shrink-0"
                        style={{ background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}
                    >
                        {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                        {isSearching && <span className="ml-2 text-sm">Buscando...</span>}
                    </Button>
                </div>

                {foundResult && (
                    <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                            <Music className="w-4 h-4 text-green-400" />
                            <span className="text-green-300 font-semibold">{foundResult.title}</span>
                            <span className="text-green-500 text-sm">— {foundResult.artist}</span>
                        </div>
                        <p className="text-green-400/70 text-xs">
                            {foundResult.slides.length} slides • ~{Math.floor(foundResult.duration / 60)}:{String(foundResult.duration % 60).padStart(2,"0")} min
                        </p>
                        <div className="flex gap-2 pt-1">
                            <Button size="sm" onClick={handleSave}
                                className="bg-green-600 hover:bg-green-700 text-white">
                                ✓ Salvar Música
                            </Button>
                            <Button size="sm" variant="outline"
                                onClick={() => setFoundResult(null)}
                                className="border-white/20 text-white hover:bg-white/10">
                                Cancelar
                            </Button>
                        </div>
                    </div>
                )}

                <div className="pt-3 border-t border-white/10">
                    <UrlLyricsImporter onImport={(data) => {
                        onSongFound(data);
                    }} />
                </div>
            </CardContent>
        </Card>
    );
}