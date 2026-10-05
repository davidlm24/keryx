import { AnimatePresence, motion } from "framer-motion";
import { WifiOff } from "lucide-react";

export default function ConnectionBanner({ isOnline }) {
    return (
        <AnimatePresence>
            {!isOnline && (
                <motion.div
                    initial={{ y: -40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -40, opacity: 0 }}
                    className="fixed top-0 left-0 right-0 z-[100] bg-amber-600 text-white text-center py-2 text-sm font-medium flex items-center justify-center gap-2"
                >
                    <WifiOff className="w-4 h-4" />
                    Sem ligação — a tentar reconectar...
                </motion.div>
            )}
        </AnimatePresence>
    );
}