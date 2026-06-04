"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { THEMES } from "@/lib/themes";
import { resolveTheme } from "@/lib/theme-resolver";
import { THEME_MAP } from "@/lib/themes";
import type { Mode } from "@/lib/theme-types";

interface ThemePickerProps {
  open: boolean;
  onClose: () => void;
  selected: string;
  mode: Mode;
  onSelect: (themeId: string) => void;
  onModeChange?: (mode: Mode) => void;
}

interface SwatchPreview {
  bg: string;
  panel: string;
  text: string;
  accent: string;
  hasLight: boolean;
  hasDark: boolean;
}

function previewColorsFor(themeId: string, mode: Mode): SwatchPreview {
  const meta = THEMES.find((t) => t.id === themeId);
  const data = THEME_MAP[themeId];
  const fallback: SwatchPreview = {
    bg: "#1a1a1a",
    panel: "#222",
    text: "#eee",
    accent: "#5c9cf5",
    hasLight: false,
    hasDark: true,
  };
  if (!meta || !data) return fallback;
  try {
    const resolved = resolveTheme(data, mode);
    return {
      bg: resolved.background,
      panel: resolved.backgroundPanel,
      text: resolved.text,
      accent: resolved.accent || resolved.primary,
      hasLight: meta.hasLight,
      hasDark: meta.hasDark,
    };
  } catch {
    return fallback;
  }
}

export default function ThemePicker({
  open,
  onClose,
  selected,
  mode,
  onSelect,
  onModeChange,
}: ThemePickerProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Recompute previews whenever the mode flips so each swatch shows the
  // user the actual palette they'd get, not a hardcoded dark variant.
  const previews: Record<string, SwatchPreview> = useMemo(() => {
    const out: Record<string, SwatchPreview> = {};
    for (const t of THEMES) out[t.id] = previewColorsFor(t.id, mode);
    return out;
  }, [mode]);

  // Filter the grid to themes that actually have a variant for the
  // currently-selected mode. A dark-only theme (e.g. Aura, Ayu) is hidden
  // when browsing in day mode so the user never sees something that would
  // silently fall back to dark.
  const availableInMode = useMemo(() => {
    return THEMES.filter((t) => (mode === "dark" ? t.hasDark : t.hasLight));
  }, [mode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableInMode;
    return availableInMode.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [query, availableInMode]);

  if (!open) return null;

  function handlePick(themeId: string) {
    onSelect(themeId);
    onClose();
  }

  const otherMode: Mode = mode === "dark" ? "light" : "dark";
  const otherModeCount = THEMES.filter((t) => (otherMode === "dark" ? t.hasDark : t.hasLight)).length;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-[rgba(10,10,30,0.85)]"
      onClick={onClose}
      role="dialog"
      aria-label="Select theme"
    >
      <div
        className="modal-card theme-picker-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="theme-picker-head">
          <div>
            <h2>Theme</h2>
            <p className="theme-picker-sub">
              {availableInMode.length} {mode === "dark" ? "night" : "day"} themes
              {otherModeCount > 0 && ` · ${otherModeCount} ${otherMode === "dark" ? "night" : "day"} hidden`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="icon-button"
            aria-label="Close theme picker"
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="theme-picker-mode" role="tablist" aria-label="Theme mode">
          <button
            role="tab"
            aria-selected={mode === "dark"}
            onClick={() => onModeChange?.("dark")}
            className={"theme-picker-mode-tab" + (mode === "dark" ? " is-active" : "")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
            <span>Night</span>
          </button>
          <button
            role="tab"
            aria-selected={mode === "light"}
            onClick={() => onModeChange?.("light")}
            className={"theme-picker-mode-tab" + (mode === "light" ? " is-active" : "")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
            </svg>
            <span>Day</span>
          </button>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search themes…"
          className="theme-picker-search"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="theme-picker-grid" role="listbox" aria-label="Themes">
          {filtered.length === 0 && (
            <p className="theme-picker-empty">No {mode === "dark" ? "night" : "day"} themes match “{query}”.</p>
          )}
          {filtered.map((theme) => {
            const preview = previews[theme.id] ?? previewColorsFor(theme.id, mode);
            const isActive = theme.id === selected;
            return (
              <button
                key={theme.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => handlePick(theme.id)}
                className={"theme-swatch" + (isActive ? " is-active" : "")}
                title={theme.description}
              >
                <div
                  className="theme-swatch-preview"
                  style={{ background: preview.bg }}
                >
                  <div
                    className="theme-swatch-panel"
                    style={{ background: preview.panel }}
                  />
                  <div
                    className="theme-swatch-accent"
                    style={{ background: preview.accent }}
                  />
                  <div
                    className="theme-swatch-text"
                    style={{ color: preview.text }}
                  >
                    Aa
                  </div>
                </div>
                <div className="theme-swatch-meta">
                  <span className="theme-swatch-name">{theme.name}</span>
                </div>
                {isActive && (
                  <span className="theme-swatch-check" aria-hidden>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
