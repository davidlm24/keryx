import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, BookOpen } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { keryx } from "@/api/keryxClient";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function BibleImporter({ onImportComplete }) {
    const colors = useThemeColors();
    const [isImporting, setIsImporting] = useState(false);
    const [version, setVersion] = useState("nvi");
    const [progress, setProgress] = useState({ current: 0, total: 0 });

    const bibleVersions = {
        nvi: { name: "Nova Versão Internacional (NVI)", url: "https://raw.githubusercontent.com/thiagobodruk/biblia/master/json/nvi.json" },
        acf: { name: "Almeida Corrigida e Fiel (ACF)", url: "https://raw.githubusercontent.com/thiagobodruk/biblia/master/json/acf.json" },
        aa: { name: "Almeida Revisada Imprensa Bíblica (AA)", url: "https://raw.githubusercontent.com/thiagobodruk/biblia/master/json/aa.json" }
    };

    const bookNames = {
        "gn": "Gênesis", "ex": "Êxodo", "lv": "Levítico", "nm": "Números", "dt": "Deuteronômio",
        "js": "Josué", "jz": "Juízes", "rt": "Rute", "1sm": "1 Samuel", "2sm": "2 Samuel",
        "1rs": "1 Reis", "2rs": "2 Reis", "1cr": "1 Crônicas", "2cr": "2 Crônicas",
        "ed": "Esdras", "ne": "Neemias", "et": "Ester", "job": "Jó", "sl": "Salmos",
        "pv": "Provérbios", "ec": "Eclesiastes", "ct": "Cânticos", "is": "Isaías",
        "jr": "Jeremias", "lm": "Lamentações", "ez": "Ezequiel", "dn": "Daniel",
        "os": "Oséias", "jl": "Joel", "am": "Amós", "ob": "Obadias", "jn": "Jonas",
        "mq": "Miquéias", "na": "Naum", "hc": "Habacuque", "sf": "Sofonias",
        "ag": "Ageu", "zc": "Zacarias", "ml": "Malaquias",
        "mt": "Mateus", "mc": "Marcos", "lc": "Lucas", "jo": "João", "at": "Atos",
        "rm": "Romanos", "1co": "1 Coríntios", "2co": "2 Coríntios", "gl": "Gálatas",
        "ef": "Efésios", "fp": "Filipenses", "cl": "Colossenses", "1ts": "1 Tessalonicenses",
        "2ts": "2 Tessalonicenses", "1tm": "1 Timóteo", "2tm": "2 Timóteo", "tt": "Tito",
        "fm": "Filemom", "hb": "Hebreus", "tg": "Tiago", "1pe": "1 Pedro", "2pe": "2 Pedro",
        "1jo": "1 João", "2jo": "2 João", "3jo": "3 João", "jd": "Judas", "ap": "Apocalipse"
    };

    const handleImport = async () => {
        if (!version) {
            alert("Selecione uma versão da Bíblia");
            return;
        }

        if (!confirm(`Deseja importar toda a Bíblia ${bibleVersions[version].name}? Isso pode demorar alguns minutos.`)) {
            return;
        }

        setIsImporting(true);
        try {
            // Buscar o JSON da Bíblia
            const response = await fetch(bibleVersions[version].url);
            const bibleData = await response.json();
            
            setProgress({ current: 0, total: bibleData.length });

            // Preparar todas as passagens para importação em lote
            const allPassages = [];
            
            for (let i = 0; i < bibleData.length; i++) {
                const book = bibleData[i];
                const bookName = bookNames[book.abbrev] || book.book || book.abbrev.toUpperCase();
                
                // Para cada capítulo do livro
                for (let chapterIndex = 0; chapterIndex < book.chapters.length; chapterIndex++) {
                    const chapter = book.chapters[chapterIndex];
                    const chapterNumber = chapterIndex + 1;
                    
                    // Criar passagem para o capítulo completo
                    const reference = `${bookName} ${chapterNumber}`;
                    const fullText = chapter.map((verse, idx) => `${idx + 1} ${verse}`).join('\n');
                    
                    // Criar slides (4 versículos por slide)
                    const slides = [];
                    for (let v = 0; v < chapter.length; v += 4) {
                        const slideVerses = chapter.slice(v, v + 4);
                        const slideText = slideVerses.map((verse, idx) => `${v + idx + 1} ${verse}`).join('\n');
                        slides.push({
                            text: slideText,
                            duration: 10
                        });
                    }
                    
                    allPassages.push({
                        reference: reference,
                        book: bookName,
                        chapter: chapterNumber,
                        verses: `1-${chapter.length}`,
                        text: fullText,
                        slides: slides,
                        version: version.toUpperCase()
                    });
                }
                
                setProgress({ current: i + 1, total: bibleData.length });
            }
            
            // Importar todas as passagens de uma vez
            await keryx.entities.BiblePassage.bulkCreate(allPassages);
            
            alert(`Bíblia ${bibleVersions[version].name} importada com sucesso!`);
            if (onImportComplete) onImportComplete();
        } catch (error) {
            console.error("Erro ao importar Bíblia:", error);
            alert("Erro ao importar Bíblia: " + error.message);
        } finally {
            setIsImporting(false);
            setProgress({ current: 0, total: 0 });
        }
    };

    return (
        <Card className="border" style={{ background: `linear-gradient(to bottom right, ${colors.primary}20, ${colors.secondary}20)`, borderColor: `${colors.primary}50` }}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: colors.primary }}>
                    <BookOpen className="w-5 h-5" />
                    Importar Bíblia Completa
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm" style={{ color: colors.primary }}>
                    Importe toda a Bíblia de uma vez. Cada capítulo será adicionado como uma passagem separada.
                </p>
                
                <Select 
                    value={version} 
                    onValueChange={setVersion}
                    disabled={isImporting}
                >
                    <SelectTrigger className="bg-white/10 text-white" style={{ borderColor: `${colors.primary}50` }}>
                        <SelectValue placeholder="Selecione a versão" />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(bibleVersions).map(([key, val]) => (
                            <SelectItem key={key} value={key}>
                                {val.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {isImporting && progress.total > 0 && (
                    <div className="text-sm" style={{ color: colors.primary }}>
                        Importando: {progress.current} de {progress.total} livros ({Math.round((progress.current / progress.total) * 100)}%)
                    </div>
                )}

                <Button
                    onClick={handleImport}
                    disabled={isImporting || !version}
                    className="w-full text-white"
                    style={{ background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}
                >
                    {isImporting ? (
                        <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Importando... {progress.current}/{progress.total}
                        </>
                    ) : (
                        <>
                            <Download className="w-5 h-5 mr-2" />
                            Importar Bíblia Completa
                        </>
                    )}
                </Button>

                <p className="text-xs" style={{ color: `${colors.primary}99` }}>
                    Fonte: github.com/thiagobodruk/biblia - Este processo pode demorar vários minutos.
                </p>
            </CardContent>
        </Card>
    );
}