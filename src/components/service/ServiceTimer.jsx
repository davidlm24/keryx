import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, AlertTriangle, X } from "lucide-react";

/**
 * Timer de serviço — conta tempo decorrido do culto ao vivo.
 * Alertas configuráveis (ex: avisar aos 90 min).
 */
export default function ServiceTimer({ active, startTime }) {
    const [elapsed, setElapsed] = useState(0);
    const [alertThreshold] = useState(() => parseInt(localStorage.getItem("serviceTimerAlert") || "90"));
    const [showAlert, setShowAlert] = useState(false);
    const alertedRef = useRef(false);

    useEffect(() => {
        if (!active || !startTime) return;
        const tick = () => {
            const secs = Math.floor((Date.now() - startTime) / 1000);
            setElapsed(secs);
            if (secs >= alertThreshold * 60 && !alertedRef.current) {
                alertedRef.current = true;
                setShowAlert(true);
            }
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [active, startTime, alertThreshold]);

    if (!active) return null;

    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const isOver = mins >= alertThreshold;

    return (
        <>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-mono ${
                isOver ? "bg-red-600/20 text-red-300 border border-red-500/40" : "bg-white/5 text-gray-300"
            }`}>
                <Clock className="w-4 h-4" />
                {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
                {isOver && <span className="text-xs">⚠ {alertThreshold}min</span>}
            </div>
            <AnimatePresence>
                {showAlert && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-red-600 text-white shadow-2xl flex items-center gap-3"
                    >
                        <AlertTriangle className="w-5 h-5" />
                        <span className="font-semibold">Culto com {alertThreshold} minutos!</span>
                        <button onClick={() => setShowAlert(false)}>
                            <X className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}