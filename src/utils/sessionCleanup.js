import { keryx } from "@/api/keryxClient";

/**
 * Limpa LiveSessions órfãs — sessões com status "active" mas sem updates
 * há mais de 30 minutos. Executado no arranque da app (Home e Services).
 */
export async function cleanupOrphanSessions() {
    try {
        const sessions = await keryx.entities.LiveSession.filter({ status: "active" });
        const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
        const orphans = sessions.filter(s => (s.startedAt || 0) < thirtyMinAgo);

        if (orphans.length === 0) return 0;

        await keryx.entities.LiveSession.bulkUpdate(
            orphans.map(s => ({
                id: s.id,
                status: "ended",
                endedAt: s.startedAt + 30 * 60 * 1000
            }))
        );
        return orphans.length;
    } catch (e) {
        return 0;
    }
}