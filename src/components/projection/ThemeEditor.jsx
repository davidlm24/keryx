import React, { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Palette, Save, Trash2, Plus, X, Type, Image, Square } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useThemeColors } from "@/hooks/useThemeColors";

const ELEMENT_TYPES = {
    title: { icon: Type, label: "Título", defaultW: 80, defaultH: 10 },
    lyrics: { icon: Type, label: "Letra", defaultW: 80, defaultH: 60 },
    image: { icon: Image, label: "Imagem", defaultW: 30, defaultH: 30 },
    background: { icon: Square, label: "Fundo", defaultW: 100, defaultH: 100 },
};

/**
 * Editor visual de temas — permite posicionar elementos (título, letra, imagem)
 * arrastando numa área 16:9, com controlo de z-index e alinhamento.
 * Os elementos posicionados são guardados no ProjectionTheme.
 *
 * Props:
 *  - theme: tema atual (ProjectionTheme)
 *  - onChange: (theme) => void
 */
export default function ThemeEditor({ theme, onChange }) {
    const colors = useThemeColors();
    const canvasRef = useRef(null);
    const [dragging, setDragging] = useState(null);

    const elements = theme?.elements || [];

    const addElement = (type) => {
        const config = ELEMENT_TYPES[type];
        const newEl = {
            id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type,
            x: type === "background" ? 0 : 10,
            y: type === "background" ? 0 : 10,
            width: config.defaultW,
            height: config.defaultH,
            z_index: type === "background" ? 0 : type === "lyrics" ? 2 : 3,
            alignment: "center",
            properties: {},
        };
        onChange({ ...theme, elements: [...elements, newEl] });
    };

    const updateElement = (id, patch) => {
        onChange({
            ...theme,
            elements: elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
        });
    };

    const removeElement = (id) => {
        onChange({ ...theme, elements: elements.filter((el) => el.id !== id) });
    };

    const handleMouseDown = (e, el) => {
        if (el.type === "background") return;
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        setDragging({
            id: el.id,
            startX: e.clientX,
            startY: e.clientY,
            origX: el.x,
            origY: el.y,
            canvasW: rect.width,
            canvasH: rect.height,
        });
    };

    const handleMouseMove = useCallback((e) => {
        if (!dragging) return;
        const dx = ((e.clientX - dragging.startX) / dragging.canvasW) * 100;
        const dy = ((e.clientY - dragging.startY) / dragging.canvasH) * 100;
        updateElement(dragging.id, {
            x: Math.max(0, Math.min(80, dragging.origX + dx)),
            y: Math.max(0, Math.min(90, dragging.origY + dy)),
        });
    }, [dragging]);

    const handleMouseUp = useCallback(() => setDragging(null), []);

    React.useEffect(() => {
        if (dragging) {
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);
            return () => {
                window.removeEventListener("mousemove", handleMouseMove);
                window.removeEventListener("mouseup", handleMouseUp);
            };
        }
    }, [dragging, handleMouseMove, handleMouseUp]);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2" style={{ color: colors.primary }}>
                    <Palette className="w-4 h-4" />
                    Editor de Tema Visual
                </label>
                <div className="flex gap-1">
                    {Object.entries(ELEMENT_TYPES).map(([type, config]) => {
                        const Icon = config.icon;
                        return (
                            <Button key={type} type="button" variant="ghost" size="sm"
                                onClick={() => addElement(type)}
                                className="text-xs h-7" style={{ color: colors.primary }}>
                                <Plus className="w-3 h-3" /> {config.label}
                            </Button>
                        );
                    })}
                </div>
            </div>

            {/* Canvas 16:9 para posicionamento */}
            <div
                ref={canvasRef}
                className="relative w-full aspect-video rounded-xl border border-white/10 overflow-hidden"
                style={{ background: theme?.background_image ? `url(${theme.background_image})` : "#0a0a0f", backgroundSize: "cover", backgroundPosition: "center" }}
            >
                {elements.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-600">
                        Adicione elementos para posicionar
                    </div>
                ) : (
                    elements
                        .sort((a, b) => a.z_index - b.z_index)
                        .map((el) => {
                            const isSelected = dragging?.id === el.id;
                            return (
                                <div
                                    key={el.id}
                                    onMouseDown={(e) => handleMouseDown(e, el)}
                                    className={`absolute rounded-md transition-colors ${el.type === "background" ? "pointer-events-none" : "cursor-move"}`}
                                    style={{
                                        left: `${el.x}%`,
                                        top: `${el.y}%`,
                                        width: `${el.width}%`,
                                        height: `${el.type === "background" ? "100%" : `${el.height}%`}`,
                                        zIndex: el.z_index,
                                        border: el.type === "background" ? "none" : isSelected ? `2px solid ${colors.primary}` : "1px dashed rgba(255,255,255,0.3)",
                                        background: el.type === "background" ? "transparent" : el.type === "title" ? `${colors.primary}15` : el.type === "lyrics" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.08)",
                                    }}
                                >
                                    <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400 font-medium pointer-events-none">
                                        {ELEMENT_TYPES[el.type]?.label}
                                    </div>
                                    {el.type !== "background" && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeElement(el.id); }}
                                            className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                                        >
                                            <X className="w-2.5 h-2.5" />
                                        </button>
                                    )}
                                </div>
                            );
                        })
                )}
            </div>

            {/* Lista de elementos com controlos */}
            {elements.filter((el) => el.type !== "background").length > 0 && (
                <div className="space-y-1.5">
                    {elements.filter((el) => el.type !== "background").map((el) => (
                        <div key={el.id} className="flex items-center gap-2 p-2 rounded-lg"
                            style={{ background: "rgba(255,255,255,0.04)" }}>
                            <span className="text-xs text-gray-300 w-16">{ELEMENT_TYPES[el.type]?.label}</span>
                            <Input type="number" value={Math.round(el.x)} onChange={(e) => updateElement(el.id, { x: Number(e.target.value) })}
                                className="h-6 w-12 text-xs bg-white/5 border-white/10 text-white" />
                            <Input type="number" value={Math.round(el.y)} onChange={(e) => updateElement(el.id, { y: Number(e.target.value) })}
                                className="h-6 w-12 text-xs bg-white/5 border-white/10 text-white" />
                            <Input type="number" value={Math.round(el.width)} onChange={(e) => updateElement(el.id, { width: Number(e.target.value) })}
                                className="h-6 w-12 text-xs bg-white/5 border-white/10 text-white" />
                            <Input type="number" value={Math.round(el.height)} onChange={(e) => updateElement(el.id, { height: Number(e.target.value) })}
                                className="h-6 w-12 text-xs bg-white/5 border-white/10 text-white" />
                            <button onClick={() => removeElement(el.id)} className="text-red-400 hover:text-red-300 ml-auto">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <p className="text-[10px] text-gray-500 italic">
                Arraste os elementos no canvas para reposicionar. Os valores X/Y/Largura/Altura são percentagens.
            </p>
        </div>
    );
}