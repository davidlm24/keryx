import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Guitar, Sparkles } from "lucide-react";
import { useThemeColors } from "@/hooks/useThemeColors";
import { parseChords } from "@/lib/songImport";

/**
 * Importa texto com acordes (cifra) e converte em slides separados por secção.
 * Detecta secções como "Verso 1", "Refrão", "Ponte", etc. e divide os slides.
 * Linhas com acordes (ex: [C] [G] [Am]) são incluídas no slide da secção.
 */
export default function ChordImporter({ onImport }) {
    const colors = useThemeColors();
    const [text, setText] = useState("");
    const [slides, setSlides] = useState(null);

    const handleParse = () => {
        if (!text.trim()) return;
        const parsed = parseChords(text);
        setSlides(parsed);
    };

    const handleImport = () => {
        if (!slides) return;
        onImport(slides.map(s => ({ text: s.text, duration: 12 })));
        setText("");
        setSlides(null);
    };

    return (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: `${colors.primary}40`, background: `${colors.primary}10` }}>
            <div className="flex items-center gap-2" style={{ color: colors.primary }}>
                <Guitar className="w-5 h-5" />
                <h3 className="font-semibold">Importar Cifra</h3>
            </div>
            <p className="text-xs text-gray-400">Cola texto com acordes ou formato ChordPro/OnSong ({`{soc}`, `{eoc}`, `[C]`}). Secções viram slides automáticos.</p>
            <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"Verso 1:\n[C] Na cruz de [G] Cristo\n[Am] onde um dia [F] eu me vi\n\nRefrão:\n[C] Santo [G] santo"}
                className="bg-white/5 text-white font-mono text-sm min-h-[120px]"
                style={{ borderColor: `${colors.primary}30` }}
            />
            <div className="flex gap-2">
                <Button size="sm" onClick={handleParse} disabled={!text.trim()} style={{ background: colors.primary }} className="text-white">
                    <Sparkles className="w-4 h-4 mr-1" />
                    Analisar
                </Button>
                {slides && (
                    <Button size="sm" onClick={handleImport} className="bg-green-600 hover:bg-green-700 text-white">
                        ✓ Importar {slides.length} slides
                    </Button>
                )}
            </div>
            {slides && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                    {slides.map((s, i) => (
                        <div key={i} className="text-xs p-2 rounded bg-black/30 border border-white/10">
                            <span className="font-semibold" style={{ color: colors.primary }}>{s.section}</span>
                            <pre className="text-gray-300 whitespace-pre-wrap mt-1">{s.text}</pre>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}