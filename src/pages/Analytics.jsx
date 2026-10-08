import React, { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import { Music, Clock, TrendingUp, BarChart3, Calendar, FileText, Copy } from "lucide-react";
import { useThemeColors } from "@/hooks/useThemeColors";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";

const PIE_COLORS = ["#7d8470", "#c9a86a", "#9c8861", "#d4b87a", "#6b7263", "#b8945a"];

export default function Analytics() {
    // Desktop: Estatísticas are the console's Relatórios. The web build keeps this page for now.
    if (keryx.isDesktop) return <Navigate to="/Console?reports=1" replace />;
    return <LegacyAnalytics />;
}

function LegacyAnalytics() {
    const colors = useThemeColors();

    const { data: songs } = useQuery({ queryKey: ["songs"], queryFn: () => keryx.entities.Song.list(), initialData: [] });
    const { data: history } = useQuery({ queryKey: ["songHistory"], queryFn: () => keryx.entities.SongHistory.list("-played_at", 200), initialData: [] });
    const { data: services } = useQuery({ queryKey: ["services"], queryFn: () => keryx.entities.Service.list("-date", 50), initialData: [] });

    const stats = useMemo(() => {
        const topSongs = {};
        (history || []).forEach(h => {
            const key = h.song_title;
            if (!topSongs[key]) topSongs[key] = { title: h.song_title, artist: h.song_artist, count: 0 };
            topSongs[key].count++;
        });
        const top = Object.values(topSongs).sort((a, b) => b.count - a.count).slice(0, 10);

        const byCategory = {};
        (songs || []).forEach(s => {
            const cat = s.category || "other";
            byCategory[cat] = (byCategory[cat] || 0) + 1;
        });
        const categoryData = Object.entries(byCategory).map(([name, value]) => ({ name, value }));

        const byMonth = {};
        (services || []).forEach(s => {
            const month = (s.date || "").slice(0, 7);
            if (month) byMonth[month] = (byMonth[month] || 0) + 1;
        });
        const monthData = Object.entries(byMonth).sort().slice(-6).map(([name, value]) => ({ name, value }));

        const ccliSongs = (songs || []).filter(s => s.ccli_number);
        const ccliReport = ccliSongs.map(s => {
            const plays = (history || []).filter(h => h.song_title === s.title).length;
            return { title: s.title, artist: s.artist, ccli: s.ccli_number, plays };
        }).sort((a, b) => b.plays - a.plays);

        return {
            totalSongs: (songs || []).length,
            totalPlays: (history || []).length,
            totalServices: (services || []).length,
            top,
            categoryData,
            monthData,
            ccliReport,
        };
    }, [songs, history, services]);

    const cards = [
        { icon: Music, label: "Músicas", value: stats.totalSongs, color: "#7d8470" },
        { icon: TrendingUp, label: "Projeções", value: stats.totalPlays, color: "#c9a86a" },
        { icon: Calendar, label: "Cultos", value: stats.totalServices, color: "#9c8861" },
    ];

    return (
        <div className="p-4 md:p-6 min-h-screen bg-background">
            <div className="max-w-5xl mx-auto">
                <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                    <BarChart3 className="w-6 h-6" style={{ color: colors.primary }} />
                    Estatísticas de Uso
                </h1>

                <div className="grid grid-cols-3 gap-3 mb-6">
                    {cards.map(c => (
                        <div key={c.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                            <c.icon className="w-5 h-5 mb-2" style={{ color: c.color }} />
                            <p className="text-2xl font-bold text-white">{c.value}</p>
                            <p className="text-xs text-gray-400">{c.label}</p>
                        </div>
                    ))}
                </div>

                {stats.top.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-6">
                        <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" /> Top Músicas Projetadas
                        </h2>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={stats.top.slice(0, 8)} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                                <XAxis type="number" stroke="#666" fontSize={12} />
                                <YAxis type="category" dataKey="title" stroke="#999" fontSize={11} width={120} tick={{ fill: "#ccc" }} />
                                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #ffffff20", borderRadius: 8, color: "#fff" }} />
                                <Bar dataKey="count" fill={colors.primary} radius={[0, 6, 6, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {stats.categoryData.length > 0 && (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                            <h2 className="text-sm font-semibold text-gray-300 mb-4">Músicas por Categoria</h2>
                            <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                    <Pie data={stats.categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={{ fill: "#ccc", fontSize: 11 }}>
                                        {stats.categoryData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #ffffff20", borderRadius: 8 }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                    {stats.monthData.length > 0 && (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                            <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                                <Clock className="w-4 h-4" /> Cultos por Mês
                            </h2>
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={stats.monthData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                                    <XAxis dataKey="name" stroke="#666" fontSize={11} />
                                    <YAxis stroke="#666" fontSize={11} />
                                    <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #ffffff20", borderRadius: 8 }} />
                                    <Bar dataKey="value" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* Relatório CCLI */}
                {stats.ccliReport.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 mt-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                <FileText className="w-4 h-4" /> Relatório CCLI
                            </h2>
                            <button
                                onClick={() => {
                                    const text = stats.ccliReport.map(s => `${s.title}\t${s.artist || ""}\t${s.ccli}\t${s.plays}`).join("\n");
                                    navigator.clipboard.writeText(`Música\tArtista\tCCLI\tProjeções\n${text}`);
                                }}
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
                            >
                                <Copy className="w-3 h-3" /> Copiar
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-400 border-b border-white/10">
                                        <th className="py-2 pr-4">Música</th>
                                        <th className="py-2 pr-4">Artista</th>
                                        <th className="py-2 pr-4">CCLI</th>
                                        <th className="py-2 pr-4 text-right">Projeções</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.ccliReport.map((s, i) => (
                                        <tr key={i} className="border-b border-white/5 text-gray-300">
                                            <td className="py-2 pr-4">{s.title}</td>
                                            <td className="py-2 pr-4 text-gray-400">{s.artist}</td>
                                            <td className="py-2 pr-4 font-mono text-muted-foreground">{s.ccli}</td>
                                            <td className="py-2 pr-4 text-right">{s.plays}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}