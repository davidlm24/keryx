import React from "react";

const BACKGROUND_STYLES = {
    celestial_clouds: { background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 30%, #3b82f6 60%, #60a5fa 100%)' },
    celestial_rays: { background: 'radial-gradient(ellipse at center, #fbbf24 0%, #f59e0b 20%, #1e3a8a 60%, #0f172a 100%)' },
    celestial_golden: { background: 'linear-gradient(180deg, #78350f 0%, #b45309 25%, #f59e0b 50%, #fcd34d 75%, #fef3c7 100%)' },
    celestial_particles: { background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)' },
    celestial_aurora: { background: 'linear-gradient(135deg, #042f2e 0%, #064e3b 20%, #0f766e 40%, #1e3a8a 60%, #312e81 80%, #0f172a 100%)' },
    celestial_starry: { background: 'radial-gradient(ellipse at center, #1e1b4b 0%, #0f172a 60%, #000000 100%)' },
    celestial_sunset: { background: 'linear-gradient(180deg, #7c2d12 0%, #c2410c 20%, #f97316 40%, #fbbf24 60%, #fde68a 80%, #fef3c7 100%)' },
    celestial_dawn: { background: 'linear-gradient(135deg, #831843 0%, #be185d 25%, #f59e0b 50%, #fde68a 75%, #fef3c7 100%)' },
    worship_lights: { background: 'radial-gradient(ellipse at 30% 40%, rgba(139,92,246,0.4) 0%, transparent 50%), radial-gradient(ellipse at 70% 60%, rgba(236,72,153,0.3) 0%, transparent 50%), linear-gradient(180deg, #1e1b4b 0%, #0f172a 100%)' },
    worship_atmosphere: { background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.3) 0%, rgba(15,23,42,0.9) 70%, #000000 100%)' },
    worship_smoke: { background: 'linear-gradient(180deg, #18181b 0%, #27272a 50%, #18181b 100%)' },
    worship_reflections: { background: 'conic-gradient(from 0deg at 50% 50%, #1e1b4b, #312e81, #1e3a8a, #1e1b4b)' },
    worship_light_rain: { background: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' },
    worship_ember: { background: 'radial-gradient(ellipse at bottom, #7c2d12 0%, #431407 40%, #0c0a09 100%)' },
    worship_aurora_warm: { background: 'linear-gradient(135deg, #431407 0%, #7c2d12 25%, #be185d 50%, #c2410c 75%, #431407 100%)' },
    premium_black_gold: { background: 'linear-gradient(135deg, #000000 0%, #18181b 40%, #422006 70%, #000000 100%)' },
    premium_elegant: { background: 'linear-gradient(160deg, #0c0a09 0%, #1c1917 40%, #292524 70%, #0c0a09 100%)' },
    premium_gold_particles: { background: 'radial-gradient(ellipse at center, #422006 0%, #1c1917 50%, #000000 100%)' },
    premium_diamond: { background: 'radial-gradient(ellipse at center, #e0f2fe 0%, #bae6fd 20%, #0c4a6e 60%, #082f49 100%)' },
    premium_platinum: { background: 'linear-gradient(135deg, #1c1917 0%, #44403c 30%, #a8a29e 50%, #44403c 70%, #1c1917 100%)' },
    premium_rose_gold: { background: 'linear-gradient(135deg, #4c0519 0%, #9f1239 30%, #be185d 50%, #fda4af 70%, #4c0519 100%)' },
    modern_blue: { background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 50%, #1d4ed8 100%)' },
    modern_purple: { background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #4c1d95 100%)' },
    modern_gold: { background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 50%, #854d0e 100%)' },
    modern_motion: { background: 'linear-gradient(45deg, #1e293b, #334155, #475569, #334155, #1e293b)' },
    modern_green: { background: 'linear-gradient(135deg, #064e3b 0%, #059669 50%, #10b981 100%)' },
    modern_coral: { background: 'linear-gradient(135deg, #9f1239 0%, #e11d48 50%, #fb7185 100%)' },
    modern_neon: { background: 'linear-gradient(135deg, #0c0a09 0%, #1e1b4b 30%, #581c87 60%, #0c0a09 100%)' },
    modern_gradient: { background: 'linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab)' },
    modern_mesh: { background: 'radial-gradient(at 0% 0%, #6366f1 0px, transparent 50%), radial-gradient(at 100% 0%, #ec4899 0px, transparent 50%), radial-gradient(at 100% 100%, #f59e0b 0px, transparent 50%), radial-gradient(at 0% 100%, #10b981 0px, transparent 50%), #0f172a' },
};

// Particle-heavy backgrounds
const PARTICLE_BACKGROUNDS = ['celestial_particles', 'celestial_starry', 'premium_gold_particles', 'premium_diamond', 'premium_platinum'];

// Star backgrounds
const STAR_BACKGROUNDS = ['celestial_starry', 'celestial_aurora'];

// Shimmer backgrounds
const SHIMMER_BACKGROUNDS = ['premium_black_gold', 'premium_elegant', 'premium_rose_gold'];

// Animated gradient backgrounds
const GRADIENT_ANIMATED = ['modern_gradient', 'modern_mesh', 'modern_neon'];

export default function AnimatedBackground({ backgroundId, customImage, speed = 1, intensity = 0.5, overlay = 0.3 }) {
    const style = BACKGROUND_STYLES[backgroundId] || BACKGROUND_STYLES.celestial_clouds;
    // Invert speed: higher speed = shorter duration
    const speedFactor = 1 / Math.max(0.1, speed);
    // Intensity controls particle count
    const particleCount = Math.max(5, Math.floor(30 * intensity));
    const overlayAlpha = overlay;

    // Deterministic star positions (not random on re-render)
    const stars = React.useMemo(() => {
        if (!STAR_BACKGROUNDS.includes(backgroundId)) return [];
        return Array.from({ length: 60 }).map((_, i) => ({
            left: (i * 37) % 100,
            top: (i * 61) % 100,
            size: (i % 3) + 1,
            delay: (i % 5) * 0.8,
        }));
    }, [backgroundId]);

    const particles = React.useMemo(() => {
        if (!PARTICLE_BACKGROUNDS.includes(backgroundId)) return [];
        return Array.from({ length: particleCount }).map((_, i) => ({
            left: (i * 53) % 100,
            top: (i * 71) % 100,
            size: ((i * 13) % 4) + 1,
            delay: (i * 0.3) % 5,
            duration: (((i * 7) % 10) + 8),
        }));
    }, [backgroundId, particleCount]);

    if (customImage) {
        return (
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${customImage})` }}>
                <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${overlayAlpha})` }} />
            </div>
        );
    }

    const isGoldParticles = backgroundId === 'premium_gold_particles';
    const particleColor = isGoldParticles ? '#fbbf24' : (backgroundId === 'premium_diamond' ? '#e0f2fe' : '#ffffff');

    return (
        <div className="absolute inset-0 overflow-hidden" style={style}>
            {/* Overlay for readability */}
            {overlayAlpha > 0 && (
                <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${overlayAlpha})` }} />
            )}

            {/* Particles */}
            {particles.length > 0 && (
                <div className="absolute inset-0">
                    {particles.map((p, i) => (
                        <div
                            key={i}
                            className="absolute rounded-full"
                            style={{
                                width: `${p.size}px`,
                                height: `${p.size}px`,
                                left: `${p.left}%`,
                                top: `${p.top}%`,
                                opacity: intensity * 0.9 + 0.1,
                                animation: `bannerFloatUp ${p.duration * speedFactor}s linear infinite`,
                                animationDelay: `${p.delay}s`,
                                background: particleColor,
                                boxShadow: `0 0 ${p.size * 3}px ${particleColor}`,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Stars (twinkling) */}
            {stars.length > 0 && (
                <div className="absolute inset-0">
                    {stars.map((s, i) => (
                        <div
                            key={i}
                            className="absolute rounded-full bg-white"
                            style={{
                                width: `${s.size}px`,
                                height: `${s.size}px`,
                                left: `${s.left}%`,
                                top: `${s.top}%`,
                                animation: `bannerTwinkle ${2 * speedFactor}s ease-in-out infinite`,
                                animationDelay: `${s.delay}s`,
                                boxShadow: '0 0 4px #fff',
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Light rays */}
            {backgroundId === 'celestial_rays' && (
                <div className="absolute inset-0">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div
                            key={i}
                            className="absolute bg-gradient-to-b from-yellow-200/30 to-transparent"
                            style={{
                                left: `${15 + i * 20}%`,
                                top: '0%',
                                width: '80px',
                                height: '100%',
                                transform: 'rotate(15deg)',
                                animation: `bannerRayPulse ${4 * speedFactor}s ease-in-out infinite`,
                                animationDelay: `${i * 0.5}s`,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Moving clouds */}
            {backgroundId === 'celestial_clouds' && (
                <div className="absolute inset-0">
                    {Array.from({ length: Math.max(2, Math.floor(4 * intensity)) }).map((_, i) => (
                        <div
                            key={i}
                            className="absolute rounded-full bg-white/10 blur-3xl"
                            style={{
                                width: '300px',
                                height: '150px',
                                left: `${-20 + i * 30}%`,
                                top: `${20 + i * 15}%`,
                                animation: `bannerCloudMove ${(20 + i * 5) * speedFactor}s linear infinite`,
                                animationDelay: `${i * 2}s`,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Worship stage lights */}
            {backgroundId === 'worship_lights' && (
                <div className="absolute inset-0">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div
                            key={i}
                            className="absolute bg-gradient-to-b from-purple-400/40 to-transparent"
                            style={{
                                left: `${20 + i * 30}%`,
                                top: '0%',
                                width: '200px',
                                height: '100%',
                                transform: `rotate(${-15 + i * 15}deg)`,
                                animation: `bannerLightSweep ${6 * speedFactor}s ease-in-out infinite`,
                                animationDelay: `${i * 1.5}s`,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Smoke */}
            {backgroundId === 'worship_smoke' && (
                <div className="absolute inset-0">
                    {Array.from({ length: Math.max(2, Math.floor(3 * intensity)) }).map((_, i) => (
                        <div
                            key={i}
                            className="absolute rounded-full bg-purple-900/10 blur-3xl"
                            style={{
                                width: '400px',
                                height: '400px',
                                left: `${10 + i * 30}%`,
                                bottom: '-20%',
                                animation: `bannerSmokeRise ${15 * speedFactor}s ease-in-out infinite`,
                                animationDelay: `${i * 3}s`,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Gold shimmer */}
            {SHIMMER_BACKGROUNDS.includes(backgroundId) && (
                <div className="absolute inset-0">
                    {Array.from({ length: Math.max(5, Math.floor(15 * intensity)) }).map((_, i) => (
                        <div
                            key={i}
                            className="absolute"
                            style={{
                                width: '2px',
                                height: '2px',
                                left: `${(i * 37) % 100}%`,
                                top: `${(i * 61) % 100}%`,
                                animation: `bannerGoldShimmer ${3 * speedFactor}s ease-in-out infinite`,
                                animationDelay: `${(i % 5) * 0.6}s`,
                                boxShadow: '0 0 8px #fbbf24',
                                background: '#fbbf24',
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Modern floating orbs */}
            {(backgroundId === 'modern_motion' || backgroundId === 'modern_mesh') && (
                <div className="absolute inset-0">
                    {Array.from({ length: Math.max(2, Math.floor(4 * intensity)) }).map((_, i) => (
                        <div
                            key={i}
                            className="absolute rounded-full blur-2xl"
                            style={{
                                width: '300px',
                                height: '300px',
                                left: `${-10 + i * 30}%`,
                                top: `${(i * 23) % 60}%`,
                                background: 'rgba(255,255,255,0.1)',
                                animation: `bannerModernFloat ${12 * speedFactor}s ease-in-out infinite`,
                                animationDelay: `${i * 2}s`,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Animated gradient shift */}
            {GRADIENT_ANIMATED.includes(backgroundId) && (
                <div
                    className="absolute inset-0"
                    style={{
                        background: style.background,
                        backgroundSize: '400% 400%',
                        animation: `bannerGradientShift ${8 * speedFactor}s ease infinite`,
                    }}
                />
            )}

            {/* Light rain (falling streaks) */}
            {backgroundId === 'worship_light_rain' && (
                <div className="absolute inset-0">
                    {Array.from({ length: Math.max(10, Math.floor(30 * intensity)) }).map((_, i) => (
                        <div
                            key={i}
                            className="absolute bg-gradient-to-b from-yellow-200/60 to-transparent"
                            style={{
                                width: '2px',
                                height: `${30 + (i % 3) * 20}px`,
                                left: `${(i * 31) % 100}%`,
                                top: '-10%',
                                animation: `bannerRainFall ${((i % 3) + 2) * speedFactor}s linear infinite`,
                                animationDelay: `${(i % 5) * 0.5}s`,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Embers (rising sparks) */}
            {backgroundId === 'worship_ember' && (
                <div className="absolute inset-0">
                    {Array.from({ length: Math.max(8, Math.floor(20 * intensity)) }).map((_, i) => (
                        <div
                            key={i}
                            className="absolute rounded-full"
                            style={{
                                width: `${(i % 3) + 2}px`,
                                height: `${(i % 3) + 2}px`,
                                left: `${(i * 41) % 100}%`,
                                bottom: '0%',
                                background: '#fb923c',
                                boxShadow: '0 0 6px #f97316',
                                animation: `bannerEmberRise ${((i % 4) + 4) * speedFactor}s ease-in infinite`,
                                animationDelay: `${(i % 6) * 0.5}s`,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Aurora waves */}
            {(backgroundId === 'celestial_aurora' || backgroundId === 'worship_aurora_warm') && (
                <div className="absolute inset-0 opacity-60">
                    {[0, 1, 2].map(i => (
                        <div
                            key={i}
                            className="absolute"
                            style={{
                                left: '-10%',
                                right: '-10%',
                                top: `${20 + i * 25}%`,
                                height: '120px',
                                background: backgroundId === 'celestial_aurora'
                                    ? `linear-gradient(90deg, transparent, rgba(16,185,129,0.5), rgba(59,130,246,0.5), rgba(139,92,246,0.5), transparent)`
                                    : `linear-gradient(90deg, transparent, rgba(251,146,60,0.5), rgba(190,24,93,0.5), rgba(251,191,36,0.5), transparent)`,
                                filter: 'blur(20px)',
                                animation: `bannerAuroraWave ${6 * speedFactor}s ease-in-out infinite`,
                                animationDelay: `${i * 0.8}s`,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Conic rotation (reflections) */}
            {backgroundId === 'worship_reflections' && (
                <div
                    className="absolute inset-0"
                    style={{
                        background: style.background,
                        animation: `bannerConicRotate ${10 * speedFactor}s linear infinite`,
                    }}
                />
            )}

            {/* Platinum sweep */}
            {backgroundId === 'premium_platinum' && (
                <div className="absolute inset-0 overflow-hidden">
                    <div
                        className="absolute -inset-1/4"
                        style={{
                            background: 'linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)',
                            animation: `bannerSweep ${4 * speedFactor}s ease-in-out infinite`,
                        }}
                    />
                </div>
            )}

            <style>{`
                @keyframes bannerFloatUp {
                    0% { transform: translateY(100vh) scale(0); opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { transform: translateY(-100px) scale(1.5); opacity: 0; }
                }
                @keyframes bannerTwinkle {
                    0%, 100% { opacity: 0.2; transform: scale(0.5); }
                    50% { opacity: 1; transform: scale(1.2); }
                }
                @keyframes bannerRayPulse {
                    0%, 100% { opacity: 0.2; transform: rotate(15deg) scaleY(1); }
                    50% { opacity: 0.6; transform: rotate(15deg) scaleY(1.2); }
                }
                @keyframes bannerCloudMove {
                    0% { transform: translateX(-50px); }
                    100% { transform: translateX(calc(100vw + 50px)); }
                }
                @keyframes bannerLightSweep {
                    0%, 100% { opacity: 0.2; }
                    50% { opacity: 0.6; }
                }
                @keyframes bannerSmokeRise {
                    0% { transform: translateY(0) scale(1); opacity: 0; }
                    50% { opacity: 0.5; }
                    100% { transform: translateY(-200px) scale(1.5); opacity: 0; }
                }
                @keyframes bannerGoldShimmer {
                    0%, 100% { opacity: 0; transform: scale(0.5); }
                    50% { opacity: 1; transform: scale(1.5); }
                }
                @keyframes bannerModernFloat {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    33% { transform: translate(100px, -50px) scale(1.2); }
                    66% { transform: translate(-50px, 50px) scale(0.8); }
                }
                @keyframes bannerGradientShift {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                @keyframes bannerRainFall {
                    0% { transform: translateY(-20px); opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { transform: translateY(100vh); opacity: 0; }
                }
                @keyframes bannerEmberRise {
                    0% { transform: translateY(0) scale(1); opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { transform: translateY(-80vh) scale(0.3); opacity: 0; }
                }
                @keyframes bannerAuroraWave {
                    0%, 100% { transform: translateX(-10%) scaleY(1); opacity: 0.4; }
                    50% { transform: translateX(10%) scaleY(1.5); opacity: 0.8; }
                }
                @keyframes bannerConicRotate {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes bannerSweep {
                    0% { transform: translateX(-100%) rotate(0deg); }
                    100% { transform: translateX(100%) rotate(0deg); }
                }
            `}</style>
        </div>
    );
}