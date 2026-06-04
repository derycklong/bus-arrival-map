"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(meters: number): string {
  if (meters < 1000) return Math.round(meters) + " m";
  return (meters / 1000).toFixed(meters < 10000 ? 1 : 0) + " km";
}

function durationHumanLabel(ms: number): string {
  if (ms < 0) return "arriving now";
  if (ms < 60000) return Math.floor(ms / 1000) + "s";
  return Math.floor(ms / 60000) + "m";
}

// Color-coded distance: green (very near) → yellow-green → amber → orange → red (far).
// Hue is interpolated across the stops; saturation/lightness are held constant so
// each pill reads as a single clear colour against white text.
const DISTANCE_COLOR_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0,    140],  // green
  [400,  90],   // green-yellow
  [900,  50],   // amber
  [1700, 25],   // orange
  [3000, 5],    // red
];
const DISTANCE_COLOR_S = 64;
const DISTANCE_COLOR_L = 46;

function distanceToColor(meters: number): string {
  const m = Math.max(0, meters);
  for (let i = 0; i < DISTANCE_COLOR_STOPS.length - 1; i++) {
    const [m1, h1] = DISTANCE_COLOR_STOPS[i];
    const [m2, h2] = DISTANCE_COLOR_STOPS[i + 1];
    if (m <= m2) {
      const t = m <= m1 ? 0 : (m - m1) / (m2 - m1);
      const h = h1 + (h2 - h1) * t;
      return "hsl(" + (Math.round(h * 10) / 10) + ", " + DISTANCE_COLOR_S + "%, " + DISTANCE_COLOR_L + "%)";
    }
  }
  const last = DISTANCE_COLOR_STOPS[DISTANCE_COLOR_STOPS.length - 1][1];
  return "hsl(" + last + ", " + DISTANCE_COLOR_S + "%, " + DISTANCE_COLOR_L + "%)";
}

