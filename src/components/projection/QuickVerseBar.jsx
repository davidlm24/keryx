import React, { useState } from "react";
import { keryx } from "@/api/keryxClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookOpen, Loader2, Send, X } from "lucide-react";
import { useThemeColors } from "@/hooks/useThemeColors";
import { reflowBibleText } from "@/utils/bibleReflow";

/**
 * Barra de versículo rápido — o operador cola "João 3:16" e projeta instantaneamente.
 * Usa InvokeLLM com contexto de internet para buscar o texto do versículo.
 */
export default function QuickVerseBar({ onProject, deviceId }) {
    const colors = useThemeColors();
    const [ref, setRef] = useState("");
    const [loading, setLoading] = useState(false);
    const [recent, setRecent] = useState(() => {
        try { return JSON.parse(localStorage.getItem("quickVerseRecent") || "[]"); } catch { return []; }
    });

    const fetchAndProject = async (reference) => {
        if (!reference.trim()) return;
        setLoading(true);
        try {
            const result = await keryx.integrations.Core.InvokeLLM({
                prompt: `Busca o versículo bíblico "${reference}" na versão Almeida Revista e Corrigida (ARC).
Retorna em JSON:
- reference: a referência formatada (ex: "João 3:16")
- text: o texto completo do versículo ou passagem
- book: nome do livro
- chapter: número do capítulo
- verse: número do versículo (ou range)

Se for uma passagem com múltiplos versículos, junta o texto todo numa string separada por espaço.`,
                add_context_from_internet: true,
                response_json_schema: {
                    type: "object",
                    properties: {
                        reference: { type: "string" },
                        text: { type: "string" },
                        book: { type: "string" },
                        chapter: { type: "number" },
                        verse: { type: "string" }
                    },
                    required: ["reference", "text"]
                }
            });

            if (result?.text) {
                const refLabel = result.reference || reference;
                const passageData = {
                    reference: refLabel,
                    text: result.text,
                    book: result.book || "",
                    chapter: result.chapter || 0,
                    verse: result.verse || "",
                    slides: reflowBibleText(result.text, refLabel),
                    text_color: "#ffffff",
                    background_image: "",
                    font_size: "large",
                    font_family: "sans",
                    text_effect: "shadow",
                };

                onProject?.(passageData);

                // Guardar nos recentes
                const updated = [reference, ...recent.filter(r => r !== reference)].slice(0, 5);
                setRecent(updated);
                localStorage.setItem("quickVerseRecent", JSON.stringify(updated));
            }
        } catch (e) {
            console.error("Erro ao buscar versículo:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleKey = (e) => {
        if (e.key === "Enter" && !loading) fetchAndProject(ref);
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: colors.primary }}>
                <BookOpen className="w-4 h-4" />
                Versículo Rápido
            </div>
            <div className="flex gap-2">
                <Input
                    value={ref}
                    onChange={(e) => setRef(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="João 3:16"
                    className="bg-white/10 border-border text-white placeholder:text-gray-500"
                    disabled={loading}
                />
                <Button
                    onClick={() => fetchAndProject(ref)}
                    disabled={loading || !ref.trim()}
                    className="text-white shrink-0"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
            </div>
            {recent.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {recent.map((r, i) => (
                        <button
                            key={i}
                            onClick={() => { setRef(r); fetchAndProject(r); }}
                            className="px-2 py-1 text-xs rounded-lg bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition-colors"
                        >
                            {r}
                        </button>
                    ))}
                    <button
                        onClick={() => { setRecent([]); localStorage.removeItem("quickVerseRecent"); }}
                        className="px-1.5 py-1 text-xs rounded-lg bg-white/5 text-gray-500 hover:text-gray-300"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}
        </div>
    );
}