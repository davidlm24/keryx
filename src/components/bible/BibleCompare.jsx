import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Book, Loader2, Layers } from "lucide-react";
import { keryx } from "@/api/keryxClient";
import { bibleBooks, VERSION_API_MAP, BOOK_API_MAP } from "./bibleData";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getBibleProjectionStyle } from "@/utils/bibleProjectionStyle";

const ALL_VERSIONS = ["NVI", "ARC", "ARA", "NAA", "NTLH"];

export default function BibleCompare({ onProjectVerse }) {
    const colors = useThemeColors();
    const [reference, setReference] = useState("");
    const [selectedVersions, setSelectedVersions] = useState(["NVI", "ARA"]);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    const toggleVersion = (v) => {
        setSelectedVersions(prev =>
            prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
        );
    };

    const parseReference = (ref) => {
        // Aceita: "João 3:16", "João 3:16-17", "Jo 3:16"
        const match = ref.trim().match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
        if (!match) return null;
        const [, bookName, chapter, verseStart, verseEnd] = match;
        const book = bibleBooks.find(b =>
            b.name.toLowerCase() === bookName.toLowerCase() ||
            b.short.toLowerCase() === bookName.toLowerCase()
        );
        if (!book) return null;
        return {
            book: book.name,
            chapter: parseInt(chapter),
            verseStart: parseInt(verseStart),
            verseEnd: verseEnd ? parseInt(verseEnd) : parseInt(verseStart)
        };
    };

    const fetchVersion = async (parsed, version) => {
        const { book, chapter, verseStart, verseEnd } = parsed;
        const apiVersion = VERSION_API_MAP[version] || "nvi";
        const bookSlug = BOOK_API_MAP[book];

        if (bookSlug) {
            try {
                const resp = await fetch(
                    `https://www.abibliadigital.com.br/api/chapters/${apiVersion}/${bookSlug}/${chapter}`,
                    { headers: { "Accept": "application/json" } }
                );
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.verses?.length) {
                        const filtered = data.verses.filter(v => v.number >= verseStart && v.number <= verseEnd);
                        if (filtered.length > 0) {
                            return filtered.map(v => `${v.number} ${v.text}`).join("\n");
                        }
                    }
                }
            } catch (e) { /* fallback to LLM */ }
        }

        // LLM fallback
        const refStr = verseEnd !== verseStart
            ? `${book} ${chapter}:${verseStart}-${verseEnd}`
            : `${book} ${chapter}:${verseStart}`;
        const result = await keryx.integrations.Core.InvokeLLM({
            prompt: `Forneça o texto bíblico COMPLETO e EXATO de ${refStr} na versão ${version}. Retorne APENAS o texto dos versículos numerados, sem introduções. Formato: "1 texto\n2 texto"`,
            response_json_schema: {
                type: "object",
                properties: { text: { type: "string" } }
            }
        });
        return result.text || "";
    };

    const handleCompare = async () => {
        const parsed = parseReference(reference);
        if (!parsed) {
            alert("Referência inválida. Use o formato: João 3:16 ou João 3:16-17");
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
                selectedVersions.map(async (v) => ({
                    version: v,
                    text: await fetchVersion(parsed, v)
                }))
            );
            setResults(fetched);
        } catch (err) {
            console.error("Erro ao comparar:", err);
            alert("Erro ao buscar passagens.");
        } finally {
            setLoading(false);
        }
    };

    const handleProject = (version, text) => {
        if (!onProjectVerse) return;
        const parsed = parseReference(reference);
        const refStr = parsed.verseEnd !== parsed.verseStart
            ? `${parsed.book} ${parsed.chapter}:${parsed.verseStart}-${parsed.verseEnd}`
            : `${parsed.book} ${parsed.chapter}:${parsed.verseStart}`;

        const verseRegex = /(\d+)\s+([\s\S]*?)(?=\s+\d+\s|$)/g;
        const slides = [];
        let m;
        const verses = [];
        while ((m = verseRegex.exec(text)) !== null) {
            if (m[2].trim()) verses.push({ number: m[1], text: m[2].trim() });
        }
        if (verses.length === 0) {
            slides.push({ text, duration: 12, is_bible: true, bible_reference: refStr });
        } else {
            verses.forEach(v => {
                const wc = v.text.split(/\s+/).filter(Boolean).length;
                slides.push({
                    text: `${v.number} ${v.text}`,
                    duration: Math.min(25, Math.max(5, 4 + wc * 0.5)),
                    is_bible: true,
                    bible_reference: refStr
                });
            });
        }

        const style = getBibleProjectionStyle();
        onProjectVerse({
            reference: refStr,
            book: parsed.book,
            chapter: parsed.chapter,
            verses: parsed.verseEnd !== parsed.verseStart ? `${parsed.verseStart}-${parsed.verseEnd}` : String(parsed.verseStart),
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
                                        onClick={() => handleProject(r.version, r.text)}
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