const NEARBY_RADIUS_M = 300;

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
  userLocation?: { lat: number; lng: number } | null;
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
  userLocation,
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
  const startedInScrollable = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    const scrollable = target.closest(".arrivals-table-wrap, .favorites-list");
    swipeStartX.current = e.touches[0].clientX;
    swipeCurrentX.current = e.touches[0].clientX;
    swipingHorizontal.current = false;
    startedInScrollable.current = !!scrollable;
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
    if (startedInScrollable.current) return;
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
  }, [expanded, dismissed, onDismissedChange, onExpandedChange, isDetailView, onCloseStop]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el || !isDetailView) return;
    const preventHorizontalDefault = (e: TouchEvent) => {
      if (!isDetailView) return;
      // Don't interfere with native scroll when touch started inside a scrollable area
      if (startedInScrollable.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - swipeStartX.current;
      if (Math.abs(dx) > 8) {
        e.preventDefault();
      }
    };
    el.addEventListener("touchmove", preventHorizontalDefault, { passive: false });
    return () => {
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

  // List-view favourite buses, keyed by stop_code. Used to surface the next
  // favourite bus in each saved-stop row (falling back to the next arrival).
  const [listFavBuses, setListFavBuses] = useState<Map<string, Set<string>>>(new Map());
  const stopCodesKey = stops.map((s) => s.stop.stop_code).join(",");

  // Panel tab — "upcoming" (left, default) shows the next 5 arriving buses
  // across all saved stops; "stops" is the original per-stop list.
  const [activeTab, setActiveTab] = useState<"upcoming" | "stops">("upcoming");

  const upcomingBuses = useMemo(() => {
    type NearbyBus = { service: Service; durationMs: number; isFav: true };
    type NearbyGroup = { stop: FavouriteStop; distanceM: number; buses: NearbyBus[] };
    if (!userLocation) return [] as NearbyGroup[];
    const groups: NearbyGroup[] = [];
    for (const item of stops) {
      if (item.loading || item.error) continue;
      const stopFavs = listFavBuses.get(item.stop.stop_code);
      if (!stopFavs || stopFavs.size === 0) continue;
      const d = haversineMeters(userLocation, { lat: item.stop.lat, lng: item.stop.lng });
      if (d > NEARBY_RADIUS_M) continue;
      const buses: NearbyBus[] = [];
      for (const svc of item.services) {
        if (!stopFavs.has(svc.no)) continue;
        if (svc.next?.duration_ms == null) continue;
        buses.push({ service: svc, durationMs: svc.next.duration_ms, isFav: true });
      }
      buses.sort((a, b) => a.durationMs - b.durationMs);
      groups.push({ stop: item.stop, distanceM: d, buses });
    }
    groups.sort((a, b) => a.distanceM - b.distanceM);
    return groups;
  }, [userLocation, stops, listFavBuses]);
  const nearbyGroups = upcomingBuses;
  const upcomingFavCount = nearbyGroups.reduce((n, g) => n + g.buses.length, 0);

  // Soonest favourite bus across all nearby groups — shown on the reopen pill
  // as a glanceable live preview so the pill is useful even before opening.
  const soonestFavBus = useMemo(() => {
    let best: { service: Service; durationMs: number } | null = null;
    for (const g of nearbyGroups) {
      for (const b of g.buses) {
        if (!best || b.durationMs < best.durationMs) {
          best = { service: b.service, durationMs: b.durationMs };
        }
      }
    }
    return best;
  }, [nearbyGroups]);

  // Saved stops annotated with distance (for the Stops tab distance pill),
  // sorted nearest-first when the user's location is available.
  const stopsWithDistance = useMemo(() => {
    const annotated = stops.map((item) => ({
      item,
      distanceM: userLocation
        ? haversineMeters(userLocation, { lat: item.stop.lat, lng: item.stop.lng })
        : null,
    }));
    if (userLocation) {
      annotated.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
    }
    return annotated;
  }, [stops, userLocation]);

  useEffect(() => {
    if (selectedStop) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset UI on stop change
      setDismissed(false);
      onDismissedChange?.(false);
    }
  }, [selectedStop, onDismissedChange]);

  useEffect(() => {
    if (!selectedStop) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- enter loading state before fetch
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

  useEffect(() => {
    if (isDetailView) return;
    let cancelled = false;
    Promise.allSettled(
      stops.map((s) =>
        getFavouriteBuses(s.stop.stop_code)
          .then((data) => ({ code: s.stop.stop_code, nos: new Set(data.bus_nos || []) }))
          .catch(() => ({ code: s.stop.stop_code, nos: new Set<string>() }))
      )
    ).then((results) => {
      if (cancelled) return;
      const next = new Map<string, Set<string>>();
      for (const r of results) {
        if (r.status === "fulfilled") next.set(r.value.code, r.value.nos);
      }
      setListFavBuses(next);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the set of stop codes changes
  }, [stopCodesKey, isDetailView]);

  function updateListFavForStop(stopCode: string, mut: (set: Set<string>) => void) {
    setListFavBuses((prev) => {
      const next = new Map(prev);
      const cur = new Set(next.get(stopCode) || []);
      mut(cur);
      next.set(stopCode, cur);
      return next;
    });
  }

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
      updateListFavForStop(selectedStop.stop_code, (s) => s.delete(busNo));
      removeFavouriteBus(selectedStop.stop_code, busNo).catch(() => {
        setFavBuses((prev) => { const next = new Set(prev); next.add(busNo); return next; });
        updateListFavForStop(selectedStop.stop_code, (s) => s.add(busNo));
      });
    } else {
      setFavBuses((prev) => { const next = new Set(prev); next.add(busNo); return next; });
      updateListFavForStop(selectedStop.stop_code, (s) => s.add(busNo));
      addFavouriteBus(selectedStop.stop_code, busNo).catch(() => {
        setFavBuses((prev) => { const next = new Set(prev); next.delete(busNo); return next; });
        updateListFavForStop(selectedStop.stop_code, (s) => s.delete(busNo));
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
        aria-label="Bus Arrival Map"
      >
        {/* Drag handle (mobile) */}
        <div className="panel-drag-handle" />

        {/* Header */}
        <div className="panel-header">
          <div>
            <p className="panel-eyebrow">Bus Arrival Map</p>
            <h2>
              {isDetailView
                ? (selectedStop?.name || "Stop Detail")
                : activeTab === "upcoming"
                  ? "Upcoming"
                  : "Saved Stops"}
            </h2>
            {isDetailView && (
              <p className="stop-subtitle">
                {selectedStop?.road && <>{selectedStop.road} · </>}
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
                <button
                  onClick={() => { setDismissed(true); onDismissedChange?.(true); }}
                  className="icon-button"
                  aria-label="Close favorites panel"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabs (only in list view) */}
        {!isDetailView && (
          <div className="panel-tabs" role="tablist" aria-label="Panel views">
            <button
              role="tab"
              aria-selected={activeTab === "upcoming"}
              aria-controls="panel-upcoming"
              onClick={() => setActiveTab("upcoming")}
              className={"panel-tab" + (activeTab === "upcoming" ? " is-active" : "")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9"/>
                <polyline points="12 7 12 12 15 14"/>
              </svg>
              <span>Upcoming</span>
              <span className="panel-tab-count">{upcomingFavCount}</span>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "stops"}
              aria-controls="panel-stops"
              onClick={() => setActiveTab("stops")}
              className={"panel-tab" + (activeTab === "stops" ? " is-active" : "")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              <span>Stops</span>
              <span className="panel-tab-count">{stops.length}</span>
            </button>
          </div>
        )}

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
                        <td className="bus-number">
                            <span className="bus-badge" data-op={svc.operator}>{svc.no}</span>
                          </td>
                        <td><DurationText ms={svc.next?.duration_ms ?? null} time={svc.next?.time} /></td>
                        <td><DurationText ms={svc.subsequent?.duration_ms ?? null} time={svc.subsequent?.time} /></td>
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

            {activeTab === "upcoming" && stops.length > 0 && !userLocation && (
              <div className="empty-state flex-1" id="panel-upcoming" role="tabpanel">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-2" style={{ background: "var(--color-accent)", color: "white" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" fill="currentColor"/>
                    <circle cx="12" cy="12" r="8"/>
                    <line x1="12" y1="1" x2="12" y2="4"/>
                    <line x1="12" y1="20" x2="12" y2="23"/>
                    <line x1="1" y1="12" x2="4" y2="12"/>
                    <line x1="20" y1="12" x2="23" y2="12"/>
                  </svg>
                </div>
                <p className="empty-title">Share your location</p>
                <p>Allow location access to see saved stops within {NEARBY_RADIUS_M}&nbsp;m and their favourite buses.</p>
              </div>
            )}

            {activeTab === "upcoming" && stops.length > 0 && userLocation && nearbyGroups.length === 0 && (
              <div className="empty-state flex-1" id="panel-upcoming" role="tabpanel">
                <p className="empty-title">Nothing nearby</p>
                <p>No saved stops with favourite buses within {NEARBY_RADIUS_M}&nbsp;m. Star a bus at a closer stop, or save a stop near you.</p>
              </div>
            )}

            {activeTab === "upcoming" && stops.length > 0 && userLocation && nearbyGroups.length > 0 && (
              <div className="upcoming-list" id="panel-upcoming" role="tabpanel">
                {nearbyGroups.map((g) => (
                  <div key={g.stop.stop_code}>
                    <div
                      className="upcoming-stop-header"
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectStop(g.stop)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectStop(g.stop); } }}
                    >
                      <div className="upcoming-stop-header-main">
                        <svg className="upcoming-pin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        <span className="upcoming-stop-header-name">{g.stop.name}</span>
                        <span className="upcoming-stop-header-code">· {g.stop.stop_code}</span>
                      </div>
                      <span className="upcoming-stop-distance">{formatDistance(g.distanceM)}</span>
                    </div>
                    {g.buses.length > 0 ? (
                      g.buses.map((u, i) => (
                        <div
                          key={g.stop.stop_code + "-" + u.service.no + "-" + i}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectStop(g.stop)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectStop(g.stop); } }}
                          className="upcoming-row is-bus-fav"
                        >
                          <div className="upcoming-row-top">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--color-fav)" stroke="var(--color-fav)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-label="Favorite bus" style={{ flexShrink: 0 }}>
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                            </svg>
                            <span className="bus-badge" data-op={u.service.operator}>{u.service.no}</span>
                            <DurationText ms={u.durationMs} time={u.service.next?.time} />
                            <span className="upcoming-dest">
                              {u.service.next?.destination_name || u.service.next?.destination_code || "—"}
                            </span>
                            <svg className="upcoming-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="9 18 15 12 9 6"/>
                            </svg>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="upcoming-group-empty">No upcoming arrivals for your favourite buses.</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeTab === "upcoming" && stops.length === 0 && !loading && !error && (
              <div className="empty-state flex-1" id="panel-upcoming" role="tabpanel">
                <p className="empty-title">No upcoming buses</p>
                <p>Save a bus stop to see arrivals here.</p>
              </div>
            )}

            {activeTab === "stops" && stops.length === 0 && !loading && !error && (
              <div className="empty-state flex-1" id="panel-stops" role="tabpanel">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-2" style={{ background: "var(--color-fav-bg)" }}>
                  <span style={{ fontSize: 20 }}>⭐</span>
                </div>
                <p className="empty-title">No favorited stops</p>
                <p>Tap the star icon on any bus stop to save it here for quick access</p>
              </div>
            )}

            {activeTab === "stops" && stops.length > 0 && (
              <div className="favorites-list" id="panel-stops" role="tabpanel">
                {stopsWithDistance.map(({ item, distanceM }) => {
                  const stopFavs = listFavBuses.get(item.stop.stop_code);
                  const metaParts = [item.stop.road, `Stop ${item.stop.stop_code}`].filter(Boolean);
                  return (
                    <div
                      key={item.stop.stop_code}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleRowClick(item.stop)}
                      onKeyDown={(e) => handleRowKeyDown(e, item.stop)}
                      className="favorite-row"
                    >
                      <div className="favorite-row-head">
                        <div className="favorite-row-name-wrap">
                          <span className="favorite-stop-name">{item.stop.name}</span>
                          <span className="favorite-stop-meta">{metaParts.join(" · ")}</span>
                        </div>
                        <div className="favorite-row-end">
                          {distanceM != null && (
                            <span className="favorite-row-distance" style={{ background: distanceToColor(distanceM) }}>{formatDistance(distanceM)}</span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmRemove(item.stop.stop_code);
                            }}
                            title="Remove from Favorites"
                            aria-label={"Remove " + item.stop.name + " from favorites"}
                            className="remove-button"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      </div>
                      <div className="favorite-row-buses">
                        {item.loading ? (
                          <span className="favorite-row-buses-empty">Loading…</span>
                        ) : item.error ? (
                          <span className="favorite-row-buses-empty is-error">Unavailable</span>
                        ) : item.services.length > 0 ? (
                          (() => {
                            const favs: Set<string> | undefined = stopFavs;
                            let pool: Service[];
                            if (favs && favs.size >= 2) {
                              pool = item.services.filter((s) => favs.has(s.no));
                            } else if (favs && favs.size === 1) {
                              const favBuses = item.services.filter((s) => favs.has(s.no));
                              let nextNonFav: Service | undefined;
                              let bestDur = Infinity;
                              for (const s of item.services) {
                                if (favs.has(s.no)) continue;
                                const d = s.next?.duration_ms;
                                if (d != null && d < bestDur) { bestDur = d; nextNonFav = s; }
                              }
                              pool = nextNonFav ? [...favBuses, nextNonFav] : favBuses;
                            } else {
                              pool = item.services;
                            }
                            const sorted = [...pool].sort((a, b) => (a.next?.duration_ms ?? 999999) - (b.next?.duration_ms ?? 999999));
                            const top = sorted.slice(0, 2);
                            const more = sorted.length - top.length;
                            return (
                              <>
                                {top.map((svc, i) => {
                                  const isFavBus = favs ? favs.has(svc.no) : false;
                                  return (
                                    <div key={svc.no + "-" + svc.operator + "-" + i} className={"favorite-bus-chip" + (isFavBus ? " is-fav" : "")}>
                                      {isFavBus && (
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--color-fav)" stroke="var(--color-fav)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-label="Favorite bus" style={{ flexShrink: 0 }}>
                                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                        </svg>
                                      )}
                                      <span className="bus-badge" data-op={svc.operator}>{svc.no}</span>
                                      <DurationText ms={svc.next?.duration_ms ?? null} time={svc.next?.time} />
                                      <span className="favorite-bus-dest">
                                        {svc.next?.destination_name || svc.next?.destination_code || "—"}
                                      </span>
                                    </div>
                                  );
                                })}
                                {more > 0 && <span className="favorite-bus-more">+{more}</span>}
                              </>
                            );
                          })()
                        ) : (
                          <span className="favorite-row-buses-empty">No services</span>
                        )}
                      </div>
                    </div>
                  );
                })}
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
          aria-label={soonestFavBus
            ? "Show favorites. Next favourite bus " + soonestFavBus.service.no + " in " + durationHumanLabel(soonestFavBus.durationMs) + "."
            : "Show favorites"}
        >
          <span className="fav-count-badge">{stops.length}</span>
          <span>Favorite Bus Stops</span>
          {soonestFavBus && (
            <span className="fav-reopen-soonest" aria-hidden="true">
              <span className="fav-reopen-divider" />
              <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--color-fav)" stroke="var(--color-fav)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              <span className="bus-badge" data-op={soonestFavBus.service.operator}>{soonestFavBus.service.no}</span>
              <DurationText ms={soonestFavBus.durationMs} time={soonestFavBus.service.next?.time} />
            </span>
          )}
        </button>
      )}
    </>
  );
}