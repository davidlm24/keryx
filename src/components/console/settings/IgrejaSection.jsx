import React, { useEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { Btn, Field } from "../kx";
import { FormRow, Switch } from "./parts";

// Igreja: the name, the city and the logo (the corner of the screens, the
// idle screen and Mostrar logo). On the local profile (User).
export default function IgrejaSection({ c }) {
    const logo = useChurchLogo();
    const [name, setName] = useState("");
    const [city, setCity] = useState("");
    const [hasOwnLogo, setHasOwnLogo] = useState(false);
    const [busy, setBusy] = useState(false);
    const [forecast, setForecast] = useState(false);
    const fileRef = useRef(null);
    const saved = useRef({ name: "", city: "" });

    useEffect(() => {
        keryx.auth.me().then((u) => {
            setName(u?.church_name || "");
            setCity(u?.church_city || "");
            setHasOwnLogo(Boolean(u?.logo_url));
            setForecast(u?.show_forecast === true);
            saved.current = { name: u?.church_name || "", city: u?.church_city || "" };
        }).catch(() => {});
    }, []);

    const save = async (patch, message) => {
        try {
            await keryx.entities.User.update("me", patch);
            if (message) c.say(message);
        } catch (err) { c.say(err?.message || "Não foi possível salvar."); }
    };
    // Text fields save when they lose focus (or on Enter), no Salvar button.
    const commit = (key, value) => {
        const field = key === "church_name" ? "name" : "city";
        if (saved.current[field] === value.trim()) return;
        saved.current[field] = value.trim();
        save({ [key]: value.trim() }, "Salvo.");
    };
    const pickLogo = async (file) => {
        if (!file) return;
        setBusy(true);
        try {
            const { file_url } = await keryx.integrations.Core.UploadFile({ file });
            await save({ logo_url: file_url }, "Logo trocado. Todas as telas já usam o novo.");
            setHasOwnLogo(true);
        } catch (err) { c.say(err?.message || "Não foi possível trocar o logo."); }
        setBusy(false);
    };

    return (
        <div className="frm">
            <FormRow k="Nome">
                <Field icon={null} value={name} onChange={setName} placeholder="Nome da igreja" onBlur={() => commit("church_name", name)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} style={{ maxWidth: 420 }} />
            </FormRow>
            <FormRow k="Cidade">
                <Field icon={null} value={city} onChange={setCity} placeholder="Cidade" onBlur={() => commit("church_city", city)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} style={{ maxWidth: 420 }} />
            </FormRow>
            <FormRow k="Previsão do culto">
                <Switch on={forecast} onChange={(on) => { setForecast(on); save({ show_forecast: on }, on ? "Previsão do fim e atraso ligados." : "Previsão desligada."); }} label="Mostrar a previsão do fim do culto e o atraso" />
                <span className="kx-meta">mostra "termina ~" e "passou N min" na barra do topo e na linha do tempo; só faz sentido se o culto é planejado com durações</span>
            </FormRow>
            <FormRow k="Logo">
                <img src={logo} alt="" className="cfg-logo" />
                <Btn disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Enviando…" : "Trocar…"}</Btn>
                {hasOwnLogo && <Btn disabled={busy} onClick={() => { save({ logo_url: "" }, "Voltou ao logo padrão do KERYX."); setHasOwnLogo(false); }}>Usar o padrão</Btn>}
                <span className="kx-meta">aparece no canto das telas, na Tela ociosa e em Mostrar logo</span>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickLogo(f); }} />
            </FormRow>
        </div>
    );
}
