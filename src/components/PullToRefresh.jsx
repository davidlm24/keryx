import React, { useRef, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";

const THRESHOLD = 70;
const MAX_PULL = 110;

export default function PullToRefresh({ onRefresh, children, className = "" }) {
    const [pullDistance, setPullDistance] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const startY = useRef(null);
    const containerRef = useRef(null);

    const handleTouchStart = useCallback((e) => {
        if (refreshing) return;
        // The scroll container is an ancestor (e.g. the Layout <main>), not this wrapper.
        let el = containerRef.current?.parentElement;
        let scrollTop = window.scrollY;
        while (el) {
            if (el.scrollTop > 0) { scrollTop = el.scrollTop; break; }
            el = el.parentElement;
        }
        if (scrollTop > 0) return;
        startY.current = e.touches[0].clientY;
    }, [refreshing]);

    const handleTouchMove = useCallback((e) => {
        if (startY.current === null || refreshing) return;
        const delta = e.touches[0].clientY - startY.current;
        if (delta <= 0) {
            setPullDistance(0);
            return;
        }
        // Apply resistance so it feels native
        const resisted = Math.min(MAX_PULL, delta * 0.5);
        setPullDistance(resisted);
    }, [refreshing]);

    const handleTouchEnd = useCallback(async () => {
        if (startY.current === null) return;
        startY.current = null;
        if (pullDistance >= THRESHOLD && !refreshing) {
            setRefreshing(true);
            setPullDistance(THRESHOLD);
            try {
                await onRefresh?.();
            } finally {
                setRefreshing(false);
                setPullDistance(0);
            }
        } else {
            setPullDistance(0);
        }
    }, [pullDistance, refreshing, onRefresh]);

    const progress = Math.min(1, pullDistance / THRESHOLD);

    return (
        <div
            ref={containerRef}
            className={className}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ overscrollBehaviorY: "contain" }}
        >
            <div
                className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
                style={{ height: pullDistance }}
            >
                <div
                    className="flex items-center justify-center"
                    style={{
                        transform: `rotate(${progress * 360}deg)`,
                        opacity: progress,
                        transition: refreshing ? "none" : "opacity 0.2s",
                    }}
                >
                    <Loader2 className={`w-6 h-6 text-white ${refreshing ? "animate-spin" : ""}`} />
                </div>
            </div>
            {children}
        </div>
    );
}