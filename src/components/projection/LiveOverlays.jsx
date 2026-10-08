import React from "react";
import { useLiveState } from "@/hooks/useLiveState";

/**
 * The live state's overlays (logo, image, text, announcement) over whatever a
 * screen shows: positions and sizes are percentages of the screen.
 */
export default function LiveOverlays() {
    const overlays = useLiveState((s) => s?.overlays) || [];
    const shown = overlays.filter((o) => o.enabled !== false);
    if (shown.length === 0) return null;

    return (
        <div className="fixed inset-0 pointer-events-none z-40">
            {shown.map((overlay) => {
                const style = {
                    position: "absolute",
                    left: `${overlay.x ?? 0}%`,
                    top: `${overlay.y ?? 0}%`,
                    width: `${overlay.width ?? 20}%`,
                    opacity: overlay.opacity ?? 1,
                    zIndex: overlay.z_index ?? 10,
                };
                if (overlay.type === "logo" || overlay.type === "image") {
                    return (
                        <div key={overlay.id} style={style}>
                            <img src={overlay.content} alt="" className="w-full h-auto object-contain" />
                        </div>
                    );
                }
                if (overlay.type === "announcement" || overlay.type === "text") {
                    return (
                        <div key={overlay.id} style={{
                            ...style,
                            padding: "16px 24px",
                            background: "rgba(0,0,0,0.6)",
                            borderRadius: "12px",
                            backdropFilter: "blur(8px)",
                        }}>
                            <p className="text-center font-semibold" style={{ color: "#ffffff", fontSize: "1.5rem", lineHeight: 1.3 }}>
                                {overlay.content}
                            </p>
                        </div>
                    );
                }
                return null;
            })}
        </div>
    );
}
