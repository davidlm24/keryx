import React from "react";
import { visibleBackgrounds, OWN_IMAGES } from "@/lib/console/backgroundPrefs";
import { useBackgrounds } from "./useConsoleData";

// The church's own images, newest first, that can be a wallpaper.
export const imagesOf = (media) => (media || []).filter((m) => m.type === "image" && m.file_url && !m.missing);

// A wallpaper for the idle screens: the church's own images (Mídia) and the
// backgrounds that ship with KERYX (Fundos), as thumbnails, as Aparência ›
// Fundos names and orders them (hidden ones left out). The chosen one is
// ringed. With onNone, a "Sem fundo" tile clears the choice.
export default function WallpaperPicker({ value, onPick, media, onNone, noneLabel = "Sem fundo" }) {
    const all = useBackgrounds(media);
    const images = visibleBackgrounds(all, { only: OWN_IMAGES });
    const bundled = visibleBackgrounds(all, { except: OWN_IMAGES });
    const tile = (b) => (
        <button type="button" key={b.source} className={`kx-t ${value === b.url ? "is-on" : ""}`} title={b.name} aria-label={b.name} aria-pressed={value === b.url} onClick={() => onPick(b.url)}>
            <img src={b.url} alt="" loading="lazy" />
        </button>
    );
    return (
        <div className="wallpick">
            {onNone && (
                <div className="bgpick">
                    <button type="button" className={`kx-t wallpick-none ${!value ? "is-on" : ""}`} onClick={onNone} aria-pressed={!value}>{noneLabel}</button>
                </div>
            )}
            {images.length > 0 && <div className="kx-section wallpick-h">Suas imagens</div>}
            {images.length > 0 && <div className="bgpick">{images.map(tile)}</div>}
            <div className="kx-section wallpick-h">Fundos</div>
            <div className="bgpick">{bundled.map(tile)}</div>
        </div>
    );
}
