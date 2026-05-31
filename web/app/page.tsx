"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import AuthForm from "@/components/auth-form";
import { getMe } from "@/lib/api";
import type { StopBase } from "@/lib/api";
import { useFavourites } from "@/lib/use-favourites";

const MapView = dynamic(() => import("@/components/map-view"), { ssr: false });
const FavoritesPanel = dynamic(() => import("@/components/favorites-panel"), { ssr: false });

export default function Home() {
  const [view, setView] = useState<"auth" | "map" | "spinner">("spinner");

  useEffect(() => {
    try {
      if (!localStorage.getItem("token")) {
        setView("auth");
      }
    } catch {
      setView("auth");
    }
  }, []);
  const [username, setUsername] = useState("");
  const [selectedStop, setSelectedStop] = useState<StopBase | null>(null);
  const [panelDismissed, setPanelDismissed] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState("");

  const {
    stops,
    loading: favsLoading,
    error: favsError,
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

  const favouriteStopCodesKey = useMemo(
    () => stops.map((s) => s.stop.stop_code).join(","),
    [stops]
  );

  // Check auth on initial mount when token exists
  useEffect(() => {
    if (view !== "spinner") return;

    const fallback = setTimeout(() => setView("auth"), 15000);

    getMe()
      .then((user) => {
        clearTimeout(fallback);
        setUsername(user.username);
        setView("map");
      })
      .catch(() => {
        clearTimeout(fallback);
        try { localStorage.removeItem("token"); } catch { /* noop */ }
        setSessionExpiredMessage("Session expired. Please log in again.");
        setView("auth");
      });

    return () => clearTimeout(fallback);
  }, [view]);

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

    window.history.pushState(null, "", window.location.href);
    window.history.pushState(null, "", window.location.href);
    function handlePopState() {
      window.history.pushState(null, "", window.location.href);
      window.history.pushState(null, "", window.location.href);
    }
    window.addEventListener("popstate", handlePopState);

    let touchStartX = 0;
    function handleTouchStart(e: TouchEvent) {
      touchStartX = e.touches[0].clientX;
    }
    function handleTouchMove(e: TouchEvent) {
      // Don't block swipes that originate inside the favorites panel
      const target = e.target as HTMLElement;
      if (target.closest(".favorites-panel")) return;
      if (touchStartX < 24 && e.touches[0].clientX - touchStartX > 0) {
        e.preventDefault();
      }
    }
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
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
        <div className="app-user">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>
          </svg>
          <span>{username}</span>
          <button onClick={handleLogout} title="Log out">
            Log out
          </button>
        </div>
      </header>
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
        onDismissedChange={setPanelDismissed}
        onExpandedChange={setPanelExpanded}
      />
      <MapView
        favouriteStopCodes={favouriteStopCodes}
        favouriteStopCodesKey={favouriteStopCodesKey}
        selectedStop={selectedStop}
        onSelectStop={handleSelectStop}
        panelDismissed={panelDismissed}
        panelExpanded={panelExpanded}
      />
    </div>
  );
}