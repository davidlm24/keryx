import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Image as ImageIcon, Upload, Search, Loader2 } from "lucide-react";
import { keryx } from "@/api/keryxClient";
import { BACKGROUNDS, backgroundUrl } from "@/lib/backgrounds";

// Galeria de fundos: gradientes + imagens incluídas no app (src/lib/backgrounds.js).
const CATEGORIES = Object.fromEntries(
    Object.entries(BACKGROUNDS)
        .filter(([cat]) => cat !== "Comunicação")
        .map(([cat, ids]) => [cat, ids.map(backgroundUrl)]),
);

const GRADIENTS = [
    { name: "Roxo/Índigo", value: "linear-gradient(to br, #581c87, #312e81)" },
    { name: "Azul/Roxo", value: "linear-gradient(to br, #1e3a8a, #581c87)" },
    { name: "Verde/Azul", value: "linear-gradient(to br, #065f46, #1e40af)" },
    { name: "Laranja/Rosa", value: "linear-gradient(to br, #c2410c, #be185d)" },
    { name: "Cinza/Preto", value: "linear-gradient(to br, #1f2937, #000000)" },
    { name: "Dourado/Marrom", value: "linear-gradient(to br, #92400e, #422006)" },
    { name: "Verde/Limão", value: "linear-gradient(to br, #14532d, #3f6212)" },
    { name: "Vermelho/Laranja", value: "linear-gradient(to br, #7f1d1d, #9a3412)" },
];

export default function BackgroundGallery({ value, onChange }) {
    const [activeCat, setActiveCat] = useState("Adoração");
    const [uploading, setUploading] = useState(false);

    // Saved to the media library, not inlined as base64 into every row that uses it.
    const handleFile = async (file) => {
        if (!file) return;
        setUploading(true);
        try {
            const { file_url } = await keryx.integrations.Core.UploadFile({ file });
            onChange(file_url);
        } catch (err) {
            alert("Erro ao enviar a imagem: " + err.message);
        } finally {
            setUploading(false);
        }
    };
    const [search, setSearch] = useState("");

    const filteredUrls = search.trim()
        ? Object.values(CATEGORIES).flat().filter(url => url.includes(search))
        : CATEGORIES[activeCat] || [];

    return (
        <div className="space-y-3">
            {/* Gradientes */}
            <div>
                <p className="text-xs text-accent mb-2">Gradientes</p>
                <div className="grid grid-cols-4 gap-2">
                    {GRADIENTS.map((bg) => (
                        <button
                            key={bg.name}
                            type="button"
                            onClick={() => onChange(bg.value)}
                            className="h-12 rounded border-2 transition-all hover:scale-105"
                            style={{ background: bg.value, borderColor: value === bg.value ? '#a78bfa' : 'transparent' }}
                            title={bg.name}
                        />
                    ))}
                </div>
            </div>

            {/* Categorias + Pesquisa */}
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs text-accent">Imagens de Fundo</p>
                    <div className="flex-1 relative">
                        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                        <Input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Pesquisar..."
                            className="h-7 text-xs pl-7 bg-white/10 border-border text-white placeholder:text-gray-500"
                        />
                    </div>
                </div>
                {!search.trim() && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        {Object.keys(CATEGORIES).map(cat => (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setActiveCat(cat)}
                                className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                                    activeCat === cat
                                        ? "bg-primary text-white"
                                        : "bg-white/5 text-gray-400 hover:bg-white/10"
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                )}
                <div className="grid grid-cols-4 gap-2">
                    {filteredUrls.map((url, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => onChange(url)}
                            className="h-12 rounded border-2 transition-all hover:scale-105 bg-cover bg-center"
                            style={{
                                backgroundImage: `url(${url})`,
                                borderColor: value === url ? '#a78bfa' : 'transparent'
                            }}
                        />
                    ))}
                </div>
            </div>

            {/* URL personalizada ou upload */}
            <div>
                <p className="text-xs text-accent mb-2 flex items-center gap-1">
                    <Upload className="w-3 h-3" /> Imagem Personalizada
                </p>
                <Input
                    type="text"
                    placeholder="Cole a URL da imagem aqui"
                    value={(value?.startsWith('http') || value?.startsWith('data:')) ? value : ''}
                    onChange={(e) => onChange(e.target.value)}
                    className="bg-white/10 border-border text-white placeholder:text-gray-400 mb-2"
                />
                <Input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e) => handleFile(e.target.files?.[0])}
                    className="bg-white/10 border-border text-white file:bg-primary file:text-white file:border-0 file:px-4 file:py-2 file:rounded file:mr-4"
                />
            </div>

            {uploading && (
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Enviando imagem...</p>
            )}

            {value && (
                <div className="flex items-center gap-2">
                    {value.startsWith('http') || value.startsWith('data:') ? (
                        <img src={value} alt="Fundo" className="w-20 h-20 object-cover rounded" />
                    ) : (
                        <div className="w-20 h-20 rounded" style={{ background: value }} />
                    )}
                    <div className="flex-1">
                        <p className="text-sm text-green-300 flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" /> Fundo selecionado
                        </p>
                        <button
                            type="button"
                            onClick={() => onChange("")}
                            className="text-xs text-red-400 hover:text-red-300"
                        >
                            Remover
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}