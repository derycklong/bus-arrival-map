function getApiBase(): string {
  return "/api";
}

const API_BASE = getApiBase();

function getToken(): string | null {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

async function api<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = getToken();
  const isAuthEndpoint = path === "/login" || path === "/register";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const opts: RequestInit = {
    method,
    signal: controller.signal,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  };
  if (token && !isAuthEndpoint) {
    (opts.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  if (body !== undefined) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`${API_BASE}${path}`, opts);
    if (res.status === 401 && !isAuthEndpoint) {
      try { localStorage.removeItem("token"); } catch { /* noop */ }
      // Give React a tick to clean up before redirecting
      setTimeout(() => window.dispatchEvent(new CustomEvent("auth:expired")), 0);
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const detail = Array.isArray(err.detail)
        ? err.detail.map((d: { msg?: string }) => (d.msg ?? String(d)).replace(/^Value error,\s*/i, "")).join("; ")
        : err.detail;
      throw new Error(detail || `HTTP ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export interface StopBase {
  stop_code: string;
  name: string;
  road: string;
  lat: number;
  lng: number;
}

export interface Stop extends StopBase {
  distance_m: number;
}

export interface Bus {
  time: string;
  duration_ms: number | null;
  load: string;
  feature: string;
  type: string;
  destination_code: string;
  destination_name: string;
  lat: number;
  lng: number;
  monitored: number;
  visit_number: string;
  origin_code: string;
}

export interface Service {
  no: string;
  operator: string;
  next: Bus | null;
  subsequent: Bus | null;
}

export interface StopsResponse {
  stops: Stop[];
}

export interface ArrivalsResponse {
  services: Service[];
}

export type FavouriteStop = StopBase;

export interface AuthResponse {
  token: string;
  user: { id: number; username: string };
}

export interface UserResponse {
  id: number;
  username: string;
}

export interface FavouritesResponse {
  stops: FavouriteStop[];
}

export function login(username: string, password: string) {
  return api<AuthResponse>("POST", "/login", { username, password });
}

export function register(username: string, password: string, email: string, mobile_number: string) {
  return api<AuthResponse>("POST", "/register", { username, password, email, mobile_number });
}

export function getMe() {
  return api<UserResponse>("GET", "/me");
}

export function getStops(lat: number, lng: number, radius: number) {
  radius = Math.min(Math.max(radius, 50), 2000);
  return api<StopsResponse>("GET", `/stops?lat=${lat}&lng=${lng}&radius=${radius}`);
}

export function getArrivals(stopCode: string) {
  return api<ArrivalsResponse>("GET", `/stops/${stopCode}/arrivals`);
}

export function getFavourites() {
  return api<FavouritesResponse>("GET", "/favourites");
}

export function addFavourite(stopCode: string) {
  return api("POST", "/favourites", { stop_code: stopCode });
}

export function removeFavourite(stopCode: string) {
  return api("DELETE", "/favourites", { stop_code: stopCode });
}

export interface FavouriteBusesResponse {
  bus_nos: string[];
}

export function getFavouriteBuses(stopCode: string) {
  return api<FavouriteBusesResponse>("GET", `/favourites/buses?stop_code=${stopCode}`);
}

export function addFavouriteBus(stopCode: string, busNo: string) {
  return api("POST", "/favourites/bus", { stop_code: stopCode, bus_no: busNo });
}

export function removeFavouriteBus(stopCode: string, busNo: string) {
  return api("DELETE", "/favourites/bus", { stop_code: stopCode, bus_no: busNo });
}
