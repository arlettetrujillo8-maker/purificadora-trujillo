import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/saro_/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright",
);

const browser = await chromium.launch({ headless: true });
const results = [];
for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("http://localhost:8080/", { waitUntil: "networkidle" });
  await page.locator("#employeeLoginPin").fill("1234");
  await page.locator("#employeeLoginForm").getByRole("button", { name: "Entrar" }).click();
  await page.locator("#employeeLoginDialog").waitFor({ state: "hidden" });
  const retainedSaleQuantity = await page.evaluate(() => {
    document.querySelector('[data-view="ventas"]').click();
    const quantity = document.querySelector("#saleQty");
    quantity.value = "40";
    quantity.dispatchEvent(new Event("input", { bubbles: true }));
    const state = window.PurificadoraApp.getState();
    const profile = state.users.find((user) => user.id === state.activeUserId);
    window.PurificadoraApp.applyCentralState(state, profile);
    return Number(document.querySelector("#saleQty").value);
  });
  const roundRequirementMessage = await page.evaluate(async () => {
    const channel = document.querySelector("#saleChannel");
    channel.value = "ruta1";
    channel.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("#saleQty").value = "1";
    document.querySelector("#salePrice").value = "14";
    document.querySelector("#saleForm").requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 50));
    return document.querySelector("#toast").textContent.trim();
  });
  await page.evaluate(() => {
    const dialog = document.querySelector("#saleReturnDialog");
    document.querySelector("#returnSaleSummary").innerHTML =
      "<strong>V-000123</strong> · Cliente QA<br>Vendidos: 5 · Ya devueltos: 2 · Disponibles: <strong>3</strong>";
    document.querySelector("#returnSaleQty").value = "1";
    document.querySelector("#returnSaleAmounts").innerHTML =
      "Importe devuelto: <strong>$14.00</strong><br>Reembolso: $14.00 (efectivo) · Reversa de fiado: $0.00";
    dialog.showModal();
  });
  const metrics = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    widths: { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth },
    buttonHeights: [...document.querySelectorAll("#saleReturnDialog button")].map((button) => Math.round(button.getBoundingClientRect().height)),
    dialogVisible: document.querySelector("#saleReturnDialog").open,
    duplicateIds: [...document.querySelectorAll("[id]")]
      .map((element) => element.id)
      .filter((id, index, ids) => ids.indexOf(id) !== index),
    overflowing: [...document.querySelectorAll("body *")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.right > document.documentElement.clientWidth + 1 || box.left < -1;
      })
      .slice(0, 12)
      .map((element) => `${element.tagName.toLowerCase()}#${element.id}.${element.className}`),
    rightOverflowing: [...document.querySelectorAll("body *")]
      .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 12)
      .map((element) => `${element.tagName.toLowerCase()}#${element.id}.${element.className}`),
  }));
  metrics.retainedSaleQuantity = retainedSaleQuantity;
  metrics.roundRequirementMessage = roundRequirementMessage;
  await page.screenshot({ path: `outputs/v302-return-${viewport.name}.png`, fullPage: true });
  results.push({ viewport, metrics, consoleErrors });
  await context.close();
}
await browser.close();
await writeFile("outputs/v302-browser-qa.json", JSON.stringify(results, null, 2), "utf8");
console.log(JSON.stringify(results, null, 2));
