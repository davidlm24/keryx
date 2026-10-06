import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Book, Loader2, Layers } from "lucide-react";
import { BIBLE_VERSIONS, formatReference, parseReference } from "@/lib/bibleBooks";
import { getPassage, versesToText } from "@/lib/bibleText";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getBibleProjectionStyle } from "@/utils/bibleProjectionStyle";

const ALL_VERSIONS = BIBLE_VERSIONS.map((v) => v.id);

export default function BibleCompare({ onProjectVerse }) {
    const colors = useThemeColors();
    const [reference, setReference] = useState("");
    const [selectedVersions, setSelectedVersions] = useState(["NVI", "ACF"]);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    const toggleVersion = (v) => {
        setSelectedVersions(prev =>
            prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
        );
    };

    // A failing version shows its reason instead of sinking the comparison.
    const fetchVersion = async (parsed, version) => {
        const { book, chapter, verseStart, verseEnd } = parsed;
        try {
            const { verses } = await getPassage(version, book, chapter, verseStart, verseEnd);
            return { version, text: versesToText(verses), verses };
        } catch (err) {
            return { version, text: `(${err.message})`, verses: [] };
        }
    };

    const handleCompare = async () => {
        const parsed = parseReference(reference);
        if (!parsed) {
            alert("Referência inválida. Exemplos: João 3:16, Jo 3:16-18, Salmos 23.");
            return;
        }
        if (selectedVersions.length === 0) {
            alert("Selecione pelo menos uma versão.");
            return;
        }

        setLoading(true);
        setResults([]);
        try {
            const fetched = await Promise.all(
                selectedVersions.map((v) => fetchVersion(parsed, v))
            );
            setResults(fetched);
        } catch (err) {
            console.error("Erro ao comparar:", err);
            alert("Erro ao buscar passagens.");
        } finally {
            setLoading(false);
        }
    };

    // Slides come from the structured verses: re-parsing the joined text
    // would split any verse that contains a number ("viveu 930 anos").
    const handleProject = (version, text, verses) => {
        if (!onProjectVerse || !verses.length) return;
        const parsed = parseReference(reference);
        const refStr = formatReference(parsed);
        const slides = verses.map((v) => {
            const wc = v.text.split(/\s+/).filter(Boolean).length;
            return {
                text: `${v.number} ${v.text}`,
                duration: Math.min(25, Math.max(5, 4 + wc * 0.5)),
                is_bible: true,
                bible_reference: refStr,
            };
        });

        const style = getBibleProjectionStyle();
        onProjectVerse({
            reference: refStr,
            book: parsed.book,
            chapter: parsed.chapter,
            verses: !parsed.verseStart ? "" : parsed.verseEnd !== parsed.verseStart ? `${parsed.verseStart}-${parsed.verseEnd}` : String(parsed.verseStart),
            text,
            version,
            slides,
            text_color: style.text_color,
            background_image: style.background_image,
            font_size: style.font_size,
            font_family: style.font_family
        });
    };

    return (
        <Card className="border" style={{ background: `linear-gradient(to bottom right, ${colors.primary}20, ${colors.secondary}20)`, borderColor: `${colors.primary}50` }}>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2" style={{ color: colors.primary }}>
                    <Layers className="w-5 h-5" />
                    Comparar Traduções
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-2">
                    <Input
                        placeholder="Referência (ex: João 3:16-17)"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCompare()}
                        className="bg-white/10 text-white placeholder:text-gray-400"
                        style={{ borderColor: `${colors.primary}50` }}
                    />
                    <Button
                        onClick={handleCompare}
                        disabled={loading}
                        className="text-white"
                        style={{ background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}
                    >
                        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Book className="w-4 h-4 mr-2" />}
                        Comparar
                    </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                    {ALL_VERSIONS.map(v => (
                        <button
                            key={v}
                            onClick={() => toggleVersion(v)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all`}
                            style={selectedVersions.includes(v)
                                ? { background: colors.primary, color: "white", borderColor: colors.primary }
                                : { background: "rgba(255,255,255,0.05)", color: colors.primary, borderColor: `${colors.primary}50` }}
                        >
                            {v}
                        </button>
                    ))}
                </div>

                {results.length > 0 && (
                    <div className="space-y-3">
                        {results.map((r, i) => (
                            <div key={i} className="p-3 bg-black/20 rounded-lg" style={{ border: `1px solid ${colors.primary}30` }}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-bold text-sm uppercase tracking-wider" style={{ color: colors.primary }}>
                                        {r.version}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleProject(r.version, r.text, r.verses)}
                                        className="h-7 text-xs"
                                        style={{ borderColor: `${colors.primary}50`, color: colors.primary }}
                                    >
                                        Projetar
                                    </Button>
                                </div>
                                <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">
                                    {r.text || "Não encontrado."}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}