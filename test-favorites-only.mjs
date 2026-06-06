import puppeteer from "puppeteer";

const FRONTEND = process.env.FRONTEND_URL || "http://127.0.0.1:3100";
const TARGET_STOP = { stop_code: "01112", lat: 1.3005, lng: 103.8551 };
const errors = [];
let exit = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); exit = 1; };
const pass = (m) => console.log(`  ✓ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const suffix = Math.random().toString(36).slice(2, 8);
const username = `fav_${suffix}`;
const password = "testpass1234";
const email = `fav_${suffix}@example.com`;
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
  // Register + fav one stop
  const reg = await api(null, "POST", P("/register"), { username, password, email, mobile_number: mobile });
  const token = reg.token;
  await api(token, "POST", P("/favourites"), { stop_code: TARGET_STOP.stop_code });
  pass(`setup: registered ${username}, fav'd stop ${TARGET_STOP.stop_code}`);

  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions(FRONTEND, ["geolocation"]);
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, isMobile: true, hasTouch: true });
  await page.setGeolocation({ latitude: TARGET_STOP.lat, longitude: TARGET_STOP.lng, accuracy: 5 });
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

  // Wait for stops to load around the user
  console.log("\n=== Wait for stops to load ===");
  let totalStops = 0;
  for (let i = 0; i < 30; i++) {
    await wait(1000);
    totalStops = await page.evaluate(() => document.querySelectorAll(".stop-marker").length);
    if (totalStops > 0) break;
  }
  if (totalStops === 0) { fail("no stops loaded after 30s"); process.exit(1); }
  pass(`loaded ${totalStops} stop markers around user`);

  // Find the toggle button
  const toggleBtn = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Show favourites only"], button[aria-label="Show all bus stops"]');
    return btn ? btn.getAttribute("aria-label") : null;
  });
  if (!toggleBtn) { fail("toggle button not found"); process.exit(1); }
  pass(`toggle button found (initial label: "${toggleBtn}")`);

  // Click toggle ON
  console.log("\n=== Click toggle ON ===");
  await page.click('button[aria-label="Show favourites only"]');
  await wait(500);
  const afterOn = await page.evaluate(() => ({
    ariaLabel: document.querySelector('button[aria-pressed="true"]')?.getAttribute("aria-label"),
    count: document.querySelectorAll(".stop-marker").length,
    pressed: !!document.querySelector('button[aria-pressed="true"]'),
    stored: localStorage.getItem("onlyShowFavorites"),
  }));
  if (afterOn.pressed) pass("toggle is now pressed (aria-pressed=true)");
  else fail("toggle is not pressed after click");
  if (afterOn.stored === "1") pass("localStorage persists onlyShowFavorites=1");
  else fail(`localStorage persisted value: ${afterOn.stored}`);
  if (afterOn.count < totalStops) pass(`stop count reduced: ${totalStops} -> ${afterOn.count}`);
  else fail(`stop count not reduced: ${totalStops} -> ${afterOn.count}`);

  // Verify ONLY fav stops (1, with 2 layers of marker for isSelected=false) remain
  // In our test, there's only 1 fav stop and 0 selected, so we expect 1 marker.
  if (afterOn.count === 1) pass("exactly 1 marker shown (the single fav stop)");
  else fail(`expected 1 marker, got ${afterOn.count}`);

  // Click toggle OFF
  console.log("\n=== Click toggle OFF ===");
  await page.click('button[aria-label="Show all bus stops"]');
  await wait(500);
  const afterOff = await page.evaluate(() => ({
    pressed: !!document.querySelector('button[aria-pressed="true"]'),
    count: document.querySelectorAll(".stop-marker").length,
    stored: localStorage.getItem("onlyShowFavorites"),
  }));
  if (!afterOff.pressed) pass("toggle is no longer pressed");
  else fail("toggle still pressed after second click");
  if (afterOff.stored === "0") pass("localStorage now 0");
  else fail(`localStorage persisted value: ${afterOff.stored}`);
  if (afterOff.count >= totalStops) pass(`stops restored: ${afterOff.count} (was ${totalStops})`);
  else fail(`stops not restored: ${afterOff.count} (expected ~${totalStops})`);

  // Persistence: reload the page with toggle ON, expect only fav stops
  console.log("\n=== Reload with toggle ON (persistence) ===");
  await page.click('button[aria-label="Show favourites only"]');
  await wait(500);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".favorites-panel", { timeout: 15000 });
  await wait(3000);
  const afterReload = await page.evaluate(() => ({
    pressed: !!document.querySelector('button[aria-pressed="true"]'),
    count: document.querySelectorAll(".stop-marker").length,
    stored: localStorage.getItem("onlyShowFavorites"),
  }));
  if (afterReload.pressed) pass("toggle persisted as ON after reload");
  else fail("toggle not persisted after reload");
  if (afterReload.count === 1) pass(`reload shows only 1 marker (fav only)`);
  else fail(`reload marker count: ${afterReload.count}`);

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
  console.log(`\n${exit === 0 ? "FAVOURITES-ONLY TOGGLE TEST PASSED" : "FAVOURITES-ONLY TOGGLE TEST FAILED"}`);
  process.exit(exit);
}
