import React from "react";
import { BACKGROUNDS, backgroundUrl } from "@/lib/backgrounds";

const BUNDLED = [...new Set(Object.values(BACKGROUNDS).flat())];

// The church's own images, newest first, that can be a wallpaper.
export const imagesOf = (media) => (media || []).filter((m) => m.type === "image" && m.file_url && !m.missing);

// A wallpaper for the idle screens: the backgrounds that ship with KERYX
// (Fundos) and the church's own images (Mídia), as thumbnails. The chosen one
// is ringed. With onNone, a "Sem fundo" tile clears the choice.
export default function WallpaperPicker({ value, onPick, media, onNone, noneLabel = "Sem fundo" }) {
    const images = imagesOf(media);
    const tile = (url, label, key) => (
        <button type="button" key={key} className={`kx-t ${value === url ? "is-on" : ""}`} title={label} aria-label={label} aria-pressed={value === url} onClick={() => onPick(url)}>
            <img src={url} alt="" loading="lazy" />
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
            {images.length > 0 && <div className="bgpick">{images.map((m) => tile(m.file_url, m.title || "Imagem", m.id))}</div>}
            <div className="kx-section wallpick-h">Fundos</div>
            <div className="bgpick">{BUNDLED.map((id) => tile(backgroundUrl(id), "Fundo incluído no KERYX", id))}</div>
        </div>
    );
}
