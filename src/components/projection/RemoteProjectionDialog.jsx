import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Monitor, Smartphone, X, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A native-like dialog shown on mobile/tablet devices when the user tries to
 * open a projection pop-up window. Instead of spawning a window (which is
 * blocked or impractical on mobile), it guides the user to use the remote
 * projection feature — pairing a tablet/TV via QR code and syncing through
 * the database (VideoSync / LyricSync entities).
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - title?: string  (which projection the user tried to open)
 */
export default function RemoteProjectionDialog({ open, onClose, title }) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.9, y: 20, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-sm rounded-3xl bg-[#15151c] border border-white/10 shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="relative px-6 pt-6 pb-4 text-center">
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                            <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-3">
                                <Smartphone className="w-8 h-8 text-primary" />
                            </div>
                            <h2 className="text-lg font-semibold text-white">
                                Projeção Remota
                            </h2>
                            <p className="mt-1 text-sm text-gray-400 leading-relaxed">
                                {title ? `"${title}"` : "Esta funcionalidade"} não abre em uma janela no celular.
                                Use a projeção remota para enviar para tablets, TVs ou projetores.
                            </p>
                        </div>

                        {/* Body */}
                        <div className="px-6 pb-6 space-y-3">
                            <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 space-y-3">
                                <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                                        <QrCode className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-white">Parear via QR Code</p>
                                        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                                            Abra a página de projeção no tablet/TV e escaneie o código de pareamento em Definições.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
                                        <Monitor className="w-5 h-5 text-accent" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-white">Sincronização automática</p>
                                        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                                            Letras e vídeos são sincronizados automaticamente via base de dados — sem janelas pop-up.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <Button
                                onClick={onClose}
                                className="w-full text-white"
                                style={{ background: "linear-gradient(to right, #7d8470, #c9a86a)" }}
                            >
                                Percebi
                            </Button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}