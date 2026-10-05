import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Music, Film, BookOpen, Search as SearchIcon } from "lucide-react";
import { useThemeColors } from "@/hooks/useThemeColors";
import { motion } from "framer-motion";

export default function GlobalSearch() {
    const colors = useThemeColors();
    const navigate = useNavigate();
    const [query, setQuery] = useState("");

    const { data: songs } = useQuery({ queryKey: ["songs"], queryFn: () => base44.entities.Song.list(), initialData: [] });
    const { data: media } = useQuery({ queryKey: ["media"], queryFn: () => base44.entities.Media.list(), initialData: [] });
    const { data: materials } = useQuery({ queryKey: ["bibleMaterials"], queryFn: () => base44.entities.BibleMaterial.list(), initialData: [] });

    const results = useMemo(() => {
        if (!query.trim()) return { songs: [], media: [], materials: [] };
        const q = query.toLowerCase();
        return {
            songs: (songs || []).filter(s => (s.title || "").toLowerCase().includes(q) || (s.artist || "").toLowerCase().includes(q)).slice(0, 5),
            media: (media || []).filter(m => (m.title || "").toLowerCase().includes(q)).slice(0, 5),
            materials: (materials || []).filter(m => (m.title || "").toLowerCase().includes(q)).slice(0, 5),
        };
    }, [query, songs, media, materials]);

    const total = results.songs.length + results.media.length + results.materials.length;

    const ResultRow = ({ icon, label, sub, onClick, accent }) => (
        <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={onClick}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-colors"
        >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${accent}20` }}>
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-white font-medium truncate">{label}</p>
                {sub && <p className="text-gray-400 text-xs truncate">{sub}</p>}
            </div>
        </motion.button>
    );

    return (
        <div className="p-4 md:p-6 min-h-screen bg-background">
            <div className="max-w-3xl mx-auto">
                <h1 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                    <SearchIcon className="w-6 h-6" style={{ color: colors.primary }} />
                    Busca Global
                </h1>
                <Input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Procurar em músicas, média e materiais bíblicos..."
                    className="bg-white/10 text-white placeholder:text-gray-400 mb-4"
                    style={{ borderColor: `${colors.primary}50` }}
                />

                {query.trim() && total === 0 && (
                    <p className="text-center text-gray-500 py-12">Nenhum resultado para "{query}"</p>
                )}

                {!query.trim() && (
                    <p className="text-center text-gray-500 py-12">Escreve para procurar em todo o conteúdo</p>
                )}

                <div className="space-y-4">
                    {results.songs.length > 0 && (
                        <div className="space-y-2">
                            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Músicas</h2>
                            {results.songs.map(s => (
                                <ResultRow
                                    key={s.id}
                                    icon={<Music className="w-5 h-5" style={{ color: colors.primary }} />}
                                    label={s.title}
                                    sub={s.artist}
                                    accent={colors.primary}
                                    onClick={() => navigate("/")}
                                />
                            ))}
                        </div>
                    )}
                    {results.media.length > 0 && (
                        <div className="space-y-2">
                            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Média</h2>
                            {results.media.map(m => (
                                <ResultRow
                                    key={m.id}
                                    icon={<Film className="w-5 h-5 text-accent" />}
                                    label={m.title}
                                    sub={m.type}
                                    accent="#c9a86a"
                                    onClick={() => navigate("/Media")}
                                />
                            ))}
                        </div>
                    )}
                    {results.materials.length > 0 && (
                        <div className="space-y-2">
                            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Materiais Bíblicos</h2>
                            {results.materials.map(m => (
                                <ResultRow
                                    key={m.id}
                                    icon={<BookOpen className="w-5 h-5 text-amber-400" />}
                                    label={m.title}
                                    sub={m.subject}
                                    accent="#f59e0b"
                                    onClick={() => navigate("/BibleSchool")}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}