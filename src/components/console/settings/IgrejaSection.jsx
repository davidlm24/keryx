import React, { useEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { useUser, usePrefs, updateUser } from "@/hooks/useUser";
import { Btn, Field, Seg } from "../kx";
import { FormRow } from "./parts";

const CORNERS = [["bottom-right", "Baixo dir."], ["bottom-left", "Baixo esq."], ["top-right", "Alto dir."], ["top-left", "Alto esq."]];

// Igreja: the name, the city and the logo (the corner of the screens, the
// idle screen and Mostrar logo). On the local profile (User).
export default function IgrejaSection({ c }) {
    const logo = useChurchLogo();
    const [name, setName] = useState("");
    const [city, setCity] = useState("");
    const user = useUser();
    const prefs = usePrefs();
    const hasOwnLogo = Boolean(user?.logo_url);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef(null);
    // What the database has: the fields follow it (another window, a
    // restore) unless the operator is typing a different value.
    const saved = useRef({ name: null, city: null });
    useEffect(() => {
        if (!user) return;
        const next = { name: user.church_name || "", city: user.church_city || "" };
        if (saved.current.name !== next.name) setName(next.name);
        if (saved.current.city !== next.city) setCity(next.city);
        saved.current = next;
    }, [user]);

    // -> true when saved; a failure is said, and the field keeps the text.
    const save = async (patch, message) => {
        try {
            await updateUser(patch);
            if (message) c.say(message);
            return true;
        } catch (err) { c.say(err?.message || "Não foi possível salvar."); return false; }
    };
    // Text fields save when they lose focus (or on Enter), no Salvar button.
    const commit = (key, value) => {
        const field = key === "church_name" ? "name" : "city";
        if (saved.current[field] === value.trim()) return;
        save({ [key]: value.trim() }, "Salvo.");
    };
    // The church's logo look: saved, and given to the screens at once
    // (not while they are locked: then at the next change).
    const setLogo = async (patch, op) => {
        if (!(await save(patch))) return;
        if (c.locked) { c.say("Salvo. As telas estão travadas: o logo muda quando destravar e mudar de novo."); return; }
        c.liveOp("logo.set", op).then(() => c.say("Logo das telas atualizado."), () => {});
    };
    const pickLogo = async (file) => {
        if (!file) return;
        setBusy(true);
        try {
            const { file_url } = await keryx.integrations.Core.UploadFile({ file });
            await save({ logo_url: file_url }, "Logo das telas atualizado.");
        } catch (err) { c.say(err?.message || "Não foi possível trocar o logo."); }
        setBusy(false);
    };

    return (
        <div className="frm">
            <FormRow k="Nome">
                <Field icon={null} value={name} onChange={setName} placeholder="Nome da igreja" onBlur={() => commit("church_name", name)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} style={{ maxWidth: 420 }} />
            </FormRow>
            <FormRow k="Cidade">
                <Field icon={null} value={city} onChange={setCity} placeholder="" onBlur={() => commit("church_city", city)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} style={{ maxWidth: 420 }} />
            </FormRow>
            <FormRow k="Logo">
                <img src={logo} alt="" className="cfg-logo" />
                <Btn disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Enviando…" : "Trocar…"}</Btn>
                {hasOwnLogo && <Btn disabled={busy} onClick={() => save({ logo_url: "" }, "Voltou ao logo padrão do KERYX.")}>Usar o padrão</Btn>}
                <span className="kx-meta">aparece no canto das telas, na Tela ociosa e em Mostrar logo</span>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickLogo(f); }} />
            </FormRow>
            <FormRow k="Logo nas telas">
                <select className="cfg-select" value={prefs.logo_corner} aria-label="Canto do logo" onChange={(e) => setLogo({ logo_corner: e.target.value }, { corner: e.target.value })}>
                    {CORNERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <Seg small label="Tamanho do logo" value={prefs.logo_size} options={[["small", "P"], ["medium", "M"], ["large", "G"]]} onChange={(v) => setLogo({ logo_size: v }, { size: v })} />
                <Seg small label="Opacidade do logo" value={String(prefs.logo_opacity)} options={[["1", "100%"], ["0.7", "70%"], ["0.4", "40%"]]} onChange={(v) => setLogo({ logo_opacity: Number(v) }, { opacity: Number(v) === 1 ? null : Number(v) })} />
                <span className="kx-meta">vale já nas telas; Camadas muda só por agora</span>
            </FormRow>
        </div>
    );
}
