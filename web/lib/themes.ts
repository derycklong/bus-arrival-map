import auraJson from "./themes/aura.json";
import ayuJson from "./themes/ayu.json";
import carbonfoxJson from "./themes/carbonfox.json";
import catppuccinJson from "./themes/catppuccin.json";
import catppuccinFrappeJson from "./themes/catppuccin-frappe.json";
import catppuccinMacchiatoJson from "./themes/catppuccin-macchiato.json";
import cobalt2Json from "./themes/cobalt2.json";
import cursorJson from "./themes/cursor.json";
import draculaJson from "./themes/dracula.json";
import everforestJson from "./themes/everforest.json";
import flexokiJson from "./themes/flexoki.json";
import githubJson from "./themes/github.json";
import gruvboxJson from "./themes/gruvbox.json";
import kanagawaJson from "./themes/kanagawa.json";
import lucentOrngJson from "./themes/lucent-orng.json";
import materialJson from "./themes/material.json";
import matrixJson from "./themes/matrix.json";
import mercuryJson from "./themes/mercury.json";
import monokaiJson from "./themes/monokai.json";
import nightowlJson from "./themes/nightowl.json";
import nordJson from "./themes/nord.json";
import oneDarkJson from "./themes/one-dark.json";
import opencodeJson from "./themes/opencode.json";
import orngJson from "./themes/orng.json";
import osakaJadeJson from "./themes/osaka-jade.json";
import palenightJson from "./themes/palenight.json";
import rosepineJson from "./themes/rosepine.json";
import solarizedJson from "./themes/solarized.json";
import synthwave84Json from "./themes/synthwave84.json";
import tokyonightJson from "./themes/tokyonight.json";
import vercelJson from "./themes/vercel.json";
import vesperJson from "./themes/vesper.json";
import zenburnJson from "./themes/zenburn.json";

import type { ThemeJson, ThemeMeta } from "./theme-types";
import { describeTheme } from "./theme-resolver";

interface ThemeEntry {
  meta: ThemeMeta;
  data: ThemeJson;
}

const RAW: Array<{ id: string; name: string; description: string; data: ThemeJson }> = [
  { id: "aura",          name: "Aura",          description: "Dark theme with purple/pink accents",     data: auraJson as ThemeJson },
  { id: "ayu",           name: "Ayu",           description: "Based on the Ayu theme",                  data: ayuJson as ThemeJson },
  { id: "carbonfox",     name: "Carbon Fox",    description: "Vintage-inspired Carbon variant",        data: carbonfoxJson as ThemeJson },
  { id: "catppuccin",    name: "Catppuccin",    description: "Soothing pastel (Latte variant)",         data: catppuccinJson as ThemeJson },
  { id: "catppuccin-frappe",    name: "Catppuccin Frappé",    description: "Soothing pastel (Frappé variant)",         data: catppuccinFrappeJson as ThemeJson },
  { id: "catppuccin-macchiato", name: "Catppuccin Macchiato", description: "Soothing pastel (Macchiato variant)",      data: catppuccinMacchiatoJson as ThemeJson },
  { id: "cobalt2",       name: "Cobalt2",       description: "Based on the Cobalt2 theme",              data: cobalt2Json as ThemeJson },
  { id: "cursor",        name: "Cursor",        description: "Based on the Cursor editor theme",        data: cursorJson as ThemeJson },
  { id: "dracula",       name: "Dracula",       description: "Based on the Dracula theme",              data: draculaJson as ThemeJson },
  { id: "everforest",    name: "Everforest",    description: "Based on the Everforest theme",           data: everforestJson as ThemeJson },
  { id: "flexoki",       name: "Flexoki",       description: "Based on the Flexoki theme",              data: flexokiJson as ThemeJson },
  { id: "github",        name: "GitHub",        description: "Based on the GitHub theme",               data: githubJson as ThemeJson },
  { id: "gruvbox",       name: "Gruvbox",       description: "Based on the Gruvbox theme",              data: gruvboxJson as ThemeJson },
  { id: "kanagawa",      name: "Kanagawa",      description: "Based on the Kanagawa theme",             data: kanagawaJson as ThemeJson },
  { id: "lucent-orng",   name: "Lucent Orng",   description: "Soft orange-tinted variant of Orng",      data: lucentOrngJson as ThemeJson },
  { id: "material",      name: "Material",      description: "Based on Material Theme",                 data: materialJson as ThemeJson },
  { id: "matrix",        name: "Matrix",        description: "Hacker-style green on black",            data: matrixJson as ThemeJson },
  { id: "mercury",       name: "Mercury",       description: "Based on the Mercury theme",              data: mercuryJson as ThemeJson },
  { id: "monokai",       name: "Monokai",       description: "Based on the Monokai theme",              data: monokaiJson as ThemeJson },
  { id: "nightowl",      name: "Night Owl",     description: "Based on the Night Owl theme",            data: nightowlJson as ThemeJson },
  { id: "nord",          name: "Nord",          description: "Based on the Nord theme",                 data: nordJson as ThemeJson },
  { id: "one-dark",      name: "One Dark",      description: "Based on the Atom One Dark theme",        data: oneDarkJson as ThemeJson },
  { id: "opencode",      name: "OpenCode",      description: "OpenCode's signature default theme",      data: opencodeJson as ThemeJson },
  { id: "orng",          name: "Orng",          description: "OpenCode orange-on-black palette",        data: orngJson as ThemeJson },
  { id: "osaka-jade",    name: "Osaka Jade",    description: "Calm jade-and-cream palette",             data: osakaJadeJson as ThemeJson },
  { id: "palenight",     name: "Palenight",     description: "Based on the Palenight theme",            data: palenightJson as ThemeJson },
  { id: "rosepine",      name: "Rosé Pine",     description: "Based on the Rosé Pine theme",            data: rosepineJson as ThemeJson },
  { id: "solarized",     name: "Solarized",     description: "Based on the Solarized theme",            data: solarizedJson as ThemeJson },
  { id: "synthwave84",   name: "Synthwave '84", description: "Retro 80s synthwave palette",             data: synthwave84Json as ThemeJson },
  { id: "tokyonight",    name: "Tokyo Night",   description: "Based on the Tokyonight theme",           data: tokyonightJson as ThemeJson },
  { id: "vercel",        name: "Vercel",        description: "Based on the Vercel design palette",      data: vercelJson as ThemeJson },
  { id: "vesper",        name: "Vesper",        description: "Based on the Vesper theme",               data: vesperJson as ThemeJson },
  { id: "zenburn",       name: "Zenburn",       description: "Based on the Zenburn theme",              data: zenburnJson as ThemeJson },
];

const REGISTRY: ThemeEntry[] = RAW.map((entry) => {
  const { hasLight, hasDark } = describeTheme(entry.data);
  return {
    meta: {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      hasLight,
      hasDark,
    },
    data: entry.data,
  };
});

export const THEMES: ThemeMeta[] = REGISTRY.map((r) => r.meta);

export const THEME_MAP: Record<string, ThemeJson> = Object.fromEntries(
  REGISTRY.map((r) => [r.meta.id, r.data])
);

export const DEFAULT_THEME_ID = "opencode";

export function getTheme(id: string): ThemeJson | undefined {
  return THEME_MAP[id];
}

export function isValidThemeId(id: string): boolean {
  return id in THEME_MAP;
}
