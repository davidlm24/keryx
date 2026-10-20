import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import { editionList } from "@/lib/bibleEditions";
import { forgetInstalledVersions } from "@/lib/bibleText";

const KEY = ["bible-editions"];

// Every edition this computer offers: the list (BIBLE_VERSIONS) and the
// ones the church installed from its own files (BibleEdition rows, this
// computer only). Follows an install or a delete in any window.
export function useBibleEditions() {
    const client = useQueryClient();
    useEffect(() => keryx.entities.BibleEdition.subscribe(() => {
        forgetInstalledVersions();
        client.invalidateQueries({ queryKey: KEY });
    }), [client]);
    const rows = useQuery({ queryKey: KEY, queryFn: () => (keryx.isDesktop ? keryx.entities.BibleEdition.list("sigla") : []) }).data;
    return useMemo(() => editionList(rows || []), [rows]);
}
