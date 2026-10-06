import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Search, Music, Book, Loader2, Cast } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { keryx } from "@/api/keryxClient";
import { useThemeColors } from "@/hooks/useThemeColors";
import { searchVerses } from "@/lib/bibleText";

/**
 * Busca unificada — pesquisa músicas (local) e versículos bíblicos (LLM)
 * numa única barra, mostrando resultados combinados.
 *
 * Props:
 *  - songs: array de músicas (para busca local)
 *  - onSelectSong: (song) => void
 *  - onSelectVerse: (verseData) => void
 */
export default function UnifiedSearch({ songs = [], onSelectSong, onSelectVerse }) {
    const colors = useThemeColors();
    const [query, setQuery] = useState("");
    const [bibleResults, setBibleResults] = useState([]);
    const [isSearchingBible, setIsSearchingBible] = useState(false);
    const [bibleSearched, setBibleSearched] = useState(false);

    // Busca local de músicas — instantânea
    const songResults = useMemo(() => {
        if (!query.trim()) return [];
        const q = query.toLowerCase();
        return songs
            .filter(s =>
                s.title?.toLowerCase().includes(q) ||
                s.artist?.toLowerCase().includes(q) ||
                s.lyrics?.toLowerCase().includes(q)
            )
            .slice(0, 6);
    }, [query, songs]);

    // Busca bíblica: na Bíblia instalada (desktop) ou via IA (web) — com debounce
    React.useEffect(() => {
        if (!query.trim() || query.trim().length < 3) {
            setBibleResults([]);
            setBibleSearched(false);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearchingBible(true);
            setBibleSearched(true);
            try {
                const local = await searchVerses(query, "NVI", 5);
                if (local) {
                    setBibleResults(local);
                    return;
                }
                const result = await keryx.integrations.Core.InvokeLLM({
                    prompt: `Pesquise na Bíblia por versículos que contenham a palavra ou frase: "${query}". Retorne até 5 resultados mais relevantes. Para cada resultado retorne: book (nome do livro em português), chapter (número), verse (número), text (texto completo do versículo). Priorize versículos onde a palavra aparece literalmente.`,
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
                                        text: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                });
                setBibleResults(result.results || []);
            } catch (e) {
                console.error("Erro na busca bíblica:", e);
            } finally {
                setIsSearchingBible(false);
            }
        }, keryx.isDesktop ? 350 : 800);

        return () => clearTimeout(timer);
    }, [query]);

    const hasResults = songResults.length > 0 || bibleResults.length > 0;
    const showResults = query.trim().length > 0;

    const handleSelectVerse = (r) => {
        const reference = `${r.book} ${r.chapter}:${r.verse}`;
        onSelectVerse?.({
            reference,
            book: r.book,
            chapter: r.chapter,
            verses: String(r.verse),
            text: `${r.verse} ${r.text}`,
            version: r.version || "NVI",
            slides: [{ text: `${r.verse} ${r.text}`, duration: 12 }],
            text_color: "#ffffff",
            font_size: "large",
        });
    };

    return (
        <div className="relative">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Pesquisar músicas ou versículos bíblicos..."
                    className="pl-9 pr-9 h-11 text-sm bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                />
            </div>

            <AnimatePresence>
                {showResults && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="absolute z-50 mt-2 w-full rounded-xl border border-white/10 bg-[#0a0a0f]/95 backdrop-blur-xl shadow-2xl overflow-hidden"
                    >
                        <div className="max-h-[60vh] overflow-y-auto">
                            {/* Músicas */}
                            {songResults.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 bg-white/5">
                                        <Music className="w-3 h-3" /> Músicas ({songResults.length})
                                    </div>
                                    {songResults.map((song) => (
                                        <button
                                            key={song.id}
                                            onClick={() => {
                                                onSelectSong?.(song);
                                                setQuery("");
                                            }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors group"
                                        >
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                                style={{ background: `${colors.primary}22` }}>
                                                <Music className="w-3.5 h-3.5" style={{ color: colors.primary }} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-white truncate">{song.title}</p>
                                                <p className="text-xs text-gray-500 truncate">{song.artist || "Artista desconhecido"}</p>
                                            </div>
                                            <Cast className="w-3.5 h-3.5 text-gray-600 group-hover:text-white transition-colors" />
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Bíblia */}
                            <div>
                                <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 bg-white/5">
                                    <Book className="w-3 h-3" /> Bíblia
                                    {isSearchingBible && <Loader2 className="w-3 h-3 animate-spin" />}
                                </div>
                                {isSearchingBible && bibleResults.length === 0 ? (
                                    <div className="px-3 py-4 text-center text-xs text-gray-500">
                                        A pesquisar na Bíblia...
                                    </div>
                                ) : bibleResults.length === 0 && bibleSearched ? (
                                    <div className="px-3 py-4 text-center text-xs text-gray-500">
                                        Nenhum versículo encontrado
                                    </div>
                                ) : (
                                    bibleResults.map((r, i) => (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                handleSelectVerse(r);
                                                setQuery("");
                                            }}
                                            className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors group"
                                        >
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                                                style={{ background: `${colors.secondary}22` }}>
                                                <Book className="w-3.5 h-3.5" style={{ color: colors.secondary }} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <span className="inline-block text-xs font-semibold px-1.5 py-0.5 rounded mb-1"
                                                    style={{ color: colors.secondary, background: `${colors.secondary}18` }}>
                                                    {r.book} {r.chapter}:{r.verse}
                                                </span>
                                                <p className="text-xs text-gray-300 line-clamp-2">{r.text}</p>
                                            </div>
                                            <Cast className="w-3.5 h-3.5 text-gray-600 group-hover:text-white transition-colors mt-1" />
                                        </button>
                                    ))
                                )}
                            </div>

                            {!hasResults && !isSearchingBible && (
                                <div className="px-3 py-6 text-center text-sm text-gray-500">
                                    Nenhum resultado para "{query}"
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}