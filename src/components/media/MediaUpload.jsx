import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Loader2, Film } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useThemeColors } from "@/hooks/useThemeColors";
import { keryx } from "@/api/keryxClient";
import { mediaTypeOf } from "@/lib/mediaImport";

export default function MediaUpload({ onMediaUploaded }) {
    const colors = useThemeColors();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("other");
    const [isUploading, setIsUploading] = useState(false);
    const [uploadQueue, setUploadQueue] = useState([]);
    const [selectedFiles, setSelectedFiles] = useState([]);

    const handleFileSelect = (event) => {
        const files = Array.from(event.target.files || []);
        setSelectedFiles(files);
    };

    const handleUpload = async () => {
        if (selectedFiles.length === 0 || !title.trim()) return;
        
        setIsUploading(true);
        setUploadQueue(selectedFiles.map(f => ({ name: f.name, status: 'pending' })));

        try {
            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                setUploadQueue(prev => prev.map((item, idx) => 
                    idx === i ? { ...item, status: 'uploading' } : item
                ));

                // The file goes to the media library (on desktop, copied to disk);
                // the row only keeps its URL.
                const { file_url } = await keryx.integrations.Core.UploadFile({ file });

                const mediaType = mediaTypeOf(file);

                await onMediaUploaded({
                    title: selectedFiles.length > 1 ? `${title} - ${file.name}` : title,
                    description,
                    type: mediaType,
                    file_url,
                    category,
                    duration: 0
                });

                setUploadQueue(prev => prev.map((item, idx) => 
                    idx === i ? { ...item, status: 'done' } : item
                ));
            }
            
            setTitle("");
            setDescription("");
            setUploadQueue([]);
            setSelectedFiles([]);
        } catch (error) {
            console.error("Erro ao fazer upload:", error);
            alert("Erro ao fazer upload: " + error.message);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <Card className="border" style={{ background: `linear-gradient(to bottom right, ${colors.primary}20, ${colors.secondary}20)`, borderColor: `${colors.primary}50` }}>
            <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: colors.primary }}>
                    <Film className="w-5 h-5" />
                    Upload de Mídia
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <Input
                    placeholder="Título da mídia"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="bg-white/10 text-white placeholder:text-gray-400"
                    style={{ borderColor: `${colors.primary}50` }}
                />
                <Input
                    placeholder="Descrição (opcional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-white/10 text-white placeholder:text-gray-400"
                    style={{ borderColor: `${colors.primary}50` }}
                />
                <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="bg-white/10 text-white" style={{ borderColor: `${colors.primary}50` }}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="sermon">Sermão</SelectItem>
                        <SelectItem value="worship">Adoração</SelectItem>
                        <SelectItem value="announcement">Anúncio</SelectItem>
                        <SelectItem value="testimony">Testemunho</SelectItem>
                        <SelectItem value="other">Outro</SelectItem>
                    </SelectContent>
                </Select>
                <Input
                    type="file"
                    accept="video/*,audio/*,image/*,.gif,.pdf,.ppt,.pptx"
                    onChange={handleFileSelect}
                    disabled={isUploading}
                    multiple
                    className="bg-white/10 text-white file:text-white file:border-0 file:px-4 file:py-2 file:rounded file:mr-4"
                    style={{ borderColor: `${colors.primary}50` }}
                />
                {selectedFiles.length > 0 && (
                    <div className="text-sm" style={{ color: colors.primary }}>
                        {selectedFiles.length} arquivo(s) selecionado(s)
                    </div>
                )}
                <Button
                    onClick={handleUpload}
                    disabled={isUploading || !title.trim() || selectedFiles.length === 0}
                    className="w-full text-white"
                    style={{ background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}
                >
                    {isUploading ? (
                        <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Carregando...
                        </>
                    ) : (
                        <>
                            <Upload className="w-5 h-5 mr-2" />
                            Adicionar Mídia
                        </>
                    )}
                </Button>
                {uploadQueue.length > 0 && (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                        {uploadQueue.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs" style={{ color: `${colors.primary}cc` }}>
                                {item.status === 'done' && '✓'}
                                {item.status === 'uploading' && <Loader2 className="w-3 h-3 animate-spin" />}
                                {item.status === 'pending' && '⏳'}
                                <span>{item.name}</span>
                            </div>
                        ))}
                    </div>
                )}
                <p className="text-xs" style={{ color: colors.primary }}>
                    Formatos aceitos: Vídeos, Áudios, Imagens, GIF, PDF, PowerPoint • Múltiplos arquivos suportados
                </p>
            </CardContent>
        </Card>
    );
}