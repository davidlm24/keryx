import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Check, X } from "lucide-react";

/**
 * Editor de slide ao vivo — permite editar o texto do slide atual sem parar a projeção.
 * Recebe o texto atual e chama onSave com o novo texto.
 */
export default function LiveSlideEditor({ currentText, onSave, onClose }) {
    const [text, setText] = useState(currentText || "");

    useEffect(() => {
        setText(currentText || "");
    }, [currentText]);

    const handleSave = () => {
        onSave(text);
        onClose();
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-2xl bg-card rounded-2xl border border-border p-5 shadow-2xl"
                >
                    <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                        <Pencil className="w-5 h-5" />
                        <h3 className="font-semibold text-lg">Editar slide ao vivo</h3>
                    </div>
                    <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        autoFocus
                        rows={6}
                        className="bg-white/10 border-border text-white text-lg resize-none mb-4"
                        placeholder="Texto do slide..."
                    />
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={onClose} className="border-border">
                            <X className="w-4 h-4 mr-1" /> Cancelar
                        </Button>
                        <Button onClick={handleSave}>
                            <Check className="w-4 h-4 mr-1" /> Aplicar
                        </Button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}