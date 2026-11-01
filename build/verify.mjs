// 本地无头验收（VOL.09）：四枚小样逐状态、错误收集、移动端溢出
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire("D:/project/machine-skill/node_modules/");
const { chromium } = require("playwright");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shots = join(root, "shots");
await mkdir(shots, { recursive: true });
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png" };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split("?")[0]);
    const file = join(root, p === "/" ? "index.html" : p);
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;
console.log("serving", base);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));
await page.goto(base, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const font = await page.evaluate(() => document.fonts.check('16px "LXGW WenKai"'));
const imgs = await page.evaluate(() => [...document.images].map((i) => ({ src: i.getAttribute("src"), ok: i.naturalWidth > 0 })));
console.log("font:", font, "| images:", imgs.length, "| broken:", imgs.filter((i) => !i.ok).map((i) => i.src).join(",") || "none");
await page.screenshot({ path: join(shots, "00-hero.png"), clip: { x: 0, y: 0, width: 1440, height: 900 } });

async function shot(sel, name, fn) {
  const el = await page.$(sel);
  if (!el) { errors.push("missing " + sel); return; }
  await el.scrollIntoViewIfNeeded();
  if (fn) await fn();
  await page.waitForTimeout(220);
  const box = await el.boundingBox();
  await page.screenshot({ path: join(shots, name), clip: { x: Math.max(0, box.x - 6), y: Math.max(0, box.y - 6), width: Math.min(1440, box.width + 12), height: Math.min(2200, box.height + 12) } });
}
const fire = (sel, ev) => page.$eval(sel, (e, type) => e.dispatchEvent(new Event(type, { bubbles: true })), ev);
const setRange = async (sel, v) => { await page.$eval(sel, (e, val) => { e.value = val; }, String(v)); await fire(sel, "input"); };

/* D1 排版流水线：窄版心 + 混入英文 */
await shot("#d1", "01-d1-default.png");
await setRange("#d1-width", 240);
await shot("#d1", "02-d1-narrow.png", async () => {
  await page.$eval("#d1-text", (e) => { e.value = "排版引擎先量 paste measures 这一类英文词，整词不拆，所以行尾会留白。"; e.dispatchEvent(new Event("input", { bubbles: true })); });
});

/* D2 绘制合并台：合并 vs 不合并 */
await shot("#d2", "03-d2-merged.png", async () => {
  await page.$eval("#d2-text", (e) => { e.value = "mixed"; e.dispatchEvent(new Event("change", { bubbles: true })); });
});
await shot("#d2", "04-d2-unmerged.png", async () => {
  await page.$eval("#d2-merge", (e) => { e.checked = false; e.dispatchEvent(new Event("change", { bubbles: true })); });
});
await shot("#d2", "05-d2-dense.png", async () => {
  await page.$eval("#d2-merge", (e) => { e.checked = true; e.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.$eval("#d2-text", (e) => { e.value = "dense"; e.dispatchEvent(new Event("change", { bubbles: true })); });
});

/* D3 命中测试台：行索引模式 + 逐个扫描模式 + 空白吸附 */
await shot("#d3", "06-d3-binary.png", async () => {
  await page.click("#d3-mode button[data-mode=binary]");
  const box = await (await page.$("#d3-page")).boundingBox();
  await page.mouse.click(box.x + box.width * 0.55, box.y + 39); // 第二行行内偏右
});
await shot("#d3", "07-d3-scan.png", async () => {
  await page.click("#d3-mode button[data-mode=scan]");
  const box = await (await page.$("#d3-page")).boundingBox();
  await page.mouse.click(box.x + box.width * 0.9, box.y + 130); // 行尾空白 → 吸附
});

/* D4 撤销合并器：合并窗 600ms 打字 → 窗口 0 重放 */
await shot("#d4", "08-d4-typed.png", async () => {
  await page.click("#d4-type");
  await page.click("#d4-type");
});
await shot("#d4", "09-d4-undo.png", async () => {
  await page.click("#d4-undo");
});
await shot("#d4", "10-d4-zerowin.png", async () => {
  await setRange("#d4-window", 0);
  await page.click("#d4-type");
});

/* 移动端：375 宽溢出检查 */
const mp = await browser.newPage({ viewport: { width: 375, height: 720 }, deviceScaleFactor: 2 });
mp.on("pageerror", (e) => errors.push("m-pageerror: " + e.message));
await mp.goto(base, { waitUntil: "networkidle" });
await mp.evaluate(() => document.fonts.ready);
const overflow = await mp.evaluate(() => {
  const bad = [];
  const dw = document.documentElement.clientWidth;
  document.querySelectorAll("body *").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.right > dw + 1 || r.left < -1)) {
      if (el.closest(".tablewrap, .code, .ts-stage, .pt-runs, .hit-log")) return;
      const cls = (el.className && el.className.toString().slice(0, 40)) || el.tagName;
      bad.push(cls + " right=" + Math.round(r.right));
    }
  });
  return { scrollW: document.documentElement.scrollWidth, clientW: dw, bad: [...new Set(bad)].slice(0, 12) };
});
console.log("mobile overflow:", JSON.stringify(overflow, null, 1));
await mp.screenshot({ path: join(shots, "11-mobile-hero.png") });
const mDemo = await mp.$("#d1");
await mDemo.scrollIntoViewIfNeeded();
await mp.waitForTimeout(200);
await mp.screenshot({ path: join(shots, "12-mobile-d1.png") });

console.log("errors:", errors.length ? errors : "none");
await browser.close();
server.close();
