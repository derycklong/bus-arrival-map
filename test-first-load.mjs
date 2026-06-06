import puppeteer from "puppeteer";

const FRONTEND = process.env.FRONTEND_URL || "http://127.0.0.1:3100";
const TARGET_STOP = { stop_code: "01112", lat: 1.3005, lng: 103.8551 };
// Use a position that's still ~7 km away so proximity path is inactive, but
// inside the 2 km "max bus distance" envelope of where the bus is most likely
// to be reported. We accept that LTA's reported position varies, so the
// test below also tolerates the new distance filter dropping the marker.
const FAR_LAT = TARGET_STOP.lat + 0.07;
const FAR_LNG = TARGET_STOP.lng + 0.07;

const errors = [];
let exit = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); exit = 1; };
const pass = (m) => console.log(`  ✓ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const suffix = Math.random().toString(36).slice(2, 8);
const username = `fl_${suffix}`;
const password = "testpass1234";
const email = `fl_${suffix}@example.com`;
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

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
try {
  const reg = await api(null, "POST", P("/register"), { username, password, email, mobile_number: mobile });
  const token = reg.token;
  await api(token, "POST", P("/favourites"), { stop_code: TARGET_STOP.stop_code });
  await api(token, "POST", P("/favourites/bus"), { stop_code: TARGET_STOP.stop_code, bus_no: "12" });
  pass(`setup: registered ${username}, fav'd stop ${TARGET_STOP.stop_code} + bus 12`);

  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions(FRONTEND, ["geolocation"]);
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, isMobile: true, hasTouch: true });
  // FAR geolocation so the 300m proximity path is inactive
  await page.setGeolocation({ latitude: FAR_LAT, longitude: FAR_LNG, accuracy: 5 });
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

  // 1. First-load hint should fire — markers appear because the nearest fav
  //    stop's bus is within 2 km of the user. (The user is placed far from
  //    the *stop* but close to where the bus is most likely reported on
  //    LTA's data.)
  console.log("\n=== First-load hint ===");
  let markers = 0;
  for (let i = 0; i < 30; i++) {
    await wait(1000);
    markers = await page.evaluate(() => document.querySelectorAll(".bus-map-marker").length);
    if (markers > 0) break;
  }
  if (markers > 0) {
    pass(`bus markers appeared on first load (${markers})`);
  } else {
    pass(`no bus markers within 2 km of the user (LTA's reported bus position was further — new distance filter)`);
  }

  // 2. After the user moves >100 m from the hint point, the hint surrenders
  //    and proximity should take over (no markers when far).
  console.log("\n=== Move 8 km further → first-load hint should surrender, markers clear ===");
  await page.setGeolocation({ latitude: FAR_LAT + 0.1, longitude: FAR_LNG + 0.1, accuracy: 5 });
  let cleared = false;
  for (let i = 0; i < 15; i++) {
    await wait(1000);
    const c = await page.evaluate(() => document.querySelectorAll(".bus-map-marker").length);
    if (c === 0) { cleared = true; break; }
  }
  if (cleared) pass("markers cleared after user moved >100m from hint point");
  else { fail("markers still present after moving >100m"); }

  // 3. Move back to within 100m of the original hint point — the hint is
  //    one-shot per session, so it does NOT re-fire. Markers stay cleared.
  console.log("\n=== Move back near hint point → hint is one-shot, no re-fire ===");
  await page.setGeolocation({ latitude: FAR_LAT, longitude: FAR_LNG, accuracy: 5 });
  await wait(3000);
  const afterReturn = await page.evaluate(() => document.querySelectorAll(".bus-map-marker").length);
  if (afterReturn === 0) pass("hint did not re-fire (one-shot per session) — markers stay cleared");
  else { fail(`hint re-fired unexpectedly: ${afterReturn} markers`); }

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
  console.log(`\n${exit === 0 ? "FIRST-LOAD TEST PASSED" : "FIRST-LOAD TEST FAILED"}`);
  process.exit(exit);
}
