import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Book, Loader2, Search, Monitor, ChevronDown, ChevronUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { bibleBooks, VERSION_API_MAP, BOOK_API_MAP } from "./bibleData";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getBibleProjectionStyle, setBibleProjectionStyle } from "@/utils/bibleProjectionStyle";

const STEP = { BOOK: "book", CHAPTER: "chapter", VERSE: "verse", RESULT: "result" };

export default function BibleSelector({ onPassageFound, onProjectDirect }) {
    const colors = useThemeColors();
    const [step, setStep] = useState(STEP.BOOK);
    const [bookSearch, setBookSearch] = useState("");
    const [selectedBook, setSelectedBook] = useState(null);
    const [selectedChapter, setSelectedChapter] = useState(null);
    const [verseStart, setVerseStart] = useState(null);
    const [verseEnd, setVerseEnd] = useState(null);
    const savedStyle = getBibleProjectionStyle();
    const [version, setVersion] = useState(savedStyle.version || "NVI");
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMode, setLoadingMode] = useState("");
    const [fetchedPassage, setFetchedPassage] = useState(null);
    const [textColor, setTextColor] = useState(savedStyle.text_color || "#ffffff");
    const [bgColor, setBgColor] = useState(savedStyle.background_color || "");
    const [bgImageUrl, setBgImageUrl] = useState(savedStyle.background_image || "");
    const [fontSize, setFontSize] = useState(savedStyle.font_size || "large");
    const [fontFamily, setFontFamily] = useState(savedStyle.font_family || "sans");
    const [showStylePanel, setShowStylePanel] = useState(false);
    const [bgUploading, setBgUploading] = useState(false);

    useEffect(() => {
        setBibleProjectionStyle({
            text_color: textColor,
            background_image: bgImageUrl,
            background_color: bgColor,
            font_size: fontSize,
            font_family: fontFamily,
            version,
        });
    }, [textColor, bgColor, bgImageUrl, fontSize, fontFamily, version]);

    const filteredBooks = useMemo(() => {
        if (!bookSearch) return bibleBooks;
        const q = bookSearch.toLowerCase();
        return bibleBooks.filter(b =>
            b.name.toLowerCase().includes(q) || b.short.toLowerCase().includes(q)
        );
    }, [bookSearch]);

    const chapters = selectedBook
        ? Array.from({ length: selectedBook.chapters }, (_, i) => i + 1)
        : [];

    const verseCount = selectedBook && selectedChapter
        ? (selectedBook.verses[selectedChapter - 1] || 30)
        : 0;

    const verses = Array.from({ length: verseCount }, (_, i) => i + 1);

    const getReference = () => {
        if (!selectedBook || !selectedChapter) return "";
        if (verseStart && verseEnd && verseEnd !== verseStart)
            return `${selectedBook.name} ${selectedChapter}:${verseStart}-${verseEnd}`;
        if (verseStart)
            return `${selectedBook.name} ${selectedChapter}:${verseStart}`;
        return `${selectedBook.name} ${selectedChapter}`;
    };

    const selectBook = (book) => {
        setSelectedBook(book);
        setSelectedChapter(null);
        setVerseStart(null);
        setVerseEnd(null);
        setFetchedPassage(null);
        setStep(STEP.CHAPTER);
    };

    const selectChapter = (ch) => {
        setSelectedChapter(ch);
        setVerseStart(null);
        setVerseEnd(null);
        setFetchedPassage(null);
        setStep(STEP.VERSE);
    };

    const handleVerseClick = (v) => {
        if (!verseStart || (verseStart && verseEnd)) {
            setVerseStart(v);
            setVerseEnd(null);
        } else {
            if (v < verseStart) {
                setVerseEnd(verseStart);
                setVerseStart(v);
            } else {
                setVerseEnd(v);
            }
        }
    };

    const isVerseSelected = (v) => {
        if (!verseStart) return false;
        if (!verseEnd) return v === verseStart;
        return v >= verseStart && v <= verseEnd;
    };

    const isVerseStart = (v) => v === verseStart;
    const isVerseEnd = (v) => v === verseEnd;

    const reset = () => {
        setStep(STEP.BOOK);
        setBookSearch("");
        setSelectedBook(null);
        setSelectedChapter(null);
        setVerseStart(null);
        setVerseEnd(null);
        setFetchedPassage(null);
    };

    const buildSlidesFromVerses = (verses) => {
        // Um versículo por slide — duração dinâmica conforme tamanho do texto
        return verses.map(v => {
            const wordCount = v.text.split(/\s+/).filter(Boolean).length;
            // Base 4s + 0.5s por palavra, mínimo 5s, máximo 25s
            const duration = Math.min(25, Math.max(5, 4 + wordCount * 0.5));
            return {
                text: `${v.number} ${v.text}`,
                duration: Math.round(duration)
            };
        });
    };

    const fetchPassage = async (mode) => {
        const reference = getReference();
        if (!reference) return;

        setLoadingMode(mode);
        setIsLoading(true);
        setFetchedPassage(null);

        try {
            const apiVersion = VERSION_API_MAP[version] || "nvi";
            const bookSlug = BOOK_API_MAP[selectedBook.name];
            const chapter = selectedChapter;
            const start = verseStart;
            const end = verseEnd || verseStart;

            let rawText = "";
            let generatedSlides = [];

            if (bookSlug && version !== "BKJ1611") {
                try {
                    const resp = await fetch(
                        `https://www.abibliadigital.com.br/api/chapters/${apiVersion}/${bookSlug}/${chapter}`,
                        { headers: { "Accept": "application/json" } }
                    );
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data.verses?.length) {
                            const filtered = data.verses.filter(v => v.number >= start && v.number <= end);
                            if (filtered.length > 0) {
                                rawText = filtered.map(v => `${v.number} ${v.text}`).join("\n");
                                generatedSlides = buildSlidesFromVerses(filtered);
                            }
                        }
                    }
                } catch (apiErr) {
                    console.warn("API abibliadigital falhou, usando LLM:", apiErr);
                }
            }

            if (!rawText) {
                const versionLabel = version === "BKJ1611"
                    ? "King James Fiel 1611 em português (BKJ 1611), tradução literal portuguesa fiel ao texto original"
                    : version;
                const result = await base44.integrations.Core.InvokeLLM({
                    prompt: `Forneça o texto bíblico COMPLETO e EXATO de ${reference} na versão ${versionLabel}. Retorne APENAS o texto dos versículos numerados, sem introduções ou comentários. Formato: "1 texto do versículo\n2 texto do versículo"`,
                    response_json_schema: {
                        type: "object",
                        properties: {
                            text: { type: "string", description: "Texto completo da passagem com versículos numerados" }
                        }
                    }
                });
                rawText = result.text || "";

                // Regex global: extrai TODOS os versículos mesmo se o texto vier tudo junto
                const verseRegex = /(\d+)\s+([\s\S]*?)(?=\s+\d+\s|$)/g;
                const parsedVerses = [];
                let m;
                while ((m = verseRegex.exec(rawText)) !== null) {
                    const num = parseInt(m[1]);
                    const txt = m[2].trim();
                    if (txt) parsedVerses.push({ number: num, text: txt });
                }
                if (parsedVerses.length > 0) {
                    generatedSlides = buildSlidesFromVerses(parsedVerses);
                } else {
                    generatedSlides = [{ text: rawText, duration: 12 }];
                }
            }

            if (generatedSlides.length === 0) generatedSlides = [{ text: rawText, duration: 12 }];

            const passage = {
                reference,
                book: selectedBook.name,
                chapter: parseInt(selectedChapter),
                verses: verseStart && verseEnd ? `${verseStart}-${verseEnd}` : verseStart ? String(verseStart) : "",
                text: rawText,
                version,
                slides: generatedSlides,
                text_color: textColor,
                background_image: bgImageUrl || bgColor || null,
                font_size: fontSize,
                font_family: fontFamily,
            };

            setFetchedPassage(passage);
            setStep(STEP.RESULT);

            if (mode === "project" && onProjectDirect) {
                onProjectDirect(passage);
            } else {
                onPassageFound(passage);
            }
        } catch (error) {
            console.error("Erro ao buscar passagem:", error);
            alert("Erro ao buscar passagem. Tente novamente.");
        } finally {
            setIsLoading(false);
            setLoadingMode("");
        }
    };

    return (
        <Card className="border" style={{ background: `linear-gradient(to bottom right, ${colors.primary}20, ${colors.secondary}20)`, borderColor: `${colors.primary}50` }}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="flex items-center gap-2" style={{ color: colors.primary }}>
                        <Book className="w-5 h-5" />
                        Buscar e Projetar Versículo
                    </CardTitle>
                    <Select value={version} onValueChange={setVersion}>
                        <SelectTrigger className="w-24 bg-white/10 text-white text-sm" style={{ borderColor: `${colors.primary}50` }}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="NVI">NVI</SelectItem>
                            <SelectItem value="ARC">ARC</SelectItem>
                            <SelectItem value="ARA">ARA</SelectItem>
                            <SelectItem value="NAA">NAA</SelectItem>
                            <SelectItem value="NTLH">NTLH</SelectItem>
                            <SelectItem value="BKJ1611">BKJ 1611</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm mt-2 flex-wrap">
                    <button onClick={reset} className="transition-colors" style={{ color: colors.primary }}>
                        📚 Livro
                    </button>
                    {selectedBook && (
                        <>
                            <span style={{ color: `${colors.primary}80` }}>›</span>
                            <button onClick={() => { setStep(STEP.CHAPTER); setSelectedChapter(null); setVerseStart(null); setVerseEnd(null); }}
                                className="transition-colors font-medium" style={{ color: colors.primary }}>
                                {selectedBook.name}
                            </button>
                        </>
                    )}
                    {selectedChapter && (
                        <>
                            <span style={{ color: `${colors.primary}80` }}>›</span>
                            <button onClick={() => { setStep(STEP.VERSE); setVerseStart(null); setVerseEnd(null); }}
                                className="transition-colors font-medium" style={{ color: colors.primary }}>
                                Cap. {selectedChapter}
                            </button>
                        </>
                    )}
                    {fetchedPassage && (
                        <>
                            <span style={{ color: `${colors.primary}80` }}>›</span>
                            <span className="text-green-400 font-medium">{fetchedPassage.reference}</span>
                        </>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-3">

                {/* STEP 1 — Selecionar livro */}
                {step === STEP.BOOK && (
                    <div className="space-y-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.primary }} />
                            <Input
                                placeholder="Pesquisar livro (ex: João, Sl, Mateus...)"
                                value={bookSearch}
                                onChange={(e) => setBookSearch(e.target.value)}
                                className="pl-9 bg-white/10 text-white placeholder:text-gray-400"
                                style={{ borderColor: `${colors.primary}50` }}
                                autoFocus
                            />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1 max-h-56 overflow-y-auto p-1 bg-black/20 rounded-lg">
                            {filteredBooks.length === 0 ? (
                                <p className="col-span-4 text-center text-sm py-4" style={{ color: colors.primary }}>Nenhum livro encontrado</p>
                            ) : filteredBooks.map((book) => (
                                <button
                                    key={book.name}
                                    type="button"
                                    onClick={() => selectBook(book)}
                                    className="text-left px-2 py-2 rounded text-sm text-white transition-colors"
                                    style={{ hoverBackground: `${colors.primary}30` }}
                                >
                                    <span className="text-xs font-mono mr-1" style={{ color: colors.primary }}>{book.short}</span>
                                    <span className="truncate">{book.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* STEP 2 — Selecionar capítulo */}
                {step === STEP.CHAPTER && selectedBook && (
                    <div className="space-y-2">
                        <p className="text-sm font-medium" style={{ color: colors.primary }}>Selecione o capítulo de <strong>{selectedBook.name}</strong>:</p>
                        <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 max-h-52 overflow-y-auto p-1 bg-black/20 rounded-lg">
                            {chapters.map((ch) => (
                                <button
                                    key={ch}
                                    type="button"
                                    onClick={() => selectChapter(ch)}
                                    className="flex items-center justify-center h-9 w-full rounded text-sm font-medium text-white transition-colors bg-white/5"
                                    style={{ border: `1px solid ${colors.primary}30` }}
                                >
                                    {ch}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* STEP 3 — Selecionar versículos (grid visual) */}
                {step === STEP.VERSE && selectedBook && selectedChapter && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <p className="text-sm font-medium" style={{ color: colors.primary }}>
                                Versículos de <strong>{selectedBook.name} {selectedChapter}</strong>:
                            </p>
                            <span className="text-xs" style={{ color: `${colors.primary}b3` }}>
                                {!verseStart ? "Clique para selecionar o início" : !verseEnd ? "Clique para selecionar o fim (ou projetar versículo único)" : `${verseStart}–${verseEnd} selecionados`}
                            </span>
                        </div>

                        <div className="grid grid-cols-8 sm:grid-cols-10 gap-1 max-h-52 overflow-y-auto p-1 bg-black/20 rounded-lg">
                            {verses.map((v) => {
                                const selected = isVerseSelected(v);
                                const start = isVerseStart(v);
                                const end = isVerseEnd(v);
                                return (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => handleVerseClick(v)}
                                        className={`flex items-center justify-center h-9 w-full rounded text-sm font-medium transition-colors border ${
                                            start || end
                                                ? "text-black font-bold"
                                                : selected
                                                ? "text-white"
                                                : "bg-white/5 text-white hover:bg-white/10"
                                        }`}
                                        style={start || end ? { background: colors.primary, borderColor: colors.primary } : selected ? { background: `${colors.primary}66`, borderColor: `${colors.primary}99` } : { borderColor: `${colors.primary}30` }}
                                    >
                                        {v}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Seleção atual */}
                        <div className="p-2 rounded text-center text-sm font-medium" style={{ background: `${colors.primary}1a`, color: colors.primary }}>
                            📖 {getReference()} — {version}
                        </div>

                        {/* Toggle Style Panel */}
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setShowStylePanel(!showStylePanel)}
                            className="w-full"
                            style={{ borderColor: `${colors.primary}66`, color: colors.primary }}
                        >
                            🎨 Estilo da Projeção
                            {showStylePanel ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                        </Button>

                        {/* Style panel — collapsível */}
                        {showStylePanel && (
                            <div className="p-3 rounded-lg space-y-3" style={{ background: `${colors.primary}1a`, border: `1px solid ${colors.primary}50` }}>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs mb-1.5 block" style={{ color: colors.primary }}>Cor da Letra</label>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <input
                                                type="color"
                                                value={textColor}
                                                onChange={(e) => setTextColor(e.target.value)}
                                                className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent flex-shrink-0"
                                            />
                                            {["#ffffff", "#000000", "#fbbf24", "#34d399", "#60a5fa", "#f87171"].map(c => (
                                                <button key={c} type="button" onClick={() => setTextColor(c)}
                                                    className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110 flex-shrink-0"
                                                    style={{ backgroundColor: c, borderColor: textColor === c ? '#a78bfa' : 'transparent' }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs mb-1.5 block" style={{ color: colors.primary }}>Tamanho</label>
                                        <Select value={fontSize} onValueChange={setFontSize}>
                                            <SelectTrigger className="bg-white/10 text-white text-sm h-8" style={{ borderColor: `${colors.primary}50` }}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="small">Pequena</SelectItem>
                                                <SelectItem value="medium">Média</SelectItem>
                                                <SelectItem value="large">Grande</SelectItem>
                                                <SelectItem value="xlarge">Extra Grande</SelectItem>
                                                <SelectItem value="xxlarge">Máximo</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="text-xs mb-1.5 block" style={{ color: colors.primary }}>Fonte</label>
                                        <Select value={fontFamily} onValueChange={setFontFamily}>
                                            <SelectTrigger className="bg-white/10 text-white text-sm h-8" style={{ borderColor: `${colors.primary}50` }}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="sans">Sans Serif</SelectItem>
                                                <SelectItem value="serif">Serif</SelectItem>
                                                <SelectItem value="arial">Arial</SelectItem>
                                                <SelectItem value="georgia">Georgia</SelectItem>
                                                <SelectItem value="times">Times New Roman</SelectItem>
                                                <SelectItem value="verdana">Verdana</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="text-xs mb-1.5 block" style={{ color: colors.primary }}>Cor de Fundo</label>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <input
                                                type="color"
                                                value={bgColor || "#1a1a2e"}
                                                onChange={(e) => { setBgColor(e.target.value); setBgImageUrl(""); }}
                                                className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent flex-shrink-0"
                                            />
                                            {["#000000","#1a1a2e","#0f172a","#1e3a5f","#14532d","#3b0764"].map(c => (
                                                <button key={c} type="button"
                                                    onClick={() => { setBgColor(c); setBgImageUrl(""); }}
                                                    className="w-6 h-6 rounded-full border-2 transition-all hover:scale-110 flex-shrink-0"
                                                    style={{ backgroundColor: c, borderColor: bgColor === c ? '#a78bfa' : 'transparent' }}
                                                />
                                            ))}
                                            {bgColor && (
                                                <button type="button" onClick={() => setBgColor("")}
                                                    className="text-xs text-red-400 hover:text-red-300">✕</button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {/* Upload imagem de fundo */}
                                <div>
                                    <label className="text-xs mb-1 block" style={{ color: colors.primary }}>Imagem de Fundo</label>
                                    <div className="flex items-center gap-2">
                                        <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded bg-white/10 text-xs hover:bg-white/20 transition-colors" style={{ border: `1px solid ${colors.primary}50`, color: colors.primary }}>
                                            {bgUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>📁</span>}
                                            {bgUploading ? "A carregar..." : bgImageUrl ? "Alterar imagem" : "Escolher JPG/PNG"}
                                            <input
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;
                                                    setBgUploading(true);
                                                    const { file_url } = await base44.integrations.Core.UploadFile({ file });
                                                    setBgImageUrl(file_url);
                                                    setBgColor("");
                                                    setBgUploading(false);
                                                }}
                                            />
                                        </label>
                                        {bgImageUrl && (
                                            <button type="button" onClick={() => setBgImageUrl("")}
                                                className="text-xs text-red-400 hover:text-red-300">✕ Remover</button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                onClick={() => fetchPassage("project")}
                                disabled={isLoading || !verseStart}
                                className="text-white font-semibold"
                                style={{ background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}
                            >
                                {isLoading && loadingMode === "project" ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Buscando...</>
                                ) : (
                                    <><Monitor className="w-4 h-4 mr-2" />Projetar Agora</>
                                )}
                            </Button>
                            <Button
                                onClick={() => fetchPassage("save")}
                                disabled={isLoading || !verseStart}
                                className="text-white"
                                style={{ background: `linear-gradient(to right, ${colors.secondary}, ${colors.primary})` }}
                            >
                                {isLoading && loadingMode === "save" ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Buscando...</>
                                ) : (
                                    <><Book className="w-4 h-4 mr-2" />Guardar</>
                                )}
                            </Button>
                        </div>
                        <p className="text-center text-xs" style={{ color: `${colors.primary}99` }}>
                            Clique num versículo para início, depois noutro para fim do intervalo
                        </p>
                    </div>
                )}

                {/* STEP 4 — Resultado */}
                {step === STEP.RESULT && fetchedPassage && (
                    <div className="space-y-3">
                        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                            <p className="text-green-300 text-xs font-semibold mb-1">
                                ✓ {fetchedPassage.reference} ({fetchedPassage.version}) — {fetchedPassage.slides?.length} slide(s)
                            </p>
                            <p className="text-white text-sm leading-relaxed max-h-24 overflow-y-auto">{fetchedPassage.text}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Button
                                onClick={() => { if (onProjectDirect) onProjectDirect(fetchedPassage); }}
                                className="text-white font-semibold"
                                style={{ background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}
                            >
                                <Monitor className="w-4 h-4 mr-2" />
                                Projetar Novamente
                            </Button>
                            <Button
                                onClick={reset}
                                variant="outline"
                                style={{ borderColor: `${colors.primary}66`, color: colors.primary }}
                            >
                                🔍 Nova Busca
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}