import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Wand2, Music, Upload, Video, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import LyricSyncEditor from "./LyricSyncEditor";
import ThemePicker from "./ThemePicker";
import ChordImporter from "@/components/songs/ChordImporter";
import BackgroundGallery from "@/components/projection/BackgroundGallery";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function SongForm({ song, onSubmit, onCancel }) {
    const colors = useThemeColors();
    const [formData, setFormData] = useState(song || {
        title: "",
        artist: "",
        lyrics: "",
        duration: 180,
        category: "worship",
        audio_url: "",
        background_image: "",
        slides: [],
        font_size: "large",
        font_family: "sans",
        text_effect: "shadow",
        text_color: "#ffffff",
        text_color_2: "",
        bpm: null,
        song_key: "",
        chords: "",
        musician_notes: "",
        is_favorite: false
    });
    const [pendingVideo, setPendingVideo] = useState(null);
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);
    const [showSyncEditor, setShowSyncEditor] = useState(false);

    const detectChorus = (text) => {
        // Detecta refrão: linhas começando com [Refrão], Refrão:, Coro, [Coro], etc.
        return /^\s*(\[?\s*(refr[ãa]o|coro)\s*:?\s*\]?)/i.test(text);
    };

    const processLyrics = () => {
        if (!formData.lyrics) return;
        
        // Dividir por estrofes (parágrafos separados por linha vazia)
        const blocks = formData.lyrics.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
        
        if (blocks.length > 1) {
            // Há estrofes bem definidas — cada estrofe = 1 slide
            const slideDuration = formData.duration ? Math.round(formData.duration / blocks.length) : 12;
            const slides = blocks.map(b => ({ text: b, duration: slideDuration, is_chorus: detectChorus(b) }));
            setFormData({ ...formData, slides });
        } else {
            // Sem estrofes — dividir por cada 4 linhas
            const lines = formData.lyrics.split('\n').filter(line => line.trim());
            const slideDuration = formData.duration ? Math.round(formData.duration / Math.max(Math.ceil(lines.length / 4), 1)) : 12;
            const slides = [];
            for (let i = 0; i < lines.length; i += 4) {
                const slideText = lines.slice(i, i + 4).join('\n');
                if (slideText.trim()) slides.push({ text: slideText, duration: slideDuration, is_chorus: detectChorus(slideText) });
            }
            setFormData({ ...formData, slides: slides.length > 0 ? slides : [{ text: formData.lyrics, duration: formData.duration || 30 }] });
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // Se não tiver slides, criar um slide padrão com a letra completa
        const dataToSubmit = { ...formData };
        if (!dataToSubmit.slides || dataToSubmit.slides.length === 0) {
            dataToSubmit.slides = [{
                text: formData.lyrics,
                duration: formData.duration || 30
            }];
        }
        
        onSubmit(dataToSubmit);
    };

    return (
        <Card className="border" style={{ background: `linear-gradient(to bottom right, ${colors.primary}20, ${colors.secondary}20)`, borderColor: `${colors.primary}50` }}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle style={{ color: colors.primary }}>
                        {song ? "Editar Música" : "Nova Música"}
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onCancel}
                        style={{ color: colors.primary }}
                    >
                        <X className="w-5 h-5" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        placeholder="Título da música"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="bg-white/10 border-border text-white placeholder:text-gray-400"
                        required
                    />
                    <Input
                        placeholder="Artista"
                        value={formData.artist}
                        onChange={(e) => setFormData({ ...formData, artist: e.target.value })}
                        className="bg-white/10 border-border text-white placeholder:text-gray-400"
                    />
                    <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                        <SelectTrigger className="bg-white/10 border-border text-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="worship">Adoração</SelectItem>
                            <SelectItem value="praise">Louvor</SelectItem>
                            <SelectItem value="hymn">Hino</SelectItem>
                            <SelectItem value="contemporary">Contemporâneo</SelectItem>
                            <SelectItem value="other">Outro</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input
                        type="number"
                        placeholder="Duração (segundos)"
                        value={formData.duration}
                        onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                        className="bg-white/10 border-border text-white placeholder:text-gray-400"
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            type="number"
                            placeholder="BPM (andamento)"
                            value={formData.bpm || ""}
                            onChange={(e) => setFormData({ ...formData, bpm: e.target.value ? parseInt(e.target.value) : null })}
                            className="bg-white/10 border-border text-white placeholder:text-gray-400"
                        />
                        <Input
                            placeholder="Tonalidade (ex: C, G, Am)"
                            value={formData.song_key || ""}
                            onChange={(e) => setFormData({ ...formData, song_key: e.target.value })}
                            className="bg-white/10 border-border text-white placeholder:text-gray-400"
                        />
                    </div>
                    <Input
                        placeholder="Número CCLI (para licenciamento)"
                        value={formData.ccli_number || ""}
                        onChange={(e) => setFormData({ ...formData, ccli_number: e.target.value })}
                        className="bg-white/10 border-border text-white placeholder:text-gray-400"
                    />
                    <Textarea
                        placeholder="Observações para músicos (ex: capo 2, introdução 4 compassos...)"
                        value={formData.musician_notes || ""}
                        onChange={(e) => setFormData({ ...formData, musician_notes: e.target.value })}
                        className="bg-white/10 border-border text-white placeholder:text-gray-400 min-h-20"
                    />
                    <Textarea
                        placeholder={"Letra da música...\n\nDica: escreva [Refrão] no início da estrofe para destacá-la na projeção."}
                        value={formData.lyrics}
                        onChange={(e) => setFormData({ ...formData, lyrics: e.target.value })}
                        className="bg-white/10 border-border text-white placeholder:text-gray-400 min-h-48"
                        required
                    />
                    <ChordImporter onImport={(slides) => {
                        setFormData({
                            ...formData,
                            slides,
                            lyrics: slides.map(s => s.text).join("\n\n")
                        });
                    }} />
                    
                    <div className="space-y-4 p-4 bg-primary/10 border border-border rounded-lg">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Video className="w-4 h-4" />
                            Vídeo MP4 (Enviado para dispositivo separado)
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Ao projetar, a letra vai para o projetor e o vídeo para o tablet/telemóvel conectado
                        </p>
                        
                        {formData.audio_url && (formData.audio_url.includes('.mp4') || formData.audio_url.includes('video') || formData.audio_url.startsWith('data:video')) ? (
                            <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded border border-green-500/30">
                                <Video className="w-5 h-5 text-green-400" />
                                <div className="flex-1">
                                    <p className="text-sm text-green-300">✓ Vídeo carregado</p>
                                    <p className="text-xs text-green-400/70">Será enviado para o dispositivo de vídeo</p>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFormData({ ...formData, audio_url: "" })}
                                    className="text-red-400 hover:text-red-300"
                                >
                                    Remover
                                </Button>
                            </div>
                        ) : pendingVideo ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-3 p-3 bg-primary/10 rounded border border-border">
                                    <Video className="w-5 h-5 text-accent" />
                                    <div className="flex-1">
                                        <p className="text-sm text-muted-foreground">Ficheiro: {pendingVideo.name}</p>
                                        <p className="text-xs text-muted-foreground/70">Tamanho: {(pendingVideo.size / (1024 * 1024)).toFixed(2)} MB</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        onClick={async () => {
                                            setIsUploadingVideo(true);
                                            try {
                                                const { file_url } = await base44.integrations.Core.UploadFile({ file: pendingVideo });
                                                setFormData({ ...formData, audio_url: file_url });
                                                setPendingVideo(null);
                                            } catch (error) {
                                                console.error("Erro ao fazer upload:", error);
                                                alert("Erro ao fazer upload do vídeo");
                                            } finally {
                                                setIsUploadingVideo(false);
                                            }
                                        }}
                                        disabled={isUploadingVideo}
                                        className="flex-1 bg-green-600 hover:bg-green-700"
                                    >
                                        {isUploadingVideo ? "A enviar..." : "✓ OK - Aceitar Vídeo"}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setPendingVideo(null)}
                                        disabled={isUploadingVideo}
                                        className="flex-1 border-red-500/30 hover:bg-red-500/10 text-red-400"
                                    >
                                        Cancelar
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <Input
                                type="file"
                                accept="video/mp4"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        setPendingVideo(file);
                                    }
                                }}
                                className="bg-white/10 border-border text-white file:bg-primary file:text-white file:border-0 file:px-4 file:py-2 file:rounded file:mr-4"
                            />
                        )}
                    </div>

                            {/* Sincronização letra com vídeo */}
                    {formData.audio_url && formData.lyrics && (
                        <div className="space-y-3">
                            {showSyncEditor ? (
                                <div className="p-4 bg-black/30 border border-yellow-500/40 rounded-lg">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-yellow-300 flex items-center gap-2">
                                            <Clock className="w-4 h-4" />
                                            Editor de Sincronização
                                        </h3>
                                        <button type="button" onClick={() => setShowSyncEditor(false)}
                                            className="text-gray-400 hover:text-white text-xs">✕ Fechar</button>
                                    </div>
                                    <LyricSyncEditor
                                        videoUrl={formData.audio_url}
                                        slides={formData.slides?.length > 0
                                            ? formData.slides
                                            : formData.lyrics.split('\n\n').filter(b => b.trim()).map(b => ({ text: b.trim(), duration: 10 }))}
                                        onSyncDone={(syncedSlides) => {
                                            setFormData({ ...formData, slides: syncedSlides });
                                            setShowSyncEditor(false);
                                        }}
                                        onCancel={() => setShowSyncEditor(false)}
                                    />
                                </div>
                            ) : (
                                <Button
                                    type="button"
                                    onClick={() => {
                                        // Auto-gerar slides se não existirem antes de abrir o sync
                                        if (!formData.slides || formData.slides.length === 0) {
                                            const blocks = formData.lyrics.split('\n\n').filter(b => b.trim());
                                            const autoSlides = blocks.length > 0
                                                ? blocks.map(b => ({ text: b.trim(), duration: 10 }))
                                                : formData.lyrics.split('\n').filter(l => l.trim()).reduce((acc, line, i) => {
                                                    if (i % 4 === 0) acc.push({ text: line, duration: 10 });
                                                    else acc[acc.length - 1].text += "\n" + line;
                                                    return acc;
                                                }, []);
                                            setFormData({ ...formData, slides: autoSlides });
                                        }
                                        setShowSyncEditor(true);
                                    }}
                                    className="w-full bg-gradient-to-r from-yellow-600 to-orange-500 hover:from-yellow-700 hover:to-orange-600 text-white font-semibold"
                                >
                                    <Clock className="w-4 h-4 mr-2" />
                                    🎬 Sincronizar Letra com Vídeo
                                    {formData.slides?.some(s => s.start !== null) && (
                                        <span className="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full">✓ Sincronizado</span>
                                    )}
                                </Button>
                            )}
                        </div>
                    )}

                    <div className="space-y-3">
                        <label className="text-sm text-muted-foreground flex items-center gap-2">
                            <Upload className="w-4 h-4" />
                            Fundo da Projeção
                        </label>
                        <BackgroundGallery
                            value={formData.background_image}
                            onChange={(val) => setFormData({ ...formData, background_image: val })}
                        />
                    </div>

                            <div className="space-y-4 pt-4 border-t border-border">
                                <h3 className="text-sm font-semibold text-foreground">Personalização da Projeção</h3>

                                <ThemePicker
                                    formData={formData}
                                    onApply={(themeFields) => setFormData({ ...formData, ...themeFields })}
                                />

                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Tamanho da Letra</label>
                                    <Select value={formData.font_size || "large"} onValueChange={(value) => setFormData({ ...formData, font_size: value })}>
                                        <SelectTrigger className="bg-white/10 border-border text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="xsmall">Extra Pequeno</SelectItem>
                                            <SelectItem value="small">Pequeno</SelectItem>
                                            <SelectItem value="medium">Médio</SelectItem>
                                            <SelectItem value="large">Grande</SelectItem>
                                            <SelectItem value="xlarge">Extra Grande</SelectItem>
                                            <SelectItem value="xxlarge">Gigante</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Tipo de Fonte</label>
                                    <Select value={formData.font_family || "sans"} onValueChange={(value) => setFormData({ ...formData, font_family: value })}>
                                        <SelectTrigger className="bg-white/10 border-border text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="sans">Sans Serif (Padrão)</SelectItem>
                                            <SelectItem value="serif">Serif (Elegante)</SelectItem>
                                            <SelectItem value="mono">Monospace (Técnico)</SelectItem>
                                            <SelectItem value="cursive">Cursiva (Artístico)</SelectItem>
                                            <SelectItem value="arial">Arial</SelectItem>
                                            <SelectItem value="georgia">Georgia</SelectItem>
                                            <SelectItem value="times">Times New Roman</SelectItem>
                                            <SelectItem value="verdana">Verdana</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-sm text-muted-foreground mb-2 block">Cor da Letra</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs text-accent mb-1 block">Cor Principal</label>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="color"
                                                    value={formData.text_color || "#ffffff"}
                                                    onChange={(e) => setFormData({ ...formData, text_color: e.target.value })}
                                                    className="w-16 h-10 p-1 bg-white/10 border-border"
                                                />
                                                <Input
                                                    type="text"
                                                    value={formData.text_color || "#ffffff"}
                                                    onChange={(e) => setFormData({ ...formData, text_color: e.target.value })}
                                                    className="flex-1 bg-white/10 border-border text-white"
                                                    placeholder="#ffffff"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs text-accent mb-1 block">Cor Secundária (Gradiente)</label>
                                            <div className="flex gap-2">
                                                <Input
                                                    type="color"
                                                    value={formData.text_color_2 || "#ffffff"}
                                                    onChange={(e) => setFormData({ ...formData, text_color_2: e.target.value })}
                                                    className="w-16 h-10 p-1 bg-white/10 border-border"
                                                />
                                                <Input
                                                    type="text"
                                                    value={formData.text_color_2 || ""}
                                                    onChange={(e) => setFormData({ ...formData, text_color_2: e.target.value })}
                                                    className="flex-1 bg-white/10 border-border text-white"
                                                    placeholder="Opcional"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    {formData.text_color_2 && (
                                        <div className="p-3 rounded bg-primary/10 border border-border">
                                            <p className="text-xs text-muted-foreground mb-2">Preview do Gradiente:</p>
                                            <div 
                                                className="h-12 rounded flex items-center justify-center text-2xl font-bold"
                                                style={{
                                                    background: `linear-gradient(to right, ${formData.text_color}, ${formData.text_color_2})`,
                                                    WebkitBackgroundClip: 'text',
                                                    WebkitTextFillColor: 'transparent',
                                                    backgroundClip: 'text'
                                                }}
                                            >
                                                Exemplo de Texto
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="text-sm text-muted-foreground mb-2 block">Efeito Visual</label>
                                    <Select value={formData.text_effect || "shadow"} onValueChange={(value) => setFormData({ ...formData, text_effect: value })}>
                                        <SelectTrigger className="bg-white/10 border-border text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="shadow">Sombra</SelectItem>
                                            <SelectItem value="double-shadow">Sombra Dupla</SelectItem>
                                            <SelectItem value="glow">Brilho</SelectItem>
                                            <SelectItem value="outline">Contorno</SelectItem>
                                            <SelectItem value="3d">Efeito 3D</SelectItem>
                                            <SelectItem value="neon">Neon</SelectItem>
                                            <SelectItem value="none">Nenhum</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <Button
                                type="button"
                                onClick={processLyrics}
                            disabled={!formData.lyrics}
                            className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
                            >
                            <Wand2 className="w-4 h-4 mr-2" />
                            Gerar Slides Automaticamente
                            </Button>
                    
                    {formData.slides?.length > 0 && (
                        <div className="text-sm text-muted-foreground">
                            {formData.slides.length} slides gerados
                        </div>
                    )}
                    
                    <div className="flex gap-3 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCancel}
                            className="flex-1"
                            style={{ borderColor: `${colors.primary}50` }}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1 text-white"
                            style={{ background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}
                        >
                            {song ? "Atualizar" : "Adicionar"}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}