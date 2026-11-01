/* 四枚确定性小样 + 阅读进度条（VOL.09 · 零依赖，全部原生 DOM，无随机数）。 */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const prog = $("#progress");
  if (prog) {
    const paint = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      prog.style.transform = "scaleX(" + (max > 0 ? h.scrollTop / max : 0) + ")";
    };
    addEventListener("scroll", paint, { passive: true });
    addEventListener("resize", paint, { passive: true });
    paint();
  }

  /* 确定性字宽模型：全角＝1.0×字号，半角＝0.55×字号。
     与真实 measureText 的量级关系一致；小样追求可复现，不追求字体度量的绝对精确。 */
  const isWide = (ch) => /[\u2E80-\u9FFF\uF900-\uFAFF\uFF01-\uFF60\u3000-\u303F\u201C\u201D\u2018\u2019\u2014\u2026]/.test(ch);
  const charW = (ch, fs) => (isWide(ch) ? fs : fs * 0.55);

  /* ══ DEMO 01 · 排版流水线（逐字测量 + 贪心断行）══ */
  (() => {
    const linesEl = $("#d1-lines"), ruler = $("#d1-ruler");
    if (!linesEl) return;
    const textIn = $("#d1-text"), widthIn = $("#d1-width"), fsIn = $("#d1-fs-in");
    const R = { len: $("#d1-len"), w: $("#d1-w"), fs: $("#d1-fs"), n: $("#d1-n"), rows: $("#d1-rows"), measure: $("#d1-measure"), fill: $("#d1-fill"), naive: $("#d1-naive") };
    const seen = new Map(); // 字符+字号 → 已量过（模拟 cacheMeasureText 的键）

    function render() {
      const text = textIn.value;
      const W = +widthIn.value, fs = +fsIn.value;
      const chars = [...text];
      let measured = 0, fresh = 0;

      linesEl.innerHTML = ""; ruler.innerHTML = "";
      linesEl.style.width = W + "px"; ruler.style.width = W + "px";
      R.w.textContent = W; R.fs.textContent = fs; R.len.textContent = chars.length + " 字";

      for (let x = 0; x <= W; x += 50) {
        const t = document.createElement("i");
        if (x % 100 === 0) { t.className = "major"; t.textContent = x; t.style.left = x + "px"; }
        else { t.style.left = x + "px"; }
        ruler.appendChild(t);
      }

      const rows = [[]];
      let x = 0;
      for (const ch of chars) {
        measured++;
        const key = ch + "@" + fs;
        if (!seen.has(key)) { seen.set(key, 1); fresh++; }
        const w = charW(ch, fs);
        if (x + w > W && x > 0) { rows.push([]); x = 0; rows[rows.length - 1].wrapped = true; }
        rows[rows.length - 1].push({ ch, w });
        x += w;
      }

      rows.forEach((row, ri) => {
        const line = document.createElement("div");
        line.className = "ts-line";
        line.innerHTML = '<span class="ln">' + String(ri + 1).padStart(2, "0") + "</span>";
        let used = 0;
        row.forEach((c, ci) => {
          const s = document.createElement("span");
          s.className = "ts-char" + (ci === 0 && ri > 0 ? " wrapstart" : "");
          s.style.width = c.w + "px";
          s.textContent = c.ch;
          s.title = "「" + c.ch + "」 " + c.w.toFixed(1) + "px";
          line.appendChild(s);
          used += c.w;
        });
        const rest = W - used;
        if (rest > 0.5) {
          const f = document.createElement("span");
          f.className = "ts-char ts-rest";
          f.style.width = rest + "px";
          f.title = "行尾剩余 " + rest.toFixed(0) + "px";
          line.appendChild(f);
        }
        linesEl.appendChild(line);
      });

      const g = document.createElement("div");
      g.className = "ts-guide"; g.style.right = "0";
      linesEl.appendChild(g);

      const total = chars.reduce((a, ch) => a + charW(ch, fs), 0);
      const naiveRows = Math.max(1, Math.ceil(total / W));
      const lastUsed = rows.length ? rows[rows.length - 1].reduce((a, c) => a + c.w, 0) : 0;
      R.n.textContent = chars.length;
      R.rows.textContent = rows.length;
      R.measure.innerHTML = measured + "<small>次</small>";
      R.measure.title = "本次排版逐字量宽 " + measured + " 次；其中 " + (measured - fresh) + " 次可被缓存命中";
      R.fill.innerHTML = Math.round((lastUsed / W) * 100) + "<small>%</small>";
      R.naive.textContent = "若按「每个字都是全角」估算：" + naiveRows + " 行；逐字测量后实际 " + rows.length + " 行。" +
        (naiveRows === rows.length ? "这次估算侥幸对了——因为样本几乎全是全角。" : "差 " + Math.abs(naiveRows - rows.length) + " 行。混进一个半角字符，估算就开始撒谎。");
    }

    textIn.addEventListener("input", render);
    widthIn.addEventListener("input", render);
    fsIn.addEventListener("input", render);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
    render();
  })();

  /* ══ DEMO 02 · 绘制合并台（真实 canvas + fillText 批次统计）══ */
  (() => {
    const cv = $("#d2-canvas");
    if (!cv) return;
    const sel = $("#d2-text"), fsIn = $("#d2-fs-in"), mergeIn = $("#d2-merge");
    const R = { calls: $("#d2-calls"), naive: $("#d2-naive"), now: $("#d2-now"), batch: $("#d2-batch"), avg: $("#d2-avg"), sw: $("#d2-sw"), cl: $("#d2-cl"), note: $("#d2-note"), runs: $("#d2-runs"), bar1: $("#d2-bar1"), bar2: $("#d2-bar2"), plen: $("#d2-plen") };

    const PLAIN = "把文字画成像素是一次造物：排版引擎先量每一个字，再决定往哪折行；绘制引擎把同一款式的连续字符合并成一次调用，把像素按批次交给图形层，一万次调用变成几十次。";
    const MIXED = [
      ["从 string 到像素，", "n"],
      ["中间隔着一台排版机：", "b"],
      ["measureText 量宽、", "r"],
      ["computeRowList 折行、", "b"],
      ["fillText 落墨。", "r"],
      ["样式每变一次，批次就断一次。", "n"]
    ];

    function buildChars() {
      const fs = +fsIn.value;
      const out = [];
      const push = (str, style) => { for (const ch of str) out.push({ ch, style }); };
      if (sel.value === "mixed") MIXED.forEach(([s, st]) => push(s, st));
      else {
        push(PLAIN, "n");
        if (sel.value === "dense") out.forEach((c, i) => { c.style = ["n", "b", "r"][Math.floor(i / 3) % 3]; });
      }
      out.forEach(c => { c.w = charW(c.ch, fs); });
      return { chars: out, fs };
    }

    function render() {
      const { chars, fs } = buildChars();
      R.plen.textContent = chars.length + " 字";
      const CW = 480, PAD = 10, avail = CW - PAD * 2;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = CW * dpr; cv.height = 150 * dpr;
      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#fbf8ee"; ctx.fillRect(0, 0, CW, 150);
      ctx.strokeStyle = "rgba(45,90,135,.14)"; ctx.lineWidth = 1;
      for (let y = 0; y <= 150; y += 25) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(CW, y + .5); ctx.stroke(); }

      const rows = [[]]; let x = PAD, y = 22;
      for (const c of chars) {
        if (x + c.w > PAD + avail && x > PAD) { rows.push([]); x = PAD; y += fs * 1.7; }
        if (y > 142) break;
        c.x = x; c.y = y; rows[rows.length - 1].push(c); x += c.w;
      }
      const placed = rows.flat();

      const merged = mergeIn.checked;
      const runs = [];
      for (const c of placed) {
        const last = runs[runs.length - 1];
        if (merged && last && last.style === c.style && last.y === c.y) { last.text += c.ch; last.w += c.w; }
        else runs.push({ text: c.ch, style: c.style, w: c.w, x: c.x, y: c.y });
      }

      const STYLE = {
        n: { font: fs + 'px "LXGW WenKai", sans-serif', color: "#24251f" },
        b: { font: "bold " + fs + 'px "LXGW WenKai", sans-serif', color: "#2d5a87" },
        r: { font: fs + 'px "LXGW WenKai", sans-serif', color: "#b8402e" }
      };
      let fontSw = 0, colorSw = 0, pf = null, pc = null;
      for (const r of runs) {
        const st = STYLE[r.style];
        if (st.font !== pf) { fontSw++; pf = st.font; }
        if (st.color !== pc) { colorSw++; pc = st.color; }
        ctx.font = st.font; ctx.fillStyle = st.color;
        ctx.fillText(r.text, r.x, r.y);
      }

R.runs.innerHTML = "";
      runs.slice(0, 24).forEach((r, i) => {
        const chip = document.createElement("span");
        chip.className = "pt-run " + (merged ? "merged" : "one");
        chip.textContent = (merged ? r.text : "「" + r.text + "」") + " · " + (merged ? r.text.length : 1) + "字";
        chip.title = "第 " + (i + 1) + " 次调用：" + r.text;
        R.runs.appendChild(chip);
      });
      if (runs.length > 24) {
        const more = document.createElement("span");
        more.className = "pt-run"; more.textContent = "…" + (runs.length - 24) + " 批";
        R.runs.appendChild(more);
      }

      const naive = placed.length, now = runs.length;
      R.calls.textContent = now;
      R.naive.textContent = naive; R.now.textContent = now;
      R.batch.textContent = now; R.avg.textContent = (placed.length / now).toFixed(1);
      R.sw.textContent = merged ? fontSw : placed.length;
      R.cl.textContent = merged ? colorSw : placed.length;
      const mx = Math.max(naive, now, 1);
      R.bar1.style.width = (naive / mx * 100) + "%";
      R.bar2.style.width = (now / mx * 100) + "%";
      R.note.textContent = merged
        ? "合并开启：批次按「font + color 双键 + 连续」切分，本段收口 " + now + " 次。"
        : "合并关闭：每个字符一次调用，共 " + now + " 次——RenderMode.COMPATIBILITY 就是这个行为。";
    }

    sel.addEventListener("change", render);
    fsIn.addEventListener("input", render);
    mergeIn.addEventListener("change", render);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
    render();
  })();

  /* ══ DEMO 03 · 命中测试台（实测坐标表 + 两种算法）══ */
  (() => {
    const page = $("#d3-page");
    if (!page) return;
    const logEl = $("#d3-log"), idxEl = $("#d3-index"), grid = $("#d3-grid"), modeEl = $("#d3-mode");
    let cross = null;
    const SAMPLE = ["命中测试是坐标表的逆向工程：", "鼠标落点要换算回字符下标，", "行尾的空白要吸附到行末，", "写错一个边界条件，手感就毁。"];
    let positions = [];
    let mode = "scan";

    function build() {
      page.innerHTML = '<div class="hit-cross" id="d3-cross" style="display:none"></div>';
      SAMPLE.forEach((text, r) => {
        const line = document.createElement("div");
        line.className = "hit-line";
        line.style.width = "fit-content";
        line.dataset.row = String(r);
        for (const ch of text) {
          const s = document.createElement("span");
          s.className = "hit-cell"; s.textContent = ch;
          line.appendChild(s);
        }
        page.appendChild(line);
      });
      const pr = page.getBoundingClientRect();
      positions = $$(".hit-cell", page).map((el, i) => {
        const r = el.getBoundingClientRect();
        const row = +el.closest(".hit-line").dataset.row;
        el.dataset.i = String(i);
        return { i, el, left: r.left - pr.left, right: r.right - pr.left, top: r.top - pr.top, bottom: r.bottom - pr.top, row, ch: el.textContent };
      });
      cross = page.querySelector("#d3-cross");
    }

    function clear() {
      positions.forEach(p => p.el.classList.remove("scanned", "hit", "miss"));
      if (cross) cross.style.display = "none";
      page.querySelectorAll(".hit-cursor").forEach(e => e.remove());
    }

    function placeCaret(x, y) {
      const c = document.createElement("div");
      c.className = "hit-cursor";
      c.style.left = x + "px"; c.style.top = y + "px"; c.style.height = "22px";
      page.appendChild(c);
    }

    function rowsOf() {
      const rows = [];
      positions.forEach(p => { (rows[p.row] = rows[p.row] || []).push(p); });
      return rows.filter(Boolean);
    }

    function snapEnd(y) {
      const rows = rowsOf();
      let best = null, bd = 1e9;
      rows.forEach(row => {
        const t = row[0].top, b = row[0].bottom;
        const d = y < t ? t - y : y > b ? y - b : 0;
        if (d < bd) { bd = d; best = row; }
      });
      return best;
    }

    function hit(x, y) {
      const log = [];
      clear();
      if (mode === "scan") {
        let hitIdx = -1;
        for (const p of positions) {
          p.el.classList.add("scanned");
          const inside = p.left <= x && p.right >= x && p.top <= y && p.bottom >= y;
          if (log.length <= 90) log.push((inside ? "yes " : "no  ") + "cell " + String(p.i).padStart(3, "0") + " 「" + p.ch + "」 x∈[" + p.left.toFixed(0) + "," + p.right.toFixed(0) + "] y∈[" + p.top.toFixed(0) + "," + p.bottom.toFixed(0) + "]");
          if (inside) {
            hitIdx = p.i;
            p.el.classList.remove("scanned"); p.el.classList.add("hit");
            log.push("HIT → index " + p.i + "，插入点吸附在字后");
            placeCaret(p.right + 1, p.top);
            break;
          }
        }
        if (hitIdx < 0) {
          if (log.length > 90) log.push("…（日志截断）");
          const row = snapEnd(y);
          if (row) {
            const last = row[row.length - 1];
            last.el.classList.add("hit");
            log.push("未命中任何字符 → 按 y 吸附到第 " + (row[0].row + 1) + " 行，x 吸附到行尾");
            placeCaret(last.right + 1, last.top);
            idxEl.textContent = String(last.i) + "⁺";
            logEl.innerHTML = log.map(esc).join("\n");
            return;
          }
        }
        idxEl.textContent = hitIdx >= 0 ? String(hitIdx) + "⁺" : "—";
      } else {
        const rows = rowsOf();
        let row = null;
        for (const r of rows) {
          log.push("row " + (r[0].row + 1) + " y∈[" + r[0].top.toFixed(0) + "," + r[0].bottom.toFixed(0) + "] " + (y >= r[0].top - 3 && y <= r[0].bottom + 3 ? "✓" : "✗"));
          if (y >= r[0].top - 3 && y <= r[0].bottom + 3) { row = r; break; }
        }
        if (!row) { row = snapEnd(y) || rows[0]; log.push("y 超出文本 → 吸附到第 " + (row[0].row + 1) + " 行"); }
        let target = null, after = true;
        for (const p of row) {
          if (x >= p.left && x <= p.right) {
            target = p; after = x > (p.left + p.right) / 2;
            p.el.classList.add(after ? "hit" : "miss");
            log.push("行内命中 cell " + p.i + " 「" + p.ch + "」 → 插入点在字" + (after ? "后" : "前") + "（x=" + x.toFixed(0) + (after ? " > " : " ≤ ") + "中点 " + ((p.left + p.right) / 2).toFixed(0) + "）");
            break;
          }
          if (x < p.left) { target = p; after = false; p.el.classList.add("miss"); log.push("x 在行首之前 → 吸附到行首（字前）"); break; }
        }
        if (!target) { target = row[row.length - 1]; after = true; target.el.classList.add("hit"); log.push("x 超出行尾 → 吸附到行尾（字后）"); }
        idxEl.textContent = String(target.i) + (after ? "⁺" : "⁻");
        placeCaret(after ? target.right + 1 : target.left - 1, target.top);
      }
      logEl.innerHTML = log.map(esc).join("\n");
    }

    page.addEventListener("click", (e) => {
      const pr = page.getBoundingClientRect();
      hit(e.clientX - pr.left, e.clientY - pr.top);
      cross = page.querySelector("#d3-cross") || cross;
      if (cross) {
        cross.style.display = "block";
        cross.style.left = (e.clientX - pr.left - 4) + "px";
        cross.style.top = (e.clientY - pr.top - 4) + "px";
        cross.textContent = "×";
      }
    });
    modeEl.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      mode = b.dataset.mode;
      modeEl.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      logEl.textContent = "模式已切换为「" + (mode === "scan" ? "逐个扫描" : "行索引 + 吸附") + "」，再点一下纸面。";
    });
    grid.addEventListener("change", () => page.classList.toggle("grid-on", grid.checked));
    $("#d3-reset").addEventListener("click", () => { clear(); idxEl.textContent = "—"; logEl.textContent = "已重置。"; if (cross) cross.style.display = "none"; });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
    build();
  })();

  /* ══ DEMO 04 · 撤销合并器（确定性时间轴：每键 180ms，标点断步）══ */
  (() => {
    if (!$("#d4-text")) return;
    const POEM = "撤销栈把时间切成片段，每一次合并都是一次对用户意图的猜测，标点会把它切断。";
    const BYTES_PER_CHAR = 100; // 单份快照每字符字节的估算口径（见小样说明）
    const winIn = $("#d4-window"), capIn = $("#d4-cap-in"), docIn = $("#d4-doc-in");
    const R = { win: $("#d4-win"), cap: $("#d4-cap"), doc: $("#d4-doc"), keys: $("#d4-keys"), steps: $("#d4-steps"), rate: $("#d4-rate"), size: $("#d4-size"), mem: $("#d4-mem"), cost: $("#d4-cost"), note: $("#d4-note"), status: $("#d4-status") };
    let text = "", keys = 0, lastAt = -1e9, stack = [], dropped = 0, cursorMoved = false;

    function snapshotBytes() { return (+docIn.value) * BYTES_PER_CHAR; }
    function fmt(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : (b / 1024).toFixed(0) + " KB"; }

    function renderStack() {
      const cells = $("#d4-cells");
      cells.innerHTML = "";
      stack.forEach((e, i) => {
        const c = document.createElement("span");
        c.className = "uo-cell" + (i === stack.length - 1 ? " fresh" : (e.merged > 1 ? " merged" : ""));
        c.style.height = (8 + Math.min(36, e.merged * 2)) + "px";
        c.title = "第 " + (i + 1) + " 步 · 合并 " + e.merged + " 键 · 时刻 " + e.at + "ms";
        cells.appendChild(c);
      });
      if (dropped) {
        const d = document.createElement("span");
        d.style.cssText = "font-family:var(--mono);font-size:9px;color:var(--red);margin-left:4px";
        d.textContent = "−" + dropped + " 步被丢弃";
        cells.appendChild(d);
      }
    }

    function stats() {
      const steps = stack.length;
      const size = snapshotBytes();
      const entries = steps + dropped; // 曾经新建过的快照数（含被丢弃的）
      const mergeRate = keys ? Math.max(0, Math.round((1 - entries / keys) * 100)) : 0;
      R.keys.textContent = keys;
      R.steps.textContent = String(steps) + (dropped ? "（丢" + dropped + "）" : "");
      R.steps.classList.toggle("over", dropped > 0);
      R.rate.textContent = mergeRate + "%";
      R.size.textContent = fmt(size);
      R.mem.textContent = fmt(steps * size);
      R.cost.textContent = ((+docIn.value / 1000) * 0.06 + 8).toFixed(1) + " ms";
      R.note.textContent = keys === 0
        ? "每敲一个键：判断是否落入合并窗 → 合并则改写栈顶，不合并则压入新快照。"
        : (+winIn.value === 0)
          ? "合并窗已调 0：此后每键一步、只增不减；栈内已有的合并步骤保留，超上限后最早历史被 shift() 丢弃。"
          : (keys && mergeRate > 65)
            ? "合并激进：栈很浅，一次 Ctrl+Z 退掉一整段——「一步」和按键数脱钩了。"
            : "合并适中：标点断步让撤销粒度接近用户的语义单位。";
    }

    function typeKey() {
      if (keys >= POEM.length) { R.status.textContent = "全部敲完。点「Ctrl+Z」看合并粒度，或刷新小样重玩。"; return; }
      const t = keys * 180;
      const ch = POEM[keys];
      const gap = t - lastAt;
      const canMerge = !cursorMoved && gap <= (+winIn.value) && stack.length > 0 && !/[。，；：！？、]/.test(POEM[keys - 1] || "");
      if (canMerge) { stack[stack.length - 1].merged++; stack[stack.length - 1].text += ch; }
      else { stack.push({ merged: 1, text: ch, at: t }); }
      while (stack.length > +capIn.value) { stack.shift(); dropped++; }
      text += ch; keys++; lastAt = t; cursorMoved = false;
      $("#d4-text").innerHTML = esc(text.slice(0, -1)) + '<span class="new">' + esc(ch) + '</span><span class="uo-caret"></span>';
      $("#d4-break").disabled = false; $("#d4-undo").disabled = false;
      renderStack(); stats();
      R.status.textContent = "第 " + keys + " 键「" + ch + "」" + (canMerge ? " → 并入栈顶（距上键 " + gap + "ms ≤ " + winIn.value + "ms）" : " → 压入新快照");
    }

    const BURST = 12;
    function typeBurst() {
      const start = keys;
      while (keys < POEM.length && keys - start < BURST) typeKey();
      const left = POEM.length - keys;
      $("#d4-type").textContent = left > 0 ? "再打 " + Math.min(BURST, left) + " 键（剩 " + left + "）" : "已打完 · 试试 Ctrl+Z";
    }
    $("#d4-type").addEventListener("click", typeBurst);
    $("#d4-type").textContent = "打 12 键试试（共 " + POEM.length + " 键）";
    $("#d4-break").addEventListener("click", () => { cursorMoved = true; R.status.textContent = "光标已移走：下一次输入必然断步（位置窗规则）。"; $("#d4-break").disabled = true; });
    $("#d4-undo").addEventListener("click", () => {
      if (!stack.length) { R.status.textContent = "栈已见底（初始状态不入栈）。"; $("#d4-undo").disabled = true; return; }
      const top = stack.pop();
      text = text.slice(0, -top.merged);
      $("#d4-text").innerHTML = esc(text) + '<span class="uo-caret"></span>';
      renderStack(); stats();
      R.status.textContent = "Ctrl+Z：退掉最近一批 " + top.merged + " 键「" + top.text + "」。这次撤销要付 " + R.cost.textContent + " 的全量重排。";
    });
    [winIn, capIn, docIn].forEach(el => el.addEventListener("input", () => {
      R.win.textContent = winIn.value; R.cap.textContent = capIn.value; R.doc.textContent = docIn.value;
      stats();
    }));
    R.win.textContent = winIn.value; R.cap.textContent = capIn.value; R.doc.textContent = docIn.value;
    stats();
  })();
})();
