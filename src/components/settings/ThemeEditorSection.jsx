import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Palette, Save, Plus, Trash2, Check } from "lucide-react";
import ThemeEditor from "@/components/projection/ThemeEditor";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function ThemeEditorSection({ isMobile }) {
    const colors = useThemeColors();
    const [themes, setThemes] = useState([]);
    const [selectedTheme, setSelectedTheme] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [newName, setNewName] = useState("");

    useEffect(() => {
        loadThemes();
    }, []);

    const loadThemes = async () => {
        setIsLoading(true);
        try {
            const list = await base44.entities.ProjectionTheme.list();
            setThemes(list);
            if (list.length > 0 && !selectedTheme) {
                setSelectedTheme(list[0]);
            }
        } catch (e) {
            console.error("Erro ao carregar temas:", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newName.trim()) return;
        try {
            const created = await base44.entities.ProjectionTheme.create({
                name: newName.trim(),
                text_color: "#ffffff",
                font_family: "sans",
                font_size: "large",
                text_effect: "shadow",
                elements: [],
            });
            setThemes([...themes, created]);
            setSelectedTheme(created);
            setNewName("");
        } catch (e) {
            console.error("Erro ao criar tema:", e);
            alert("Erro ao criar tema");
        }
    };

    const handleSave = async () => {
        if (!selectedTheme?.id) return;
        setIsSaving(true);
        try {
            await base44.entities.ProjectionTheme.update(selectedTheme.id, {
                name: selectedTheme.name,
                elements: selectedTheme.elements || [],
                text_color: selectedTheme.text_color,
                text_color_2: selectedTheme.text_color_2,
                font_family: selectedTheme.font_family,
                font_size: selectedTheme.font_size,
                text_effect: selectedTheme.text_effect,
                background_image: selectedTheme.background_image,
            });
            setThemes(themes.map((t) => (t.id === selectedTheme.id ? selectedTheme : t)));
        } catch (e) {
            console.error("Erro ao salvar tema:", e);
            alert("Erro ao salvar tema");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("Eliminar este tema?")) return;
        try {
            await base44.entities.ProjectionTheme.delete(id);
            const updated = themes.filter((t) => t.id !== id);
            setThemes(updated);
            if (selectedTheme?.id === id) setSelectedTheme(updated[0] || null);
        } catch (e) {
            console.error("Erro ao eliminar tema:", e);
        }
    };

    return (
        <Card className="bg-card border-border">
            <CardHeader className={isMobile ? "p-4" : ""}>
                <CardTitle className={`text-card-foreground flex items-center gap-2 ${isMobile ? "text-base" : "text-lg"}`}>
                    <Palette className={isMobile ? "w-4 h-4" : "w-5 h-5"} />
                    Editor de Temas de Projeção
                </CardTitle>
            </CardHeader>
            <CardContent className={`space-y-4 ${isMobile ? "p-4 pt-0" : ""}`}>
                <p className={`${isMobile ? "text-xs" : "text-sm"} text-muted-foreground`}>
                    Crie e posicione elementos visuais (título, letra, imagem) num canvas 16:9. Os temas podem ser aplicados às projeções.
                </p>

                {/* Seletor de temas + criar novo */}
                <div className="flex flex-wrap gap-2 items-center">
                    {isLoading ? (
                        <span className="text-xs text-muted-foreground">A carregar temas...</span>
                    ) : (
                        themes.map((t) => (
                            <button
                                key={t.id}
                                onClick={() => setSelectedTheme(t)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                                    selectedTheme?.id === t.id
                                        ? "bg-primary/30 border border-primary/50 text-white"
                                        : "bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10"
                                }`}
                            >
                                {t.name}
                                {t.is_default && <span className="text-[9px] text-accent">(padrão)</span>}
                            </button>
                        ))
                    )}
                </div>

                {/* Criar novo tema */}
                <div className="flex gap-2">
                    <Input
                        type="text"
                        placeholder="Nome do novo tema..."
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                        className="bg-white/10 border-border text-white placeholder:text-gray-400"
                    />
                    <Button onClick={handleCreate} size="sm" className=" text-white shrink-0">
                        <Plus className="w-4 h-4 mr-1" /> Criar
                    </Button>
                </div>

                {/* Editor do tema selecionado */}
                {selectedTheme ? (
                    <div className="space-y-3 p-3 rounded-xl bg-black/20 border border-border">
                        <div className="flex items-center gap-2">
                            <Input
                                type="text"
                                value={selectedTheme.name}
                                onChange={(e) => setSelectedTheme({ ...selectedTheme, name: e.target.value })}
                                className="bg-white/10 border-border text-white h-8 text-sm"
                            />
                            <Button
                                onClick={handleSave}
                                disabled={isSaving}
                                size="sm"
                                className=" text-white shrink-0"
                            >
                                {isSaving ? <Save className="w-4 h-4 animate-pulse" /> : <><Save className="w-4 h-4 mr-1" /> Salvar</>}
                            </Button>
                            <Button
                                onClick={() => handleDelete(selectedTheme.id)}
                                size="sm"
                                variant="ghost"
                                className="text-red-400 hover:text-red-300 shrink-0"
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                        <ThemeEditor theme={selectedTheme} onChange={setSelectedTheme} />
                    </div>
                ) : (
                    <div className="text-center py-8 text-sm text-gray-500">
                        Crie um tema para começar a editar
                    </div>
                )}
            </CardContent>
        </Card>
    );
}