"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  getFavourites,
  getArrivals,
  addFavourite,
  removeFavourite,
  FavouriteStop,
  Service,
} from "@/lib/api";

export interface FavouriteStopWithArrivals {
  stop: FavouriteStop;
  services: Service[];
  loading: boolean;
  error: boolean;
}

interface FavouritesState {
  stops: FavouriteStopWithArrivals[];
  loading: boolean;
  error: boolean;
}

export function useFavourites() {
  const [state, setState] = useState<FavouritesState>({
    stops: [],
    loading: true,
    error: false,
  });
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopsRef = useRef(state.stops);

  // Keep stopsRef in sync after render for optimistic revert
  useEffect(() => {
    stopsRef.current = state.stops;
  });

  const fetchFavourites = useCallback(async () => {
    try {
      const data = await getFavourites();
      if (data.stops.length === 0) {
        setState({ stops: [], loading: false, error: false });
        return;
      }
      const results = await Promise.allSettled(
        data.stops.map(async (stop) => {
          const arrivals = await getArrivals(stop.stop_code);
          return { stop, services: arrivals.services, loading: false, error: false };
        })
      );
      const items: FavouriteStopWithArrivals[] = results.map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        return {
          stop: data.stops[i],
          services: [],
          loading: false,
          error: true,
        };
      });
      setState({ stops: items, loading: false, error: false });
    } catch {
      setState((prev) => ({ ...prev, loading: false, error: true }));
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    fetchFavourites();
    pollingRef.current = setInterval(fetchFavourites, 30000);
  }, [fetchFavourites, stopPolling]);

  useEffect(() => {
    return stopPolling;
  }, [stopPolling]);

  const addFavouriteStop = useCallback(
    async (stop: { stop_code: string; name: string; road: string; lat: number; lng: number }) => {
      const optimistic: FavouriteStopWithArrivals = {
        stop: {
          stop_code: stop.stop_code,
          name: stop.name,
          road: stop.road,
          lat: stop.lat,
          lng: stop.lng,
        },
        services: [],
        loading: true,
        error: false,
      };
      setState((prev) => ({ ...prev, stops: [...prev.stops, optimistic] }));
      try {
        await addFavourite(stop.stop_code);
      } catch {
        setState((prev) => ({
          ...prev,
          stops: prev.stops.filter((s) => s.stop.stop_code !== stop.stop_code),
        }));
      }
    },
    []
  );

  const removeFavouriteStop = useCallback(async (stopCode: string) => {
    const prevStops = stopsRef.current;
    setState((prev) => ({
      ...prev,
      stops: prev.stops.filter((s) => s.stop.stop_code !== stopCode),
    }));
    try {
      await removeFavourite(stopCode);
    } catch {
      setState((prev) => ({ ...prev, stops: prevStops }));
    }
  }, []);

  return {
    stops: state.stops,
    loading: state.loading,
    error: state.error,
    fetchFavourites,
    addFavouriteStop,
    removeFavouriteStop,
    startPolling,
    stopPolling,
  };
}
