// Template presets for Banner Studio

export const BANNER_PRESETS = {
    opening: [
        { id: 'welcome', name: 'Seja Bem-vindo', title: 'Seja Bem-vindo', phrases: ['Seja Bem-vindo(a)'] },
        { id: 'house_of_god', name: 'Casa do Senhor', title: 'Bem-vindos à Casa do Senhor', phrases: ['Bem-vindos à Casa do Senhor'] },
        { id: 'starting_soon', name: 'Culto em Instantes', title: 'O Culto Iniciará em Instantes', phrases: ['O Culto Iniciará em Instantes'] },
        { id: 'prepare_heart', name: 'Prepare o Coração', title: 'Prepare Seu Coração', phrases: ['Prepare Seu Coração', 'Para Adorar'] },
        { id: 'presence', name: 'Presença de Deus', title: 'A Presença de Deus', phrases: ['A Presença de Deus', 'Está Neste Lugar'] },
        { id: 'worship_together', name: 'Adorar Juntos', title: 'Vamos Adorar Juntos', phrases: ['Vamos Adorar Juntos'] },
        { id: 'jesus_center', name: 'Jesus é o Centro', title: 'Jesus é o Centro', phrases: ['Jesus é o Centro', 'Deste Culto'] },
        {
            id: 'welcome_sequence',
            name: 'Sequência de Boas-vindas',
            title: 'Seja Bem-vindo',
            phrases: [
                'SEJA BEM-VINDO(A)',
                'Desconecte-se de tudo',
                'Conecte-se com Deus',
                'Silencie sua mente',
                'Abra seu coração',
                'Deixe Deus te usar',
                'Deixe Deus te transformar',
                'Vamos adorar juntos'
            ]
        },
    ],
    closing: [
        { id: 'thanks_presence', name: 'Obrigado pela Presença', title: 'Obrigado', phrases: ['Obrigado', 'pela sua presença'] },
        { id: 'bless_week', name: 'Deus Abençoe', title: 'Deus abençoe', phrases: ['Deus abençoe', 'sua semana'] },
        { id: 'come_back', name: 'Volte Sempre', title: 'Volte', phrases: ['Volte', 'no próximo culto'] },
        { id: 'blessed_week', name: 'Semana Abençoada', title: 'Semana Abençoada', phrases: ['Tenha uma', 'semana abençoada'] },
        { id: 'stay_strong', name: 'Firme na Fé', title: 'Firme na Fé', phrases: ['Continue', 'firme na fé'] },
    ],
    announcement: [
        { id: 'event', name: 'Evento', title: 'Nome do Evento' },
        { id: 'congress', name: 'Congresso', title: 'Congresso' },
        { id: 'conference', name: 'Conferência', title: 'Conferência' },
        { id: 'vigil', name: 'Vigília', title: 'Vigília de Oração' },
        { id: 'campaign', name: 'Campanha', title: 'Campanha' },
        { id: 'holy_communion', name: 'Santa Ceia', title: 'Santa Ceia' },
        { id: 'youth', name: 'Culto de Jovens', title: 'Culto de Jovens' },
        { id: 'women', name: 'Culto de Mulheres', title: 'Culto de Mulheres' },
        { id: 'men', name: 'Culto de Homens', title: 'Culto de Homens' },
        { id: 'bible_school', name: 'Escola Bíblica', title: 'Escola Bíblica' },
        { id: 'baptism', name: 'Batismos', title: 'Batismos' },
    ],
    countdown: [
        { id: 'countdown_1', name: '1 Minuto', title: 'O Culto Iniciará em', countdown_duration: 60 },
        { id: 'countdown_3', name: '3 Minutos', title: 'O Culto Iniciará em', countdown_duration: 180 },
        { id: 'countdown_5', name: '5 Minutos', title: 'O Culto Iniciará em', countdown_duration: 300 },
        { id: 'countdown_10', name: '10 Minutos', title: 'O Culto Iniciará em', countdown_duration: 600 },
    ],
};

