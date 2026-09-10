export type ThemeName = "peach" | "lavender" | "cream" | "night" | "sunset" | "minimal";
const key = "nhip-doi:theme";
const themes: Record<ThemeName, { accent: string; canvas: string }> = {
  peach: { accent: "#a95d54", canvas: "#faf3ef" }, lavender: { accent: "#6e638f", canvas: "#f5f2fa" }, cream: { accent: "#8c6a42", canvas: "#fbf8ef" }, night: { accent: "#84b5ae", canvas: "#182725" }, sunset: { accent: "#bc6b43", canvas: "#fbf2e9" }, minimal: { accent: "#4f6965", canvas: "#f5f6f4" },
};
export function currentTheme(): ThemeName { try { return (localStorage.getItem(key) as ThemeName) || "cream"; } catch { return "cream"; } }
export function applyTheme(theme: ThemeName): void { const palette = themes[theme] ?? themes.cream; document.documentElement.dataset.theme = theme; document.documentElement.style.setProperty("--accent", palette.accent); document.documentElement.style.setProperty("--canvas", palette.canvas); try { localStorage.setItem(key, theme); } catch { /* offline preference is best effort */ } }
export function initializeTheme(): void { applyTheme(currentTheme()); }
