import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLiveState } from "@/hooks/useLiveState";

// The live state's alert (projection.alert, the console's Alerta rápido) over
// whatever a screen shows: the lyrics, stage, video and avisos screens. (The
// projector draws it inside ScreenRenderer.)
export default function AlertOverlayRenderer() {
    const alert = useLiveState((s) => s?.alert);
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