"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getStops, Stop, StopBase, FavouriteStop } from "@/lib/api";

const SG_CENTER: [number, number] = [1.3521, 103.8198];
const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

const FAV_BUS_PROXIMITY_M = 300;
// Buses reported by LTA can be anywhere along their route (often several
// km from the stop or the user). Only show live bus positions that are
// actually within this radius of the user — the rest are noise.
const MAX_BUS_DISTANCE_M = 2000;

/* --- Live bus position (used when user is near a favourite stop) --- */

export interface FavouriteBusPosition {
  no: string;
  operator: string;
  lat: number;
  lng: number;
  destinationName: string;
  stopCode: string;
  type: "next" | "subsequent";
}

/* --- Modern bus stop marker --- */

function lighten(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const toHex = (c: number) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0");
  return "#" + toHex(mix(r)) + toHex(mix(g)) + toHex(mix(b));
}

function createStopIcon(color: string, colorTop: string, isSelected: boolean, isFav: boolean) {
  const outer = isSelected ? 38 : 30;
  const inner = isSelected ? 28 : 22;
  const iconSize = isSelected ? 16 : 13;
  const cls = "stop-marker" + (isSelected ? " is-selected" : "") + (isFav ? " is-fav" : "");

  return L.divIcon({
    html: `<div class="stop-marker-wrap" style="width:${outer}px;height:${outer}px;">
      <div class="${cls}" style="width:${inner}px;height:${inner}px;--mk-base:${color};--mk-top:${colorTop};">
        <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="18" height="13" rx="3" fill="#fff"/>
          <rect x="5" y="5.5" width="14" height="4" rx="1" fill="#1f2937"/>
          <circle cx="8" cy="17" r="2.2" fill="#1f2937"/>
          <circle cx="16" cy="17" r="2.2" fill="#1f2937"/>
        </svg>
      </div>
    </div>`,
    className: "",
    iconSize: [outer, outer],
    iconAnchor: [outer / 2, outer / 2],
  });
}

