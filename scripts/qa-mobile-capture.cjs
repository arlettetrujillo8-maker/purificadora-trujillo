// Navegador aislado: nunca carga Supabase, nunca envia operaciones.
// PLAYWRIGHT_PATH permite usar un runtime ya instalado sin instalar paquetes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const base = process.env.QA_URL || "http://127.0.0.1:8092/";
const root = path.resolve(__dirname, "..");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  });
  const results = [];
  try {
    for (const [width, height, overlay] of [
      [320, 568, false], [360, 800, false], [390, 844, false],
      [360, 400, false], [390, 400, false], [430, 350, false],
      [390, 844, true], [1440, 900, false],
    ]) {
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
      await context.route("**/*", (route) => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== new URL(base).origin || request.method() !== "GET") return route.abort();
        // El resto del HTML/CSS/JS es el real servido desde el proyecto.
        if (url.pathname.endsWith("/v3/bootstrap.js"))
          return route.fulfill({ contentType: "application/javascript", body: "" });
        return route.continue();
      });
      if (overlay) await context.addInitScript(() => {
        const viewport = new EventTarget();
        Object.assign(viewport, { height: 400, offsetTop: 35 });
        Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
      });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(base, { waitUntil: "networkidle" });
      // Presentacion aislada, sin iniciar sesion ni enviar ventas/pagos.
      await page.evaluate(() => {
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
        document.querySelector("#view-ventas").classList.add("active");
        document.querySelector("#saleQty").value = "2";
        document.querySelector("#salePrice").value = "14";
        document.querySelector("#saleQtyPlus").click();
        document.querySelector("#saleQty").focus();
      });
      await page.waitForTimeout(400);
      const sale = await page.evaluate(() => {
        const qty = document.querySelector("#saleQty"), bar = document.querySelector(".sale-checkout");
        return { quantity: qty.value, total: document.querySelector("#saleTotal").value,
          fieldBottom: qty.getBoundingClientRect().bottom, barTop: bar.getBoundingClientRect().top,
          barBottom: bar.getBoundingClientRect().bottom,
          visibleBottom: visualViewport.offsetTop + visualViewport.height,
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.equal(sale.quantity, "3");
      assert.match(sale.total, /42/);
      assert.equal(sale.overflow, false);
      if (width <= 850) {
        assert(sale.fieldBottom <= sale.barTop, JSON.stringify(sale));
        assert(sale.barBottom <= sale.visibleBottom, JSON.stringify(sale));
      }
      await page.evaluate(() => {
        document.querySelector("#paymentClientSummary").textContent = "Cliente de prueba · Saldo $120.00";
        document.querySelector("#paymentDialog").showModal();
        document.querySelector("#paymentAmount").value = "30.50";
        document.querySelector("#paymentAmount").focus();
      });
      await page.waitForTimeout(400);
      const payment = await page.evaluate(() => {
        const f = document.querySelector("#paymentAmount"), b = document.querySelector(".payment-footer button");
        return { fieldTop: f.getBoundingClientRect().top, fieldBottom: f.getBoundingClientRect().bottom,
          actionTop: b.getBoundingClientRect().top, actionBottom: b.getBoundingClientRect().bottom,
          visibleTop: visualViewport.offsetTop, visibleBottom: visualViewport.offsetTop + visualViewport.height,
          valid: f.checkValidity(), overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert(payment.valid);
      assert(!payment.overflow);
      assert(payment.fieldTop >= payment.visibleTop);
      assert(payment.fieldBottom <= payment.actionTop);
      assert(payment.actionBottom <= payment.visibleBottom, JSON.stringify(payment));
      if (width === 390 && height === 400)
        await page.screenshot({ path: path.join(root, "outputs/mobile-capture-payment.png") });
      await page.evaluate(() => {
        document.querySelector(".payment-notes").open = true;
        document.querySelector("#paymentNotes").focus();
      });
      await page.waitForTimeout(400);
      const notesVisible = await page.evaluate(() =>
        document.querySelector("#paymentNotes").getBoundingClientRect().bottom <=
        document.querySelector(".payment-footer").getBoundingClientRect().top);
      assert(notesVisible);
      assert.deepEqual(errors, []);
      results.push({ width, height, overlay, sale, payment, notesVisible, errors });
      await context.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(root, "outputs/mobile-capture-qa.json"), JSON.stringify(results, null, 2));
  console.log(`mobile-capture: ${results.length} escenarios PASS (teclado simulado, backend bloqueado)`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
