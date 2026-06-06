import puppeteer from "puppeteer";

const FRONTEND = process.env.FRONTEND_URL || "http://127.0.0.1:3100";
const errors = [];
let exit = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); exit = 1; };
const pass = (m) => console.log(`  ✓ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const suffix = Math.random().toString(36).slice(2, 10);
const username = `e2e_${suffix}`;
const password = "testpass1234";
const email = `e2e_${suffix}@example.com`;
const mobile = "9" + Math.floor(1000000 + Math.random() * 9000000).toString();

async function findByText(page, text) {
  return page.evaluate((t) => {
    const els = [...document.querySelectorAll("button, a, [role=tab]")];
    return els.find((e) => e.textContent.trim() === t) || null;
  }, text);
}

async function findInputByPlaceholder(page, ph) {
  return page.evaluate((p) => {
    return document.querySelector(`input[placeholder="${p}"]`) !== null;
  }, ph);
}

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, isMobile: true, hasTouch: true });
  page.on("pageerror", (e) => errors.push("PAGEERR: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      if (!/Failed to fetch arrivals|net::|AbortError|429|502|HMR|webpack-hmr|websocket/i.test(t)) {
        errors.push(t);
      }
    }
  });

  console.log("=== Load app ===");
  await page.goto(FRONTEND, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector("form", { timeout: 15000 });
  pass("auth form rendered");

  console.log("\n=== Switch to register ===");
  await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const reg = tabs.find((b) => b.textContent.trim() === "Register");
    if (!reg) throw new Error("Register tab not found");
    reg.click();
  });
  await wait(400);
  pass("switched to register mode");

  console.log("\n=== Fill registration form ===");
  // The current auth-form placeholders are:
  //   "Enter your username", "Enter your password", "you@example.com", "91234567"
  await page.type('input[placeholder="Enter your username"]', username);
  await page.type('input[placeholder="Enter your password"]', password);
  await page.type('input[placeholder="you@example.com"]', email);
  await page.type('input[placeholder="91234567"]', mobile);
  pass("filled all fields");

  console.log("\n=== Submit registration ===");
  await page.tap('button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector(".auth-screen"), { timeout: 15000 });
  pass("auth screen cleared (entered map view)");

  await page.waitForSelector(".map-canvas, .leaflet-container", { timeout: 15000 });
  pass("map rendered");

  await wait(2000);
  const hasLogout = await page.evaluate(() => document.body.textContent.includes("Log out"));
  if (hasLogout) pass("logout button visible");
  else fail("logout button missing");

  console.log("\n=== FavoritesPanel rendered (no ReferenceError) ===");
  // The original failures were handleTouchStart/handleRefresh/handleRowClick/etc
  // — verify the panel actually mounted, which means all the defs were restored.
  const panelOk = await page.evaluate(() => !!document.querySelector(".favorites-panel"));
  if (panelOk) pass("favorites panel mounted");
  else fail("favorites panel missing — likely another ReferenceError");

  console.log("\n=== JS errors during flow ===");
  if (errors.length === 0) pass("no unexpected JS errors");
  else { fail("errors:"); errors.forEach((e) => console.error("    " + e)); }

  console.log("\n=== Logout + re-login round trip ===");
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Log out");
    if (!b) throw new Error("logout not found");
    b.click();
  });
  await page.waitForSelector("form", { timeout: 15000 });
  await page.type('input[placeholder="Enter your username"]', username);
  await page.type('input[placeholder="Enter your password"]', password);
  await page.tap('button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector(".auth-screen"), { timeout: 15000 });
  pass("re-logged in successfully");
  await wait(1500);
  const errs2 = errors.filter((e) => !/HMR|webpack-hmr|websocket/i.test(e));
  if (errs2.length === 0) pass("no JS errors after re-login");
  else { fail("errors after re-login:"); errs2.forEach((e) => console.error("    " + e)); }
} catch (e) {
  fail(`fatal: ${e.message}`);
  exit = 1;
} finally {
  await browser.close();
  console.log(`\n${exit === 0 ? "ALL CHECKS PASSED" : "E2E FAILED"}`);
  process.exit(exit);
}
