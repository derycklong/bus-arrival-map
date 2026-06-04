import type {
  ColorValue,
  Mode,
  ResolvedTheme,
  ThemeJson,
  ThemeToken,
} from "./theme-types";

const TOKEN_KEYS: ThemeToken[] = [
  "primary",
  "secondary",
  "accent",
  "error",
  "warning",
  "success",
  "info",
  "text",
  "textMuted",
  "background",
  "backgroundPanel",
  "backgroundElement",
  "border",
  "borderActive",
  "borderSubtle",
  "diffAdded",
  "diffRemoved",
  "diffContext",
  "diffHunkHeader",
  "diffHighlightAdded",
  "diffHighlightRemoved",
  "diffAddedBg",
  "diffRemovedBg",
  "diffContextBg",
  "diffLineNumber",
  "diffAddedLineNumberBg",
  "diffRemovedLineNumberBg",
  "markdownText",
  "markdownHeading",
  "markdownLink",
  "markdownLinkText",
  "markdownCode",
  "markdownBlockQuote",
  "markdownEmph",
  "markdownStrong",
  "markdownHorizontalRule",
  "markdownListItem",
  "markdownListEnumeration",
  "markdownImage",
  "markdownImageText",
  "markdownCodeBlock",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxFunction",
  "syntaxVariable",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
  "syntaxPunctuation",
];

function isVariant(v: unknown): v is { dark: ColorValue; light: ColorValue } {
  return (
    typeof v === "object" &&
    v !== null &&
    "dark" in v &&
    "light" in v &&
    typeof (v as { dark: unknown }).dark !== "undefined" &&
    typeof (v as { light: unknown }).light !== "undefined"
  );
}

function resolveColor(
  raw: ColorValue,
  theme: ThemeJson,
  mode: Mode,
  chain: string[] = []
): string {
  if (typeof raw === "string") {
    if (raw.startsWith("#")) return raw.toLowerCase();
    if (chain.includes(raw)) {
      throw new Error(`Circular color reference: ${[...chain, raw].join(" -> ")}`);
    }
    const defs = theme.defs ?? {};
    const next = defs[raw] ?? (theme.theme as Record<string, ColorValue>)[raw];
    if (next === undefined) {
      return "#000000";
    }
    return resolveColor(next, theme, mode, [...chain, raw]);
  }
  if (isVariant(raw)) {
    return resolveColor(raw[mode], theme, mode, chain);
  }
  return "#000000";
}

export function resolveTheme(theme: ThemeJson, mode: Mode): ResolvedTheme {
  const out = {} as Record<ThemeToken, string>;
  for (const key of TOKEN_KEYS) {
    const value = theme.theme[key];
    if (value === undefined) {
      out[key] = "#000000";
      continue;
    }
    out[key] = resolveColor(value, theme, mode);
  }
  return out as ResolvedTheme;
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

function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const srgb = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

// A theme truly has a usable light variant only if the light mode resolves
// to a light background with a dark, contrasting text. Some themes (e.g.
// catppuccin-frappe, nightowl, lucent-orng) ship a `{dark, light}` token
// shape but point both sides at the same dark values, so the "light" picker
// would actually render a dark palette.
export function themeHasLightVariant(theme: ThemeJson): boolean {
  let bgValue: ColorValue | undefined;
  let textValue: ColorValue | undefined;
  for (const key of ["background", "text"] as const) {
    const value = theme.theme[key];
    if (value === undefined) continue;
    if (!isVariant(value)) return false;
    if (key === "background") bgValue = value;
    if (key === "text") textValue = value;
  }
  if (!bgValue || !textValue) return false;
  const bgHex = resolveColor(bgValue, theme, "light");
  const textHex = resolveColor(textValue, theme, "light");
  const bgLum = luminance(bgHex);
  const textLum = luminance(textHex);
  // Light theme: background is bright AND text is meaningfully darker
  // than the background so there's actual contrast.
  return bgLum > 0.3 && textLum < bgLum - 0.3;
}

export function describeTheme(theme: ThemeJson): { hasLight: boolean; hasDark: boolean } {
  return {
    hasLight: themeHasLightVariant(theme),
    hasDark: true,
  };
}
