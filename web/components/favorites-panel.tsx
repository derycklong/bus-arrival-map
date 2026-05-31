"use client";

import { useState, useEffect, useReducer, useRef, useCallback } from "react";
import {
  getArrivals,
  getFavouriteBuses,
  addFavouriteBus,
  removeFavouriteBus,
  StopBase,
  Service,
} from "@/lib/api";
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
  onDismissedChange?: (dismissed: boolean) => void;
  onExpandedChange?: (expanded: boolean) => void;
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
  onDismissedChange,
  onExpandedChange,
}: FavoritesPanelProps) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmUnfav, setConfirmUnfav] = useState(false);
  const [refreshingFavs, setRefreshingFavs] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isDetailView = selectedStop !== null;
  const panelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);
  const swipeStartX = useRef(0);
  const swipeCurrentX = useRef(0);
  const swipingHorizontal = useRef(false);

const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    const scrollable = target.closest(".arrivals-table-wrap, .favorites-list");
    swipeStartX.current = e.touches[0].clientX;
    swipeCurrentX.current = e.touches[0].clientX;
    swipingHorizontal.current = false;
    if (scrollable && scrollable.scrollTop > 0) {
      touchStartY.current = -999;
      return;
    }
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY;
    swipeCurrentX.current = e.touches[0].clientX;
    const dx = swipeCurrentX.current - swipeStartX.current;
    const dy = touchCurrentY.current - touchStartY.current;
    if (isDetailView && Math.abs(dx) > 15 && (touchStartY.current === -999 || Math.abs(dx) > Math.abs(dy))) {
      e.preventDefault();
      swipingHorizontal.current = true;
      return;
    }
    if (touchStartY.current === -999 || !isDetailView) return;
    if (panelRef.current) {
      if (dy > 0) {
        panelRef.current.style.transform = "translateY(" + dy + "px)";
        panelRef.current.style.transition = "none";
      } else if (!expanded && dy < 0) {
        const currentH = panelRef.current.offsetHeight;
        panelRef.current.style.height = (currentH + Math.abs(dy) * 0.3) + "px";
      } else if (dismissed && dy < 0) {
        panelRef.current.style.transform = "translateY(" + dy + "px)";
        panelRef.current.style.transition = "none";
      }
    }
  }, [expanded, dismissed, isDetailView]);

  const handleTouchEnd = useCallback(() => {
    const hDx = swipeCurrentX.current - swipeStartX.current;
    if (swipingHorizontal.current && isDetailView) {
      if (hDx > 40) {
        onCloseStop();
      }
      swipingHorizontal.current = false;
      swipeStartX.current = 0;
      swipeCurrentX.current = 0;
      touchStartY.current = 0;
      touchCurrentY.current = 0;
      return;
    }
    if (touchStartY.current === -999) {
      touchStartY.current = 0;
      swipingHorizontal.current = false;
      swipeStartX.current = 0;
      swipeCurrentX.current = 0;
      return;
    }
    swipingHorizontal.current = false;
    swipeStartX.current = 0;
    swipeCurrentX.current = 0;
    const diff = touchCurrentY.current - touchStartY.current;
    if (panelRef.current) {
      panelRef.current.style.transform = "";
      panelRef.current.style.height = "";
      panelRef.current.style.transition = "";
    }
    if (diff > 100) {
      if (dismissed) {
      } else if (expanded) {
        setExpanded(false);
        onExpandedChange?.(false);
      } else {
        setDismissed(true);
        onDismissedChange?.(true);
      }
    } else if (diff < -50) {
      if (dismissed) {
        setDismissed(false);
        onDismissedChange?.(false);
      } else if (!expanded) {
        setExpanded(true);
        onExpandedChange?.(true);
      }
    }
    touchStartY.current = 0;
    touchCurrentY.current = 0;
  }, [expanded, dismissed, onDismissedChange, onExpandedChange, isDetailView]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el || !isDetailView) return;
    let startX = swipeStartX.current;
    let started = false;
    const onTouchStart = () => {
      startX = swipeStartX.current;
      started = false;
    };
    const preventHorizontalDefault = (e: TouchEvent) => {
      if (!isDetailView) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      if (Math.abs(dx) > 8) {
        e.preventDefault();
        started = true;
      }
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", preventHorizontalDefault, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", preventHorizontalDefault);
    };
  }, [isDetailView]);

  const confirmStop = confirmRemove ? stops.find((s) => s.stop.stop_code === confirmRemove) ?? null : null;

  function handleRowClick(stop: FavouriteStop) {
    if (selectedStop && selectedStop.stop_code === stop.stop_code) {
      onCloseStop();
    } else {
      onSelectStop(stop);
    }
  }

  function handleRowKeyDown(e: React.KeyboardEvent, stop: FavouriteStop) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRowClick(stop);
    }
  }

  function handleRefresh() {
    if (refreshingFavs) return;
    setRefreshingFavs(true);
    onRefresh();
    setTimeout(() => setRefreshingFavs(false), 600);
  }

  function handleConfirmRemoveFav() {
    if (selectedStop) onFavouriteRemove(selectedStop.stop_code);
    setConfirmUnfav(false);
    onCloseStop();
  }

  // Detail arrivals
  const [detailServices, setDetailServices] = useState<Service[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [favBuses, setFavBuses] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (selectedStop) {
      setDismissed(false);
      onDismissedChange?.(false);
    }
  }, [selectedStop, onDismissedChange]);

  useEffect(() => {
    if (!selectedStop) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(false);
    getArrivals(selectedStop.stop_code)
      .then((data) => {
        if (!cancelled) {
          setDetailServices(data.services || []);
          setDetailLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetailError(true);
          setDetailLoading(false);
        }
      });
    getFavouriteBuses(selectedStop.stop_code)
      .then((data) => {
        if (!cancelled) setFavBuses(new Set(data.bus_nos || []));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedStop]);

  const sortedDetail = (() => {
    const sd = [...detailServices].sort(
      (a, b) => (a.next?.duration_ms ?? 999999) - (b.next?.duration_ms ?? 999999)
    );
    const favs = sd.filter((s) => favBuses.has(s.no));
    const rest = sd.filter((s) => !favBuses.has(s.no));
    return [...favs, ...rest];
  })();

  function toggleBusFav(busNo: string) {
    if (!selectedStop) return;
    const isFav = favBuses.has(busNo);
    if (isFav) {
      setFavBuses((prev) => { const next = new Set(prev); next.delete(busNo); return next; });
      removeFavouriteBus(selectedStop.stop_code, busNo).catch(() => {
        setFavBuses((prev) => { const next = new Set(prev); next.add(busNo); return next; });
      });
    } else {
      setFavBuses((prev) => { const next = new Set(prev); next.add(busNo); return next; });
      addFavouriteBus(selectedStop.stop_code, busNo).catch(() => {
        setFavBuses((prev) => { const next = new Set(prev); next.delete(busNo); return next; });
      });
    }
  }

  return (
    <>
      <aside
        ref={panelRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={"favorites-panel app-panel" + (isDetailView ? " is-detail" : "") + (expanded ? " is-expanded" : "") + (dismissed ? " is-dismissed" : "")}
        role="complementary"
        aria-label="Favorites"
      >
        {/* Drag handle (mobile) */}
        <div className="panel-drag-handle" />

        {/* Header */}
        <div className="panel-header">
          <div>
            <p className="panel-eyebrow">Favorites</p>
            <h2>
              {isDetailView
                ? (selectedStop?.name || "Stop Detail")
                : "Saved Stops"}
            </h2>
            {isDetailView && (
              <p className="stop-subtitle">
                {selectedStop?.road}
                <span>Stop {selectedStop?.stop_code}</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {isDetailView ? (
              <>
                <button
                  onClick={() => {
                    if (isFavourite) {
                      setConfirmUnfav(true);
                    } else if (selectedStop) {
                      onFavouriteAdd(selectedStop);
                    }
                  }}
                  title={isFavourite ? "Remove from Favorites" : "Add to Favorites"}
                  aria-label={isFavourite ? "Remove from Favorites" : "Add to Favorites"}
                  className={"favorite-action" + (isFavourite ? " is-favorite" : "")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavourite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: isFavourite ? "var(--color-fav)" : "var(--color-text-secondary)", flexShrink: 0 }}>
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </button>
                <button
                  onClick={() => {
                    if (!selectedStop || detailLoading) return;
                    setDetailLoading(true);
                    setDetailError(false);
                    getArrivals(selectedStop.stop_code)
                      .then((data) => { setDetailServices(data.services || []); setDetailLoading(false); })
                      .catch(() => { setDetailError(true); setDetailLoading(false); });
                  }}
                  className={"icon-button" + (detailLoading ? " is-spinning" : "")}
                  disabled={detailLoading}
                  aria-label="Refresh arrivals"
                  title="Refresh arrivals"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </button>
                <button
                  onClick={onCloseStop}
                  className="icon-button"
                  aria-label="Close stop detail"
                >
                  &times;
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleRefresh}
                  disabled={refreshingFavs}
                  className={"icon-button" + (refreshingFavs ? " is-spinning" : "")}
                  aria-label="Refresh arrivals"
                  title="Refresh arrivals"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Detail view */}
        {isDetailView && selectedStop && (
          <>
            {detailLoading && (
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
            {detailError && (
              <div className="empty-state flex-1">
                <p className="empty-title" style={{ color: "var(--color-danger)" }}>Failed to load arrivals</p>
                <button
                  onClick={() => {
                    if (!selectedStop) return;
                    setDetailLoading(true);
                    setDetailError(false);
                    getArrivals(selectedStop.stop_code)
                      .then((data) => { setDetailServices(data.services || []); setDetailLoading(false); })
                      .catch(() => { setDetailError(true); setDetailLoading(false); });
                  }}
                  className="primary-button"
                >
                  Retry
                </button>
              </div>
            )}
            {!detailLoading && !detailError && detailServices.length === 0 && (
              <p className="panel-message flex-1">No bus services at this stop</p>
            )}
            {!detailLoading && !detailError && detailServices.length > 0 && (
              <div className="arrivals-table-wrap">
                <table className="arrivals-table">
                  <thead>
                    <tr>
                      <th className="th-star"></th>
                      <th>Bus</th>
                      <th>Next</th>
                      <th>After</th>
                      <th>Dest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDetail.map((svc, i) => (
                      <tr key={svc.no + "-" + svc.operator + "-" + i} className={favBuses.has(svc.no) ? "is-bus-fav" : ""}>
                        <td className="td-star">
                          <button
                            onClick={() => toggleBusFav(svc.no)}
                            className={"bus-fav-toggle" + (favBuses.has(svc.no) ? " is-fav" : "")}
                            aria-label={favBuses.has(svc.no) ? "Unfavorite bus " + svc.no : "Favorite bus " + svc.no}
                            title={favBuses.has(svc.no) ? "Unfavorite" : "Favorite"}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill={favBuses.has(svc.no) ? "var(--color-fav)" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                          </button>
                        </td>
                        <td className="bus-number">{svc.no}</td>
                        <td><DurationText ms={svc.next?.duration_ms ?? null} /></td>
                        <td><DurationText ms={svc.subsequent?.duration_ms ?? null} /></td>
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
        )}

        {/* List view */}
        {!isDetailView && (
          <>
            {loading && stops.length === 0 && (
              <div className="flex-1 flex flex-col gap-3 p-4">
                {[1,2,3,4,5].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--color-surface-hover)" }}>
                    <div className="flex-1 space-y-2">
                      <div className="skeleton w-32 h-4" />
                      <div className="skeleton w-24 h-3" />
                      <div className="skeleton w-16 h-3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && stops.length === 0 && (
              <div className="empty-state flex-1">
                <p className="empty-title" style={{ color: "var(--color-danger)" }}>Failed to load favorites</p>
                <button onClick={onRefresh} className="primary-button">Retry</button>
              </div>
            )}

            {!loading && !error && stops.length === 0 && (
              <div className="empty-state flex-1">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-2" style={{ background: "var(--color-fav-bg)" }}>
                  <span style={{ fontSize: 20 }}>⭐</span>
                </div>
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
                            <span style={{ color: "var(--color-text-muted)" }}>Loading...</span>
                          ) : item.error ? (
                            <span style={{ color: "var(--color-danger)" }}>Unavailable</span>
                          ) : item.services.length > 0 ? (
                            <span>
                              <DurationText ms={item.services[0].next?.duration_ms ?? null} />
                              {item.services.length > 1 && (
                                <span className="arrival-count">
                                  &middot; {item.services.length} services
                                </span>
                              )}
                            </span>
                          ) : (
                            <span style={{ color: "var(--color-text-muted)" }}>No services</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmRemove(item.stop.stop_code);
                        }}
                        title="Remove from Favorites"
                        aria-label={"Remove " + item.stop.name + " from favorites"}
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

      {/* Remove confirmation modal */}
      {confirmRemove && confirmStop && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-[rgba(10,10,30,0.85)]"
          onClick={() => setConfirmRemove(null)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Remove from Favorites?</h2>
            <p>Remove {confirmStop.stop.name} from favorites?</p>
            <div className="modal-actions">
              <button onClick={() => setConfirmRemove(null)} className="modal-cancel">Cancel</button>
              <button onClick={() => { onRemoveStop(confirmRemove); setConfirmRemove(null); }} className="modal-confirm">Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Unfavourite confirmation */}
      {confirmUnfav && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-[rgba(10,10,30,0.85)]"
          onClick={() => setConfirmUnfav(false)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Remove from Favorites?</h2>
            <p>Remove {selectedStop?.name} from favorites?</p>
            <div className="modal-actions">
              <button onClick={() => setConfirmUnfav(false)} className="modal-cancel">Cancel</button>
              <button onClick={handleConfirmRemoveFav} className="modal-confirm">Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating reopen button */}
      {dismissed && (
        <button
          onClick={() => { setDismissed(false); onDismissedChange?.(false); }}
          className="favorites-reopen-button"
          aria-label="Show favorites"
        >
          <span className="fav-count-badge">{stops.length}</span>
          <span>Favorite Bus Stops</span>
        </button>
      )}
    </>
  );
}