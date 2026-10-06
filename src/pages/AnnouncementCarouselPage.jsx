import React from "react";
import AnnouncementCarousel from "@/components/projection/AnnouncementCarousel";

/**
 * Página de projeção — carousel de anúncios em loop automático.
 * Abrir em tela separada / tablet remoto.
 */
export default function AnnouncementCarouselPage() {
    return <AnnouncementCarousel intervalSec={8} />;
}