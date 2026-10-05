import { useEffect, useState } from "react";

/**
 * Detects whether the current client is a mobile or tablet device.
 * Uses a combination of user-agent sniffing and touch capability detection.
 * Returns true for phones and tablets (i.e. non-desktop), false for desktop browsers.
 */
export function useIsMobileDevice() {
    const [isMobile, setIsMobile] = useState(() => checkMobileDevice());

    useEffect(() => {
        const handler = () => setIsMobile(checkMobileDevice());
        window.addEventListener("resize", handler);
        return () => window.removeEventListener("resize", handler);
    }, []);

    return isMobile;
}

export function checkMobileDevice() {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false;

    const ua = navigator.userAgent || "";
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    // Tablets and phones in user-agent
    const mobileUA = /Android|iPhone|iPad|iPod|Windows Phone|BlackBerry|BB10|Mobile|Opera Mini|IEMobile/i.test(ua);

    // iPadOS 13+ reports as Mac with touch — detect it explicitly
    const isIPadOS = /Macintosh/i.test(ua) && isTouch && !/Mobile/i.test(ua);

    return mobileUA || isIPadOS;
}

export default useIsMobileDevice;