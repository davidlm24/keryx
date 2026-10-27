import React from "react";
import { HOLD_MS } from "@/lib/console/remoteClient";
import { HoldButton } from "./parts";
import { FollowCard, PlayerCard, ScreenTrio, SendNext, SlideCards, TimerCard } from "./liveParts";

// Ao vivo (the default tab): the slide on air and the next, the big arrows,
// the Setlist's next and back, Tela preta / Logo / Limpar in one compact
// row, then what plays (player, Letra automática, the timer) and last the
// held Encerrar tudo. Slides, Aviso and Timer live in Mais › Enviar (Rodada
// Q). The smoke reads "Segure para encerrar tudo" on this tab.
export default function LiveTab({ live, state, caps, c }) {
    const content = live?.content || null;
    return (
        <div className="rm-main rm-two">
            <div className="rm-col">
                <SlideCards content={content} caps={caps} c={c} />
                <SendNext state={state} caps={caps} c={c} />
                <ScreenTrio live={live} c={c} />
            </div>
            <div className="rm-col">
                <PlayerCard live={live} state={state} caps={caps} c={c} />
                <FollowCard content={content} caps={caps} c={c} />
                <TimerCard live={live} caps={caps} c={c} />
                <HoldButton ms={HOLD_MS} label="Segure para encerrar tudo" icon="power" className="is-end" onDone={() => c.run("end", "end")} aria="Encerrar tudo: segure por um segundo e meio" />
                <p className="rm-mini">Segure 1,5 s. {caps.has("undo") ? "Depois o Desfazer fica 8 s." : "Tira tudo do ar."}</p>
            </div>
        </div>
    );
}
