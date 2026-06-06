"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  getFavourites,
  getArrivals,
  getFavouriteBuses,
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
  const [favouriteBusesByStop, setFavouriteBusesByStop] = useState<Map<string, Set<string>>>(new Map());
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
    pollingRef.current = setInterval(fetchFavourites, 10000);
  }, [fetchFavourites, stopPolling]);

  // Keep favouriteBusesByStop in sync with the current set of fav stops.
  // Refetched whenever the stop list changes; the per-stop getFavouriteBuses
  // call is cheap and the data is small.
  const stopCodesKey = state.stops.map((s) => s.stop.stop_code).join(",");
  useEffect(() => {
    if (state.stops.length === 0) {
      setFavouriteBusesByStop(new Map());
      return;
    }
    let cancelled = false;
    Promise.allSettled(
      state.stops.map((s) =>
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
      setFavouriteBusesByStop(next);
    });
    return () => { cancelled = true; };
  }, [stopCodesKey, state.stops.length]);

  // Optimistic update helper for FavoritesPanel to keep map + panel in sync
  // when the user stars/unstars a bus from the detail view.
  const updateFavouriteBusesForStop = useCallback(
    (stopCode: string, mut: (set: Set<string>) => void) => {
      setFavouriteBusesByStop((prev) => {
        const next = new Map(prev);
        const cur = new Set(next.get(stopCode) || []);
        mut(cur);
        next.set(stopCode, cur);
        return next;
      });
    },
    []
  );

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
        const arrivals = await getArrivals(stop.stop_code);
        setState((prev) => ({
          ...prev,
          stops: prev.stops.map((s) =>
            s.stop.stop_code === stop.stop_code
              ? { ...s, services: arrivals.services, loading: false, error: false }
              : s
          ),
        }));
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
    favouriteBusesByStop,
    updateFavouriteBusesForStop,
    fetchFavourites,
    addFavouriteStop,
    removeFavouriteStop,
    startPolling,
    stopPolling,
  };
}
