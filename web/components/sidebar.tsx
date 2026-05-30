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

    return () => {
      cancelled = true;
    };
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
      <aside className="stop-panel app-panel">
        <div className="stop-header">
          <div className="stop-header-copy">
            <div className="stop-title-row">
              <h2>{stop.name}</h2>
              <button
                onClick={handleFavClick}
                title={isFavourite ? "Remove from Favorites" : "Add to Favorites"}
                aria-label={isFavourite ? "Remove from Favorites" : "Add to Favorites"}
                className={`favorite-action ${isFavourite ? "is-favorite" : ""}`}
              >
                {isFavourite ? "⭐ Favorited" : "☆ Favorite"}
              </button>
            </div>
            <p>{stop.road}</p>
            <span>Stop {stop.stop_code}</span>
          </div>
          <button
            onClick={onClose}
            className="icon-button"
            aria-label="Close arrivals"
          >
            &times;
          </button>
        </div>

        {loading && <p className="panel-message">Loading arrivals...</p>}

        {error && (
          <div className="empty-state">
            <p className="empty-title text-red-500">Failed to load arrivals</p>
            <button
              onClick={() => {
                dispatch({ type: "fetch_start" });
                getArrivals(stop.stop_code)
                  .then((data) => dispatch({ type: "fetch_success", services: data.services || [] }))
                  .catch(() => dispatch({ type: "fetch_error" }));
              }}
              className="primary-button"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && services.length === 0 && (
          <p className="panel-message">No bus services at this stop</p>
        )}

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
                  <tr key={`${svc.no}-${svc.operator}-${i}`}>
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

      {confirmUnfav && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-[rgba(10,10,30,0.85)]"
          onClick={() => setConfirmUnfav(false)}
        >
          <div
            className="bg-[#16213e] rounded-2xl p-6 shadow-2xl w-[340px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-white font-semibold text-lg mb-2">Remove from Favorites?</h2>
            <p className="text-gray-400 text-sm mb-5">Remove {stop.name} from favorites?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmUnfav(false)}
                className="flex-1 py-2 rounded-lg bg-[#0f3460] text-gray-400 text-sm cursor-pointer hover:bg-[#1a4a80]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemove}
                className="flex-1 py-2 rounded-lg bg-[#ef4444] text-white text-sm font-semibold cursor-pointer hover:bg-[#dc2626]"
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
