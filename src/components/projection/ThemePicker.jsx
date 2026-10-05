import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Palette, Save, Trash2, Plus, X } from "lucide-react";

const FONT_MAP = {
    sans: "Inter, sans-serif",
    serif: "Georgia, serif",
    mono: "monospace",
    cursive: "cursive",
    arial: "Arial, sans-serif",
    georgia: "Georgia, serif",
    times: "'Times New Roman', serif",
    verdana: "Verdana, sans-serif",
};

const SIZE_MAP = {
    xsmall: "0.9rem",
    small: "1.1rem",
    medium: "1.4rem",
    large: "1.8rem",
    xlarge: "2.4rem",
    xxlarge: "3.2rem",
};

export default function ThemePicker({ formData, onApply }) {
    const [themes, setThemes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showSave, setShowSave] = useState(false);
    const [themeName, setThemeName] = useState("");

    const loadThemes = async () => {
        try {
            const data = await base44.entities.ProjectionTheme.list("-updated_date", 50);
            setThemes(data);
        } catch (e) {
            console.error("Erro ao carregar temas:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadThemes();
    }, []);

    const applyTheme = (theme) => {
        onApply({
            text_color: theme.text_color,
            text_color_2: theme.text_color_2 || "",
            font_family: theme.font_family,
            font_size: theme.font_size,
            text_effect: theme.text_effect,
            background_image: theme.background_image || "",
        });
    };

    const saveTheme = async () => {
        if (!themeName.trim()) return;
        try {
            await base44.entities.ProjectionTheme.create({
                name: themeName.trim(),
                text_color: formData.text_color || "#ffffff",
                text_color_2: formData.text_color_2 || "",
                font_family: formData.font_family || "sans",
                font_size: formData.font_size || "large",
                text_effect: formData.text_effect || "shadow",
                background_image: formData.background_image || "",
            });
            setThemeName("");
            setShowSave(false);
            loadThemes();
        } catch (e) {
            console.error("Erro ao guardar tema:", e);
        }
    };

    const deleteTheme = async (id) => {
        if (!confirm("Eliminar este tema?")) return;
        try {
            await base44.entities.ProjectionTheme.delete(id);
            loadThemes();
        } catch (e) {
            console.error("Erro ao eliminar:", e);
        }
    };

    const previewStyle = (theme) => {
        const bg = theme.background_image || "linear-gradient(to br, #1e1b4b, #0f172a)";
        const isUrl = theme.background_image && (theme.background_image.startsWith("http") || theme.background_image.startsWith("data:"));
        return {
            background: isUrl ? `url(${bg})` : bg,
            backgroundSize: "cover",
            backgroundPosition: "center",
        };
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    Temas de Projeção
                </label>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSave(!showSave)}
                    className="text-muted-foreground hover:text-foreground"
                >
                    <Plus className="w-4 h-4 mr-1" />
                    Guardar atual
                </Button>
            </div>

            {showSave && (
                <div className="flex gap-2 p-3 rounded-lg bg-primary/10 border border-border">
                    <Input
                        type="text"
                        placeholder="Nome do tema..."
                        value={themeName}
                        onChange={(e) => setThemeName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveTheme()}
                        className="bg-white/10 border-border text-white placeholder:text-gray-400"
                        autoFocus
                    />
                    <Button
                        type="button"
                        onClick={saveTheme}
                        size="sm"
                        className=" text-white"
                    >
                        <Save className="w-4 h-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSave(false)}
                        className="text-gray-400"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            )}

            {loading ? (
                <p className="text-xs text-muted-foreground">Carregando temas...</p>
            ) : themes.length === 0 ? (
                <p className="text-xs text-muted-foreground/60">
                    Nenhum tema guardado. Personalize o estilo e clique em "Guardar atual".
                </p>
            ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {themes.map((theme) => (
                        <div key={theme.id} className="group relative">
                            <button
                                type="button"
                                onClick={() => applyTheme(theme)}
                                className="w-full h-20 rounded-lg border-2 border-transparent hover:border-primary transition-all overflow-hidden relative flex items-center justify-center"
                                style={previewStyle(theme)}
                                title={theme.name}
                            >
                                <span
                                    style={{
                                        color: theme.text_color || "#fff",
                                        fontFamily: FONT_MAP[theme.font_family] || "sans-serif",
                                        fontSize: "0.85rem",
                                        fontWeight: 700,
                                        textShadow: theme.text_effect === "shadow" ? "1px 1px 4px rgba(0,0,0,0.8)" : "none",
                                    }}
                                >
                                    Aa Bb
                                </span>
                            </button>
                            <p className="text-xs text-center text-muted-foreground mt-1 truncate pr-4">{theme.name}</p>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); deleteTheme(theme.id); }}
                                className="absolute top-1 right-1 w-5 h-5 rounded bg-black/50 text-red-400 hover:bg-red-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}