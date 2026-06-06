import puppeteer from "puppeteer";

const FRONTEND = process.env.FRONTEND_URL || "http://127.0.0.1:3100";
const errors = [];
let exit = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); exit = 1; };
const pass = (m) => console.log(`  ✓ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Use a known stop from earlier: 01112 (Opp Bugis Stn Exit C), lat 1.3005, lng 103.8551
// We'll set geolocation to be at this stop (distance 0) so the proximity check passes.
const TARGET_STOP = { stop_code: "01112", lat: 1.3005, lng: 103.8551 };

const suffix = Math.random().toString(36).slice(2, 10);
const username = `prox_${suffix}`;
const password = "testpass1234";
const email = `prox_${suffix}@example.com`;
const mobile = "9" + Math.floor(1000000 + Math.random() * 9000000).toString();

async function api(token, method, path, body) {
  const res = await fetch(`http://127.0.0.1:8000${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API ${method} ${path} -> ${res.status}: ${t}`);
  }
  return res.json();
}
const P = (p) => p.startsWith("/api") ? p : `/api${p}`;

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
try {
  // -------- Phase 1: register, favourite the target stop, favourite bus "12" via API --------
  console.log("=== Setup (register + fav stop + fav bus) ===");
  const reg = await api(null, "POST", P("/register"), {
    username,
    password,
    email,
    mobile_number: mobile,
  });
  const token = reg.token;
  pass(`registered user ${username}`);
  await api(token, "POST", P("/favourites"), { stop_code: TARGET_STOP.stop_code });
  pass(`favourited stop ${TARGET_STOP.stop_code}`);

  // Find a live bus whose reported position is within 2 km of the user —
  // the new distance filter hides buses further than that, so we need a
  // candidate that's actually close to the test geolocation.
  const arrivals = await api(null, "GET", P(`/stops/${TARGET_STOP.stop_code}/arrivals`));
  const user = { lat: TARGET_STOP.lat, lng: TARGET_STOP.lng };
  const liveBuses = arrivals.services
    .filter((s) => s.next?.monitored === 1 && s.next?.lat && s.next?.lng)
    .map((s) => ({ no: s.no, lat: s.next.lat, lng: s.next.lng }));
  function dist(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const closeBus = liveBuses.find((b) => dist(user, b) <= 2000);
  if (!closeBus) {
    fail("no LTA bus within 2 km of the user — cannot test");
    process.exit(1);
  }
  const busNo = closeBus.no;
  await api(token, "POST", P("/favourites/bus"), { stop_code: TARGET_STOP.stop_code, bus_no: busNo });
  pass(`favourited bus ${busNo} at ${TARGET_STOP.stop_code}`);
  pass(`LTA reports live coordinate for bus ${busNo}: (${closeBus.lat.toFixed(5)}, ${closeBus.lng.toFixed(5)}) — ${Math.round(dist(user, closeBus))}m from user`);

  // -------- Phase 2: open the page with the token, set geolocation near the stop --------
  console.log("\n=== Open page with geolocation near fav stop ===");
  const context = browser.defaultBrowserContext();
  await context.overridePermissions(FRONTEND, ["geolocation"]);
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, isMobile: true, hasTouch: true });
  await page.setGeolocation({ latitude: TARGET_STOP.lat, longitude: TARGET_STOP.lng, accuracy: 5 });
  page.on("pageerror", (e) => errors.push("PAGEERR: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      if (!/Failed to fetch arrivals|net::|AbortError|429|502|HMR|webpack-hmr|websocket/i.test(t)) {
        errors.push(t);
      }
    }
  });

  // Pre-seed token so the app skips auth and goes straight to the map
  await page.evaluateOnNewDocument((t) => {
    try { localStorage.setItem("token", t); } catch {}
  }, token);
  await page.goto(FRONTEND, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector(".favorites-panel", { timeout: 15000 });
  pass("favorites panel mounted");

  // Wait for arrivals + bus layer render
  console.log("\n=== Wait for bus marker to appear ===");
  // Arrivals poll is 10s, the bus layer renders on the next animation frame after.
  let busMarkerFound = false;
  for (let i = 0; i < 30; i++) {
    await wait(1000);
    const found = await page.evaluate(() => {
      return document.querySelectorAll(".bus-map-marker").length;
    });
    if (found > 0) { busMarkerFound = true; break; }
  }
  if (busMarkerFound) {
    const count = await page.evaluate(() => document.querySelectorAll(".bus-map-marker").length);
    pass(`bus marker rendered (${count} marker(s) on map)`);
  } else {
    fail("no .bus-map-marker after 30s — proximity check or rendering failed");
  }

  // -------- Phase 3: move geolocation far away, marker should disappear --------
  if (busMarkerFound) {
    console.log("\n=== Move geolocation far away → markers should clear ===");
    // Move ~1.5 km away
    await page.setGeolocation({ latitude: TARGET_STOP.lat + 0.015, longitude: TARGET_STOP.lng + 0.015, accuracy: 5 });
    // GPS watch may take a few seconds to fire; also force the layer to re-render by waiting
    let cleared = false;
    for (let i = 0; i < 15; i++) {
      await wait(1000);
      const c = await page.evaluate(() => document.querySelectorAll(".bus-map-marker").length);
      if (c === 0) { cleared = true; break; }
    }
    if (cleared) pass("markers cleared after moving >300m away");
    else {
      const c = await page.evaluate(() => document.querySelectorAll(".bus-map-marker").length);
      fail(`markers still present (${c}) after moving away — proximity check did not re-evaluate`);
    }

    // -------- Phase 4: move back near, marker should reappear --------
    console.log("\n=== Move geolocation back near fav stop → markers should reappear ===");
    await page.setGeolocation({ latitude: TARGET_STOP.lat, longitude: TARGET_STOP.lng, accuracy: 5 });
    let reappeared = false;
    for (let i = 0; i < 15; i++) {
      await wait(1000);
      const c = await page.evaluate(() => document.querySelectorAll(".bus-map-marker").length);
      if (c > 0) { reappeared = true; break; }
    }
    if (reappeared) pass("markers reappeared after returning within 300m");
    else fail("markers did not reappear after returning");
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
  console.log(`\n${exit === 0 ? "PROXIMITY TEST PASSED" : "PROXIMITY TEST FAILED"}`);
  process.exit(exit);
}
