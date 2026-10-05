import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Guitar, Sparkles } from "lucide-react";
import { useThemeColors } from "@/hooks/useThemeColors";

/**
 * Importa texto com acordes (cifra) e converte em slides separados por secção.
 * Detecta secções como "Verso 1", "Refrão", "Ponte", etc. e divide os slides.
 * Linhas com acordes (ex: [C] [G] [Am]) são incluídas no slide da secção.
 */
export default function ChordImporter({ onImport }) {
    const colors = useThemeColors();
    const [text, setText] = useState("");
    const [slides, setSlides] = useState(null);

    const isChordPro = (raw) => {
        // ChordPro usa directivas entre chavetas: {title:}, {c:}, {soc}, {eoc}, {sov}, {eov}
        return /\{(title|artist|c|soc|eoc|sov|eov|comment|start_of_chorus|end_of_chorus|start_of_verse|end_of_verse):?\s/i.test(raw);
    };

    const parseChordPro = (raw) => {
        const lines = raw.split("\n");
        const sections = [];
        let currentSection = "Verso 1";
        let currentLines = [];
        let inChorus = false;
        let inVerse = false;

        for (const line of lines) {
            const trimmed = line.trim();

            // Directivas ChordPro
            const directive = trimmed.match(/^\{(\w+):?\s*(.*?)\}$/i);
            if (directive) {
                const key = directive[1].toLowerCase();
                const val = directive[2] || "";

                if (key === "soc" || key === "start_of_chorus") {
                    if (currentLines.length > 0) {
                        sections.push({ section: currentSection, text: currentLines.join("\n").trim() });
                        currentLines = [];
                    }
                    currentSection = "Refrão";
                    inChorus = true;
                    continue;
                }
                if (key === "eoc" || key === "end_of_chorus") {
                    inChorus = false;
                    if (currentLines.length > 0) {
                        sections.push({ section: currentSection, text: currentLines.join("\n").trim() });
                        currentLines = [];
                    }
                    currentSection = "Verso";
                    continue;
                }
                if (key === "sov" || key === "start_of_verse") {
                    if (currentLines.length > 0) {
                        sections.push({ section: currentSection, text: currentLines.join("\n").trim() });
                        currentLines = [];
                    }
                    currentSection = val ? `Verso ${val}` : "Verso";
                    inVerse = true;
                    continue;
                }
                if (key === "eov" || key === "end_of_verse") {
                    inVerse = false;
                    if (currentLines.length > 0) {
                        sections.push({ section: currentSection, text: currentLines.join("\n").trim() });
                        currentLines = [];
                    }
                    currentSection = "Verso";
                    continue;
                }
                if (key === "c" || key === "comment") {
                    if (currentLines.length > 0) {
                        sections.push({ section: currentSection, text: currentLines.join("\n").trim() });
                        currentLines = [];
                    }
                    currentSection = val || "Comentário";
                    continue;
                }
                // Ignora outras directivas (title, artist, key, etc.)
                continue;
            }

            // Linha em branco dentro de secção sem directivas
            if (trimmed === "" && !inChorus && !inVerse && currentLines.length === 0) continue;

            // Remove acordes inline [C] [G] [Am] do texto do slide
            const cleanLine = line.replace(/\[([^\]]+)\]/g, "");
            currentLines.push(cleanLine);
        }
        if (currentLines.length > 0) {
            sections.push({ section: currentSection, text: currentLines.join("\n").trim() });
        }
        return sections.filter(s => s.text);
    };

    const parseChords = (raw) => {
        // Detecta formato ChordPro/OnSong
        if (isChordPro(raw)) {
            return parseChordPro(raw);
        }

        const lines = raw.split("\n");
        const sections = [];
        let currentSection = null;
        let currentLines = [];

        const sectionMarkers = /^\s*(verso|refr[ãa]o|ponte|intro|outro|solo|pr[ée]-refr[ãa]o|bridge|chorus|verse|interlude|final)\s*\d*\s*[:\-\)]?/i;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === "" && currentLines.length === 0) continue;

            if (sectionMarkers.test(trimmed) && trimmed.length < 40) {
                if (currentSection && currentLines.length > 0) {
                    sections.push({ section: currentSection, text: currentLines.join("\n").trim() });
                }
                currentSection = trimmed.replace(/[:\-\)]$/, "").trim();
                currentLines = [];
            } else {
                currentLines.push(line);
            }
        }
        if (currentSection && currentLines.length > 0) {
            sections.push({ section: currentSection, text: currentLines.join("\n").trim() });
        }
        if (!currentSection && currentLines.length > 0) {
            sections.push({ section: "Verso 1", text: currentLines.join("\n").trim() });
        }

        // Se não detetou secções, dividir por linhas em branco
        if (sections.length <= 1) {
            const blocks = raw.split(/\n\s*\n/).filter(b => b.trim());
            return blocks.map((b, i) => ({
                section: `Parte ${i + 1}`,
                text: b.trim()
            }));
        }

        return sections;
    };

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