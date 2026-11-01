// 拼接单文件站点：head + style + hero + 七章 + 结语(footer 内) + demos.js
// 用法：node build/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const style = read("build/style.css");
const hero = read("build/hero.html");
const chapters = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7"]
  .map((n) => read(`build/${n}.html`)).join("\n");
const footer = read("build/footer.html");
const js = read("build/demos.js");

const head = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<meta name="theme-color" content="#efeade"/>
<link rel="preload" href="assets/fonts/wenkai-regular.woff2" as="font" type="font/woff2" crossorigin/>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' fill='%23efeade'/%3E%3Crect x='3' y='4' width='18' height='16' rx='1' fill='none' stroke='%232d5a87' stroke-width='1.4'/%3E%3Cpath d='M10 12.2h7.2M10 15.4h4.6' stroke='%23b8402e' stroke-width='1.4' stroke-linecap='round'/%3E%3Crect x='10' y='11' width='1.6' height='5.6' fill='%23b8402e' opacity='.25'/%3E%3C/svg%3E"/>
<meta name="description" content="从一条招聘要求出发：有画布、白板、流程图、节点工作流、编辑器的实际经验。这篇拿一个真实的 canvas 富文本编辑器当标本，把一个字符从字符串走到像素的六层旅程逐层拆开——测量、断行、合并绘制、光标、命中、撤销与自动保存，附四枚确定性小样。"/>
<meta name="author" content="StarrySea1412"/>
<meta property="og:title" content="把文字画成像素 · 造物手记 VOL.09"/>
<meta property="og:description" content="可视化编辑器为什么不能用 contenteditable 写完：一次字符测量的旅行，和光标、命中、撤销、自动保存的真实代价。"/>
<meta property="og:type" content="article"/>
<meta property="og:image" content="assets/art/hero.webp"/>
<title>把文字画成像素 · 造物手记 VOL.09</title>
<style>
${style}
</style>
</head>
<body>
<div class="progress" id="progress"></div>
`;
const tail = `
<script>
${js}
</script>
</body>
</html>
`;

const html = head + hero + "\n<main>\n" + chapters + "\n" + footer + "\n</main>\n" + tail;
writeFileSync(join(root, "index.html"), html, "utf8");
console.log(`built index.html  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
