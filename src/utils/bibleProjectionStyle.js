const STORAGE_KEY = "bible_projection_style";

export const getBibleProjectionStyle = () => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
        text_color: "#ffffff",
        background_image: null,
        background_color: null,
        font_size: "large",
        font_family: "sans",
        version: "NVI",
    };
};

export const setBibleProjectionStyle = (style) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
    } catch (e) {}
};