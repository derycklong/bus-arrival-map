// End-to-end smoke test using Puppeteer.
//
// Assumes:
//   - backend on 127.0.0.1:8000
//   - Next.js dev on http://127.0.0.1:3100 (set FRONTEND_URL to override)
//
// Asserts:
//   1. App loads and shows auth form
//   2. Register flow: switches to register tab, fills fields, submits, reaches map
//   3. Map renders Leaflet tiles
//   4. Theme toggle works
//   5. Logout returns to auth form
//   6. Login with newly-created credentials works
//   7. No uncaught JS errors during the flow

import puppeteer from "puppeteer";

const FRONTEND = process.env.FRONTEND_URL || "http://127.0.0.1:3100";
const errors = [];
let exitCode = 0;

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  exitCode = 1;
}
function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

const suffix = Math.random().toString(36).slice(2, 10);
const username = `e2e_${suffix}`;
const password = "testpass1234";
const email = `e2e_${suffix}@example.com`;
const mobile = "9" + Math.floor(1000000 + Math.random() * 9000000).toString();

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safe(fn, label) {
  try {
    return await fn();
  } catch (e) {
    fail(`${label}: ${e.message}`);
    throw e;
  }
}

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, isMobile: true, hasTouch: true });

  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      // Ignore expected fetch errors when LTA upstream is flaky
      if (!/Failed to fetch arrivals|net::|AbortError|429|502/.test(t)) {
        errors.push(t);
      }
    }
  });

  console.log("\n=== Load app ===");
  await safe(() => page.goto(FRONTEND, { waitUntil: "domcontentloaded", timeout: 15000 }), "goto");
  await safe(() => page.waitForSelector("form", { timeout: 10000 }), "wait for form");
  pass("auth form rendered");

  // Switch to register tab
  console.log("\n=== Switch to register ===");
  await safe(
    () => page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const reg = btns.find((b) => b.textContent.trim() === "Register");
      if (!reg) throw new Error("Register button not found");
      reg.click();
    }),
    "click register tab",
  );
  await wait(300);
  pass("switched to register mode");

  // Fill in fields
  console.log("\n=== Fill registration form ===");
  await safe(() => page.type('input[placeholder="Username"]', username), "type username");
  await safe(() => page.type('input[placeholder="Password"]', password), "type password");
  await safe(() => page.type('input[placeholder="Email"]', email), "type email");
  await safe(
    () => page.type('input[placeholder="Mobile number (e.g. 91234567)"]', mobile),
    "type mobile",
  );
  pass("filled all fields");

  // Submit
  console.log("\n=== Submit registration ===");
  await safe(() => page.tap('button[type="submit"]'), "submit");
  // Wait for the auth screen to disappear
  await safe(
    () => page.waitForFunction(() => !document.querySelector(".auth-screen"), { timeout: 10000 }),
    "wait for auth to clear",
  );
  pass("auth screen cleared");

  // Verify map and topbar
  await safe(
    () => page.waitForSelector(".map-canvas, .leaflet-container", { timeout: 10000 }),
    "wait for map",
  );
  pass("map rendered");

  // Check that 'Log out' button is visible
  const hasLogout = await safe(
    () => page.evaluate(() => document.body.textContent.includes("Log out")),
    "check logout button",
  );
  if (hasLogout) pass("logout button visible (we are on map view)");
  else fail("logout button missing on map view");

  // Wait a bit for the favourites polling to start
  await wait(1500);

  // Theme toggle
  console.log("\n=== Theme toggle ===");
  const themeBefore = await safe(
    () => page.evaluate(() => document.documentElement.getAttribute("data-theme") || "light"),
    "get theme",
  );
  await safe(
    () => page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Toggle dark/light mode"]');
      if (!btn) throw new Error("theme toggle not found");
      btn.click();
    }),
    "click theme toggle",
  );
  await wait(200);
  const themeAfter = await safe(
    () => page.evaluate(() => document.documentElement.getAttribute("data-theme") || "light"),
    "get theme after toggle",
  );
  if (themeBefore !== themeAfter) pass(`theme toggled: ${themeBefore} -> ${themeAfter}`);
  else fail(`theme did not change (still ${themeBefore})`);

  // Logout
  console.log("\n=== Logout ===");
  await safe(
    () => page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Log out");
      if (!btn) throw new Error("logout button not found");
      btn.click();
    }),
    "click logout",
  );
  await safe(
    () => page.waitForSelector("form", { timeout: 10000 }),
    "wait for auth form again",
  );
  pass("returned to auth form");

  // Re-login
  console.log("\n=== Re-login ===");
  await safe(() => page.type('input[placeholder="Username"]', username), "type username");
  await safe(() => page.type('input[placeholder="Password"]', password), "type password");
  await safe(() => page.tap('button[type="submit"]'), "submit login");
  await safe(
    () => page.waitForFunction(() => !document.querySelector(".auth-screen"), { timeout: 10000 }),
    "wait for auth to clear",
  );
  pass("re-logged in successfully");

  // Verify no JS errors
  console.log("\n=== JS errors ===");
  if (errors.length === 0) {
    pass("no unexpected JS errors");
  } else {
    fail(`unexpected JS errors: ${JSON.stringify(errors, null, 2)}`);
  }
} catch (e) {
  fail(`fatal: ${e.message}`);
  exitCode = 1;
} finally {
  await browser.close();
  console.log(`\n${exitCode === 0 ? "ALL E2E CHECKS PASSED" : "E2E FAILED"}`);
  process.exit(exitCode);
}
