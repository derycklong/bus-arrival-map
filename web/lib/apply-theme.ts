import type { ResolvedTheme } from "./theme-types";

export interface AppVars {
  "--color-card": string;
  "--color-border": string;
  "--color-border-strong": string;
  "--color-text": string;
  "--color-text-secondary": string;
  "--color-text-muted": string;
  "--color-accent": string;
  "--color-accent-hover": string;
  "--color-accent-soft": string;
  "--color-bg": string;
  "--color-surface": string;
  "--color-surface-hover": string;
  "--color-glass-border": string;
  "--color-glass-shadow": string;
  "--color-fav": string;
  "--color-fav-bg": string;
  "--color-fav-border": string;
  "--color-success": string;
  "--color-success-bg": string;
  "--color-danger": string;
  "--color-danger-bg": string;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function adjustHex(hex: string, percent: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const adj = (c: number) => {
    const v = Math.round(c + (percent / 100) * (percent >= 0 ? 255 - c : c));
    return Math.max(0, Math.min(255, v));
  };
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(adj(r))}${toHex(adj(g))}${toHex(adj(b))}`;
}

function pickSecondaryText(theme: ResolvedTheme): string {
  // Derive a secondary tone from the main text color so it's always
  // visually distinct from the muted color (many OpenCode themes set
  // textMuted == textSecondary, which collapses the hierarchy). In dark
  // mode we lighten, in light mode we darken, both toward ~60% blend.
  const text = theme.text;
  const muted = theme.textMuted;
  if (!text) return muted;
  const isDark = textIsDark(text);
  if (isDark) {
    return blendRgb(text, "#ffffff", 0.4);
  }
  return blendRgb(text, "#000000", 0.35);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const toHex = (c: number) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function blendRgb(a: string, b: string, t: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return rgbToHex({
    r: ra.r + (rb.r - ra.r) * t,
    g: ra.g + (rb.g - ra.g) * t,
    b: ra.b + (rb.b - ra.b) * t,
  });
}

function textIsDark(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  // sRGB relative luminance, simplified — values below 0.5 are "dark text".
  const srgb = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  return lum < 0.5;
}

export function buildAppVars(theme: ResolvedTheme, mode: "dark" | "light"): AppVars {
  const isDark = mode === "dark";
  const accent = theme.accent || theme.primary;
  const favColor = theme.warning || theme.diffHighlightAdded || theme.primary;
  const success = theme.success;

  const card = theme.backgroundPanel;
  const surfaceAlpha = isDark ? 0.88 : 0.85;
  const surfaceHoverAlpha = isDark ? 0.92 : 1;

  return {
    "--color-card": card,
    "--color-border": isDark ? hexToRgba(theme.borderSubtle, 0.4) : hexToRgba(theme.borderSubtle, 0.35),
    "--color-border-strong": theme.border,
    "--color-text": theme.text,
    "--color-text-secondary": pickSecondaryText(theme),
    "--color-text-muted": theme.textMuted,
    "--color-accent": accent,
    "--color-accent-hover": adjustHex(accent, isDark ? -8 : -10),
    "--color-accent-soft": hexToRgba(accent, isDark ? 0.18 : 0.12),
    "--color-bg": theme.background,
    "--color-surface": hexToRgba(card, surfaceAlpha),
    "--color-surface-hover": hexToRgba(theme.backgroundElement, surfaceHoverAlpha),
    "--color-glass-border": hexToRgba(theme.border, isDark ? 0.18 : 0.5),
    "--color-glass-shadow": hexToRgba(theme.background, isDark ? 0.4 : 0.08),
    "--color-fav": favColor,
    "--color-fav-bg": hexToRgba(favColor, isDark ? 0.16 : 0.12),
    "--color-fav-border": hexToRgba(favColor, isDark ? 0.5 : 0.45),
    "--color-success": success,
    "--color-success-bg": hexToRgba(success, 0.12),
    "--color-danger": theme.error,
    "--color-danger-bg": hexToRgba(theme.error, 0.12),
  };
}

export function applyAppVars(vars: AppVars): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}