function createBusIcon(busNo: string, operator: string, type: "next" | "subsequent") {
  const safeNo = String(busNo).replace(/[<>&"]/g, "");
  const op = String(operator || "");
  const cls = "bus-map-marker" + (type === "subsequent" ? " is-subsequent" : "");
  // Visual: 24×24 colored dot with the bus number. Hit area is enlarged to
  // 34×34 via a transparent wrapper so taps remain easy on mobile.
  return L.divIcon({
    html: `<div class="bus-map-marker-hit"><div class="${cls}" data-op="${op}"><span class="bus-map-marker-no">${safeNo}</span></div></div>`,
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

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

// Panel offset for centering map content
const PANEL_OFFSET_PX = 182;

function offsetForPanel(target: L.LatLng, zoom: number): L.LatLng {
  if (window.innerWidth < 601) return target;
  const point = L.CRS.EPSG3857.latLngToPoint(target, zoom);
  const offsetPoint = L.point(point.x - PANEL_OFFSET_PX, point.y);
  return L.CRS.EPSG3857.pointToLatLng(offsetPoint, zoom);
}

function panelCenter(center: L.LatLng, zoom: number): L.LatLng {
  if (window.innerWidth < 601) return center;
  const point = L.CRS.EPSG3857.latLngToPoint(center, zoom);
  const shiftedPoint = L.point(point.x + PANEL_OFFSET_PX, point.y);
  return L.CRS.EPSG3857.pointToLatLng(shiftedPoint, zoom);
}

function findNearestFavStopCode(loc: { lat: number; lng: number }, stops: FavouriteStop[]): string | null {
  if (stops.length === 0) return null;
  let bestCode: string | null = null;
  let bestDist = Infinity;
  for (const s of stops) {
    const d = haversineMeters(loc, { lat: s.lat, lng: s.lng });
    if (d < bestDist) {
      bestDist = d;
      bestCode = s.stop_code;
    }
  }
  return bestCode;
}

/* --- Icons --- */

const LocateIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" fill="currentColor"/>
    <circle cx="12" cy="12" r="8"/>
    <line x1="12" y1="1" x2="12" y2="4"/>
    <line x1="12" y1="20" x2="12" y2="23"/>
    <line x1="1" y1="12" x2="4" y2="12"/>
    <line x1="20" y1="12" x2="23" y2="12"/>
  </svg>
);

/* --- Component --- */

interface MapViewProps {
  favouriteStopCodes: Set<string>;
  favouriteStops: FavouriteStop[];
  favouriteBuses: FavouriteBusPosition[];
  userLocation: { lat: number; lng: number } | null;
  selectedStop: StopBase | null;
  onSelectStop: (stop: StopBase) => void;
  onLocationChange?: (loc: { lat: number; lng: number }) => void;
  mode: "light" | "dark";
  onlyShowFavorites: boolean;
}

export default function MapView({ favouriteStopCodes, favouriteStops, favouriteBuses, userLocation, selectedStop, onSelectStop, onLocationChange, mode, onlyShowFavorites }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayer = useRef<L.LayerGroup | null>(null);
  const locationLayer = useRef<L.LayerGroup | null>(null);
  const busesLayer = useRef<L.LayerGroup | null>(null);
  const currentStops = useRef<Stop[]>([]);
  const prevSelectedCode = useRef<string | null>(null);
  const selectedStopRef = useRef(selectedStop);
  const onSelectStopRef = useRef(onSelectStop);
  const favCodesRef = useRef(favouriteStopCodes);
  const favStopsRef = useRef<FavouriteStop[]>(favouriteStops);
  const favBusesRef = useRef<FavouriteBusPosition[]>(favouriteBuses);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(userLocation);
  const onlyShowFavoritesRef = useRef(onlyShowFavorites);
  const firstLoadNearestCode = useRef<string | null>(null);
  const hasComputedFirstLoad = useRef(false);
  const firstLoadHintLocation = useRef<{ lat: number; lng: number } | null>(null);
  const initialLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextMoveendClear = useRef(false);
  const [firstLoadNearestTick, setFirstLoadNearestTick] = useState(0);
  const locationWatchId = useRef<number | null>(null);
  const lastLocation = useRef<{ lat: number; lng: number } | null>(null);
  const modeRef = useRef(mode);
  const onLocationChangeRef = useRef(onLocationChange);
  const [geolocationDenied, setGeolocationDenied] = useState(false);
  const [isLoadingStops, setIsLoadingStops] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    selectedStopRef.current = selectedStop;
    onSelectStopRef.current = onSelectStop;
    favCodesRef.current = favouriteStopCodes;
    favStopsRef.current = favouriteStops;
    favBusesRef.current = favouriteBuses;
    userLocationRef.current = userLocation;
    onlyShowFavoritesRef.current = onlyShowFavorites;
    modeRef.current = mode;
    onLocationChangeRef.current = onLocationChange;
  });

  useEffect(() => {
    if (!mapInstance.current) return;
    if (tileLayerRef.current) {
      mapInstance.current.removeLayer(tileLayerRef.current);
    }
    const tileUrl = mode === "dark" ? DARK_TILES : LIGHT_TILES;
    tileLayerRef.current = L.tileLayer(tileUrl, { maxZoom: 19, keepBuffer: 4 }).addTo(mapInstance.current);
    const bg = mode === "dark" ? "#000000" : "#f2efec";
    mapInstance.current.getContainer().style.background = bg;
    const tilePane = mapInstance.current.getPane("tilePane");
    if (tilePane) tilePane.style.background = bg;
    // Force Safari to re-rasterize after tile layer swap
    requestAnimationFrame(() => {
      mapInstance.current?.invalidateSize({ pan: false });
    });
  }, [mode]);

  const renderStops = useCallback((stops: Stop[], map: L.Map, selectedCode: string | null, favCodes: Set<string>) => {
    markersLayer.current?.clearLayers();
    currentStops.current = stops;

    const stopColor = mode === "dark" ? "#60a5fa" : "#2563eb";
    const selectedColor = "#ef4444";
    const favColor = "#f59e0b";
    const onlyFav = onlyShowFavoritesRef.current;

    for (const stop of stops) {
      const isSelected = stop.stop_code === selectedCode;
      const isFav = favCodes.has(stop.stop_code);
      // "Favourites only" toggle: skip non-favourite stops entirely. The
      // selected stop is always a favourite in practice (you select from the
      // map), but render it anyway so the selection UI stays consistent.
      if (onlyFav && !isFav && !isSelected) continue;
      const color = isSelected ? selectedColor : isFav ? favColor : stopColor;
      const colorTop = lighten(color, 0.35);
      const icon = createStopIcon(color, colorTop, isSelected, isFav);
      const marker = L.marker([stop.lat, stop.lng], { icon });
      marker.on("click", () => onSelectStopRef.current(stop));
      markersLayer.current?.addLayer(marker);
    }
  }, [mode]);

  const renderBuses = useCallback(() => {
    const layer = busesLayer.current;
    if (!layer) return;
    layer.clearLayers();
    const allBuses = favBusesRef.current;
    if (allBuses.length === 0) return;

    // Path 1: a stop is explicitly selected — show that stop's fav buses
    // regardless of user location OR how far the bus is. The user opted in.
    const selected = selectedStopRef.current;
    let toShow: typeof allBuses = [];
    let applyDistanceFilter = true;
    if (selected) {
      toShow = allBuses.filter((b) => b.stopCode === selected.stop_code);
      applyDistanceFilter = false;
    } else if (firstLoadNearestCode.current) {
      // Path 1b: first-load auto-show — the closest favourite stop's buses
      // are surfaced on app open so the user sees their bus even if they're
      // not yet within the 300m proximity radius. Cleared on first user
      // interaction (pan/zoom/explicit select). Distance-filtered so a
      // bus reported on the far end of a long route doesn't pollute the
      // view.
      toShow = allBuses.filter((b) => b.stopCode === firstLoadNearestCode.current);
    } else {
      // Path 2: no selection — find the closest fav stop within 300 m and
      // show ONLY that stop's buses. (Previously this showed every fav
      // bus from every stop, which is confusing when a bus from a
      // different stop happens to be passing through the area.)
      const loc = userLocationRef.current;
      const stops = favStopsRef.current;
      if (!loc || stops.length === 0) return;
      let nearStop: FavouriteStop | null = null;
      let nearDist = Infinity;
      for (const s of stops) {
        const d = haversineMeters(loc, { lat: s.lat, lng: s.lng });
        if (d <= FAV_BUS_PROXIMITY_M && d < nearDist) {
          nearDist = d;
          nearStop = s;
        }
      }
      if (!nearStop) return;
      toShow = allBuses.filter((b) => b.stopCode === nearStop.stop_code);
    }

    for (const b of toShow) {
      // Skip sentinel (0,0) from unmonitored buses; LTA returns these when GPS is missing.
      if (!b.lat || !b.lng) continue;
      // Drop buses that LTA reported at far-away positions along the route —
      // but only on the implicit paths (first-load hint / proximity). An
      // explicit stop selection always shows the bus so the user can see
      // where it is on the route.
      if (applyDistanceFilter) {
        const loc = userLocationRef.current;
        if (loc && haversineMeters(loc, { lat: b.lat, lng: b.lng }) > MAX_BUS_DISTANCE_M) continue;
      }
      const icon = createBusIcon(b.no, b.operator, b.type);
      const marker = L.marker([b.lat, b.lng], { icon, zIndexOffset: 600 });
      const dest = b.destinationName ? ` → ${b.destinationName}` : "";
      marker.bindTooltip(`Bus ${b.no}${dest}`, {
        direction: "top",
        offset: [0, -8],
        className: "bus-tooltip",
      });
      layer.addLayer(marker);
    }
  }, []);

  // Mirror renderStops into a ref so loadStops can stay stable (empty deps).
  // Without this, every tile-mode toggle re-creates loadStops → re-creates
  // the main init effect → calls map.remove() on the live map → any
  // moveend-scheduled loadStops fires on a disposed map and throws
  // "Cannot read properties of undefined (reading '_leaflet_pos')".
  const renderStopsRef = useRef(renderStops);
  renderStopsRef.current = renderStops;

  // Mirror renderBuses for the same reason — the buses effect reads refs so
  // it can run with empty deps and not tear down the map on every change.
  const renderBusesRef = useRef(renderBuses);
  renderBusesRef.current = renderBuses;

  const loadStops = useCallback((map: L.Map) => {
    // Defensive guard: a previous tile-mode toggle may have torn down the
    // map while a setTimeout-scheduled loadStops was still pending.
    if (!map || (map as unknown as { _mapPane?: { _leaflet_pos?: unknown } })._mapPane?._leaflet_pos === undefined) {
      return;
    }
    setLoadError(false);
    // Show loading indicator with delay to avoid flicker
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = setTimeout(() => setIsLoadingStops(true), 300);
    const center = map.getCenter();
    const zoom = map.getZoom();
    const trueCenter = panelCenter(center, zoom);
    const bounds = map.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const diag = ne.distanceTo(sw);
    const radius = Math.min(Math.round(diag / 2), 2000);

    getStops(trueCenter.lat, trueCenter.lng, radius)
      .then((data) => {
        setIsLoadingStops(false);
        setLoadError(false);
        if (loadingTimerRef.current) { clearTimeout(loadingTimerRef.current); loadingTimerRef.current = null; }
        const stops = data.stops || [];
        stops.sort((a, b) => (a.distance_m ?? 999999) - (b.distance_m ?? 999999));
        renderStopsRef.current(stops, map, selectedStopRef.current?.stop_code ?? null, favCodesRef.current);
      })
      .catch(() => {
        setIsLoadingStops(false);
        setLoadError(true);
        if (loadingTimerRef.current) { clearTimeout(loadingTimerRef.current); loadingTimerRef.current = null; }
      });
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;

    if (!selectedStop) {
      // Stop was deselected — clear marker so the same stop can re-trigger flyTo
      prevSelectedCode.current = null;
      return;
    }
    if (prevSelectedCode.current === selectedStop.stop_code) return;
    prevSelectedCode.current = selectedStop.stop_code;
    const currentZoom = mapInstance.current.getZoom();
    const targetZoom = Math.max(currentZoom, 15);
    mapInstance.current.flyTo(
      offsetForPanel(L.latLng(selectedStop.lat, selectedStop.lng), targetZoom),
      targetZoom,
      { duration: 0.6 }
    );
  }, [selectedStop]);

  useEffect(() => {
    if (!mapInstance.current) return;
    renderStops(currentStops.current, mapInstance.current, selectedStop?.stop_code ?? null, favouriteStopCodes);
  }, [favouriteStopCodes, selectedStop?.stop_code, onlyShowFavorites, renderStops]);

  // Re-paint the bus layer when any of its inputs change. The callback reads
  // refs, so the effect itself can stay minimal and not depend on renderBuses.
  useEffect(() => {
    if (!mapInstance.current) return;
    // An explicit user selection supersedes the first-load nearest hint.
    if (selectedStop && firstLoadNearestCode.current !== null) {
      firstLoadNearestCode.current = null;
    }
    // First-load nearest hint: one-shot. Fires the first time both
    // userLocation and favouriteStops are available. Stays active until
    // the user actually moves >100 m from the hint point (GPS noise alone
    // shouldn't clear it). Surrenders to the ≤300m proximity rule after
    // that.
    if (
      !hasComputedFirstLoad.current &&
      userLocation &&
      favouriteStops.length > 0
    ) {
      const nearest = findNearestFavStopCode(userLocation, favouriteStops);
      if (nearest) firstLoadNearestCode.current = nearest;
      firstLoadHintLocation.current = userLocation;
      hasComputedFirstLoad.current = true;
      setFirstLoadNearestTick((n) => n + 1);
    } else if (
      hasComputedFirstLoad.current &&
      firstLoadNearestCode.current !== null &&
      userLocation &&
      firstLoadHintLocation.current
    ) {
      const moved = haversineMeters(userLocation, firstLoadHintLocation.current);
      if (moved > 100) {
        firstLoadNearestCode.current = null;
      }
    }
    renderBusesRef.current();
  }, [userLocation, favouriteStops, favouriteBuses, selectedStop?.stop_code, firstLoadNearestTick]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: SG_CENTER,
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
    });

    const tileUrl = modeRef.current === "dark" ? DARK_TILES : LIGHT_TILES;
    tileLayerRef.current = L.tileLayer(tileUrl, { maxZoom: 19, keepBuffer: 4 }).addTo(map);

    markersLayer.current = L.layerGroup().addTo(map);
    locationLayer.current = L.layerGroup().addTo(map);
    busesLayer.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    map.getContainer().style.background = modeRef.current === "dark" ? "#000000" : "#f2efec";
    const tilePane = map.getPane("tilePane");
    if (tilePane) tilePane.style.background = modeRef.current === "dark" ? "#000000" : "#f2efec";

    const container = map.getContainer();
    let disposed = false;
    const refreshMapSize = () => {
      requestAnimationFrame(() => {
        if (disposed || !container.isConnected) return;
        try { map.invalidateSize({ pan: false }); } catch {}
      });
    };
    const observer = new ResizeObserver(() => refreshMapSize());
    observer.observe(container);
    refreshMapSize();
    const settleTimer = window.setTimeout(refreshMapSize, 300);
    window.addEventListener("orientationchange", refreshMapSize);
    window.addEventListener("resize", refreshMapSize);

    // Defer the initial stop fetch until the first GPS fix arrives so the
    // first batch of stops is centered on the user's actual location. If the
    // user denies geolocation, or the fix never arrives within 5s, fall back
    // to the default Singapore center.
    if (initialLoadTimerRef.current) clearTimeout(initialLoadTimerRef.current);
    initialLoadTimerRef.current = setTimeout(() => {
      if (!lastLocation.current) loadStops(map);
    }, 5000);

    // Auto-watch location — updates marker silently on position changes
    if (navigator.geolocation) {
      locationWatchId.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const isFirstFix = !lastLocation.current;
          updateLocationMarker(latitude, longitude);
          if (isFirstFix) {
            if (initialLoadTimerRef.current) {
              clearTimeout(initialLoadTimerRef.current);
              initialLoadTimerRef.current = null;
            }
            const map = mapInstance.current;
            if (map) {
              // The flyTo that follows triggers a moveend — suppress the
              // first-load-hint clear in that handler so the first user
              // "movement" doesn't wipe out the auto-show before arrivals
              // poll finishes.
              suppressNextMoveendClear.current = true;
              map.flyTo(offsetForPanel(L.latLng(latitude, longitude), 16), 16, { duration: 0.6 });
              setTimeout(() => loadStops(map), 700);
            }
          }
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setGeolocationDenied(true);
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    } else {
      setGeolocationDenied(true);
    }

    // Compute the nearest favourite stop for first-load bus display once both
    // the user's location and the favourites list are available. The race
    // between geolocation and the favourites fetch is handled by waiting for
    // both deps before firing (one-shot per session via hasComputedFirstLoad).
    if (!hasComputedFirstLoad.current) {
      const nearest = findNearestFavStopCode(
        userLocationRef.current ?? { lat: 0, lng: 0 },
        favStopsRef.current
      );
      if (userLocationRef.current && nearest) {
        firstLoadNearestCode.current = nearest;
        hasComputedFirstLoad.current = true;
        setFirstLoadNearestTick((n) => n + 1);
      } else if (userLocationRef.current) {
        // Location known but no favourites — give up on this session.
        hasComputedFirstLoad.current = true;
      }
    }

    let timer: ReturnType<typeof setTimeout>;
    map.on("moveend", () => {
      // Skip the first-load-hint clear if the move was our programmatic
      // flyTo. Subsequent user-initiated pans/zooms should clear it.
      if (suppressNextMoveendClear.current) {
        suppressNextMoveendClear.current = false;
      } else if (firstLoadNearestCode.current !== null) {
        firstLoadNearestCode.current = null;
        setFirstLoadNearestTick((n) => n + 1);
      }
      clearTimeout(timer);
      if (map.getZoom() < 13) {
        markersLayer.current?.clearLayers();
        currentStops.current = [];
        return;
      }
      timer = setTimeout(() => loadStops(map), 500);
    });

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearTimeout(settleTimer);
      window.removeEventListener("orientationchange", refreshMapSize);
      window.removeEventListener("resize", refreshMapSize);
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      if (initialLoadTimerRef.current) {
        clearTimeout(initialLoadTimerRef.current);
        initialLoadTimerRef.current = null;
      }
      if (locationWatchId.current !== null) {
        navigator.geolocation.clearWatch(locationWatchId.current);
        locationWatchId.current = null;
      }
      map.remove();
      mapInstance.current = null;
    };
  }, [loadStops]);

  function updateLocationMarker(lat: number, lng: number) {
    const map = mapInstance.current;
    if (!map) return;
    locationLayer.current?.clearLayers();
    const pulseIcon = L.divIcon({
      html: `<div style="
        width:24px;height:24px;position:relative;
        display:flex;align-items:center;justify-content:center;
      ">
        <div style="
          position:absolute;width:24px;height:24px;
          border-radius:50%;
          background:#dc262644;
          animation:pulse-location 1.5s ease-out infinite;
        "></div>
        <div style="
          width:14px;height:14px;border-radius:50%;
          background:#dc2626;border:2.5px solid white;
          box-shadow:0 2px 6px rgba(0,0,0,0.2);z-index:1;
        "></div>
      </div>`,
      className: "",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    L.marker([lat, lng], { icon: pulseIcon })
      .bindTooltip("You are here", { direction: "top", offset: [0, -10] })
      .addTo(locationLayer.current!);
    lastLocation.current = { lat, lng };
    onLocationChangeRef.current?.({ lat, lng });
  }

  function handleUseLocation() {
    if (!navigator.geolocation || geolocationDenied) return;
    const loc = lastLocation.current;
    const map = mapInstance.current;
    if (!map || !loc) return;
    // The auto-watch already keeps `lastLocation` current. Recenter the map
    // on the "you are here" marker immediately — no fresh GPS fix required.
    map.flyTo(offsetForPanel(L.latLng(loc.lat, loc.lng), 16), 16, { duration: 0.6 });
    setTimeout(() => loadStops(map), 700);
  }

  return (
    <div className="map-stage">
      <div ref={mapRef} className="map-canvas" />
      <div className={"map-loading-indicator" + (isLoadingStops ? " is-visible" : "")}>
        <span className="spinner-modern" style={{ width: 14, height: 14, borderWidth: 2 }} />
        Loading stops...
      </div>
      {loadError && (
        <div style={{
          position: "absolute",
          bottom: 80,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 970,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          borderRadius: 999,
          background: "var(--color-surface)",
          border: "1px solid var(--color-danger)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 4px 16px var(--color-glass-shadow)",
          color: "var(--color-danger)",
          fontSize: 13,
          fontWeight: 600,
          pointerEvents: "auto",
          cursor: "pointer",
        }}>
          <span>Failed to load stops</span>
          <button
            onClick={() => {
              const map = mapInstance.current;
              if (map) loadStops(map);
            }}
            style={{
              background: "var(--color-accent)",
              color: "white",
              border: 0,
              borderRadius: 8,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={handleUseLocation}
        disabled={geolocationDenied}
        className="map-locate-button"
        aria-label="Go to my current location"
        title={geolocationDenied ? "Location permission denied" : "Go to current location"}
      >
        <LocateIcon />
      </button>
    </div>
  );
}