"use client";

import { useEffect, useState, useReducer } from "react";
import { StopBase, Service, getArrivals } from "@/lib/api";
import DurationText from "./duration-text";

type ArrivalsState = {
  services: Service[];
  loading: boolean;
  error: boolean;
};

type ArrivalsAction =
  | { type: "fetch_start" }
  | { type: "fetch_success"; services: Service[] }
  | { type: "fetch_error" };

function arrivalsReducer(state: ArrivalsState, action: ArrivalsAction): ArrivalsState {
  switch (action.type) {
    case "fetch_start":
      return { services: [], loading: true, error: false };
    case "fetch_success":
      return { services: action.services, loading: false, error: false };
    case "fetch_error":
      return { services: [], loading: false, error: true };
  }
}

interface SidebarProps {
  stop: StopBase;
  onClose: () => void;
  isFavourite: boolean;
  onFavouriteAdd: (stop: StopBase) => void;
  onFavouriteRemove: (stopCode: string) => void;
}

export default function Sidebar({
  stop,
  onClose,
  isFavourite,
  onFavouriteAdd,
  onFavouriteRemove,
}: SidebarProps) {
  const [{ services, loading, error }, dispatch] = useReducer(arrivalsReducer, {
    services: [],
    loading: true,
    error: false,
  });
  const [confirmUnfav, setConfirmUnfav] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "fetch_start" });

    getArrivals(stop.stop_code)
      .then((data) => {
        if (!cancelled) dispatch({ type: "fetch_success", services: data.services || [] });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "fetch_error" });
      });

    return () => { cancelled = true; };
  }, [stop.stop_code]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmUnfav(false);
    }
    if (confirmUnfav) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [confirmUnfav]);

  const sorted = [...services].sort((a, b) => {
    return (a.next?.duration_ms ?? 999999) - (b.next?.duration_ms ?? 999999);
  });

  function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    dispatch({ type: "fetch_start" });
    getArrivals(stop.stop_code)
      .then((data) => {
        dispatch({ type: "fetch_success", services: data.services || [] });
        setRefreshing(false);
      })
      .catch(() => {
        dispatch({ type: "fetch_error" });
        setRefreshing(false);
      });
  }

  function handleFavClick() {
    if (isFavourite) {
      setConfirmUnfav(true);
    } else {
      onFavouriteAdd(stop);
    }
  }

  function handleConfirmRemove() {
    onFavouriteRemove(stop.stop_code);
    setConfirmUnfav(false);
  }

  return (
    <>
      <aside
        className="stop-panel app-panel"
      >
        {/* Header */}
        <div className="stop-header">
          <div className="stop-header-copy">
            <div className="stop-title-row">
              <div className="stop-title-text">
                <h2>{stop.name}</h2>
              </div>
              <button
                onClick={handleFavClick}
                title={isFavourite ? "Remove from Favorites" : "Add to Favorites"}
                aria-label={isFavourite ? "Remove from Favorites" : "Add to Favorites"}
                className={"favorite-action" + (isFavourite ? " is-favorite" : "")}
              >
                {isFavourite ? "⭐" : "☆"}
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className={"icon-button" + (refreshing ? " is-spinning" : "")}
                aria-label="Refresh arrivals"
                title="Refresh arrivals"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </button>
              <button
                onClick={onClose}
                className="icon-button"
                aria-label="Close arrivals"
              >
                &times;
              </button>
            </div>
            <p className="stop-subtitle">
              {stop.road}
              <span>Stop {stop.stop_code}</span>
            </p>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex-1 flex flex-col gap-3 p-4">
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton w-12 h-5" />
                <div className="skeleton w-16 h-5" />
                <div className="skeleton w-16 h-5" />
                <div className="skeleton flex-1 h-5" />
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="empty-state flex-1">
            <p className="empty-title" style={{ color: "var(--color-danger)" }}>Failed to load arrivals</p>
            <button
              onClick={handleRefresh}
              className="primary-button"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && services.length === 0 && (
          <p className="panel-message flex-1">No bus services at this stop</p>
        )}

        {/* Arrivals table */}
        {!loading && !error && services.length > 0 && (
          <div className="arrivals-table-wrap">
            <table className="arrivals-table">
              <thead>
                <tr>
                  <th>Bus</th>
                  <th>Next</th>
                  <th>After</th>
                  <th>Dest</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((svc, i) => (
                  <tr key={svc.no + "-" + svc.operator + "-" + i}>
                    <td className="bus-number">{svc.no}</td>
                    <td>
                      <DurationText ms={svc.next?.duration_ms ?? null} />
                    </td>
                    <td>
                      <DurationText ms={svc.subsequent?.duration_ms ?? null} />
                    </td>
                    <td className="destination-code">
                      {svc.next?.destination_name || svc.next?.destination_code || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </aside>

      {/* Unfavourite confirmation modal */}
      {confirmUnfav && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-[rgba(10,10,30,0.85)]"
          onClick={() => setConfirmUnfav(false)}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Remove from Favorites?</h2>
            <p>Remove {stop.name} from favorites?</p>
            <div className="modal-actions">
              <button
                onClick={() => setConfirmUnfav(false)}
                className="modal-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemove}
                className="modal-confirm"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}