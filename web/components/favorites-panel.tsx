"use client";

import { useState, useEffect, useReducer, useRef, useCallback } from "react";
import { getArrivals, StopBase, Service } from "@/lib/api";
import { FavouriteStop } from "@/lib/api";
import { FavouriteStopWithArrivals } from "@/lib/use-favourites";
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

interface FavoritesPanelProps {
  stops: FavouriteStopWithArrivals[];
  loading: boolean;
  error: boolean;
  selectedStop: StopBase | null;
  onSelectStop: (stop: FavouriteStop) => void;
  onCloseStop: () => void;
  onRemoveStop: (stopCode: string) => void;
  onRefresh: () => void;
  isFavourite: boolean;
  onFavouriteAdd: (stop: StopBase) => void;
  onFavouriteRemove: (stopCode: string) => void;
}

export default function FavoritesPanel({
  stops,
  loading,
  error,
  selectedStop,
  onSelectStop,
  onCloseStop,
  onRemoveStop,
  onRefresh,
  isFavourite,
  onFavouriteAdd,
  onFavouriteRemove,
}: FavoritesPanelProps) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmUnfav, setConfirmUnfav] = useState(false);
  const [refreshingFavs, setRefreshingFavs] = useState(false);
  const [refreshingDetail, setRefreshingDetail] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isDetailView = selectedStop !== null;
  const panelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    const scrollable = target.closest(".arrivals-table-wrap, .favorites-list");
    if (scrollable && scrollable.scrollTop > 0) {
      touchStartY.current = -999;
      return;
    }
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === -999) return;
    touchCurrentY.current = e.touches[0].clientY;
    const diff = touchCurrentY.current - touchStartY.current;
    if (panelRef.current) {
      if (diff > 0) {
        // Swiping down — follow finger at all panel levels
        panelRef.current.style.transform = `translateY(${diff}px)`;
      } else if (!expanded && diff < 0) {
        // Swiping up — rubber-band feedback before expanding
        panelRef.current.style.transform = `translateY(${diff * 0.3}px)`;
      }
    }
  }, [expanded]);

  const handleTouchEnd = useCallback(() => {
    if (touchStartY.current === -999) {
      touchStartY.current = 0;
      return;
    }
    const diff = touchCurrentY.current - touchStartY.current;

    // Reset visual position
    if (panelRef.current) {
      panelRef.current.style.transform = "";
    }

    if (diff > 100) {
      // Swiped down far enough — dismiss from any level
      if (isDetailView) {
        onCloseStop();
      }
      setDismissed(true);
    } else if (diff < -50 && !expanded) {
      // Swiped up far enough — expand panel from any level
      setExpanded(true);
    }

    touchStartY.current = 0;
    touchCurrentY.current = 0;
  }, [isDetailView, expanded, onCloseStop]);

  useEffect(() => {
    if (selectedStop) {
      setDismissed(false);
      setExpanded(false);
    }
  }, [selectedStop]);

  const [{ services, loading: arrivalsLoading, error: arrivalsError }, dispatch] = useReducer(
    arrivalsReducer,
    { services: [], loading: false, error: false }
  );

  useEffect(() => {
    if (!selectedStop) return;
    let cancelled = false;
    dispatch({ type: "fetch_start" });

    getArrivals(selectedStop.stop_code)
      .then((data) => {
        if (!cancelled) dispatch({ type: "fetch_success", services: data.services || [] });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "fetch_error" });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedStop?.stop_code]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setConfirmUnfav(false);
        if (selectedStop) onCloseStop();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedStop, onCloseStop]);

  const sorted = [...services].sort(
    (a, b) => (a.next?.duration_ms ?? 999999) - (b.next?.duration_ms ?? 999999)
  );

  function handleRowClick(stop: FavouriteStop) {
    onSelectStop(stop);
  }

  function handleRowKeyDown(e: React.KeyboardEvent, stop: FavouriteStop) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectStop(stop);
    }
  }

  function handleFavClick() {
    if (!selectedStop) return;
    if (isFavourite) {
      setConfirmUnfav(true);
    } else {
      onFavouriteAdd(selectedStop);
    }
  }

  function handleConfirmRemoveFav() {
    if (!selectedStop) return;
    onFavouriteRemove(selectedStop.stop_code);
    setConfirmUnfav(false);
  }

  function handleRefreshFavs() {
    setRefreshingFavs(true);
    onRefresh();
    setTimeout(() => setRefreshingFavs(false), 800);
  }

  function handleRefreshDetail() {
    if (!selectedStop) return;
    setRefreshingDetail(true);
    dispatch({ type: "fetch_start" });
    getArrivals(selectedStop.stop_code)
      .then((data) => dispatch({ type: "fetch_success", services: data.services || [] }))
      .catch(() => dispatch({ type: "fetch_error" }));
    setTimeout(() => setRefreshingDetail(false), 800);
  }

  const confirmStop = confirmRemove ? stops.find((s) => s.stop.stop_code === confirmRemove) : null;

  return (
    <>
      <aside
        ref={panelRef}
        className={`favorites-panel app-panel ${isDetailView ? "is-detail" : ""} ${expanded ? "is-expanded" : ""} ${dismissed ? "is-dismissed" : ""}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="panel-drag-handle" />
        {isDetailView ? (
          <>
            <div className="stop-header">
              <div className="stop-header-copy">
                <div className="stop-title-row">
                  <button
                    onClick={onCloseStop}
                    className="icon-button"
                    aria-label="Back to favorites"
                    style={{ fontSize: "14px" }}
                  >
                    &#8592;
                  </button>
                  <div className="stop-title-text">
                    <h2>{selectedStop.name}</h2>
                    <span className="stop-subtitle">{selectedStop.road} · Stop {selectedStop.stop_code}</span>
                  </div>
                  <button
                    onClick={handleRefreshDetail}
                    title="Refresh arrivals"
                    aria-label="Refresh arrivals"
                    className="icon-button"
                  >
                    <span className={refreshingDetail ? "is-spinning" : ""}>↻</span>
                  </button>
                  <button
                    onClick={handleFavClick}
                    title={isFavourite ? "Remove from Favorites" : "Add to Favorites"}
                    aria-label={isFavourite ? "Remove from Favorites" : "Add to Favorites"}
                    className={`favorite-action ${isFavourite ? "is-favorite" : ""}`}
                  >
                    {isFavourite ? "★" : "☆"}
                  </button>
                </div>
              </div>
            </div>

            {arrivalsLoading && <p className="panel-message">Loading arrivals...</p>}

            {arrivalsError && (
              <div className="empty-state">
                <p className="empty-title">Failed to load arrivals</p>
                <button
                  onClick={() => {
                    dispatch({ type: "fetch_start" });
                    getArrivals(selectedStop.stop_code)
                      .then((data) =>
                        dispatch({ type: "fetch_success", services: data.services || [] })
                      )
                      .catch(() => dispatch({ type: "fetch_error" }));
                  }}
                  className="primary-button"
                >
                  Retry
                </button>
              </div>
            )}

            {!arrivalsLoading && !arrivalsError && services.length === 0 && (
              <p className="panel-message">No bus services at this stop</p>
            )}

            {!arrivalsLoading && !arrivalsError && services.length > 0 && (
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
          </>
        ) : (
          <>
            <div className="panel-header">
              <div>
                <p className="panel-eyebrow">Saved stops</p>
                <h2>Favorites</h2>
              </div>
              <button
                onClick={handleRefreshFavs}
                title="Refresh favorites"
                aria-label="Refresh favorites"
                className="icon-button"
              >
                <span className={refreshingFavs ? "is-spinning" : ""}>↻</span>
              </button>
            </div>

            {loading && stops.length === 0 && (
              <p className="panel-message">Loading arrivals...</p>
            )}

            {error && stops.length === 0 && (
              <div className="empty-state">
                <p className="empty-title">Could not load favorites</p>
                <p>Check your connection and try again</p>
                <button onClick={onRefresh} className="primary-button">
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && stops.length === 0 && (
              <div className="empty-state">
                <p className="empty-title">No favorited stops</p>
                <p>Tap the star icon on any bus stop to save it here for quick access</p>
              </div>
            )}

            {stops.length > 0 && (
              <div className="favorites-list">
                {stops.map((item) => (
                  <div
                    key={item.stop.stop_code}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleRowClick(item.stop)}
                    onKeyDown={(e) => handleRowKeyDown(e, item.stop)}
                    className="favorite-row"
                  >
                    <div className="favorite-row-main">
                      <div className="favorite-stop-copy">
                        <p className="favorite-stop-name">{item.stop.name}</p>
                        <p className="favorite-stop-road">{item.stop.road}</p>
                        <p className="favorite-stop-code">Stop {item.stop.stop_code}</p>
                        <div className="favorite-arrival">
                          {item.loading ? (
                            <span>Loading arrivals...</span>
                          ) : item.error ? (
                            <span className="text-red-500">Arrivals unavailable</span>
                          ) : item.services.length > 0 ? (
                            <span>
                              <DurationText ms={item.services[0].next?.duration_ms ?? null} />
                              {item.services.length > 1 && (
                                <span className="arrival-count">
                                  · {item.services.length} services
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-gray-600 text-xs">No services</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmRemove(item.stop.stop_code);
                        }}
                        title="Remove from Favorites"
                        aria-label={`Remove ${item.stop.name} from favorites`}
                        className="remove-button"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </aside>

      {confirmRemove && confirmStop && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-[rgba(10,10,30,0.85)]"
          onClick={() => setConfirmRemove(null)}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Remove from Favorites?</h2>
            <p>Remove {confirmStop.stop.name} from favorites?</p>
            <div className="modal-actions">
              <button
                onClick={() => setConfirmRemove(null)}
                className="modal-cancel"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onRemoveStop(confirmRemove);
                  setConfirmRemove(null);
                }}
                className="modal-confirm"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

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
            <p>Remove {selectedStop?.name} from favorites?</p>
            <div className="modal-actions">
              <button
                onClick={() => setConfirmUnfav(false)}
                className="modal-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemoveFav}
                className="modal-confirm"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Floating reopen button — visible on mobile when panel is dismissed */}
      {dismissed && (
        <button
          onClick={() => setDismissed(false)}
          className="favorites-reopen-button"
          aria-label="Show favorites"
        >
          <span>☆ Favorites</span>
        </button>
      )}
    </>
  );
}
