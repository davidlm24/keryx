import React, { useState } from "react";
import QRCode from "react-qr-code";
import { QrCode, X } from "lucide-react";

/**
 * Painel de QR Code — gera QR code para a congregação acessar a letra no celular.
 * A URL aponta para a página de projeção de letras com o canal da sessão.
 */
export default function QrCodePanel({ channel, songTitle }) {
    const [show, setShow] = useState(false);

    const qrUrl = `${window.location.origin}/LyricProjection${channel ? `?ch=${channel}` : ""}`;

    return (
        <>
            <button
                onClick={() => setShow(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/15 text-white text-sm hover:bg-white/10 transition-colors"
            >
                <QrCode className="w-4 h-4" />
                QR Letra
            </button>
            {show && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShow(false)}>
                    <div className="bg-white rounded-2xl p-6 max-w-xs w-full text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-semibold text-gray-900">QR Code da Letra</h3>
                            <button onClick={() => setShow(false)} className="text-gray-400 hover:text-gray-900">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        {songTitle && <p className="text-sm text-gray-600 mb-3">{songTitle}</p>}
                        <div className="flex justify-center mb-4">
                            <QRCode value={qrUrl} size={200} />
                        </div>
                        <p className="text-xs text-gray-500">
                            A congregação pode ler este código para ver a letra no celular em tempo real.
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}