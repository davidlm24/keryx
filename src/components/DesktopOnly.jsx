import React from "react";
import { defaultLogoUrl } from "@/lib/backgrounds";

// What a plain browser sees: KERYX is the app on the church computer. A
// tablet or TV joins through the address the computer shows in
// Configurações › Telas na rede (served by electron/lan.cjs), not this page.
export default function DesktopOnly() {
    return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
            <div className="max-w-md text-center space-y-3">
                <img src={defaultLogoUrl()} alt="" className="w-16 h-16 mx-auto rounded-full object-cover" />
                <h1 className="text-2xl font-heading font-semibold">KERYX</h1>
                <p className="text-muted-foreground">O KERYX é o aplicativo de projeção do computador da igreja. Abra o KERYX instalado no Windows.</p>
                <p className="text-muted-foreground text-sm">Para uma TV, um tablet ou o celular mostrar a projeção, use o endereço que o KERYX mostra em Configurações › Telas na rede.</p>
            </div>
        </div>
    );
}