export const ANIMATED_BACKGROUNDS = {
    celestial: [
        { id: 'celestial_clouds', name: 'Nuvens' },
        { id: 'celestial_rays', name: 'Raios de Luz' },
        { id: 'celestial_golden', name: 'Céu Dourado' },
        { id: 'celestial_particles', name: 'Partículas Brilhantes' },
        { id: 'celestial_aurora', name: 'Aurora Boreal' },
        { id: 'celestial_starry', name: 'Céu Estrelado' },
        { id: 'celestial_sunset', name: 'Pôr do Sol' },
        { id: 'celestial_dawn', name: 'Alvorada' },
    ],
    worship: [
        { id: 'worship_lights', name: 'Luzes de Palco' },
        { id: 'worship_atmosphere', name: 'Atmosfera' },
        { id: 'worship_smoke', name: 'Fumaça Suave' },
        { id: 'worship_reflections', name: 'Reflexos de Luz' },
        { id: 'worship_light_rain', name: 'Chuva de Luz' },
        { id: 'worship_ember', name: 'Brasas' },
        { id: 'worship_aurora_warm', name: 'Aurora Quente' },
    ],
    premium: [
        { id: 'premium_black_gold', name: 'Preto e Dourado' },
        { id: 'premium_elegant', name: 'Elegante' },
        { id: 'premium_gold_particles', name: 'Partículas Douradas' },
        { id: 'premium_diamond', name: 'Diamante' },
        { id: 'premium_platinum', name: 'Platina' },
        { id: 'premium_rose_gold', name: 'Ouro Rosa' },
    ],
    modern: [
        { id: 'modern_blue', name: 'Azul' },
        { id: 'modern_purple', name: 'Roxo' },
        { id: 'modern_gold', name: 'Dourado' },
        { id: 'modern_motion', name: 'Motion Graphics' },
        { id: 'modern_green', name: 'Verde' },
        { id: 'modern_coral', name: 'Coral' },
        { id: 'modern_neon', name: 'Neon' },
        { id: 'modern_gradient', name: 'Gradiente Animado' },
        { id: 'modern_mesh', name: 'Mesh Gradient' },
    ],
};

export const TEXT_ANIMATIONS = [
    { id: 'fade_in', name: 'Fade In' },
    { id: 'fade_out', name: 'Fade Out' },
    { id: 'zoom', name: 'Zoom Suave' },
    { id: 'slide_up', name: 'Slide Up' },
    { id: 'slide_down', name: 'Slide Down' },
    { id: 'slide_left', name: 'Slide Left' },
    { id: 'slide_right', name: 'Slide Right' },
    { id: 'blur_reveal', name: 'Blur Reveal' },
    { id: 'glow', name: 'Glow Light' },
    { id: 'rotate', name: 'Rotação' },
    { id: 'flip', name: 'Flip 3D' },
    { id: 'bounce', name: 'Salto' },
    { id: 'elastic', name: 'Elástico' },
    { id: 'scale_pulse', name: 'Pulso' },
    { id: 'shimmer', name: 'Brilho' },
    { id: 'typewriter', name: 'Máquina de Escrever' },
];

export const FONT_SIZES = {
    xsmall: 'text-xl',
    small: 'text-2xl',
    medium: 'text-4xl',
    large: 'text-6xl',
    xlarge: 'text-7xl',
    xxlarge: 'text-8xl',
    xxxlarge: 'text-9xl',
};

export const FONT_FAMILIES = {
    sans: "'Inter', system-ui, sans-serif",
    serif: "'Georgia', serif",
    mono: "'Courier New', monospace",
    cursive: "'Brush Script MT', cursive",
    arial: "'Arial', sans-serif",
    georgia: "'Georgia', serif",
    times: "'Times New Roman', serif",
    verdana: "'Verdana', sans-serif",
    trebuchet: "'Trebuchet MS', sans-serif",
    impact: "'Impact', sans-serif",
    palatino: "'Palatino Linotype', serif",
    garamond: "'Garamond', serif",
    helvetica: "'Helvetica', sans-serif",
    courier_new: "'Courier New', monospace",
};

export const FONT_WEIGHTS = {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
};

export const TEXT_EFFECTS = [
    { id: 'none', name: 'Nenhum' },
    { id: 'shadow', name: 'Sombra' },
    { id: 'glow', name: 'Brilho' },
    { id: 'outline', name: 'Contorno' },
    { id: '3d', name: '3D' },
    { id: 'neon', name: 'Neon' },
    { id: 'double_shadow', name: 'Sombra Dupla' },
    { id: 'emboss', name: 'Relevo' },
];

export function getTextEffectStyle(effect, color = '#000000') {
    switch (effect) {
        case 'shadow':
            return { textShadow: `2px 4px 8px ${color}99, 4px 8px 16px ${color}66` };
        case 'glow':
            return { textShadow: `0 0 10px ${color}, 0 0 20px ${color}, 0 0 40px ${color}99` };
        case 'outline':
            return {
                WebkitTextStroke: `2px ${color}`,
                WebkitTextFillColor: 'transparent',
            };
        case '3d':
            return {
                textShadow: `1px 1px 0 ${color}, 2px 2px 0 ${color}, 3px 3px 0 ${color}, 4px 4px 0 ${color}, 5px 5px 0 ${color}, 6px 6px 10px ${color}99`,
            };
        case 'neon':
            return {
                textShadow: `0 0 5px ${color}, 0 0 10px ${color}, 0 0 20px ${color}, 0 0 40px ${color}, 0 0 80px ${color}`,
            };
        case 'double_shadow':
            return { textShadow: `3px 3px 0 ${color}, 6px 6px 12px ${color}99` };
        case 'emboss':
            return { textShadow: `1px 1px 1px ${color}, -1px -1px 1px ${color}88` };
        default:
            return {};
    }
}