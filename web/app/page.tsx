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

  // Check auth on initial mount when token exists
  useEffect(() => {
    if (view !== "spinner") return;

    getMe()
      .then((user) => {
        setUsername(user.username);
        setView("map");
      })
      .catch(() => {
        try {
          localStorage.removeItem("token");
        } catch {
          /* noop */
        }
        setSessionExpiredMessage("Session expired. Please log in again.");
        setView("auth");
      });
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

  // Handle session expiry from any API call (token expired mid-session)
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

  if (view === "spinner") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,10,30,0.5)]">
        <div className="w-10 h-10 border-3 border-[#2a3a5c] border-t-[#0a6bff] rounded-full animate-spin" />
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
      />
      <MapView
        favouriteStopCodes={favouriteStopCodes}
        selectedStop={selectedStop}
        onSelectStop={handleSelectStop}
      />
    </div>
  );
}
