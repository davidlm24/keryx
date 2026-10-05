import React from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Wrapper de transição entre slides projetados.
 * Suporta fade, slide, zoom e crossfade.
 */
const TRANSITIONS = {
    fade: {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.4 }
    },
    slide: {
        initial: { opacity: 0, x: 60 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -60 },
        transition: { duration: 0.35 }
    },
    zoom: {
        initial: { opacity: 0, scale: 0.92 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 1.08 },
        transition: { duration: 0.35 }
    },
    crossfade: {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.6 }
    },
};

export default function SlideTransition({ slideKey, type = "fade", children, className = "" }) {
    const config = TRANSITIONS[type] || TRANSITIONS.fade;
    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={slideKey}
                initial={config.initial}
                animate={config.animate}
                exit={config.exit}
                transition={config.transition}
                className={className}
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}

export { TRANSITIONS };