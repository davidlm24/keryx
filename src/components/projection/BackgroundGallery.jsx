import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Image as ImageIcon, Upload, Search } from "lucide-react";

/**
 * Galeria de fundos curada — imagens categorizadas do Unsplash + gradientes.
 * Substitui as listas hardcoded espalhadas pelo app.
 */
const CATEGORIES = {
    "Adoração": [
        "https://images.unsplash.com/photo-1518192368985-c6c31d1037f8?w=1920&q=80",
        "https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=1920&q=80",
        "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80",
        "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&q=80",
        "https://images.unsplash.com/photo-1475274047050-1d0c0975c63e?w=1920&q=80",
        "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80",
    ],
    "Natureza": [
        "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=1920&q=80",
        "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80",
        "https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=1920&q=80",
        "https://images.unsplash.com/photo-1490604001847-b712b0172b94?w=1920&q=80",
        "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=1920&q=80",
        "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1920&q=80",
    ],
    "Abstrato": [
        "https://images.unsplash.com/photo-1516339901601-2e1b62dc0c45?w=1920&q=80",
        "https://images.unsplash.com/photo-1451187580459-434d6216065f?w=1920&q=80",
        "https://images.unsplash.com/photo-1505765050516-f72dcac9c60e?w=1920&q=80",
        "https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1920&q=80",
        "https://images.unsplash.com/photo-1451187580459-434d6216065f?w=1920&q=80",
        "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&q=80",
    ],
    "Céu/Luz": [
        "https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=1920&q=80",
        "https://images.unsplash.com/photo-1505765050516-f72dcac9c60e?w=1920&q=80",
        "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1920&q=80",
        "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80",
    ],
};

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
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => onChange(event.target.result);
                        reader.readAsDataURL(file);
                    }}
                    className="bg-white/10 border-border text-white file:bg-primary file:text-white file:border-0 file:px-4 file:py-2 file:rounded file:mr-4"
                />
            </div>

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