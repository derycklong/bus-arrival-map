import puppeteer from "puppeteer";

const FRONTEND = process.env.FRONTEND_URL || "http://127.0.0.1:3100";
const TARGET_STOP = { stop_code: "01112", lat: 1.3005, lng: 103.8551 };
// User near the fav stop so the first-load hint fires.
const NEAR_LAT = TARGET_STOP.lat;
const NEAR_LNG = TARGET_STOP.lng;

const errors = [];
let exit = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); exit = 1; };
const pass = (m) => console.log(`  ✓ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const suffix = Math.random().toString(36).slice(2, 8);
const username = `bd_${suffix}`;
const password = "testpass1234";
const email = `bd_${suffix}@example.com`;
const mobile = "9" + Math.floor(1000000 + Math.random() * 9000000).toString();

async function api(token, method, path, body) {
  const r = await fetch(`http://127.0.0.1:8000${path}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`API ${method} ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}
const P = (p) => p.startsWith("/api") ? p : `/api${p}`;

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
try {
  // Phase 1: find at least two fav buses at the target stop, one close to
  // the user and one farther than 2 km.
  console.log("=== Setup ===");
  const reg = await api(null, "POST", P("/register"), { username, password, email, mobile_number: mobile });
  const token = reg.token;
  pass(`registered ${username}`);

  await api(token, "POST", P("/favourites"), { stop_code: TARGET_STOP.stop_code });
  pass(`favourited stop ${TARGET_STOP.stop_code}`);

  const arrivals = await api(null, "GET", P(`/stops/${TARGET_STOP.stop_code}/arrivals`));
  const liveBuses = arrivals.services
    .map((s) => ({ no: s.no, lat: s.next?.lat, lng: s.next?.lng, monitored: s.next?.monitored }))
    .filter((b) => b.monitored === 1 && b.lat && b.lng);

  const closeBuses = liveBuses.filter((b) => haversineMeters(NEAR_LAT ? { lat: NEAR_LAT, lng: NEAR_LNG } : TARGET_STOP, b) <= 2000);
  const farBuses = liveBuses.filter((b) => haversineMeters({ lat: NEAR_LAT, lng: NEAR_LNG }, b) > 2000);

  console.log(`LTA live buses at stop ${TARGET_STOP.stop_code}:`, liveBuses.map((b) => `${b.no}@(${b.lat.toFixed(4)},${b.lng.toFixed(4)})`).join(", "));
  if (closeBuses.length === 0 || farBuses.length === 0) {
    fail(`need at least one close and one far bus; got ${closeBuses.length} close, ${farBuses.length} far`);
    process.exit(1);
  }
  pass(`found ${closeBuses.length} close bus(es) and ${farBuses.length} far bus(es) at stop`);
  const closeBus = closeBuses[0];
  const farBus = farBuses[0];
  await api(token, "POST", P("/favourites/bus"), { stop_code: TARGET_STOP.stop_code, bus_no: closeBus.no });
  await api(token, "POST", P("/favourites/bus"), { stop_code: TARGET_STOP.stop_code, bus_no: farBus.no });
  pass(`favourited bus ${closeBus.no} (close) + bus ${farBus.no} (far)`);

  // Phase 2: open the page near the fav stop, expect only the close bus
  console.log("\n=== Open page near fav stop, expect only close bus shown ===");
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions(FRONTEND, ["geolocation"]);
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, isMobile: true, hasTouch: true });
  await page.setGeolocation({ latitude: NEAR_LAT, longitude: NEAR_LNG, accuracy: 5 });
  await page.evaluateOnNewDocument((t) => { try { localStorage.setItem("token", t); } catch {} }, token);
  page.on("pageerror", (e) => errors.push("PAGEERR: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      if (!/Failed to fetch arrivals|net::|AbortError|429|502|HMR|webpack-hmr|websocket/i.test(t)) errors.push(t);
    }
  });

  await page.goto(FRONTEND, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector(".favorites-panel", { timeout: 15000 });

  // Wait for the buses layer to settle
  let busMarkers = [];
  for (let i = 0; i < 30; i++) {
    await wait(1000);
    busMarkers = await page.evaluate(() => {
      const ms = [...document.querySelectorAll(".bus-map-marker")];
      return ms.map((m) => m.textContent.trim());
    });
    if (busMarkers.length > 0) break;
  }
  console.log(`bus markers visible: [${busMarkers.join(", ")}]  expected: [${closeBus.no}]`);
  if (busMarkers.length === 0) {
    fail("no bus markers visible (first-load hint may not have fired)");
  } else {
    if (busMarkers.includes(closeBus.no)) pass(`close bus ${closeBus.no} is shown`);
    else fail(`close bus ${closeBus.no} is missing from markers`);
    if (busMarkers.includes(farBus.no)) fail(`far bus ${farBus.no} should be hidden (>2km) but is shown`);
    else pass(`far bus ${farBus.no} correctly hidden (${Math.round(haversineMeters({lat:NEAR_LAT,lng:NEAR_LNG}, farBus))}m away)`);
  }

  console.log("\n=== JS errors ===");
  const filtered = errors.filter((e) => !/HMR|webpack-hmr|websocket/i.test(e));
  if (filtered.length === 0) pass("no JS errors");
  else { fail("errors:"); filtered.forEach((e) => console.error("    " + e)); }
} catch (e) {
  fail(`fatal: ${e.message}`);
  console.error(e);
  exit = 1;
} finally {
  await browser.close();
  console.log(`\n${exit === 0 ? "DISTANCE-FILTER TEST PASSED" : "DISTANCE-FILTER TEST FAILED"}`);
  process.exit(exit);
}
