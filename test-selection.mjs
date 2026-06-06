import puppeteer from "puppeteer";

const FRONTEND = process.env.FRONTEND_URL || "http://127.0.0.1:3100";
const errors = [];
let exit = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); exit = 1; };
const pass = (m) => console.log(`  ✓ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const TARGET_STOP = { stop_code: "01112", lat: 1.3005, lng: 103.8551 };
// Geolocation is intentionally FAR from the fav stop so the proximity path
// is guaranteed to be inactive — only the explicit selection path can light
// the bus markers up.
const FAR_LAT = TARGET_STOP.lat + 0.05;  // ~5.5 km north
const FAR_LNG = TARGET_STOP.lng + 0.05;  // ~5.5 km east

const suffix = Math.random().toString(36).slice(2, 10);
const username = `sel_${suffix}`;
const password = "testpass1234";
const email = `sel_${suffix}@example.com`;
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
  console.log("=== Setup (register + fav stop 01112 + fav bus 12) ===");
  const reg = await api(null, "POST", P("/register"), { username, password, email, mobile_number: mobile });
  const token = reg.token;
  pass(`registered user ${username}`);
  await api(token, "POST", P("/favourites"), { stop_code: TARGET_STOP.stop_code });
  await api(token, "POST", P("/favourites/bus"), { stop_code: TARGET_STOP.stop_code, bus_no: "12" });
  pass("favourited stop 01112 + bus 12");

  // Confirm LTA has live data for the fav bus
  const arrivals = await api(null, "GET", P(`/stops/${TARGET_STOP.stop_code}/arrivals`));
  const svc = arrivals.services.find((s) => s.no === "12");
  if (!svc || !svc.next?.lat || !svc.next?.lng) {
    fail("LTA has no live coordinate for bus 12 — cannot test");
    process.exit(1);
  }
  pass(`LTA: bus 12 next = (${svc.next.lat.toFixed(5)}, ${svc.next.lng.toFixed(5)})`);

  console.log("\n=== Open page with FAR geolocation (~7km from fav stop) ===");
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions(FRONTEND, ["geolocation"]);
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, isMobile: true, hasTouch: true });
  await page.setGeolocation({ latitude: FAR_LAT, longitude: FAR_LNG, accuracy: 50 });
  page.on("pageerror", (e) => errors.push("PAGEERR: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      if (!/Failed to fetch arrivals|net::|AbortError|429|502|HMR|webpack-hmr|websocket/i.test(t)) {
        errors.push(t);
      }
    }
  });
  await page.evaluateOnNewDocument((t) => { try { localStorage.setItem("token", t); } catch {} }, token);
  await page.goto(FRONTEND, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector(".favorites-panel", { timeout: 15000 });
  pass("favorites panel mounted");

  console.log("\n=== Wait for initial load + arrivals poll ===");
  // On first load, the nearest fav stop's buses are surfaced. Whether the
  // marker is actually drawn depends on whether the bus is within 2 km of
  // the user (the new distance filter). Either result is acceptable here
  // — we only care that the first-load hint was attempted.
  await wait(15000);
  let count = await page.evaluate(() => document.querySelectorAll(".bus-map-marker").length);
  pass(`first-load hint attempted; ${count} marker(s) visible (depends on LTA's bus position)`);

  console.log("\n=== Click on fav stop in the panel to select it ===");
  // The "Stops" tab shows the favourited stops; clicking one sets selectedStop.
  // Switch to the Stops tab first.
  await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const stopsTab = tabs.find((t) => t.textContent.trim().startsWith("Stops"));
    if (stopsTab) stopsTab.click();
  });
  await wait(400);
  // Click the favourite-stop row for stop 01112
  const clicked = await page.evaluate((code) => {
    const rows = [...document.querySelectorAll(".favorite-row")];
    const target = rows.find((r) => r.textContent.includes(code));
    if (!target) return false;
    target.click();
    return true;
  }, TARGET_STOP.stop_code);
  if (!clicked) { fail("could not find favourite stop row to click"); process.exit(1); }
  pass("clicked favourite stop row");

  console.log("\n=== Wait for bus markers to appear (selection-triggered) ===");
  let appeared = false;
  for (let i = 0; i < 10; i++) {
    await wait(500);
    const c = await page.evaluate(() => document.querySelectorAll(".bus-map-marker").length);
    if (c > 0) { appeared = true; break; }
  }
  if (appeared) {
    const c = await page.evaluate(() => document.querySelectorAll(".bus-map-marker").length);
    pass(`bus markers appeared on selection (${c} marker(s))`);
  } else {
    fail("no bus markers after selecting stop — selection-trigger path failed");
  }

  console.log("\n=== Verify only the SELECTED stop's buses are shown ===");
  // We only fav'd bus 12 at one stop, so we expect 1-2 markers (next + subsequent).
  // If the wrong filter were used, we'd see 0 (no other fav'd buses anywhere).
  const markerCount = await page.evaluate(() => document.querySelectorAll(".bus-map-marker").length);
  if (markerCount >= 1 && markerCount <= 4) pass(`marker count in expected range (${markerCount})`);
  else fail(`unexpected marker count: ${markerCount}`);

  // Verify the marker shows the right bus number
  const markerText = await page.evaluate(() => {
    const m = document.querySelector(".bus-map-marker");
    return m ? m.textContent.trim() : "";
  });
  if (markerText === "12") pass(`marker shows bus number "${markerText}"`);
  else fail(`marker text was "${markerText}", expected "12"`);

  console.log("\n=== Close the detail view → markers should clear (back to proximity path, far) ===");
  // Click the X button in the detail view
  const closed = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Close stop detail"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!closed) { fail("could not find close-stop button"); }
  else pass("closed detail view");

  let cleared = false;
  for (let i = 0; i < 10; i++) {
    await wait(500);
    const c = await page.evaluate(() => document.querySelectorAll(".bus-map-marker").length);
    if (c === 0) { cleared = true; break; }
  }
  if (cleared) pass("markers cleared after deselect (proximity path also inactive — far location)");
  else {
    const c = await page.evaluate(() => document.querySelectorAll(".bus-map-marker").length);
    fail(`markers still present (${c}) after deselect`);
  }

  console.log("\n=== Re-select the same stop → markers reappear ===");
  await page.evaluate((code) => {
    const rows = [...document.querySelectorAll(".favorite-row")];
    const target = rows.find((r) => r.textContent.includes(code));
    if (target) target.click();
  }, TARGET_STOP.stop_code);
  let reappeared = false;
  for (let i = 0; i < 10; i++) {
    await wait(500);
    const c = await page.evaluate(() => document.querySelectorAll(".bus-map-marker").length);
    if (c > 0) { reappeared = true; break; }
  }
  if (reappeared) pass("markers reappeared on re-selection");
  else fail("markers did not reappear");

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
  console.log(`\n${exit === 0 ? "SELECTION TEST PASSED" : "SELECTION TEST FAILED"}`);
  process.exit(exit);
}
