"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getStops, Stop, StopBase } from "@/lib/api";

const SG_CENTER: [number, number] = [1.3521, 103.8198];

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

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

        const marker = L.circleMarker([stop.lat, stop.lng], {
          radius: isSelected ? 10 : 7,
          fillColor: isSelected ? "#ffd700" : isFav ? "#ffd700" : "#0a6bff",
          color: "#fff",
          weight: isSelected ? 3 : 2,
          fillOpacity: 0.8,
        });
        marker.bindTooltip(stop.name, { direction: "top", offset: [0, -8] });
        marker.on("click", () => onSelectStopRef.current(stop));
        markersLayer.current?.addLayer(marker);
      }
    },
    []
  );

  // Load stops from API within current map bounds
  const loadStops = useCallback(async (map: L.Map) => {
    const center = map.getCenter();
    const bounds = map.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const R = 6371000;
    const dlat = ((ne.lat - sw.lat) / 2) * Math.PI / 180;
    const dlng = ((ne.lng - sw.lng) / 2) * Math.PI / 180;
    const a =
      Math.sin(dlat / 2) ** 2 +
      Math.cos(sw.lat * Math.PI / 180) * Math.cos(ne.lat * Math.PI / 180) * Math.sin(dlng / 2) ** 2;
    const radius = Math.min(Math.ceil(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.2), 1000);
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
    if (currentStops.current.length > 0) {
      renderStops(currentStops.current, favouriteStopCodes);
    }
  }, [favouriteStopCodes, selectedStop?.stop_code, renderStops]);

  // Fly to selected stop
  useEffect(() => {
    if (!selectedStop || !mapInstance.current) return;
    if (prevSelectedCode.current === selectedStop.stop_code) return;
    prevSelectedCode.current = selectedStop.stop_code;
    mapInstance.current.flyTo([selectedStop.lat, selectedStop.lng], 16);
  }, [selectedStop]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: SG_CENTER,
      zoom: 15,
      zoomControl: false,
    });

    const tileUrl = theme === "dark" ? DARK_TILES : LIGHT_TILES;
    tileLayerRef.current = L.tileLayer(tileUrl, {
      maxZoom: 19,
    }).addTo(map);

    markersLayer.current = L.layerGroup().addTo(map);
    locationLayer.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    loadStops(map);

    let timer: ReturnType<typeof setTimeout>;
    map.on("moveend", () => {
      clearTimeout(timer);
      timer = setTimeout(() => loadStops(map), 500);
    });

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [loadStops, theme]);

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
        L.circle([latitude, longitude], {
          radius: Math.min(Math.max(accuracy, 30), 500),
          color: "#2563eb",
          fillColor: "#3b82f6",
          fillOpacity: 0.12,
          weight: 1,
        }).addTo(locationLayer.current!);
        L.circleMarker([latitude, longitude], {
          radius: 7,
          color: "#ffffff",
          fillColor: "#2563eb",
          fillOpacity: 1,
          weight: 3,
        })
          .bindTooltip("You are here", { direction: "top", offset: [0, -8] })
          .addTo(locationLayer.current!);

        setIsLocating(false);
        map.flyTo([latitude, longitude], 16);
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
