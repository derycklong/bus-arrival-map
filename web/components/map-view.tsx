"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getStops, Stop, StopBase } from "@/lib/api";

const SG_CENTER: [number, number] = [1.3521, 103.8198];

const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

function createStopIcon(color: string, isSelected: boolean, isFav: boolean) {
  const outer = isSelected ? 36 : 28;
  const inner = isSelected ? 26 : 20;
  const iconSize = isSelected ? 18 : 14;
  const glowRing = isFav ? `0 0 0 3px ${color}44,` : "";
  const shadow = ` ${glowRing} 0 2px 6px rgba(0,0,0,0.15)`;

  return L.divIcon({
    html: `<div style="
      width:${outer}px;height:${outer}px;
      display:flex;align-items:center;justify-content:center;
    ">
      <div style="
        width:${inner}px;height:${inner}px;
        border-radius:50%;
        background:${color};
        border:2.5px solid white;
        box-shadow:${shadow};
        display:flex;align-items:center;justify-content:center;
        animation:${isFav ? "fav-pulse 1.8s ease-in-out infinite" : "none"};
      ">
        <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="5" width="18" height="13" rx="2.5"/>
          <rect x="5" y="7" width="14" height="4" rx="0.5"/>
          <line x1="5" y1="11" x2="19" y2="11"/>
          <circle cx="8" cy="17" r="1"/>
          <circle cx="16" cy="17" r="1"/>
        </svg>
      </div>
    </div>`,
    className: "",
    iconSize: [outer, outer],
    iconAnchor: [outer / 2, outer / 2],
  });
}

// Panel: left 16px + width 348px = 364px obscured on left; offset by half = 182px
const PANEL_OFFSET_PX = 182;

function offsetForPanel(target: L.LatLng, zoom: number): L.LatLng {
  if (window.innerWidth < 601) return target;
  const point = L.CRS.EPSG3857.latLngToPoint(target, zoom);
  const offsetPoint = L.point(point.x - PANEL_OFFSET_PX, point.y);
  return L.CRS.EPSG3857.pointToLatLng(offsetPoint, zoom);
}

// Shift a map center RIGHT by the panel offset to get the visible area center for stop loading
function panelCenter(center: L.LatLng, zoom: number): L.LatLng {
  if (window.innerWidth < 601) return center;
  const point = L.CRS.EPSG3857.latLngToPoint(center, zoom);
  const shiftedPoint = L.point(point.x + PANEL_OFFSET_PX, point.y);
  return L.CRS.EPSG3857.pointToLatLng(shiftedPoint, zoom);
}

interface MapViewProps {
  favouriteStopCodes: Set<string>;
  selectedStop: StopBase | null;
  onSelectStop: (stop: StopBase) => void;
}

