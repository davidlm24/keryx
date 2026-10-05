import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Pencil, Trash2, Music, Heart, Printer, ChevronDown, ChevronRight, User, Video, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useThemeColors } from "@/hooks/useThemeColors";
import PullToRefresh from "@/components/PullToRefresh";

const ALPHABET = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","#"];

function getLetter(str) {
    const letter = (str?.[0] || "#").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return /[A-Z]/.test(letter) ? letter : "#";
}

export default function SongList({ songs, onPlay, onEdit, onDelete, onToggleFavorite, onPrint, onRefresh }) {
    const colors = useThemeColors();
    const [selectedLetter, setSelectedLetter] = useState(null);
    const [expandedArtists, setExpandedArtists] = useState({});

    // Agrupar por letra do artista, depois por artista
    const grouped = useMemo(() => {
        const groups = {};
        songs.forEach(song => {
            const letter = getLetter(song.artist || song.title);
            if (!groups[letter]) groups[letter] = {};
            const artist = song.artist || "Artista desconhecido";
            if (!groups[letter][artist]) groups[letter][artist] = [];
            groups[letter][artist].push(song);
        });
        // Ordenar músicas dentro de cada artista por título
        Object.values(groups).forEach(letterGroup => {
            Object.values(letterGroup).forEach(artistSongs => {
                artistSongs.sort((a, b) => (a.title || "").localeCompare((b.title || ""), "pt"));
            });
        });
        return groups;
    }, [songs]);

    const availableLetters = useMemo(() =>
        ALPHABET.filter(l => grouped[l] && Object.keys(grouped[l]).length > 0),
    [grouped]);

    const lettersToShow = selectedLetter ? [selectedLetter] : availableLetters;

    const toggleArtist = (artist) => {
        setExpandedArtists(prev => ({ ...prev, [artist]: !prev[artist] }));
    };

    return (
        <PullToRefresh onRefresh={onRefresh}>
        <div className="flex gap-4">
            {/* Lista principal */}
            <div className="flex-1 space-y-6">
                {lettersToShow.map(letter => {
                    const artists = grouped[letter] || {};
                    const artistNames = Object.keys(artists).sort((a, b) => a.localeCompare(b, "pt"));
                    const totalSongs = artistNames.reduce((sum, a) => sum + artists[a].length, 0);

                    return (
                        <div key={letter}>
                            {/* Separador de letra */}
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg"
                                    style={{ background: `${colors.primary}40`, border: `1px solid ${colors.primary}40`, color: colors.primary }}>
                                    {letter}
                                </div>
                                <div className="flex-1 h-px" style={{ background: `${colors.primary}30` }}></div>
                                <span className="text-xs" style={{ color: `${colors.primary}99` }}>
                                    {totalSongs} música{totalSongs !== 1 ? "s" : ""} • {artistNames.length} artista{artistNames.length !== 1 ? "s" : ""}
                                </span>
                            </div>

                            {/* Artistas sob esta letra */}
                            <div className="space-y-2">
                                {artistNames.map(artist => {
                                    const artistSongs = artists[artist];
                                    const isExpanded = selectedLetter ? true : expandedArtists[artist];
                                    return (
                                        <div key={artist} className="rounded-lg overflow-hidden"
                                            style={{ border: `1px solid ${colors.primary}25`, background: `${colors.primary}15` }}>
                                            <button
                                                onClick={() => toggleArtist(artist)}
                                                className="w-full flex items-center gap-3 p-3 transition-colors"
                                                style={{ background: "transparent" }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = `${colors.primary}15`}
                                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                                            >
                                                <div className="p-2 rounded-lg shrink-0" style={{ background: `${colors.primary}30` }}>
                                                    <User className="w-4 h-4" style={{ color: colors.primary }} />
                                                </div>
                                                <div className="flex-1 text-left min-w-0">
                                                    <h3 className="font-semibold text-white truncate">{artist}</h3>
                                                    <p className="text-xs" style={{ color: `${colors.primary}cc` }}>{artistSongs.length} música{artistSongs.length !== 1 ? "s" : ""}</p>
                                                </div>
                                                {isExpanded
                                                    ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: colors.primary }} />
                                                    : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: colors.primary }} />}
                                            </button>
                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: "auto", opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="px-3 pb-3 space-y-2">
                                                            {artistSongs.map((song, index) => (
                                                                <motion.div
                                                                    key={song.id}
                                                                    initial={{ opacity: 0, x: -10 }}
                                                                    animate={{ opacity: 1, x: 0 }}
                                                                    transition={{ delay: index * 0.02 }}
                                                                >
                                                                    <Card className="ml-11 transition-all"
                                                                        style={{
                                                                            background: `linear-gradient(to bottom right, ${colors.primary}25, ${colors.secondary}25)`,
                                                                            border: `1px solid ${colors.primary}30`
                                                                        }}>
                                                                        <CardContent className="p-3">
                                                                            <div className="flex items-center justify-between gap-3">
                                                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                                    <Music className="w-4 h-4 shrink-0" style={{ color: colors.primary }} />
                                                                                    <div className="min-w-0">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <h4 className="font-medium text-white truncate">{song.title}</h4>
                                                                                            {song.is_favorite && (
                                                                                                <Heart className="w-3 h-3 text-pink-400 fill-pink-400 shrink-0" />
                                                                                            )}
                                                                                            {song.audio_url ? (
                                                                                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                                                                                                    <Video className="w-2.5 h-2.5" />Vídeo
                                                                                                </span>
                                                                                            ) : (
                                                                                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                                                                                                    <FileText className="w-2.5 h-2.5" />Só letra
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                        <p className="text-xs" style={{ color: `${colors.primary}cc` }}>
                                                                                            {song.slides?.length || 0} slides
                                                                                            {song.song_key ? ` • Tom: ${song.song_key}` : ""}
                                                                                            {song.bpm ? ` • ${song.bpm} BPM` : ""}
                                                                                            {song.play_count > 0 ? ` • Tocada ${song.play_count}x` : ""}
                                                                                        </p>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="flex gap-1 shrink-0">
                                                                                    {onToggleFavorite && (
                                                                                        <Button
                                                                                            onClick={() => onToggleFavorite(song)}
                                                                                            size="sm"
                                                                                            variant="ghost"
                                                                                            className={`h-8 w-8 p-0 ${song.is_favorite ? "text-pink-400 hover:text-pink-300" : "text-gray-400 hover:text-pink-400"}`}
                                                                                        >
                                                                                            <Heart className={`w-3.5 h-3.5 ${song.is_favorite ? "fill-current" : ""}`} />
                                                                                        </Button>
                                                                                    )}
                                                                                    {onPrint && (
                                                                                        <Button
                                                                                            onClick={() => onPrint(song)}
                                                                                            size="sm"
                                                                                            variant="ghost"
                                                                                            className="text-gray-400 hover:text-white h-8 w-8 p-0"
                                                                                            title="Imprimir letra"
                                                                                        >
                                                                                            <Printer className="w-3.5 h-3.5" />
                                                                                        </Button>
                                                                                    )}
                                                                                    <Button
                                                                                        onClick={() => onPlay(song)}
                                                                                        size="sm"
                                                                                        className="text-white h-8"
                                                                                        style={{ background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}
                                                                                    >
                                                                                        <Play className="w-3.5 h-3.5 mr-1" />
                                                                                        Projetar
                                                                                    </Button>
                                                                                    <Button
                                                                                        onClick={() => onEdit(song)}
                                                                                        size="sm"
                                                                                        variant="outline"
                                                                                        className="h-8 w-8 p-0"
                                                                                        style={{ borderColor: `${colors.primary}50` }}
                                                                                    >
                                                                                        <Pencil className="w-3.5 h-3.5" />
                                                                                    </Button>
                                                                                    <Button
                                                                                        onClick={() => onDelete(song)}
                                                                                        size="sm"
                                                                                        variant="outline"
                                                                                        className="border-red-500/30 hover:bg-red-500/10 text-red-400 h-8 w-8 p-0"
                                                                                    >
                                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                                    </Button>
                                                                                </div>
                                                                            </div>
                                                                        </CardContent>
                                                                    </Card>
                                                                </motion.div>
                                                            ))}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}

                {lettersToShow.length === 0 && (
                    <div className="text-center py-12" style={{ color: colors.primary }}>Nenhuma música encontrada.</div>
                )}
            </div>

        </div>
        </PullToRefresh>
    );
}