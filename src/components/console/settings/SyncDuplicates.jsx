import React, { useEffect, useMemo, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { Btn } from "../kx";
import { useLibrary } from "../useConsoleData";
import { FormRow, CfgGroup, formatWhen } from "./parts";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { duplicateSongs, keepPairs, mergePlan } from "@shared/syncDuplicates.mjs";

// Músicas repetidas (shared/syncDuplicates.mjs): the same title and lyrics in
// different songs, each computer having had its own. Juntar em uma keeps
// the newest and points the setlists at it; Manter as duas keeps them, on
// every computer (User.song_duplicates_kept, a church field).
export default function SyncDuplicates({ c, confirm }) {
    const { songs } = useLibrary();
    const prefs = usePrefs();
    const groups = useMemo(() => duplicateSongs(songs, prefs.song_duplicates_kept), [songs, prefs.song_duplicates_kept]);
    const [open, setOpen] = useState(false);
    const [uses, setUses] = useState({});
    const [busy, setBusy] = useState("");
    const n = groups.length;

    // How many setlist items use each song, for the list.
    useEffect(() => {
        if (!open || !n) return undefined;
        let live = true;
        keryx.entities.ServiceItem.filter({ type: "SONG" }).then((items) => {
            if (!live) return;
            const count = {};
            for (const it of items || []) if (it.contentId) count[it.contentId] = (count[it.contentId] || 0) + 1;
            setUses(count);
        }).catch(() => {});
        return () => { live = false; };
    }, [open, n]);

    const merge = async (g) => {
        const [keep, ...rest] = g.songs;
        const others = rest.length;
        if (!(await confirm({
            title: `Juntar "${g.title}" em uma?`,
            text: `Fica a editada por último (${formatWhen(keep.updated_date)}). As setlists e os modelos de culto passam a usar ela, e ${others === 1 ? "a outra cópia é excluída" : `as outras ${others} cópias são excluídas`}.`,
            ok: "Juntar",
            danger: true,
        }))) return;
        setBusy(g.key);
        try {
            const [serviceItems, templates, history] = await Promise.all([
                keryx.entities.ServiceItem.filter({ type: "SONG" }),
                keryx.entities.ServiceTemplate.list(),
                keryx.entities.SongHistory.list(),
            ]);
            const plan = mergePlan(g, { serviceItems, templates, history });
            for (const u of plan.items) await keryx.entities.ServiceItem.update(u.id, u.patch);
            for (const u of plan.templates) await keryx.entities.ServiceTemplate.update(u.id, u.patch);
            for (const u of plan.history) await keryx.entities.SongHistory.update(u.id, u.patch);
            for (const id of plan.remove) await keryx.entities.Song.delete(id);
            c.say(`"${g.title}": ficou uma.`);
        } catch (err) {
            c.say(`Juntar: ${err?.message || "não foi possível."}`);
        } finally {
            setBusy("");
        }
    };
    const keepBoth = async (g) => {
        setBusy(g.key);
        try {
            await updateUser({ song_duplicates_kept: [...new Set([...(prefs.song_duplicates_kept || []), ...keepPairs(g.songs)])] });
            c.say(g.songs.length === 2 ? "As duas ficam." : "Todas ficam.");
        } finally {
            setBusy("");
        }
    };

    const line = n ? `${n} ${n === 1 ? "parece repetida" : "parecem repetidas"}` : "nenhuma";
    return (
        <CfgGroup id="sync.repetidas" k="Músicas repetidas" defaultOpen={n > 0} summary={line}>
          <div className="frm">
            <FormRow k="">
                <span className="kx-meta">{n ? `${line} · mesmo título e mesma letra` : "nenhuma repetida · mesmo título e mesma letra"}</span>
                {n > 0 && <Btn on={open} onClick={() => setOpen((o) => !o)}>{open ? "Fechar a lista" : "Ver…"}</Btn>}
            </FormRow>
            {open && n > 0 && (
                <FormRow k="">
                    <div className="cfg-sync-dups">
                        {groups.map((g) => (
                            <div key={g.key} className="cfg-sync-dup">
                                <span className="cfg-sync-dup-t">{g.title}</span>
                                {g.songs.map((s, i) => (
                                    <span key={s.id} className="cfg-sync-dup-v">
                                        <span>{i === 0 ? "a mais recente" : "cópia"}{s.artist ? ` · ${s.artist}` : ""}{uses[s.id] ? ` · em ${uses[s.id]} ${uses[s.id] === 1 ? "item de setlist" : "itens de setlist"}` : ""}</span>
                                        <span className="kx-meta">{s.updated_date ? formatWhen(s.updated_date) : ""}</span>
                                    </span>
                                ))}
                                <div className="cfg-sync-acts">
                                    <Btn kind="outline" small disabled={Boolean(busy)} onClick={() => merge(g)}>{busy === g.key ? "Juntando…" : "Juntar em uma"}</Btn>
                                    <Btn small disabled={Boolean(busy)} onClick={() => keepBoth(g)}>{g.songs.length === 2 ? "Manter as duas" : "Manter todas"}</Btn>
                                </div>
                            </div>
                        ))}
                    </div>
                </FormRow>
            )}
          </div>
        </CfgGroup>
    );
}
