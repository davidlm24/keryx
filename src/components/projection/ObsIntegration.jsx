import React, { useState } from "react";
import { Copy, Check, Monitor } from "lucide-react";
import { useThemeColors } from "@/hooks/useThemeColors";

/**
 * Painel de integração OBS — mostra a URL de Browser Source para streaming.
 * Cada canal de projeção tem uma URL dedicada.
 */
export default function ObsIntegration({ channel }) {
    const colors = useThemeColors();
    const [copied, setCopied] = useState(false);

    const baseUrl = window.location.origin;
    const obsUrls = {
        lyrics: `${baseUrl}/LyricProjection${channel ? `?ch=${channel}` : ""}`,
        bible: `${baseUrl}/BibleMaterialProjection${channel ? `?ch=${channel}` : ""}`,
        stage: `${baseUrl}/StageView${channel ? `?ch=${channel}` : ""}`,
    };

    const copy = (url) => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: `${colors.primary}40`, background: `${colors.primary}08` }}>
            <div className="flex items-center gap-2" style={{ color: colors.primary }}>
                <Monitor className="w-5 h-5" />
                <h3 className="font-semibold">Integração OBS Studio</h3>
            </div>
            <p className="text-xs text-gray-400">
                Adiciona estas URLs como "Browser Source" no OBS para transmitir os slides ao vivo.
            </p>
            <div className="space-y-2">
                {Object.entries(obsUrls).map(([type, url]) => (
                    <div key={type} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-16 capitalize">{type}:</span>
                        <code className="flex-1 text-xs text-white bg-black/40 px-2 py-1.5 rounded truncate">{url}</code>
                        <button
                            onClick={() => copy(url)}
                            className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white"
                        >
                            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                ))}
            </div>
            <p className="text-xs text-gray-500">
                💡 Define largura 1920 × altura 1080 no OBS. Usa o parâmetro <code className="text-white">?ch=</code> para isolar PCs diferentes na mesma rede.
            </p>
        </div>
    );
}