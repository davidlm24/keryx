import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Loader2, Cast, Star, Inbox } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getBibleProjectionStyle } from "@/utils/bibleProjectionStyle";

export default function BibleSearch({ onProjectVerse }) {
    const colors = useThemeColors();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setIsLoading(true);
        setHasSearched(true);
        setResults([]);

        try {
            const prompt = `Pesquise na Bíblia por versículos que contenham a palavra ou frase: "${query}".
            Retorne até 12 resultados dos versículos mais relevantes.
            Para cada resultado, retorne: book (nome do livro em português), chapter (número), verse (número), text (texto completo do versículo).
            Priorize versículos onde a palavra aparece literalmente.`;

            const result = await base44.integrations.Core.InvokeLLM({
                prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        results: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    book: { type: "string" },
                                    chapter: { type: "number" },
                                    verse: { type: "number" },
                                    text: { type: "string" }
                                }
                            }
                        }
                    }
                }
            });

            setResults(result.results || []);
        } catch (err) {
            console.error("Erro na pesquisa:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleProject = (r) => {
        if (!onProjectVerse) return;
        const style = getBibleProjectionStyle();
        const reference = `${r.book} ${r.chapter}:${r.verse}`;
        onProjectVerse({
            reference,
            book: r.book,
            chapter: r.chapter,
            verses: String(r.verse),
            text: `${r.verse} ${r.text}`,
            version: style.version || "NVI",
            slides: [{ text: `${r.verse} ${r.text}`, duration: 12 }],
            text_color: style.text_color,
            background_image: style.background_image,
            font_size: style.font_size,
            font_family: style.font_family,
        });
    };

    const [savingId, setSavingId] = useState(null);

    const handleSaveFavorite = async (r, i) => {
        setSavingId(i);
        try {
            const reference = `${r.book} ${r.chapter}:${r.verse}`;
            await base44.entities.BibleNote.create({
                reference,
                book: r.book,
                chapter: r.chapter,
                verse: r.verse,
                verse_text: r.text,
                note_type: "favorite",
            });
        } catch (e) {
            console.error("Erro ao guardar favorito:", e);
        } finally {
            setSavingId(null);
        }
    };

    const highlightQuery = (text) => {
        if (!query.trim()) return text;
        const parts = text.split(new RegExp(`(${query.trim()})`, "gi"));
        return parts.map((part, i) =>
            part.toLowerCase() === query.trim().toLowerCase()
                ? <mark key={i} className="bg-amber-400/40 text-white rounded px-0.5">{part}</mark>
                : part
        );
    };

    return (
        <Card className="border" style={{ background: `linear-gradient(to bottom right, ${colors.primary}20, ${colors.secondary}20)`, borderColor: `${colors.primary}50` }}>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2" style={{ color: colors.primary }}>
                    <Search className="w-5 h-5" />
                    Pesquisar por Palavra
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.primary }} />
                        <Input
                            placeholder="Digite uma palavra (ex: amor, graça, fé...)"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                            className="pl-9 bg-white/10 text-white placeholder:text-gray-400"
                            style={{ borderColor: `${colors.primary}50` }}
                            autoFocus
                        />
                    </div>
                    <Button
                        onClick={handleSearch}
                        disabled={isLoading || !query.trim()}
                        className="text-white"
                        style={{ background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                </div>

                {isLoading && (
                    <div className="text-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: colors.primary }} />
                        <p className="text-sm" style={{ color: colors.primary }}>A pesquisar na Bíblia...</p>
                    </div>
                )}

                {hasSearched && !isLoading && results.length === 0 && (
                    <div className="text-center py-10 flex flex-col items-center">
                        <Inbox className="w-12 h-12 text-gray-500 mb-3" />
                        <p className="text-gray-400 text-sm">
                            Nenhum versículo encontrado para "{query}"
                        </p>
                        <p className="text-gray-500 text-xs mt-1">Tente outra palavra ou frase</p>
                    </div>
                )}

                {results.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium" style={{ color: colors.primary }}>
                                {results.length} {results.length === 1 ? "resultado" : "resultados"}
                            </span>
                        </div>
                        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                            <AnimatePresence>
                                {results.map((r, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.04 }}
                                        className="p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-all group"
                                        style={{ border: `1px solid ${colors.primary}30` }}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-md mb-2" style={{ color: colors.primary, background: `${colors.primary}25` }}>
                                                    {r.book} {r.chapter}:{r.verse}
                                                </span>
                                                <p className="text-white text-sm leading-relaxed">
                                                    {highlightQuery(r.text)}
                                                </p>
                                            </div>
                                            <div className="flex flex-col gap-1 shrink-0">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleProject(r)}
                                                    className="hover:bg-white/10 h-8 px-2"
                                                    style={{ color: colors.primary }}
                                                    title="Projetar versículo"
                                                >
                                                    <Cast className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleSaveFavorite(r, i)}
                                                    disabled={savingId === i}
                                                    className="text-amber-400 hover:bg-amber-500/20 h-8 px-2"
                                                    title="Guardar como favorito"
                                                >
                                                    <Star className={`w-4 h-4 ${savingId === i ? "animate-pulse" : ""}`} />
                                                </Button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}