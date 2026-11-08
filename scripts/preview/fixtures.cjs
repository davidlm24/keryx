// Sample data for the browser preview (scripts/preview/server.cjs): enough to
// see every part of the console — songs, a culto with sections, avisos,
// media, a turma with a quiz, a chapter of the Bíblia. Everything is invented:
// the lyrics are placeholders and the Bible verses are "Texto de exemplo do
// versículo N" (the editions are copyrighted; KERYX never ships their text).

const two = (n) => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
const bg = (id) => `keryx-media://bundled/backgrounds/${id}.webp`;

const SONGS = [
    { title: "Canção de exemplo · Manhã", artist: "Ministério de exemplo", category: "louvor", song_key: "G", bpm: 72, duration: 240, ccli_number: "1000001",
        verses: [["Verso", "Primeira linha de exemplo\nSegunda linha de exemplo"], ["Refrão", "Este é o refrão de exemplo\nCantado por todos"], ["Verso", "Terceira linha de exemplo\nQuarta linha de exemplo"]] },
    { title: "Canção de exemplo · Graça", artist: "Coral de exemplo", category: "adoracao", song_key: "D", bpm: 68, duration: 276,
        verses: [["Verso", "Uma estrofe de exemplo\nPara ver os slides"], ["Refrão", "Refrão de exemplo\nCom duas linhas"]] },
    { title: "Hino de exemplo", artist: "Hinário de exemplo", category: "hymn", song_key: "C", duration: 210,
        verses: [["Verso", "Estrofe um do hino de exemplo"], ["Verso", "Estrofe dois do hino de exemplo"]] },
];

function seed(store) {
    const create = (entity, row) => store.call(entity, "create", [row]);
    store.call("User", "update", ["local", { church_name: "Igreja de exemplo", church_city: "Cidade de exemplo" }]);

    const songs = SONGS.map((s) => create("Song", {
        title: s.title, artist: s.artist, category: s.category, song_key: s.song_key, bpm: s.bpm || null, duration: s.duration, ccli_number: s.ccli_number || "",
        lyrics: s.verses.map(([label, text]) => `[${label}]\n${text}`).join("\n\n"),
        slides: s.verses.map(([label, text]) => ({ text, label, ...(label === "Refrão" ? { is_chorus: true } : {}) })),
    }));

    const verses = [14, 15, 16, 17, 18].map((v) => ({ version: "NVI", testament: "Novo", book: "João", chapter: 3, verse: v, text: `Texto de exemplo do versículo ${v}` }));
    store.call("BibleVerse", "bulkCreate", [verses]);
    const passage = create("BiblePassage", { reference: "João 3:16-17 · NVI", book: "João", chapter: 3, verses: "16-17", version: "NVI",
        text: "16 Texto de exemplo do versículo 16\n17 Texto de exemplo do versículo 17",
        slides: [{ text: "16 Texto de exemplo do versículo 16", label: "v. 16" }, { text: "17 Texto de exemplo do versículo 17", label: "v. 17" }] });

    const countdown = create("CommunicationVideo", { title: "O culto começa em", type: "countdown", text: "O culto começa em", duration: 300, text_color: "#ffffff", font_size: "large", show_logo: true, logo_position: "top-left", background_image: bg("1557672172-298e090bd0f1") });
    create("CommunicationVideo", { title: "Bem-vindos", type: "announcement", text: "Bem-vindos", subtext: "Que bom ter você aqui", duration: 20, text_color: "#ffffff", font_size: "large", show_logo: true, logo_position: "top-left", background_image: bg("1506905925346-21bda4d32df4") });
    create("CommunicationVideo", { title: "Atenção", type: "attention", text: "Atenção", subtext: "Carro de exemplo com o farol aceso", duration: 30, text_color: "#ffffff", font_size: "large", sound_alert: true });

    create("Media", { title: "Fundo · montanhas", type: "image", file_url: bg("1506905925346-21bda4d32df4"), category: "other", duration: 10 });
    create("Media", { title: "Fundo · luz", type: "image", file_url: bg("1557672172-298e090bd0f1"), category: "worship", duration: 10 });

    const service = create("Service", { title: "Culto de exemplo", date: today(), startTime: "19:00", status: "READY", service_type: "culto", location: "Templo",
        worship_team: [{ member_id: "", member_name: "Ana de Exemplo", role: "Ministra" }, { member_id: "", member_name: "Bruno de Exemplo", role: "Teclado" }] });
    const items = [
        { type: "SECTION", title: "Pré-culto", duration: 0 },
        { type: "ANNOUNCEMENT", title: countdown.title, contentId: countdown.id, duration: 300 },
        { type: "SECTION", title: "Culto", duration: 0 },
        { type: "SONG", title: songs[0].title, contentId: songs[0].id, duration: 240, notes: "intro longa" },
        { type: "SONG", title: songs[1].title, contentId: songs[1].id, duration: 276 },
        { type: "BIBLE", title: "João 3:16-17", contentId: passage.id, duration: 120 },
        { type: "TEXT", title: "Oração", notes: "Momento de oração", duration: 180 },
        { type: "SONG", title: songs[2].title, contentId: songs[2].id, duration: 210 },
    ];
    store.call("ServiceItem", "bulkCreate", [items.map((it, order) => ({ serviceId: service.id, order, enabled: true, ...it }))]);

    const klass = create("BibleSchoolClass", { name: "Adultos", age_group: "adults", room: "Sala 1", teacher_name: "Professor de exemplo",
        students: [{ name: "Carla de Exemplo", attendance: [] }, { name: "Daniel de Exemplo", attendance: [] }, { name: "Ester de Exemplo", attendance: [] }] });
    create("BibleMaterial", { title: "Pergunta da lição", type: "quiz", subject: "Lição de exemplo", class_id: klass.id, class_name: klass.name,
        description: "Nota de exemplo para o professor: deixe dois minutos para respostas.",
        quiz_questions: [{ question: "Pergunta de exemplo?", options: ["Opção A de exemplo", "Opção B de exemplo"], correct: 1 }] });
    create("BibleMaterial", { title: "Slides da lição", type: "slides", subject: "Lição de exemplo", class_id: klass.id, class_name: klass.name,
        slides: [{ text: "Slide de exemplo 1" }, { text: "Slide de exemplo 2" }] });

    // SongHistory, so Relatórios has something to show.
    const now = Date.now();
    store.call("SongHistory", "bulkCreate", [[0, 0, 1, 2].map((k, i) => ({ song_id: songs[k].id, song_title: songs[k].title, song_artist: songs[k].artist, played_at: new Date(now - (i + 1) * 86400000 * 3).toISOString(), service_title: "Culto de exemplo" }))]);
    return { service, songs };
}

module.exports = { seed };
