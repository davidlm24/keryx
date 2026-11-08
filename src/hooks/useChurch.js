import { useEffect } from "react";
import { useUser } from "@/hooks/useUser";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { churchLine, windowTitle } from "@/lib/church";

// The church as every window shows it: name, city, the line with both
// ("Igreja X · Cidade") and the logo (Configurações › Igreja).
export function useChurch() {
    const name = useUser((u) => u?.church_name || "").trim();
    const city = useUser((u) => u?.church_city || "").trim();
    const logo = useChurchLogo();
    return { name, city, logo, line: churchLine(name, city) };
}

// Keeps the window's (or the browser tab's) title: "Igreja X · KERYX" for
// the console, "Palco · Igreja X" for a screen (src/lib/church.js).
export function useWindowTitle(screen = "") {
    const { name } = useChurch();
    useEffect(() => { document.title = windowTitle({ name, screen }); }, [name, screen]);
}
