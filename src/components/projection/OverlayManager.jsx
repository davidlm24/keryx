import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Layers, Plus, Trash2, Eye, EyeOff, GripVertical, Upload, Loader2 } from "lucide-react";
import { keryx } from "@/api/keryxClient";
import { useThemeColors } from "@/hooks/useThemeColors";

/**
 * Gestor de camadas (overlays) — permite adicionar logos, anúncios e texto
 * sobrepostos à projeção principal, com controlo de opacidade e posição.
 *
 * Props:
 *  - overlays: array de overlays
 *  - onChange: (overlays) => void
 */
export default function OverlayManager({ overlays = [], onChange }) {
    const colors = useThemeColors();
    const [uploading, setUploading] = useState(null);

    const addOverlay = (type) => {
        const newOverlay = {
            id: `ov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type,
            content: type === "logo" || type === "image" ? "" : "Novo anúncio",
            x: 5,
            y: 5,
            width: type === "logo" || type === "image" ? 15 : 40,
            opacity: 1,
            z_index: 10,
            enabled: true,
        };
        onChange([...overlays, newOverlay]);
    };

    const updateOverlay = (id, patch) => {
        onChange(overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    };

    const removeOverlay = (id) => {
        onChange(overlays.filter((o) => o.id !== id));
    };

    const toggleOverlay = (id) => {
        onChange(overlays.map((o) => (o.id === id ? { ...o, enabled: !o.enabled } : o)));
    };

    const handleUpload = async (id, file) => {
        if (!file) return;
        setUploading(id);
        try {
            const { file_url } = await keryx.integrations.Core.UploadFile({ file });
            updateOverlay(id, { content: file_url });
        } catch (e) {
            console.error("Erro no upload:", e);
        } finally {
            setUploading(null);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2" style={{ color: colors.primary }}>
                    <Layers className="w-4 h-4" />
                    Camadas (Overlays)
                </label>
                <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => addOverlay("logo")}
                        className="text-xs h-7" style={{ color: colors.primary }}>
                        <Plus className="w-3 h-3" /> Logo
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => addOverlay("announcement")}
                        className="text-xs h-7" style={{ color: colors.primary }}>
                        <Plus className="w-3 h-3" /> Anúncio
                    </Button>
                </div>
            </div>

            {overlays.length === 0 ? (
                <p className="text-xs text-gray-500 italic px-2">
                    Nenhuma camada ativa. Adicione um logo ou anúncio para sobrepor à projeção.
                </p>
            ) : (
                <div className="space-y-2">
                    {overlays.map((o) => (
                        <div
                            key={o.id}
                            className={`rounded-lg border p-2.5 space-y-2 transition-opacity ${!o.enabled ? "opacity-50" : ""}`}
                            style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}
                        >
                            <div className="flex items-center gap-2">
                                <GripVertical className="w-3 h-3 text-gray-500 shrink-0" />
                                <span className="text-xs font-medium text-gray-300 flex-1">
                                    {o.type === "logo" ? "Logo" : o.type === "image" ? "Imagem" : "Anúncio"}
                                </span>
                                <button onClick={() => toggleOverlay(o.id)} className="text-gray-400 hover:text-white">
                                    {o.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => removeOverlay(o.id)} className="text-red-400 hover:text-red-300">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {o.type === "logo" || o.type === "image" ? (
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-1.5 cursor-pointer text-xs px-2 py-1.5 rounded-md transition-colors"
                                        style={{ background: "rgba(255,255,255,0.08)", color: colors.primary }}>
                                        {uploading === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                                        {o.content ? "Trocar" : "Enviar imagem"}
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            className="hidden"
                                            onChange={(e) => handleUpload(o.id, e.target.files?.[0])}
                                        />
                                    </label>
                                    {o.content && (
                                        <img src={o.content} alt="" className="w-8 h-8 object-contain rounded" />
                                    )}
                                </div>
                            ) : (
                                <Input
                                    value={o.content}
                                    onChange={(e) => updateOverlay(o.id, { content: e.target.value })}
                                    placeholder="Texto do anúncio..."
                                    className="h-7 text-xs bg-white/5 border-white/10 text-white"
                                />
                            )}

                            {/* Posição e opacidade */}
                            <div className="grid grid-cols-3 gap-1.5">
                                <div>
                                    <label className="text-[10px] text-gray-500">X (%)</label>
                                    <Input
                                        type="number" min={0} max={100} value={Math.round(o.x ?? 0)}
                                        onChange={(e) => updateOverlay(o.id, { x: Number(e.target.value) })}
                                        className="h-6 text-xs bg-white/5 border-white/10 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500">Y (%)</label>
                                    <Input
                                        type="number" min={0} max={100} value={Math.round(o.y ?? 0)}
                                        onChange={(e) => updateOverlay(o.id, { y: Number(e.target.value) })}
                                        className="h-6 text-xs bg-white/5 border-white/10 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500">Larg. (%)</label>
                                    <Input
                                        type="number" min={1} max={100} value={Math.round(o.width ?? 20)}
                                        onChange={(e) => updateOverlay(o.id, { width: Number(e.target.value) })}
                                        className="h-6 text-xs bg-white/5 border-white/10 text-white"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-500 flex justify-between">
                                    <span>Opacidade</span><span>{Math.round((o.opacity ?? 1) * 100)}%</span>
                                </label>
                                <input
                                    type="range" min={0} max={1} step={0.05} value={o.opacity ?? 1}
                                    onChange={(e) => updateOverlay(o.id, { opacity: Number(e.target.value) })}
                                    className="w-full h-1 accent-white"
                                    style={{ accentColor: colors.primary }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}