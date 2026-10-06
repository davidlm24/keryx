import { keryx } from "@/api/keryxClient";

const IDLE_MS = 30 * 60 * 1000;

/**
 * Limpa LiveSessions órfãs — sessões com status "active" sem qualquer
 * atualização há mais de 30 minutos. Executado no arranque (Home e Services).
 * Mede a inatividade por updated_date (cada slide atualiza a sessão), não por
 * startedAt: um culto longo e ativo não pode ser terminado por outro operador.
 */
export async function cleanupOrphanSessions() {
    try {
        const sessions = await keryx.entities.LiveSession.filter({ status: "active" });
        const cutoff = Date.now() - IDLE_MS;
        const lastActivity = (s) => Date.parse(s.updated_date) || s.startedAt || 0;
        const orphans = sessions.filter(s => lastActivity(s) < cutoff);

        if (orphans.length === 0) return 0;

        await keryx.entities.LiveSession.bulkUpdate(
            orphans.map(s => ({
                id: s.id,
                status: "ended",
                endedAt: lastActivity(s) + IDLE_MS
            }))
        );
        return orphans.length;
    } catch (e) {
        return 0;
    }
}
