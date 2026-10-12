import React from "react";
import { FormRow, Switch } from "./parts";
import { useUser, updateUser } from "@/hooks/useUser";

// Culto: how the service is planned and counted. Previsão do culto: the
// forecast of the end and the delay ("termina ~", "passou N min"), off by
// default (a church that plans only the order would see invented figures).
export default function CultoSection({ c }) {
    const forecast = useUser((u) => u?.show_forecast === true);
    const save = (patch, message) => updateUser(patch).then(() => c.say(message)).catch(() => c.say("Não foi possível salvar."));
    return (
        <div className="frm">
            <FormRow k="Previsão do culto">
                <Switch on={forecast} onChange={(on) => save({ show_forecast: on }, on ? "Previsão do fim e atraso ligados." : "Previsão desligada.")} label="Mostrar a previsão do fim do culto e o atraso" />
                <span className="kx-meta">mostra "termina ~" e "passou N min" na barra do topo e na linha do tempo; só faz sentido se o culto é planejado com durações</span>
            </FormRow>
        </div>
    );
}
