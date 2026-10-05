import React, { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bibleBooks, VERSION_API_MAP, BOOK_API_MAP } from "./bibleData";
import { base44 } from "@/api/base44Client";
import { Loader2, ChevronLeft, ChevronRight, Type, Moon, Sun, BookOpen, List } from "lucide-react";

const FONT_SIZES = { sm: "text-base", md: "text-lg", lg: "text-xl", xl: "text-2xl", xxl: "text-3xl" };

export default function BibleReader() {
    const [bookName, setBookName] = useState("João");
    const [chapter, setChapter] = useState(1);
    const [version, setVersion] = useState("NVI");
    const [verses, setVerses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fontSize, setFontSize] = useState("lg");
    const [dark, setDark] = useState(true);
    const [showPicker, setShowPicker] = useState(false);
    const topRef = useRef(null);

    const book = useMemo(() => bibleBooks.find(b => b.name === bookName), [bookName]);
    const chapters = book ? Array.from({ length: book.chapters }, (_, i) => i + 1) : [];

    const fetchChapter = async (bName, ch, ver) => {
        const cacheKey = `bible_${ver}_${bName}_${ch}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try { setVerses(JSON.parse(cached)); return; } catch {}
        }
        setLoading(true);
        setVerses([]);
        try {
            const apiVersion = VERSION_API_MAP[ver] || "nvi";
            const bookSlug = BOOK_API_MAP[bName];
            let data = null;
            if (bookSlug) {
                try {
                    const resp = await fetch(`https://www.abibliadigital.com.br/api/chapters/${apiVersion}/${bookSlug}/${ch}`);
                    if (resp.ok) data = await resp.json();
                } catch {}
            }
            if (data?.verses?.length) {
                const parsed = data.verses.map(v => ({ number: v.number, text: v.text }));
                setVerses(parsed);
                localStorage.setItem(cacheKey, JSON.stringify(parsed));
            } else {
                const result = await base44.integrations.Core.InvokeLLM({
                    prompt: `Forneça o texto bíblico COMPLETO de ${bName} ${ch} na versão ${ver}. Retorne APENAS os versículos numerados no formato "1 texto\n2 texto".`,
                    response_json_schema: { type: "object", properties: { text: { type: "string" } } }
                });
                const parsed = [];
                const regex = /(\d+)\s+([\s\S]*?)(?=\s+\d+\s|$)/g;
                let m;
                while ((m = regex.exec(result.text || "")) !== null) {
                    parsed.push({ number: parseInt(m[1]), text: m[2].trim() });
                }
                const finalVerses = parsed.length ? parsed : [{ number: 1, text: result.text || "Não foi possível obter o texto." }];
                setVerses(finalVerses);
                localStorage.setItem(cacheKey, JSON.stringify(finalVerses));
            }
        } catch (e) {
            setVerses([{ number: 0, text: "Erro ao carregar o capítulo." }]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchChapter(bookName, chapter, version); }, [bookName, chapter, version]);

    const goChapter = (delta) => {
        const idx = chapters.indexOf(chapter);
        const next = idx + delta;
        if (next >= 0 && next < chapters.length) setChapter(chapters[next]);
    };

    const changeBook = (name) => { setBookName(name); setChapter(1); setShowPicker(false); };

    const bg = dark ? "bg-slate-900" : "bg-stone-50";
    const cardBg = dark ? "bg-slate-800/60 border-slate-700" : "bg-white border-stone-200";
    const text = dark ? "text-slate-100" : "text-stone-800";
    const muted = dark ? "text-slate-400" : "text-stone-500";
    const verseNum = dark ? "text-accent" : "text-accent";

    return (
        <div ref={topRef} className={`rounded-xl border ${cardBg} ${text} overflow-hidden`}>
            {/* Top bar */}
            <div className={`flex items-center gap-2 px-3 sm:px-5 py-3 border-b ${dark ? "border-slate-700" : "border-stone-200"} flex-wrap`}>
                <button onClick={() => setShowPicker(!showPicker)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium">
                    <BookOpen className="w-4 h-4" /> {bookName} {chapter}
                </button>
                <Select value={version} onValueChange={setVersion}>
                    <SelectTrigger className="w-24 h-8 bg-white/10 border-0 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {Object.keys(VERSION_API_MAP).map(v => <SelectItem key={v} value={v}>{v === "BKJ1611" ? "BKJ 1611" : v}</SelectItem>)}
                    </SelectContent>
                </Select>
                <div className="flex items-center gap-1 ml-auto">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setFontSize(fs => {
                        const order = Object.keys(FONT_SIZES); const i = order.indexOf(fs); return order[Math.min(order.length-1, i+1)];
                    })}><Type className="w-4 h-4" /><span className="sr-only">Aumentar</span></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setFontSize(fs => {
                        const order = Object.keys(FONT_SIZES); const i = order.indexOf(fs); return order[Math.max(0, i-1)];
                    })}><Type className="w-3 h-3" /><span className="sr-only">Diminuir</span></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDark(!dark)}>
                        {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </Button>
                </div>
            </div>

            {/* Picker panel */}
            {showPicker && (
                <div className={`px-3 sm:px-5 py-3 border-b ${dark ? "border-slate-700 bg-slate-800/40" : "border-stone-200 bg-stone-100/60"}`}>
                    <p className={`text-xs font-medium mb-2 ${muted}`}>Livro</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1 max-h-40 overflow-y-auto mb-3">
                        {bibleBooks.map(b => (
                            <button key={b.name} onClick={() => changeBook(b.name)}
                                className={`px-2 py-1.5 rounded text-xs text-left transition-colors ${b.name === bookName ? "bg-primary text-primary-foreground" : (dark ? "hover:bg-white/10" : "hover:bg-stone-200")}`}>
                                <span className="opacity-60 font-mono mr-1">{b.short}</span>{b.name}
                            </button>
                        ))}
                    </div>
                    <p className={`text-xs font-medium mb-2 ${muted}`}>Capítulo</p>
                    <div className="grid grid-cols-8 sm:grid-cols-12 gap-1 max-h-32 overflow-y-auto">
                        {chapters.map(ch => (
                            <button key={ch} onClick={() => { setChapter(ch); setShowPicker(false); }}
                                className={`h-8 rounded text-xs font-medium transition-colors ${ch === chapter ? "bg-primary text-primary-foreground" : (dark ? "bg-white/5 hover:bg-white/10" : "bg-stone-200 hover:bg-stone-300")}`}>
                                {ch}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Reading content */}
            <div className={`px-4 sm:px-8 py-6 sm:py-10 ${bg} min-h-[50vh]`}>
                <div className="max-w-2xl mx-auto">
                    <h2 className={`text-center font-semibold mb-6 ${FONT_SIZES[fontSize]} ${dark ? "text-white" : "text-stone-900"}`}>
                        {bookName} {chapter}
                    </h2>
                    {loading ? (
                        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin opacity-50" /></div>
                    ) : (
                        <p className={`${FONT_SIZES[fontSize]} leading-relaxed ${dark ? "text-slate-200" : "text-stone-700"} text-justify`}>
                            {verses.map(v => (
                                <React.Fragment key={v.number}>
                                    <sup className={`font-bold mr-1 ${verseNum}`}>{v.number}</sup>{v.text}{" "}
                                </React.Fragment>
                            ))}
                        </p>
                    )}
                </div>
            </div>

            {/* Bottom nav */}
            <div className={`flex items-center justify-between px-3 sm:px-5 py-3 border-t ${dark ? "border-slate-700" : "border-stone-200"}`}>
                <Button variant="ghost" size="sm" disabled={loading || chapters.indexOf(chapter) === 0} onClick={() => goChapter(-1)}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                </Button>
                <span className={`text-xs ${muted}`}>{bookName} {chapter} · {version}</span>
                <Button variant="ghost" size="sm" disabled={loading || chapters.indexOf(chapter) === chapters.length - 1} onClick={() => goChapter(1)}>
                    Próximo <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
            </div>
        </div>
    );
}