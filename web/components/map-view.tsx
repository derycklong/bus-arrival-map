"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getStops, Stop, StopBase } from "@/lib/api";

const SG_CENTER: [number, number] = [1.3521, 103.8198];
const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

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
  selectedStop: StopBase | null;
  onSelectStop: (stop: StopBase) => void;
  onLocationChange?: (loc: { lat: number; lng: number }) => void;
  theme: "light" | "dark";
}

export default function MapView({ favouriteStopCodes, selectedStop, onSelectStop, onLocationChange, theme }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayer = useRef<L.LayerGroup | null>(null);
  const locationLayer = useRef<L.LayerGroup | null>(null);
  const currentStops = useRef<Stop[]>([]);
  const prevSelectedCode = useRef<string | null>(null);
  const selectedStopRef = useRef(selectedStop);
  const onSelectStopRef = useRef(onSelectStop);
  const favCodesRef = useRef(favouriteStopCodes);
  const locationWatchId = useRef<number | null>(null);
  const lastLocation = useRef<{ lat: number; lng: number } | null>(null);
  const themeRef = useRef(theme);
  const onLocationChangeRef = useRef(onLocationChange);
  const [isLocating, setIsLocating] = useState(false);
  const [geolocationDenied, setGeolocationDenied] = useState(false);
  const [isLoadingStops, setIsLoadingStops] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    selectedStopRef.current = selectedStop;
    onSelectStopRef.current = onSelectStop;
    favCodesRef.current = favouriteStopCodes;
    themeRef.current = theme;
    onLocationChangeRef.current = onLocationChange;
  });

  useEffect(() => {
    if (!mapInstance.current) return;
    if (tileLayerRef.current) {
      mapInstance.current.removeLayer(tileLayerRef.current);
    }
    const tileUrl = theme === "dark" ? DARK_TILES : LIGHT_TILES;
    tileLayerRef.current = L.tileLayer(tileUrl, { maxZoom: 19, keepBuffer: 4 }).addTo(mapInstance.current);
    const bg = theme === "dark" ? "#000000" : "#f2efec";
    mapInstance.current.getContainer().style.background = bg;
    const tilePane = mapInstance.current.getPane("tilePane");
    if (tilePane) tilePane.style.background = bg;
    // Force Safari to re-rasterize after tile layer swap
    requestAnimationFrame(() => {
      mapInstance.current?.invalidateSize({ pan: false });
    });
  }, [theme]);

  const renderStops = useCallback((stops: Stop[], map: L.Map, selectedCode: string | null, favCodes: Set<string>) => {
    markersLayer.current?.clearLayers();
    currentStops.current = stops;

    const stopColor = theme === "dark" ? "#60a5fa" : "#2563eb";
    const selectedColor = "#ef4444";
    const favColor = "#f59e0b";

    for (const stop of stops) {
      const isSelected = stop.stop_code === selectedCode;
      const isFav = favCodes.has(stop.stop_code);
      const color = isSelected ? selectedColor : isFav ? favColor : stopColor;
      const colorTop = lighten(color, 0.35);
      const icon = createStopIcon(color, colorTop, isSelected, isFav);
      const marker = L.marker([stop.lat, stop.lng], { icon });
      marker.on("click", () => onSelectStopRef.current(stop));
      markersLayer.current?.addLayer(marker);
    }
  }, [theme]);

  const loadStops = useCallback((map: L.Map) => {
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
        renderStops(stops, map, selectedStopRef.current?.stop_code ?? null, favCodesRef.current);
      })
      .catch(() => {
        setIsLoadingStops(false);
        setLoadError(true);
        if (loadingTimerRef.current) { clearTimeout(loadingTimerRef.current); loadingTimerRef.current = null; }
      });
  }, [renderStops]);

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
  }, [favouriteStopCodes, selectedStop?.stop_code, renderStops]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: SG_CENTER,
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
    });

    const tileUrl = themeRef.current === "dark" ? DARK_TILES : LIGHT_TILES;
    tileLayerRef.current = L.tileLayer(tileUrl, { maxZoom: 19, keepBuffer: 4 }).addTo(map);

    markersLayer.current = L.layerGroup().addTo(map);
    locationLayer.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    map.getContainer().style.background = themeRef.current === "dark" ? "#000000" : "#f2efec";
    const tilePane = map.getPane("tilePane");
    if (tilePane) tilePane.style.background = themeRef.current === "dark" ? "#000000" : "#f2efec";

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

    loadStops(map);

    // Auto-watch location — updates marker silently on position changes
    if (navigator.geolocation) {
      locationWatchId.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const isFirstFix = !lastLocation.current;
          updateLocationMarker(latitude, longitude);
          if (isFirstFix) {
            // First fix: fly and load stops
            const map = mapInstance.current;
            if (map) {
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

    let timer: ReturnType<typeof setTimeout>;
    map.on("moveend", () => {
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
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const map = mapInstance.current;
        if (!map) return;

        updateLocationMarker(latitude, longitude);
        setIsLocating(false);
        map.flyTo(offsetForPanel(L.latLng(latitude, longitude), 16), 16, { duration: 0.6 });
        setTimeout(() => loadStops(map), 700);
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) setGeolocationDenied(true);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
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
        disabled={isLocating || geolocationDenied}
        className="map-locate-button"
        aria-label="Go to my current location"
        title={geolocationDenied ? "Location permission denied" : "Go to current location"}
      >
        <LocateIcon />
      </button>
    </div>
  );
}