export default function MapView({ favouriteStopCodes, selectedStop, onSelectStop }: MapViewProps) {
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
  const [isLocating, setIsLocating] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return (localStorage.getItem("theme") as "light" | "dark") || "light";
    } catch {
      return "light";
    }
  });

  // Keep refs in sync for callbacks (not used for rendering)
  useEffect(() => {
    selectedStopRef.current = selectedStop;
    onSelectStopRef.current = onSelectStop;
    favCodesRef.current = favouriteStopCodes;
  });

  // Theme toggle function
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch {}
      return next;
    });
  }, []);

  // Apply theme on mount
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Update tile layer when theme changes
  useEffect(() => {
    if (!mapInstance.current) return;
    if (tileLayerRef.current) {
      mapInstance.current.removeLayer(tileLayerRef.current);
    }
    const tileUrl = theme === "dark" ? DARK_TILES : LIGHT_TILES;
    tileLayerRef.current = L.tileLayer(tileUrl, {
      maxZoom: 19,
    }).addTo(mapInstance.current);
  }, [theme]);

  // Render markers from current stops list
  // favouriteStopCodes is passed directly (not via ref) so colors are never stale
  const renderStops = useCallback(
    (stops: Stop[], favCodes: Set<string>) => {
      markersLayer.current?.clearLayers();
      const selStop = selectedStopRef.current;

      for (const stop of stops) {
        const isFav = favCodes.has(stop.stop_code);
        const isSelected = selStop?.stop_code === stop.stop_code;
        const color = isFav ? "#fbbf24" : "#7eb8ff";
        const icon = createStopIcon(color, isSelected, isFav);

        const marker = L.marker([stop.lat, stop.lng], { icon });
        marker.bindTooltip(stop.name, { direction: "top", offset: [0, -10] });
        marker.on("click", () => onSelectStopRef.current(stop));
        markersLayer.current?.addLayer(marker);
      }
    },
    []
  );

  // Load stops from API within current map bounds
  const loadStops = useCallback(async (map: L.Map) => {
    const zoom = map.getZoom();
    if (zoom < 13) {
      markersLayer.current?.clearLayers();
      currentStops.current = [];
      return;
    }
    const center = panelCenter(map.getCenter(), zoom);
    const bounds = map.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const R = 6371000;
    const dlat = ((ne.lat - sw.lat) / 2) * Math.PI / 180;
    const dlng = ((ne.lng - sw.lng) / 2) * Math.PI / 180;
    const a =
      Math.sin(dlat / 2) ** 2 +
      Math.cos(sw.lat * Math.PI / 180) * Math.cos(ne.lat * Math.PI / 180) * Math.sin(dlng / 2) ** 2;
    const radius = Math.min(Math.ceil(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.2), 2000);
    if (radius < 50) return;

    try {
      const data = await getStops(center.lat, center.lng, radius);
      currentStops.current = data.stops;
      renderStops(data.stops, favCodesRef.current);
    } catch {
      /* ignore */
    }
  }, [renderStops]);

  // Re-render markers when favourites or selected stop changes
  useEffect(() => {
    if (currentStops.current.length > 0 && (mapInstance.current?.getZoom() ?? 0) >= 13) {
      renderStops(currentStops.current, favouriteStopCodes);
    }
  }, [favouriteStopCodes, selectedStop?.stop_code, renderStops]);

  // Fly to selected stop
  useEffect(() => {
    if (!selectedStop || !mapInstance.current) return;
    if (prevSelectedCode.current === selectedStop.stop_code) return;
    prevSelectedCode.current = selectedStop.stop_code;
    const currentZoom = mapInstance.current.getZoom();
    const targetZoom = Math.max(currentZoom, 15);
    mapInstance.current.flyTo(offsetForPanel(L.latLng(selectedStop.lat, selectedStop.lng), targetZoom), targetZoom);
  }, [selectedStop]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: SG_CENTER,
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
    });

    const tileUrl = theme === "dark" ? DARK_TILES : LIGHT_TILES;
    tileLayerRef.current = L.tileLayer(tileUrl, {
      maxZoom: 19,
    }).addTo(map);

    markersLayer.current = L.layerGroup().addTo(map);
    locationLayer.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    loadStops(map);
    handleUseLocation();

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
      map.remove();
      mapInstance.current = null;
    };
  }, [loadStops]);

  function handleUseLocation() {
    if (!navigator.geolocation) {
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const map = mapInstance.current;
        if (!map) return;

        locationLayer.current?.clearLayers();
        const pulseIcon = L.divIcon({
          html: `<div style="
            width:24px;height:24px;
            position:relative;
            display:flex;align-items:center;justify-content:center;
          ">
            <div style="
              position:absolute;
              width:24px;height:24px;
              border-radius:50%;
              background:#dc262644;
              animation:pulse-location 1.5s ease-out infinite;
            "></div>
            <div style="
              width:14px;height:14px;
              border-radius:50%;
              background:#dc2626;
              border:2.5px solid white;
              box-shadow:0 2px 6px rgba(0,0,0,0.2);
              z-index:1;
            "></div>
          </div>`,
          className: "",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([latitude, longitude], { icon: pulseIcon })
          .bindTooltip("You are here", { direction: "top", offset: [0, -10] })
          .addTo(locationLayer.current!);

        setIsLocating(false);
        map.flyTo(offsetForPanel(L.latLng(latitude, longitude), 16), 16);
        setTimeout(() => loadStops(map), 700);
      },
      () => {
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  return (
    <div className="map-stage">
      <div ref={mapRef} className="map-canvas" />
      <div className="map-controls">
        <button
          type="button"
          onClick={handleUseLocation}
          disabled={isLocating}
          className="map-control-button"
          aria-label="Go to my current location"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
          </svg>
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          className="map-control-button"
          aria-label="Toggle dark/light mode"
        >
          {theme === "dark" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
