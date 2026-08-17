const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = "http://localhost:8080/?qa=auth-simplified";
const root = path.resolve(__dirname, "..");

async function openPage(browser, viewport, withoutNativeUuid = false) {
  const context = await browser.newContext({ viewport });
  if (withoutNativeUuid) {
    await context.addInitScript(() => {
      Object.defineProperty(Crypto.prototype, "randomUUID", {
        configurable: true,
        value: undefined,
      });
    });
  }
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#accessChoiceDialog[open]");
  return { context, page, runtimeErrors };
}

(async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const mobile = await openPage(browser, { width: 390, height: 844 }, true);
    assert.equal(
      await mobile.page.locator('meta[name="app-build"]').getAttribute("content"),
      "20260817-caja-automatica",
    );
    assert.match(
      await mobile.page.evaluate(() => window.PurificadoraCrypto.safeRandomUUID()),
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    await mobile.page.waitForFunction(
      () => !document.getElementById("v3OpenAuthBtn")?.disabled,
    );
    await mobile.page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("purificadora:central-access", {
          detail: { ready: true, profileId: "usr_admin", role: "administrador" },
        }),
      );
      document.getElementById("enterAsAdminBtn").click();
    });
    await mobile.page.waitForSelector("#view-usuarios.active");
    assert.equal(await mobile.page.locator("body.admin-mode").count(), 1);
    assert.equal(await mobile.page.locator("#adminLoginDialog[open]").count(), 0);
    assert.equal(
      await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    assert.equal(mobile.runtimeErrors.some((message) => /randomUUID/.test(message)), false);
    await mobile.page.screenshot({
      path: path.join(root, "outputs", "qa-auth-mobile-390x844.png"),
      fullPage: false,
    });
    await mobile.context.close();

    for (const viewport of [
      { width: 360, height: 800 },
      { width: 1440, height: 900 },
    ]) {
      const check = await openPage(browser, viewport);
      assert.equal(
        await check.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      assert.deepEqual(check.runtimeErrors, []);
      await check.context.close();
    }

    console.log("mobile-auth-qa: 390x844, 360x800 y 1440x900 PASS");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
