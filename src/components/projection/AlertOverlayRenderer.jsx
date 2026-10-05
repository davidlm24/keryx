import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";

/**
 * Renderiza um overlay de alerta/mensagem sobre qualquer projeção.
 * Subscreve a AlertMessage e mostra a mensagem mais recente ativa.
 * Incluído em LyricProjection, BibleMaterialProjection, StageView, VideoProjection.
 */
export default function AlertOverlayRenderer() {
    const [alert, setAlert] = useState(null);

    useEffect(() => {
        // Buscar alerta ativo ao carregar
        const check = async () => {
            try {
                const records = await base44.entities.AlertMessage.list("-timestamp", 1);
                if (records.length > 0 && records[0].status === "active") {
                    setAlert(records[0]);
                }
            } catch (e) {}
        };
        check();

        const unsubscribe = base44.entities.AlertMessage.subscribe((event) => {
            if (event.type === "create" || event.type === "update") {
                if (event.data?.status === "active") {
                    setAlert(event.data);
                } else if (event.data?.status === "inactive") {
                    setAlert(null);
                }
            }
            if (event.type === "delete") {
                setAlert(null);
            }
        });

        return () => unsubscribe();
    }, []);

    const isAlert = alert?.type === "alert";

    return (
        <AnimatePresence>
            {alert && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none"
                >
                    <div
                        className="px-8 py-4 rounded-2xl backdrop-blur-md border-2 shadow-2xl text-center"
                        style={{
                            background: isAlert ? "rgba(220,38,38,0.92)" : "rgba(0,0,0,0.82)",
                            borderColor: isAlert ? "#fca5a5" : "rgba(255,255,255,0.25)",
                        }}
                    >
                        <p className="text-white font-bold text-2xl md:text-4xl leading-tight whitespace-pre-wrap">
                            {alert.message}
                        </p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}