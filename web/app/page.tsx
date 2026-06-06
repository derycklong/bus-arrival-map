"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import AuthForm from "@/components/auth-form";
import { getMe } from "@/lib/api";
import type { StopBase } from "@/lib/api";
import { useFavourites } from "@/lib/use-favourites";
import { THEME_MAP, DEFAULT_THEME_ID, isValidThemeId } from "@/lib/themes";
import { resolveTheme } from "@/lib/theme-resolver";
import { buildAppVars, applyAppVars } from "@/lib/apply-theme";
import type { Mode } from "@/lib/theme-types";

const MapView = dynamic(() => import("@/components/map-view"), { ssr: false });
const FavoritesPanel = dynamic(() => import("@/components/favorites-panel"), { ssr: false });
const ThemePicker = dynamic(() => import("@/components/theme-picker"), { ssr: false });

function applyThemeToDom(themeId: string, mode: Mode): void {
  const data = THEME_MAP[themeId];
  if (!data) return;
  try {
    const resolved = resolveTheme(data, mode);
    applyAppVars(buildAppVars(resolved, mode));
    document.documentElement.setAttribute("data-theme", mode);
  } catch {
    /* noop */
  }
}

export default function Home() {
  // Initial values must be deterministic on both server and client to avoid
  // hydration mismatches. localStorage is read after mount in the effect below.
  const [view, setView] = useState<"auth" | "map" | "spinner">("spinner");
  const [username, setUsername] = useState("");
  const [selectedStop, setSelectedStop] = useState<StopBase | null>(null);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState("");
  const [mapMode, setMapMode] = useState<"light" | "dark">("light");
  const [mode, setMode] = useState<Mode>("light");
  const [themeId, setThemeId] = useState<string>(DEFAULT_THEME_ID);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [onlyShowFavorites, setOnlyShowFavorites] = useState(false);

  const handleLocationChange = useCallback((loc: { lat: number; lng: number }) => {
    setUserLocation(loc);
  }, []);

  const toggleOnlyFavorites = useCallback(() => {
    setOnlyShowFavorites((prev) => {
      const next = !prev;
      try { localStorage.setItem("onlyShowFavorites", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  const {
    stops,
    loading: favsLoading,
    error: favsError,
    favouriteBusesByStop,
    updateFavouriteBusesForStop,
    fetchFavourites,
    addFavouriteStop,
    removeFavouriteStop,
    startPolling,
    stopPolling,
  } = useFavourites();

  const favouriteStopCodes = useMemo(
    () => new Set(stops.map((s) => s.stop.stop_code)),
    [stops]
  );

  const favouriteStops = useMemo(
    () => stops.map((s) => s.stop),
    [stops]
  );

  // Flatten favourite buses across all favourite stops, taking only live
  // (non-zero) positions from `next` and `subsequent`. The map decides
  // whether to render them based on proximity to the user.
  const favouriteBusPositions = useMemo(() => {
    const out: {
      no: string;
      operator: string;
      lat: number;
      lng: number;
      destinationName: string;
      stopCode: string;
      type: "next" | "subsequent";
    }[] = [];
    for (const item of stops) {
      if (item.loading || item.error) continue;
      const favNos = favouriteBusesByStop.get(item.stop.stop_code);
      if (!favNos || favNos.size === 0) continue;
      for (const svc of item.services) {
        if (!favNos.has(svc.no)) continue;
        if (svc.next?.lat && svc.next?.lng) {
          out.push({
            no: svc.no,
            operator: svc.operator,
            lat: svc.next.lat,
            lng: svc.next.lng,
            destinationName: svc.next.destination_name || "",
            stopCode: item.stop.stop_code,
            type: "next",
          });
        }
        if (svc.subsequent?.lat && svc.subsequent?.lng) {
          out.push({
            no: svc.no,
            operator: svc.operator,
            lat: svc.subsequent.lat,
            lng: svc.subsequent.lng,
            destinationName: svc.subsequent.destination_name || "",
            stopCode: item.stop.stop_code,
            type: "subsequent",
          });
        }
      }
    }
    return out;
  }, [stops, favouriteBusesByStop]);

  const toggleMapMode = useCallback(() => {
    setMapMode((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try { localStorage.setItem("mapMode", next); } catch {}
      return next;
    });
  }, []);

  const handleSelectTheme = useCallback((id: string) => {
    setThemeId(id);
    try { localStorage.setItem("themeId", id); } catch {}
    setPickerOpen(false);
  }, []);

  const handlePickerModeChange = useCallback((m: Mode) => {
    setMode(m);
    try { localStorage.setItem("mode", m); } catch {}
  }, []);

  useEffect(() => {
    applyThemeToDom(themeId, mode);
  }, [themeId, mode]);

  // Initialize: hydrate theme + token state from localStorage, then validate
  // the token with the server. Runs once on mount.
  useEffect(() => {
    // 1. Restore mapMode + theme mode + themeId preferences (client-only, post-mount)
    try {
      const storedMap = localStorage.getItem("mapMode") as "light" | "dark" | null;
      if (storedMap === "dark" || storedMap === "light") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration sync from localStorage
        setMapMode(storedMap);
      }
      const storedMode = (localStorage.getItem("mode") ?? localStorage.getItem("theme")) as Mode | null;
      if (storedMode === "dark" || storedMode === "light") {
        setMode(storedMode);
      }
      const storedId = localStorage.getItem("themeId");
      if (storedId && isValidThemeId(storedId)) {
        setThemeId(storedId);
      }
      const storedOnlyFav = localStorage.getItem("onlyShowFavorites");
      if (storedOnlyFav === "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration sync from localStorage
        setOnlyShowFavorites(true);
      }
    } catch { /* noop */ }

    // 2. Check for a stored token. If absent, go straight to auth.
    let token: string | null = null;
    try {
      token = localStorage.getItem("token");
    } catch { /* noop */ }
    if (!token) {
      setView("auth");
      return;
    }

    // 3. Validate the token with the server.
    let cancelled = false;
    const fallback = setTimeout(() => {
      if (cancelled) return;
      try { localStorage.removeItem("token"); } catch { /* noop */ }
      setSessionExpiredMessage("Could not reach server. Please log in again.");
      setView("auth");
    }, 5000);

    getMe()
      .then((user) => {
        if (cancelled) return;
        clearTimeout(fallback);
        setUsername(user.username);
        setView("map");
      })
      .catch(() => {
        if (cancelled) return;
        clearTimeout(fallback);
        try { localStorage.removeItem("token"); } catch { /* noop */ }
        setSessionExpiredMessage("Session expired. Please log in again.");
        setView("auth");
      });

    return () => {
      cancelled = true;
      clearTimeout(fallback);
    };
  }, []);

  // Start/stop favourites polling based on view
  useEffect(() => {
    if (view === "map") {
      startPolling();
    }
    return () => {
      if (view !== "map") {
        stopPolling();
      }
    };
  }, [view, startPolling, stopPolling]);

  // Disable back nav on mobile (only in map view)
  useEffect(() => {
    if (view !== "map") return;

    // Keep exactly 1 history entry — iOS disables edge-swipe when history length is 1
    window.history.replaceState(null, "", window.location.href);
    document.body.classList.add("no-swipe-back");

    // Intercept browser back button: if the user tries to leave the map view,
    // push the current state back so they stay on the map. This prevents the
    // BFCache or service-worker-cached auth page from appearing on back nav.
    function handlePopState() {
      window.history.pushState(null, "", window.location.href);
    }
    window.addEventListener("popstate", handlePopState);

    // Block iOS edge-swipe navigation gestures
    const root = document.querySelector("div.app-shell") || document.body.firstElementChild;
    function handleTouchStart(e: TouchEvent) {
      const x = e.touches[0]?.pageX ?? 0;
      if (x > 20 && x < window.innerWidth - 20) return;
      const target = e.target as HTMLElement;
      if (target.closest(".favorites-panel") || target.closest(".stop-panel")) return;
      e.preventDefault();
    }
    if (root) {
      (root as HTMLElement).addEventListener("touchstart", handleTouchStart, { passive: false });
    }

    return () => {
      document.body.classList.remove("no-swipe-back");
      window.removeEventListener("popstate", handlePopState);
      if (root) {
        (root as HTMLElement).removeEventListener("touchstart", handleTouchStart);
      }
    };
  }, [view]);

  useEffect(() => {
    function handleSessionExpired() {
      stopPolling();
      setSelectedStop(null);
      setSessionExpiredMessage("Session expired. Please log in again.");
      setView("auth");
      setUsername("");
    }
    window.addEventListener("auth:expired", handleSessionExpired);
    return () => window.removeEventListener("auth:expired", handleSessionExpired);
  }, [stopPolling]);

  function handleAuth(_token: string, user: string) {
    setUsername(user);
    setSessionExpiredMessage("");
    // Overwrite the auth page in the history stack so back button
    // doesn't return to the login screen (BFCache / SW can still
    // restore it otherwise). The popstate handler in the map-view
    // effect re-pushes to neutralize any remaining back entries.
    window.history.replaceState(null, "", window.location.href);
    window.history.pushState(null, "", window.location.href);
    setView("map");
  }

  function handleSelectStop(stop: StopBase) {
    setSelectedStop(stop);
  }

  function handleCloseSidebar() {
    setSelectedStop(null);
  }

  function handleLogout() {
    stopPolling();
    setSelectedStop(null);
    try { localStorage.removeItem("token"); } catch { /* noop */ }
    setUsername("");
    setView("auth");
  }

  if (view === "spinner") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
        <div className="spinner-modern w-10 h-10" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  if (view === "auth") {
    return <AuthForm onAuth={handleAuth} sessionExpiredMessage={sessionExpiredMessage} />;
  }

  return (
    <div className={`app-shell ${selectedStop ? "has-sidebar-open" : ""}`}>
      <header className="app-topbar">
        <div>
          <p className="app-kicker">derycklong</p>
          <h1>Bus Arrival Map</h1>
        </div>
      </header>
      <div className="app-user">
          <button onClick={toggleMapMode} className="theme-toggle-button" title={"Switch map to " + (mapMode === "dark" ? "light" : "dark") + " tiles"} aria-label="Toggle map day/night">
            {mapMode === "dark"
              ? <svg key="sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
              : <svg key="moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>
          <button onClick={() => setPickerOpen(true)} className="theme-toggle-button" title="Choose theme" aria-label="Choose theme">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
              <circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
              <circle cx="16.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
              <circle cx="15.5" cy="15" r="1.1" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <button
            onClick={toggleOnlyFavorites}
            className={"theme-toggle-button" + (onlyShowFavorites ? " is-active" : "")}
            title={onlyShowFavorites ? "Show all bus stops" : "Show favourites only"}
            aria-label={onlyShowFavorites ? "Show all bus stops" : "Show favourites only"}
            aria-pressed={onlyShowFavorites}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={onlyShowFavorites ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <svg className="app-user-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>
          </svg>
          <span>{username}</span>
          <button onClick={handleLogout} title="Log out">
            Log out
          </button>
        </div>
      <FavoritesPanel
        stops={stops}
        loading={favsLoading}
        error={favsError}
        selectedStop={selectedStop}
        onSelectStop={handleSelectStop}
        onCloseStop={handleCloseSidebar}
        onRemoveStop={removeFavouriteStop}
        onRefresh={fetchFavourites}
        isFavourite={selectedStop ? favouriteStopCodes.has(selectedStop.stop_code) : false}
        onFavouriteAdd={addFavouriteStop}
        onFavouriteRemove={removeFavouriteStop}
        userLocation={userLocation}
        favouriteBusesByStop={favouriteBusesByStop}
        onUpdateFavouriteBuses={updateFavouriteBusesForStop}
      />
      <MapView
        favouriteStopCodes={favouriteStopCodes}
        favouriteStops={favouriteStops}
        favouriteBuses={favouriteBusPositions}
        userLocation={userLocation}
        selectedStop={selectedStop}
        onSelectStop={handleSelectStop}
        onLocationChange={handleLocationChange}
        mode={mapMode}
        onlyShowFavorites={onlyShowFavorites}
      />
      {pickerOpen && (
        <ThemePicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          selected={themeId}
          mode={mode}
          onSelect={handleSelectTheme}
          onModeChange={handlePickerModeChange}
        />
      )}
    </div>
  );
}