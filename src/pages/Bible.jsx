import React, { useState } from "react";
import { keryx } from "@/api/keryxClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Maximize2, Book, Search, Star, Upload, BookOpen, ChevronUp, ChevronDown, Clock, Layers } from "lucide-react";
import { motion } from "framer-motion";
import { useThemeColors } from "@/hooks/useThemeColors";
import { openProjectionWindow, sendToProjection } from "@/lib/projectionWindow";
import { getBibleProjectionStyle } from "@/utils/bibleProjectionStyle";

import BibleSelector from "../components/bible/BibleSelector";
import BibleReader from "../components/bible/BibleReader";
import BibleImporter from "../components/bible/BibleImporter";
import BibleSearch from "../components/bible/BibleSearch";
import BibleFavorites from "../components/bible/BibleFavorites";
import BibleCompare from "../components/bible/BibleCompare";
import ProjectionTools from "../components/projection/ProjectionTools";
import PreviewPanel from "../components/projection/PreviewPanel";
import OverlayManager from "../components/projection/OverlayManager";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function Bible() {
    const queryClient = useQueryClient();

    const colors = useThemeColors();

    const createPassageMutation = useMutation({
        mutationFn: (passageData) => keryx.entities.BiblePassage.create(passageData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["biblePassages"] });
        },
    });

    const handlePassageFound = (passageData) => {
        createPassageMutation.mutate(passageData);
    };

    const [previewContent, setPreviewContent] = useState(null);
    const [overlays, setOverlays] = useState([]);
    const [showProjectionTools, setShowProjectionTools] = useState(false);

    const sendPassageToProjection = (passage) => {
        const savedStyle = getBibleProjectionStyle();
        sendToProjection({
            type: "PROJECTION_DATA",
            title: passage.reference,
            is_bible: true,
            bible_reference: passage.reference,
            slides: passage.slides?.length ? passage.slides : [{ text: passage.text, duration: 12 }],
            background_image: passage.background_image || savedStyle.background_image || null,
            font_size: passage.font_size || savedStyle.font_size || "large",
            font_family: passage.font_family || savedStyle.font_family || "sans",
            text_effect: passage.text_effect || "shadow",
            text_color: passage.text_color || savedStyle.text_color || "#ffffff",
            text_color_2: passage.text_color_2 || "",
        });
    };

    const handleProjectDirect = (passageData) => {
        const savedStyle = getBibleProjectionStyle();
        // Atualizar pré-visualização
        setPreviewContent({
            type: "bible",
            title: passageData.reference,
            slides: passageData.slides?.length ? passageData.slides : [{ text: passageData.text, duration: 12 }],
            slide_index: 0,
            text_color: passageData.text_color || savedStyle.text_color || "#ffffff",
            text_color_2: passageData.text_color_2 || "",
            background_image: passageData.background_image || savedStyle.background_image || null,
            font_size: passageData.font_size || savedStyle.font_size || "large",
            font_family: passageData.font_family || savedStyle.font_family || "sans",
            text_effect: passageData.text_effect || "shadow",
        });

        // Enviar para a janela única de projeção (abre-a se ainda não existir)
        sendPassageToProjection(passageData);
        // Guardar na base de dados em background (não bloqueia a projeção)
        createPassageMutation.mutate(passageData);
    };

    return (
        <div className="min-h-screen p-4 md:p-6 bg-background">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-wrap justify-between items-center mb-8 gap-4"
                >
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                            <Book className="w-7 h-7" style={{ color: colors.primary }} />
                            Bíblia Sagrada
                        </h1>
                        <p className="mt-1 text-sm text-gray-500">Sistema de Projeção de Versículos</p>
                    </div>
                    <Button
                        onClick={openProjectionWindow}
                        className="text-white"
                        style={{ background: colors.primary }}
                    >
                        <Maximize2 className="w-4 h-4 mr-2" />
                        Abrir Tela de Projeção
                    </Button>
                </motion.div>

                {/* Pré-visualização + Camadas */}
                {previewContent && (
                    <div className="mb-6 space-y-3">
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Pré-visualização</span>
                        <PreviewPanel content={previewContent} overlays={overlays} />
                        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                            <OverlayManager overlays={overlays} onChange={setOverlays} />
                        </div>
                    </div>
                )}

                {/* Ferramentas de Projeção — expansível */}
                <div className="mb-4">
                    <Button
                        variant="outline"
                        onClick={() => setShowProjectionTools(!showProjectionTools)}
                        className="w-full justify-between"
                        style={{ borderColor: `${colors.primary}40`, color: colors.primary }}
                    >
                        <span className="flex items-center">
                            <Clock className="w-4 h-4 mr-2" />
                            Ferramentas de Projeção
                        </span>
                        {showProjectionTools ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    {showProjectionTools && (
                        <div className="mt-2">
                            <ProjectionTools />
                        </div>
                    )}
                </div>

                <Tabs defaultValue="selector" className="mb-6">
                    <TabsList className="grid grid-cols-3 w-full mb-4 bg-white/5 border border-white/10 rounded-xl">
                        <TabsTrigger value="selector" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-gray-400 rounded-lg">
                            <Search className="w-4 h-4 mr-1.5" /> Buscar
                        </TabsTrigger>
                        <TabsTrigger value="reader" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-gray-400 rounded-lg">
                            <BookOpen className="w-4 h-4 mr-1.5" /> Ler
                        </TabsTrigger>
                        <TabsTrigger value="more" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-gray-400 rounded-lg">
                            <Star className="w-4 h-4 mr-1.5" /> Mais
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="selector">
                        <div className="space-y-4">
                            <BibleSelector onPassageFound={handlePassageFound} onProjectDirect={handleProjectDirect} />
                            <BibleSearch onProjectVerse={handleProjectDirect} />
                        </div>
                    </TabsContent>
                    <TabsContent value="reader">
                        <BibleReader />
                    </TabsContent>
                    <TabsContent value="more">
                        <Tabs defaultValue="favorites">
                            <TabsList className="grid grid-cols-3 w-full mb-4 bg-white/5 border border-white/10 rounded-xl">
                                <TabsTrigger value="favorites" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-gray-400 rounded-lg">
                                    <Star className="w-4 h-4 mr-1.5" /> Favoritos
                                </TabsTrigger>
                                <TabsTrigger value="import" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-gray-400 rounded-lg">
                                    <Upload className="w-4 h-4 mr-1.5" /> Importar
                                </TabsTrigger>
                                <TabsTrigger value="compare" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-gray-400 rounded-lg">
                                    <Layers className="w-4 h-4 mr-1.5" /> Comparar
                                </TabsTrigger>
                            </TabsList>
                            <TabsContent value="favorites">
                                <BibleFavorites onProjectVerse={handleProjectDirect} />
                            </TabsContent>
                            <TabsContent value="import">
                                <BibleImporter onImportComplete={() => queryClient.invalidateQueries({ queryKey: ["biblePassages"] })} />
                            </TabsContent>
                            <TabsContent value="compare">
                                <BibleCompare onProjectVerse={handleProjectDirect} />
                            </TabsContent>
                        </Tabs>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}