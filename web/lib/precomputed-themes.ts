import { THEMES, THEME_MAP, DEFAULT_THEME_ID } from "./themes";
import { resolveTheme } from "./theme-resolver";
import { buildAppVars } from "./apply-theme";
import type { Mode } from "./theme-types";

const MODES: Mode[] = ["dark", "light"];

const PRECOMPUTED: Record<string, Record<Mode, Record<string, string>>> = {};
for (const meta of THEMES) {
  const data = THEME_MAP[meta.id];
  if (!data) continue;
  const modes: Record<Mode, Record<string, string>> = { dark: {} as Record<string, string>, light: {} as Record<string, string> };
  for (const mode of MODES) {
    const resolved = resolveTheme(data, mode);
    modes[mode] = buildAppVars(resolved, mode) as unknown as Record<string, string>;
  }
  PRECOMPUTED[meta.id] = modes;
}

export const PRECOMPUTED_THEME_VARS = PRECOMPUTED;
export const PRECOMPUTED_DEFAULT_THEME = DEFAULT_THEME_ID;
