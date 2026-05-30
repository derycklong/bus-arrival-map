import puppeteer from "puppeteer";
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

// iPhone 14 Pro Max viewport
await page.setViewport({ width: 430, height: 932, isMobile: true, hasTouch: true });

const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto("http://localhost:3000", { waitUntil: "networkidle0", timeout: 15000 });
await page.waitForSelector("form", { timeout: 5000 });

console.log("Mobile: Page loaded with form");

const submitBtn = await page.$('button[type="submit"]');
console.log("Mobile: Submit button text:", await page.evaluate(el => el.textContent, submitBtn));

// Check button visibility and position
const btnBox = await submitBtn.boundingBox();
console.log("Mobile: Button position:", JSON.stringify(btnBox));

// Fill fields  
await page.type('input[placeholder="Username"]', "testuser2");
await page.type('input[placeholder="Password"]', "test1234");

// Click using tap (touch)
await page.tap('button[type="submit"]');
await new Promise(r => setTimeout(r, 3000));

const bodyText = await page.evaluate(() => document.body.textContent);
const isMap = bodyText.includes("Logout");
console.log("Mobile: Transitioned to map view:", isMap);
console.log("Mobile: Errors:", JSON.stringify(errors));

await browser.close();
