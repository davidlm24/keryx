import React, { useState, useEffect, useRef } from "react";
import BannerPreview from "@/components/banners/BannerPreview";

export default function BannerProjection() {
    const [banner, setBanner] = useState(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const hasSignaled = useRef(false);

    useEffect(() => {
        // Signal ready
        if (!hasSignaled.current) {
            hasSignaled.current = true;
            window.opener?.postMessage({ type: 'BANNER_PROJ_READY' }, '*');
        }

        const handleMessage = (event) => {
            if (event.data.type === 'BANNER_DATA') {
                setBanner(event.data.banner);
            }
            if (event.data.type === 'BANNER_PLAY') {
                setIsPlaying(true);
            }
            if (event.data.type === 'BANNER_PAUSE') {
                setIsPlaying(false);
            }
        };
        window.addEventListener('message', handleMessage);

        // Auto fullscreen
        const tryFullscreen = () => {
            const el = document.documentElement;
            if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        };
        // Try after a small delay to let content render
        setTimeout(tryFullscreen, 500);

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    return (
        <div className="fixed inset-0 bg-black" onClick={() => {
            if (!document.fullscreenElement) {
                const el = document.documentElement;
                if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
                else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            }
        }}>
            <BannerPreview banner={banner} isPlaying={isPlaying} />
        </div>
    );
}