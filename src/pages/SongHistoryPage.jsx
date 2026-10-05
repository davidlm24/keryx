import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Clock, TrendingUp, Music, Calendar } from "lucide-react";
import moment from "moment";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function SongHistoryPage() {
    const colors = useThemeColors();

    const { data: history, isLoading } = useQuery({
        queryKey: ["songHistory"],
        queryFn: () => base44.entities.SongHistory.list("-played_at", 100),
        initialData: [],
    });

    const { data: songs } = useQuery({
        queryKey: ["songs"],
        queryFn: () => base44.entities.Song.list("title"),
        initialData: [],
    });

    const topSongs = useMemo(() => {
        const counts = {};
        history.forEach(h => {
            const key = h.song_title;
            if (!counts[key]) counts[key] = { title: key, artist: h.song_artist, count: 0 };
            counts[key].count++;
        });
        return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 10);
    }, [history]);

    const recentHistory = useMemo(() => {
        return [...history].sort((a, b) => new Date(b.played_at) - new Date(a.played_at)).slice(0, 30);
    }, [history]);

    const todayCount = useMemo(() => {
        const today = moment().startOf("day");
        return history.filter(h => moment(h.played_at).isAfter(today)).length;
    }, [history]);

    const weekCount = useMemo(() => {
        const week = moment().subtract(7, "days");
        return history.filter(h => moment(h.played_at).isAfter(week)).length;
    }, [history]);

    return (
        <div className="p-6">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-4xl font-bold mb-2 bg-clip-text text-transparent"
                    style={{ backgroundImage: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}>
                    Histórico e Estatísticas
                </h1>
                <p className="mb-6" style={{ color: colors.primary }}>Músicas mais tocadas e histórico de reprodução</p>

                {/* Cards de resumo */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <Card className="bg-gradient-to-br from-accent/20 to-primary/20 border-accent/30">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-accent/20 p-3 rounded-lg">
                                    <Music className="w-6 h-6 text-accent" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-white">{songs.length}</p>
                                    <p className="text-accent text-xs">Músicas cadastradas</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/30 border-green-500/30">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-green-600/30 p-3 rounded-lg">
                                    <Calendar className="w-6 h-6 text-green-300" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-white">{todayCount}</p>
                                    <p className="text-green-300 text-xs">Tocadas hoje</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-blue-900/30 to-cyan-900/30 border-blue-500/30">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-600/30 p-3 rounded-lg">
                                    <TrendingUp className="w-6 h-6 text-blue-300" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-white">{weekCount}</p>
                                    <p className="text-blue-300 text-xs">Esta semana</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-amber-900/30 to-yellow-900/30 border-amber-500/30">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-amber-600/30 p-3 rounded-lg">
                                    <Clock className="w-6 h-6 text-amber-300" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-white">{history.length}</p>
                                    <p className="text-amber-300 text-xs">Total de reproduções</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Gráfico de mais tocadas */}
                    <Card className="bg-gradient-to-br from-accent/20 to-primary/20 border-accent/30">
                        <CardHeader>
                            <CardTitle className="text-accent-foreground flex items-center gap-2">
                                <TrendingUp className="w-5 h-5" />
                                Top 10 Músicas Mais Tocadas
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {topSongs.length === 0 ? (
                                <p className="text-gray-400 text-center py-8">Ainda não há dados de reprodução</p>
                            ) : (
                                <ResponsiveContainer width="100%" height={350}>
                                    <BarChart data={topSongs} layout="vertical" margin={{ left: 20, right: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                                        <XAxis type="number" stroke="#ffffff60" fontSize={12} />
                                        <YAxis
                                            type="category"
                                            dataKey="title"
                                            stroke="#ffffff60"
                                            fontSize={11}
                                            width={120}
                                            tickFormatter={(v) => v.length > 18 ? v.substring(0, 18) + "…" : v}
                                        />
                                        <Tooltip
                                            contentStyle={{ background: "#252220", border: "1px solid #7d8470", borderRadius: 8 }}
                                            labelStyle={{ color: "#fff" }}
                                        />
                                        <Bar dataKey="count" fill={colors.primary} radius={[0, 6, 6, 0]} name="Vezes tocada" />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>

                    {/* Histórico recente */}
                    <Card className="bg-gradient-to-br from-blue-900/20 to-cyan-900/20 border-blue-500/30">
                        <CardHeader>
                            <CardTitle className="text-blue-100 flex items-center gap-2">
                                <Clock className="w-5 h-5" />
                                Histórico Recente
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <p className="text-gray-400 text-center py-8">Carregando...</p>
                            ) : recentHistory.length === 0 ? (
                                <p className="text-gray-400 text-center py-8">Nenhuma reprodução registada</p>
                            ) : (
                                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2">
                                    {recentHistory.map((h, i) => (
                                        <div key={h.id || i} className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
                                            <div className="w-8 h-8 rounded-full bg-blue-600/30 flex items-center justify-center shrink-0">
                                                <Music className="w-4 h-4 text-blue-300" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-sm font-medium truncate">{h.song_title}</p>
                                                <p className="text-blue-300 text-xs truncate">
                                                    {h.song_artist || "Artista desconhecido"}
                                                </p>
                                            </div>
                                            <p className="text-gray-400 text-xs shrink-0">
                                                {moment(h.played_at).format("DD/MM HH:mm")}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}