import React, { useEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { useUser, updateUser } from "@/hooks/useUser";
import { Btn, Field } from "../kx";
import { FormRow } from "./parts";

// Igreja: the name, the city and the logo (the corner of the screens, the
// idle screen and Mostrar logo). On the local profile (User).
export default function IgrejaSection({ c }) {
    const logo = useChurchLogo();
    const [name, setName] = useState("");
    const [city, setCity] = useState("");
    const user = useUser();
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
    const pickLogo = async (file) => {
        if (!file) return;
        setBusy(true);
        try {
            const { file_url } = await keryx.integrations.Core.UploadFile({ file });
            await save({ logo_url: file_url }, "Logo trocado. Todas as telas já usam o novo.");
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
            <FormRow k="Logo">
                <img src={logo} alt="" className="cfg-logo" />
                <Btn disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Enviando…" : "Trocar…"}</Btn>
                {hasOwnLogo && <Btn disabled={busy} onClick={() => save({ logo_url: "" }, "Voltou ao logo padrão do KERYX.")}>Usar o padrão</Btn>}
                <span className="kx-meta">aparece no canto das telas, na Tela ociosa e em Mostrar logo</span>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pickLogo(f); }} />
            </FormRow>
        </div>
    );
}
