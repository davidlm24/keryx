import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Square, Image as ImageIcon, Clock, MessageSquare, Monitor, X, Baby, Pencil, Presentation } from "lucide-react";

/**
 * Dock flutuante de acesso rápido durante o culto ao vivo.
 * Botões de 1 toque para: tela vazia, logo, cronômetro, anúncio, tela preta,
 * alerta de berçário, mensagem livre, edição ao vivo, carousel de anúncios.
 */
export default function QuickAccessDock({ onBlank, onLogo, onCountdown, onAnnouncement, onBlack, onAlert, onMessage, onLiveEdit, onCarousel }) {
    const [open, setOpen] = useState(false);

    const actions = [
        { icon: Square, label: "Vazio", color: "bg-gray-600", onClick: onBlank },
        { icon: ImageIcon, label: "Logo", color: "bg-blue-600", onClick: onLogo },
        { icon: Clock, label: "Cronômetro", color: "bg-amber-600", onClick: onCountdown },
        { icon: MessageSquare, label: "Aviso", color: "bg-green-600", onClick: onAnnouncement },
        { icon: Baby, label: "Berçário", color: "bg-rose-600", onClick: onAlert },
        { icon: Pencil, label: "Editar slide", color: "bg-cyan-600", onClick: onLiveEdit },
        { icon: Presentation, label: "Anúncios", color: "bg-primary", onClick: onCarousel },
        { icon: Monitor, label: "Preto", color: "bg-black", onClick: onBlack },
    ].filter(a => a.onClick);

    return (
        <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2">
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="flex flex-col gap-1.5"
                    >
                        {actions.map((a, i) => (
                            <motion.button
                                key={a.label}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ delay: i * 0.04 }}
                                onClick={() => { a.onClick?.(); setOpen(false); }}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm hover:bg-white/20 transition-colors shadow-lg"
                            >
                                <a.icon className="w-4 h-4" />
                                {a.label}
                            </motion.button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
            <button
                onClick={() => setOpen(!open)}
                className="w-12 h-12 rounded-full text-white shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
            >
                {open ? <X className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
            </button>
        </div>
    );
}