import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Clock, Timer, Bell, Upload, Image } from "lucide-react";
import { keryx } from "@/api/keryxClient";

export default function CommunicationVideoForm({ video, onSubmit, onCancel }) {
    const [formData, setFormData] = useState(video || {
        title: "",
        type: "countdown",
        duration: 300,
        text: "",
        subtext: "",
        background_image: "",
        background_video: "",
        background_audio: "",
        background_color: "linear-gradient(to br, #2a2520, #1a1714)",
        text_color: "#ffffff",
        text_color_2: "",
        font_size: "large",
        font_family: "sans",
        text_effect: "shadow",
        text_position_h: "center",
        text_position_v: "middle",
        show_logo: true,
        logo_position: "top-left",
        sound_alert: false
    });

    const [logoUrl, setLogoUrl] = useState("");
    const [pendingImage, setPendingImage] = useState("");
    const [pendingVideo, setPendingVideo] = useState("");
    const [pendingAudio, setPendingAudio] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState(video?.files || []);

    useEffect(() => {
        const loadLogo = async () => {
            try {
                const user = await keryx.auth.me();
                setLogoUrl(user.logo_url || "");
            } catch (error) {
                console.error("Erro ao carregar logo:", error);
            }
        };
        loadLogo();
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ ...formData, files: uploadedFiles });
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setIsUploading(true);
        try {
            const { file_url } = await keryx.integrations.Core.UploadFile({ file });
            setPendingImage(file_url);
        } catch (error) {
            console.error("Erro ao fazer upload:", error);
            alert("Erro ao fazer upload da imagem");
        } finally {
            setIsUploading(false);
        }
    };

    const handleVideoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setIsUploading(true);
        try {
            const { file_url } = await keryx.integrations.Core.UploadFile({ file });
            setPendingVideo(file_url);
        } catch (error) {
            console.error("Erro ao fazer upload:", error);
            alert("Erro ao fazer upload do vídeo");
        } finally {
            setIsUploading(false);
        }
    };

    const handleAudioUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setIsUploading(true);
        try {
            const { file_url } = await keryx.integrations.Core.UploadFile({ file });
            setPendingAudio(file_url);
        } catch (error) {
            console.error("Erro ao fazer upload:", error);
            alert("Erro ao fazer upload do áudio");
        } finally {
            setIsUploading(false);
        }
    };

    const handleMultipleFilesUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setIsUploading(true);
        try {
            for (const file of files) {
                const { file_url } = await keryx.integrations.Core.UploadFile({ file });
                
                let fileType = "image";
                let duration = 5;
                
                if (file.type.startsWith("video/")) {
                    fileType = "video";
                    duration = 0;
                } else if (file.type.startsWith("audio/")) {
                    fileType = "audio";
                    duration = 0;
                }

                setUploadedFiles(prev => [...prev, {
                    url: file_url,
                    type: fileType,
                    duration: duration,
                    name: file.name
                }]);
            }
        } catch (error) {
            console.error("Erro ao fazer upload:", error);
            alert("Erro ao fazer upload dos ficheiros");
        } finally {
            setIsUploading(false);
        }
    };

    const removeFile = (index) => {
        setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const typeIcons = {
        countdown: Clock,
        timer: Timer,
        announcement: Bell,
        image_text: Image
    };

    const TypeIcon = typeIcons[formData.type];

    return (
        <Card className="bg-gradient-to-br from-orange-900/20 to-red-900/20 border-orange-500/30">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-orange-100 flex items-center gap-2">
                        <TypeIcon className="w-5 h-5" />
                        {video ? "Editar Comunicação" : "Nova Comunicação"}
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onCancel}
                        className="text-orange-300 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        placeholder="Título (ex: Início do Culto em...)"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="bg-white/10 border-orange-500/30 text-white placeholder:text-gray-400"
                        required
                    />

                    <Select
                        value={formData.type}
                        onValueChange={(value) => setFormData({ ...formData, type: value })}
                    >
                        <SelectTrigger className="bg-white/10 border-orange-500/30 text-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="countdown">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    Contagem Regressiva
                                </div>
                            </SelectItem>
                            <SelectItem value="timer">
                                <div className="flex items-center gap-2">
                                    <Timer className="w-4 h-4" />
                                    Cronómetro
                                </div>
                            </SelectItem>
                            <SelectItem value="announcement">
                                <div className="flex items-center gap-2">
                                    <Bell className="w-4 h-4" />
                                    Chamar Atenção / Anúncio
                                </div>
                            </SelectItem>
                            <SelectItem value="image_text">
                                <div className="flex items-center gap-2">
                                    <Image className="w-4 h-4" />
                                    Imagem + Texto
                                </div>
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm text-orange-300 mb-2 block">
                                Duração (segundos)
                            </label>
                            <Input
                                type="number"
                                min="1"
                                value={formData.duration}
                                onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                                className="bg-white/10 border-orange-500/30 text-white"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-sm text-orange-300 mb-2 block">
                                Tamanho da Fonte
                            </label>
                            <Select
                                value={formData.font_size}
                                onValueChange={(value) => setFormData({ ...formData, font_size: value })}
                            >
                                <SelectTrigger className="bg-white/10 border-orange-500/30 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="small">Pequeno</SelectItem>
                                    <SelectItem value="medium">Médio</SelectItem>
                                    <SelectItem value="large">Grande</SelectItem>
                                    <SelectItem value="xlarge">Extra Grande</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Input
                        placeholder="Texto principal"
                        value={formData.text}
                        onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                        className="bg-white/10 border-orange-500/30 text-white placeholder:text-gray-400"
                    />

                    <Textarea
                        placeholder="Subtexto/mensagem adicional"
                        value={formData.subtext}
                        onChange={(e) => setFormData({ ...formData, subtext: e.target.value })}
                        className="bg-white/10 border-orange-500/30 text-white placeholder:text-gray-400 min-h-20"
                    />

                    <div className="space-y-3">
                        <label className="text-sm text-orange-300 flex items-center gap-2">
                            <Upload className="w-4 h-4" />
                            Fundo
                        </label>

                        <div>
                            <p className="text-xs text-orange-400 mb-2">Gradientes Worship</p>
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { name: "Roxo Profundo", value: "linear-gradient(to br, #581c87, #312e81)" },
                                    { name: "Azul Celestial", value: "linear-gradient(to br, #1e3a8a, #581c87)" },
                                    { name: "Fogo Santo", value: "linear-gradient(to br, #c2410c, #991b1b)" },
                                    { name: "Verde Esperança", value: "linear-gradient(to br, #065f46, #1e40af)" },
                                    { name: "Dourado Glória", value: "linear-gradient(to br, #92400e, #d97706)" },
                                    { name: "Rosa Amor", value: "linear-gradient(to br, #9f1239, #be123c)" },
                                    { name: "Turquesa Paz", value: "linear-gradient(to br, #0e7490, #155e75)" },
                                    { name: "Coral Adoração", value: "linear-gradient(to br, #ea580c, #dc2626)" },
                                ].map((bg) => (
                                    <button
                                        key={bg.name}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, background_color: bg.value, background_image: "", background_video: "" })}
                                        className="h-12 rounded border-2 transition-all hover:scale-105"
                                        style={{ background: bg.value, borderColor: formData.background_color === bg.value ? '#fb923c' : 'transparent' }}
                                        title={bg.name}
                                    />
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-xs text-orange-400 mb-2">Imagens Worship do Unsplash</p>
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1920&q=80",
                                    "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=1920&q=80",
                                    "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=1920&q=80",
                                    "https://images.unsplash.com/photo-1502139214982-d0ad755818d8?w=1920&q=80",
                                    "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=1920&q=80",
                                    "https://images.unsplash.com/photo-1476610182048-b716b8518aae?w=1920&q=80",
                                    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80",
                                    "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&q=80",
                                ].map((url, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, background_image: url, background_color: "", background_video: "" })}
                                        className="h-12 rounded border-2 transition-all hover:scale-105 bg-cover bg-center"
                                        style={{ 
                                            backgroundImage: `url(${url})`,
                                            borderColor: formData.background_image === url ? '#fb923c' : 'transparent'
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-orange-400">Upload de Imagem (JPG, PNG)</label>
                            <Input
                                type="file"
                                accept="image/jpeg,image/jpg,image/png"
                                onChange={handleImageUpload}
                                disabled={isUploading}
                                className="bg-white/10 border-orange-500/30 text-white file:bg-orange-600 file:text-white file:border-0 file:px-4 file:py-2 file:rounded file:mr-4"
                            />
                            {pendingImage && (
                                <div className="flex items-center gap-3 p-3 bg-orange-500/10 rounded-lg border border-orange-500/30">
                                    <img src={pendingImage} alt="Preview" className="w-24 h-24 object-cover rounded" />
                                    <div className="flex-1">
                                        <p className="text-sm text-orange-300 mb-2">✓ Upload concluído</p>
                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                onClick={() => {
                                                    setFormData({ ...formData, background_image: pendingImage, background_color: "", background_video: "" });
                                                    setPendingImage("");
                                                }}
                                                size="sm"
                                                className="bg-orange-600 hover:bg-orange-700"
                                            >
                                                ✓ OK - Usar Imagem
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setPendingImage("")}
                                                className="text-red-400 hover:text-red-300"
                                            >
                                                Cancelar
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-orange-400">Upload de Vídeo de Fundo (MP4)</label>
                            <Input
                                type="file"
                                accept="video/mp4"
                                onChange={handleVideoUpload}
                                disabled={isUploading}
                                className="bg-white/10 border-orange-500/30 text-white file:bg-orange-600 file:text-white file:border-0 file:px-4 file:py-2 file:rounded file:mr-4"
                            />
                            {pendingVideo && (
                                <div className="flex items-center gap-3 p-3 bg-orange-500/10 rounded-lg border border-orange-500/30">
                                    <video src={pendingVideo} className="w-24 h-24 object-cover rounded" muted />
                                    <div className="flex-1">
                                        <p className="text-sm text-orange-300 mb-2">✓ Upload concluído</p>
                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                onClick={() => {
                                                    setFormData({ ...formData, background_video: pendingVideo, background_color: "", background_image: "" });
                                                    setPendingVideo("");
                                                }}
                                                size="sm"
                                                className="bg-orange-600 hover:bg-orange-700"
                                            >
                                                ✓ OK - Usar Vídeo
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setPendingVideo("")}
                                                className="text-red-400 hover:text-red-300"
                                            >
                                                Cancelar
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-orange-400">Upload de Áudio de Fundo (MP3)</label>
                            <Input
                                type="file"
                                accept="audio/mpeg,audio/mp3"
                                onChange={handleAudioUpload}
                                disabled={isUploading}
                                className="bg-white/10 border-orange-500/30 text-white file:bg-orange-600 file:text-white file:border-0 file:px-4 file:py-2 file:rounded file:mr-4"
                            />
                            {pendingAudio && (
                                <div className="flex items-center gap-3 p-3 bg-orange-500/10 rounded-lg border border-orange-500/30">
                                    <div className="text-4xl">🎵</div>
                                    <div className="flex-1">
                                        <p className="text-sm text-orange-300 mb-2">✓ Áudio carregado</p>
                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                onClick={() => {
                                                    setFormData({ ...formData, background_audio: pendingAudio });
                                                    setPendingAudio("");
                                                }}
                                                size="sm"
                                                className="bg-orange-600 hover:bg-orange-700"
                                            >
                                                ✓ OK - Usar Áudio
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setPendingAudio("")}
                                                className="text-red-400 hover:text-red-300"
                                            >
                                                Cancelar
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-sm text-orange-300 mb-2 block">Cor Principal do Texto</label>
                                <div className="flex gap-2">
                                    <Input
                                        type="color"
                                        value={formData.text_color}
                                        onChange={(e) => setFormData({ ...formData, text_color: e.target.value })}
                                        className="w-14 h-10 p-1 cursor-pointer"
                                    />
                                    <Input
                                        type="text"
                                        value={formData.text_color}
                                        onChange={(e) => setFormData({ ...formData, text_color: e.target.value })}
                                        className="flex-1 bg-white/10 border-orange-500/30 text-white"
                                        placeholder="#ffffff"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-sm text-orange-300 mb-2 block">Cor Secundária (Gradiente)</label>
                                <div className="flex gap-2">
                                    <Input
                                        type="color"
                                        value={formData.text_color_2 || "#ffffff"}
                                        onChange={(e) => setFormData({ ...formData, text_color_2: e.target.value })}
                                        className="w-14 h-10 p-1 cursor-pointer"
                                    />
                                    <Input
                                        type="text"
                                        value={formData.text_color_2 || ""}
                                        onChange={(e) => setFormData({ ...formData, text_color_2: e.target.value })}
                                        className="flex-1 bg-white/10 border-orange-500/30 text-white"
                                        placeholder="Opcional"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-sm text-orange-300 mb-2 block">Tipo de Fonte</label>
                                <Select value={formData.font_family || "sans"} onValueChange={(v) => setFormData({ ...formData, font_family: v })}>
                                    <SelectTrigger className="bg-white/10 border-orange-500/30 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="sans">Sans Serif</SelectItem>
                                        <SelectItem value="serif">Serif</SelectItem>
                                        <SelectItem value="mono">Monospace</SelectItem>
                                        <SelectItem value="cursive">Cursiva</SelectItem>
                                        <SelectItem value="arial">Arial</SelectItem>
                                        <SelectItem value="georgia">Georgia</SelectItem>
                                        <SelectItem value="times">Times New Roman</SelectItem>
                                        <SelectItem value="verdana">Verdana</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-sm text-orange-300 mb-2 block">Efeito Visual</label>
                                <Select value={formData.text_effect || "shadow"} onValueChange={(v) => setFormData({ ...formData, text_effect: v })}>
                                    <SelectTrigger className="bg-white/10 border-orange-500/30 text-white">
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

                        {formData.type === "image_text" && (
                            <div className="grid grid-cols-2 gap-3 p-3 bg-orange-500/10 rounded-lg border border-orange-500/30">
                                <div>
                                    <label className="text-sm text-orange-300 mb-2 block">Posição Horizontal</label>
                                    <Select value={formData.text_position_h || "center"} onValueChange={(v) => setFormData({ ...formData, text_position_h: v })}>
                                        <SelectTrigger className="bg-white/10 border-orange-500/30 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="left">Esquerda</SelectItem>
                                            <SelectItem value="center">Centro</SelectItem>
                                            <SelectItem value="right">Direita</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <label className="text-sm text-orange-300 mb-2 block">Posição Vertical</label>
                                    <Select value={formData.text_position_v || "middle"} onValueChange={(v) => setFormData({ ...formData, text_position_v: v })}>
                                        <SelectTrigger className="bg-white/10 border-orange-500/30 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="top">Topo</SelectItem>
                                            <SelectItem value="middle">Meio</SelectItem>
                                            <SelectItem value="bottom">Fundo</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-3 pt-4 border-t border-orange-500/30">
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 text-orange-200 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.show_logo}
                                    onChange={(e) => setFormData({ ...formData, show_logo: e.target.checked })}
                                    className="w-4 h-4"
                                />
                                Mostrar logo da igreja
                            </label>
                            <label className="flex items-center gap-2 text-orange-200 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.sound_alert}
                                    onChange={(e) => setFormData({ ...formData, sound_alert: e.target.checked })}
                                    className="w-4 h-4"
                                />
                                Som de alerta
                            </label>
                        </div>

                        {formData.show_logo && (
                            <div>
                                <label className="text-sm text-orange-300 mb-2 block">Posição do Logo</label>
                                <Select
                                    value={formData.logo_position}
                                    onValueChange={(value) => setFormData({ ...formData, logo_position: value })}
                                >
                                    <SelectTrigger className="bg-white/10 border-orange-500/30 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="top-left">Canto Superior Esquerdo</SelectItem>
                                        <SelectItem value="top-right">Canto Superior Direito</SelectItem>
                                        <SelectItem value="bottom-left">Canto Inferior Esquerdo</SelectItem>
                                        <SelectItem value="bottom-right">Canto Inferior Direito</SelectItem>
                                        <SelectItem value="center">Centro</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    <div className="space-y-3 pt-4 border-t border-orange-500/30">
                        <label className="text-sm text-orange-300 flex items-center gap-2">
                            <Upload className="w-4 h-4" />
                            Adicionar Múltiplos Ficheiros (Loop)
                        </label>
                        <p className="text-xs text-orange-400">
                            Carregue vários ficheiros (imagens, vídeos, áudios) que serão reproduzidos em loop durante a comunicação
                        </p>
                        <Input
                            type="file"
                            accept="image/*,video/mp4,audio/mp3,audio/mpeg"
                            multiple
                            onChange={handleMultipleFilesUpload}
                            disabled={isUploading}
                            className="bg-white/10 border-orange-500/30 text-white file:bg-orange-600 file:text-white file:border-0 file:px-4 file:py-2 file:rounded file:mr-4"
                        />
                        
                        {uploadedFiles.length > 0 && (
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                <p className="text-sm text-orange-300">{uploadedFiles.length} ficheiro(s) adicionado(s)</p>
                                {uploadedFiles.map((file, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-2 bg-orange-500/10 rounded border border-orange-500/30">
                                        {file.type === "video" && <span className="text-2xl">🎥</span>}
                                        {file.type === "image" && <span className="text-2xl">🖼️</span>}
                                        {file.type === "audio" && <span className="text-2xl">🎵</span>}
                                        <div className="flex-1">
                                            <p className="text-sm text-white">{file.name || `Ficheiro ${idx + 1}`}</p>
                                            <p className="text-xs text-orange-300">{file.type}</p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeFile(idx)}
                                            className="text-red-400 hover:text-red-300"
                                        >
                                            ✕
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onCancel}
                            className="flex-1 border-orange-500/30 hover:bg-orange-500/10"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700"
                        >
                            {video ? "Atualizar" : "Criar"}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}