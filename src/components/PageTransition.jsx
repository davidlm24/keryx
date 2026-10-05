import React from "react";
import { motion } from "framer-motion";

/**
 * Wraps page content with a push/pop slide transition for route changes.
 * Used inside App.jsx's AnimatePresence to animate between routes.
 */
export default function PageTransition({ children }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ minHeight: "100%" }}
        >
            {children}
        </motion.div>
    );
}