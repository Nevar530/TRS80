// modules/sheet.js — self-contained printable sheet (CodePen layout)
// Exposes: window.TRS_SHEET.update(mech), .fit(), .print()

(() => {
  const API = {};
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (x) => (x == null ? "—" : String(x));
  const num = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);

  // ---------------------- Weapon catalog (lazy) ----------------------
  let WEAP_MAP = null;
  const normKey = (s) => String(s || "").toLowerCase().replace(/[\s._\-\/]+/g, " ").trim();

  async function ensureWeaponsLoaded() {
    if (WEAP_MAP) return;
    try {
      const base = new URL(".", document.baseURI);
      const url = new URL("data/weapons.json", base).href;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      WEAP_MAP = new Map();
      for (const w of list || []) {
        if (!w) continue;
        const keys = new Set([w.id, w.name, ...(w.aliases || [])].map(normKey));
        for (const k of keys) if (k && !WEAP_MAP.has(k)) WEAP_MAP.set(k, w);
      }
    } catch { WEAP_MAP = new Map(); }
  }
  const lookupWeapon = (n) => (n ? WEAP_MAP?.get(normKey(n)) || null : null);
  const getPB = (r = {}) => {
    const v = r.pointblank ?? r.pb ?? r.close ?? r.C ?? r.c;
    return Number.isFinite(v) ? v : "";
  };

  // ---------------------- DOM + Styles ----------------------
  function ensureStyle() {
    document.querySelectorAll('#trs80-sheet-style').forEach(n => n.remove());
    const s = document.createElement("style");
    s.id = "trs80-sheet-style";
    s.textContent = `
:root{
  --bg:#111; --pane:#0b0b0b; --line:#2a2a2a; --ink:#eaeaea; --muted:#9bb;
  --font:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto;

  /* SCREEN pip behavior */
  --pip-gap: 0.008in;
  --pip-cell-max: 0.10in;    /* normal size */
  --pip-cell-min: 0.065in;   /* min when space is tiny */
  --pip-cell: var(--pip-cell-max);
  --pip-cols-min: 5;         /* never show fewer than 5 */
  --pip-cols-max: 40;        /* allow very wide rows */

  --loc-cols: 4;
}
.sheet{font-family:var(--font); color:var(--ink); max-width:1500px; margin:12px auto; padding:0 8px}
.sheet__bar{display:flex; justify-content:space-between; align-items:center; margin-bottom:10px}
.sheet__title{margin:0 0 8px 0; font-size:1.1rem}
.sheet__controls button{background:#151515;border:1px solid var(--line);color:var(--ink);padding:6px 10px;cursor:pointer}

.grid{
  display:grid; grid-template-columns:310px 1fr 220px; grid-template-rows:auto auto auto; gap:12px;
  grid-template-areas:"pilot armor heat" "weapons weapons heat" "equipment equipment heat";
  position:relative;
}

.card{background:var(--pane); border:1px solid var(--line); padding:10px; min-width:0; min-height:0; display:flex; flex-direction:column}
.pilot{grid-area:pilot}
.armor{grid-area:armor; overflow:auto}
.heat{grid-area:heat}
.weapons{grid-area:weapons}
.equipment{grid-area:equipment}
.card h2{margin:0 0 8px 0; font-size:1rem}

.grid2{display:grid; grid-template-columns:120px 1fr; gap:4px 8px; font-size:12px}
.grid2 .lab{color:var(--muted)}
.grid2 .val{white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.hints{margin-top:6px; display:flex; gap:14px; font-size:11px; color:var(--muted)}

/* Armor matrix */
.armorMatrix{
  display:grid;
  grid-template-columns: repeat(var(--loc-cols), minmax(0,1fr));
  grid-auto-rows: 1fr;
  grid-auto-flow: row dense;
  gap:8px;
  min-height:0;
}

/* TRS pips */
.trs-pips{
  display:grid;
  grid-template-columns: repeat(var(--pip-cols, var(--pip-cols-max)), var(--pip-cell));
  grid-auto-rows: var(--pip-cell);
  gap: calc(var(--pip-gap) * 0.5) var(--pip-gap);
  justify-content:start; align-content:start;
  font-size:0; line-height:0; padding:0;
}
.trs-pip{ display:block; box-sizing:border-box; width:100%; height:100%; aspect-ratio:1/1; border:1px solid #aab; background:transparent; }
.trs-pip.pip-armor   { border-radius:50%; }
.trs-pip.pip-internal{ border-radius:2px; transform:rotate(45deg); }
.trs-pip.pip-rear    { border-radius:2px; }

/* Heat */
.heatTable{width:100%; table-layout:fixed; border-collapse:collapse; font-size:10px; flex:1}
.heatTable th,.heatTable td{border:1px solid var(--line); padding:2px 4px; vertical-align:top}
.heatTable th{background:#1a1a1a; font-weight:600}
.heatTable th:first-child,.heatTable td:first-child{width:56px; text-align:center}
.heatTotal{display:grid; grid-template-columns:repeat(3,1fr); gap:8px; border-top:1px solid var(--line); font-size:14px; padding-top:6px; font-weight:600}
.heatTotal .hsField{display:flex; flex-direction:column; gap:2px; font-weight:600}
.heatTotal .sup{font-size:10px; color:var(--muted); font-weight:400}

/* Weapons */
.weapTable{width:100%; table-layout:fixed; border-collapse:collapse; font-size:12px}
.weapTable th,.weapTable td{border:1px solid var(--line); padding:3px 4px; text-align:center}
.weapTable th{background:#1a1a1a; font-weight:600}
.weapTable th:nth-child(1){width:32%}.weapTable td:nth-child(1){text-align:left}
.weapTable th:nth-child(2){width:14%}
.weapTable th:nth-child(3),.weapTable th:nth-child(4){width:7%}
.weapTable th:nth-child(5){width:6%}
.weapTable th:nth-child(6){width:8%}
.weapTable th:nth-child(7){width:10%}
.weapTable th:nth-child(8){width:10%}
.weapTable th:nth-child(9){width:6%}

/* Equipment */
.equipGrid{display:grid; grid-template-columns:repeat(8,36px minmax(0,1fr)); column-gap:4px; row-gap:4px; font-size:10px}
.eqH{font-weight:600}
.equipGrid .eqH:nth-child(odd){ text-align:right; padding-right:2px }
.equipGrid .eqH:nth-child(even){ text-align:left }
.eqRows{grid-column:1 / -1; display:grid; grid-template-columns:inherit; column-gap:4px; row-gap:4px}
.eqSlot{ color:var(--muted); font-size:10px; text-align:right; padding-right:2px }
.eqVal{ border-bottom:1px solid var(--line); min-height:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:10px }

/* SCREEN FIT */
@media screen {
  #trs80-screenfit{
    display:grid; place-content:start center;
    width: 100%;
    height: var(--screen-fit-h, auto);
    margin: 0 auto;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
  }
  #trs80-sheet-host{
    transform-origin: top left;
    transform: scale(var(--screen-scale, 1));
  }
}

/* PRINT (independent of screen) */
@media print{
  @page { margin: 0.25in; }

  /* hide everything except the sheet */
  body *{ visibility: hidden !important; }
  #trs80-sheet-host, #trs80-sheet-host *{ visibility: visible !important; }

  /* paper tuning */
  :root{
    --pip-gap: 0.006in;
    --pip-cell-max: 0.095in;
    --pip-cell-min: 0.070in;
    --pip-cell: var(--pip-cell-max);
    --pip-cols-min: 5;
    --pip-cols-max: 48; /* let rows go very wide on paper */
  }

  .sheet{ max-width:none !important; background:#fff !important; }
  /* host is positioned/scaled by JS before print; don't override here */
}
`;
    document.head.appendChild(s);
  }

  function ensureRootAndHost() {
    let root = $("#sheet-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "sheet-root";
      document.body.appendChild(root);
    }

    let host = $("#trs80-sheet-host");
    if (!host) {
      host = document.createElement("section");
      host.id = "trs80-sheet-host";
      host.className = "sheet";
      host.innerHTML = `
<header class="sheet__bar">
  <h1 class="sheet__title">Technical Readout Sheet</h1>
  <div class="sheet__controls">
    <button id="trs80-sheet-print" title="Print this sheet">Print</button>
  </div>
</header>

<div class="grid">
  <section class="card pilot" aria-label="Pilot & Mech">
    <div class="grid2">
      <div class="lab">PILOT</div> <div class="val">___________________________</div>
      <div class="lab">CALL SIGN</div> <div class="val">___________________________</div>
      <div class="lab">GUNNERY (G)</div> <div class="val">[____]</div>
      <div class="lab">PILOTING (P)</div> <div class="val">[____]</div>
      <div class="lab">HITS TAKEN</div> <div class="val">|01| |02| |03| |04| |05| |06|</div>
      <div class="lab">CONSCIOUSNESS #</div> <div class="val">|03| |05| |07| |10| |11| |KIA|</div>
    </div>
    <hr/>
    <div class="grid2">
      <div class="lab">CHASSIS</div> <div class="val"><span id="mechChassis">—</span><sup id="mechVariant">—</sup></div>
      <div class="lab">TECH BASE</div>  <div class="val" id="mechTech">—</div>
      <div class="lab">TONNAGE</div>    <div class="val" id="mechTonnage">—</div>
      <div class="lab">BV</div>         <div class="val" id="mechBV">—</div>
      <div class="lab">MOVEMENT (W/R/J)</div> <div class="val" id="mechMove">—</div>
    </div>
    <div class="hints"><span>STANDING +0</span><span>WALK +1</span><span>RUNNING +2</span><span>JUMP +3</span></div>
  </section>

  <section class="card armor" aria-label="Armor / Structure">
    <h2>Armor / Structure by Location</h2>
    <div id="armorMatrix" class="armorMatrix"></div>
  </section>

  <aside class="card heat" aria-label="Heat">
    <h2>Heat</h2>
    <table class="heatTable">
      <thead><tr><th>HEAT</th><th>EFFECT</th></tr></thead>
      <tbody id="heatRows"></tbody>
    </table>
    <div class="heatTotal">
      <div class="hsField"><div class="sup">TYPE</div><div id="hsType">—</div></div>
      <div class="hsField"><div class="sup">COUNT</div><div id="hsCount">—</div></div>
      <div class="hsField"><div class="sup">TOTAL</div><div id="hsCapacity">—</div></div>
    </div>
  </aside>

  <section class="card weapons" aria-label="Weapons">
    <h2>Weapons</h2>
    <table class="weapTable">
      <thead>
        <tr>
          <th>NAME</th><th>TYPE</th><th>DAMAGE</th><th>HEAT</th>
          <th>MIN</th><th>SHORT</th><th>MID</th><th>LONG</th><th>AMMO</th>
        </tr>
      </thead>
      <tbody id="weapRows"></tbody>
    </table>
  </section>

  <section class="card equipment" aria-label="Equipment">
    <h2>Equipment</h2>
    <div class="equipGrid">
      <div class="eqH">LA</div><div class="eqH">NAME</div>
      <div class="eqH">LL</div><div class="eqH">NAME</div>
      <div class="eqH">LT</div><div class="eqH">NAME</div>
      <div class="eqH">CT</div><div class="eqH">NAME</div>
      <div class="eqH">HD</div><div class="eqH">NAME</div>
      <div class="eqH">RT</div><div class="eqH">NAME</div>
      <div class="eqH">RL</div><div class="eqH">NAME</div>
      <div class="eqH">RA</div><div class="eqH">NAME</div>
      <div id="equipRows" class="eqRows"></div>
    </div>
  </section>
</div>

<footer class="sheet__legal" style="opacity:.8;font-size:9px;margin-top:6px">
  Unofficial, non-commercial fan work. BattleTech®, BattleMech®, ’Mech®, and AeroTech® are trademarks or registered trademarks of The Topps Company, Inc.
  Catalyst Game Labs and the Catalyst Game Labs logo are trademarks of InMediaRes Productions, LLC. This sheet is not affiliated with, or endorsed by, those rights holders.
</footer>`;
      root.appendChild(host);

      // Heat table (30 → 1)
      const HEAT = {
        30:"Shutdown", 28:"Ammo explosion chk (8+)", 26:"Shutdown (10+)",
        25:"-5 MP", 24:"+4 To-Hit", 23:"Ammo explosion chk (6+)",
        22:"Shutdown (8+)", 20:"-4 MP", 19:"Ammo explosion chk (4+)",
        17:"Shutdown (6+)", 15:"+3 To-Hit", 14:"-3 MP", 12:"+2 To-Hit",
        10:"-2 MP", 8:"+1 To-Hit"
      };
      const heatBody = $("#heatRows", host);
      for (let h = 30; h >= 1; h--) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>[${String(h).padStart(2,"0")}]</td><td>${HEAT[h] || "—"}</td>`;
        heatBody.appendChild(tr);
      }
    }
    return { root, host };
  }

  // Ensure wrapper and move host inside
  function ensureWrapper() {
    const { root, host } = ensureRootAndHost();
    let wrap = $("#trs80-screenfit");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "trs80-screenfit";
      root.appendChild(wrap);
    }
    if (host.parentElement !== wrap) wrap.appendChild(host);
    return { wrap, host };
  }

  // ---------------------- Responsive pips (screen & print) ----------------------
  function updatePipCols(){
    const rootCS = getComputedStyle(document.documentElement);
    const COLS_MIN = parseInt(rootCS.getPropertyValue('--pip-cols-min')) || 5;
    const COLS_MAX = parseInt(rootCS.getPropertyValue('--pip-cols-max')) || 40;
    const CELL_MAX_RAW = rootCS.getPropertyValue('--pip-cell-max').trim() || '0.10in';
    const CELL_MIN_RAW = rootCS.getPropertyValue('--pip-cell-min').trim() || '0.065in';
    const GAP_RAW      = rootCS.getPropertyValue('--pip-gap').trim() || '0in';

    const toPx = (raw) => {
      const v = parseFloat(raw||0);
      return /in$/.test(raw) ? v*96 : v;
    };
    const CELL_MAX = toPx(CELL_MAX_RAW);
    const CELL_MIN = toPx(CELL_MIN_RAW);
    const GAP_PX   = toPx(GAP_RAW);

    document.querySelectorAll('.trs-pips').forEach(p => {
      if (!p.isConnected || p.offsetParent === null) return;

      const cs = getComputedStyle(p);
      const padL  = parseFloat(cs.paddingLeft) || 0;
      const padR  = parseFloat(cs.paddingRight) || 0;

      const rectW = p.getBoundingClientRect().width || p.clientWidth;
      const avail = Math.max(0, rectW - padL - padR);

      const colsAtMax = Math.floor((avail + GAP_PX) / (CELL_MAX + GAP_PX));

      if (colsAtMax >= COLS_MIN){
        const cols = Math.max(COLS_MIN, Math.min(COLS_MAX, colsAtMax));
        p.style.setProperty('--pip-cols', cols);
        p.style.removeProperty('--pip-cell'); // fallback to CSS var (max)
      } else {
        const cellForFive = Math.max(
          CELL_MIN,
          Math.min(CELL_MAX, (avail - (COLS_MIN - 1) * GAP_PX) / COLS_MIN)
        );
        p.style.setProperty('--pip-cols', COLS_MIN);
        p.style.setProperty('--pip-cell', `${cellForFive}px`);
      }
    });
  }

  function schedulePipLayout(bursts = 3){
    let i = 0;
    const tick = () => { updatePipCols(); if (++i < bursts) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  let __pipIO, __pipRO;
  function bindPipObservers(root = document){
    if (!__pipIO) {
      __pipIO = new IntersectionObserver((entries) => {
        if (entries.some(e => e.isIntersecting)) { schedulePipLayout(2); fitToViewport(); }
      }, { threshold: 0 });
    }
    if (!__pipRO) {
      __pipRO = new ResizeObserver(() => schedulePipLayout(1));
    }
    root.querySelectorAll(".trs-pips").forEach(el => {
      __pipIO.observe(el);
      __pipRO.observe(el);
    });
  }

  // ---------------------- Screen fit (scales container; pips handle width) ----------------------
  let screenRaf = 0;
  function fitToViewport(){
    const { wrap, host } = ensureWrapper();
    if (!host || !wrap) return;

    host.style.removeProperty('--screen-scale');
    wrap.style.removeProperty('--screen-fit-w');
    wrap.style.removeProperty('--screen-fit-h');

    if (host.offsetParent === null && !matchMedia('print').matches) return;

    const baseW = Math.max(host.scrollWidth, host.offsetWidth);
    const baseH = Math.max(host.scrollHeight, host.offsetHeight);
    if (baseW < 10 || baseH < 10) return;

    const rect = wrap.parentElement?.getBoundingClientRect?.() || { width: window.innerWidth };
    const SAFE = 12;
    const availW = Math.max(0, rect.width  - SAFE*2);
    const availH = Math.max(0, window.innerHeight - SAFE*2);

    const isDesktop = rect.width >= 1024;
    const scaleW = availW / baseW;
    const scaleH = availH / baseH;
    let scale = isDesktop ? scaleW : Math.min(scaleW, scaleH);

    scale = Math.max(0.5, Math.min(1, scale));

    if (scale >= 0.999) {
      host.style.removeProperty('--screen-scale');
      wrap.style.removeProperty('--screen-fit-w');
      wrap.style.removeProperty('--screen-fit-h');
    } else {
      const scaledW = Math.max(1, Math.round(baseW * scale));
      const scaledH = Math.max(1, Math.round(baseH * scale));
      host.style.setProperty('--screen-scale', String(scale));
      wrap.style.setProperty('--screen-fit-w', `${scaledW}px`);
      wrap.style.setProperty('--screen-fit-h', `${scaledH}px`);
    }
  }
  function onViewportResize(){
    if (screenRaf) cancelAnimationFrame(screenRaf);
    screenRaf = requestAnimationFrame(() => { screenRaf = 0; fitToViewport(); });
  }

  // ---------------------- Print hooks (independent layout) ----------------------
  (function installPrintHooks(){
    function recomputePipsBursty(times = 6){
      let i = 0;
      const tick = () => { updatePipCols(); if (++i < times) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }

    function beforePrint(){
      const host = $("#trs80-sheet-host");
      if (!host) return;

      // Determine printable box (independent of screen)
      const DPI = 96, MARGIN_IN = 0.25;
      const isLandscape = (() => {
        try { return matchMedia('(orientation: landscape)').matches; } catch {}
        return innerWidth >= innerHeight;
      })();
      const pageW = (isLandscape ? 11 : 8.5) * DPI - 2*MARGIN_IN*DPI;
      const pageH = (isLandscape ? 8.5 : 11) * DPI - 2*MARGIN_IN*DPI;

      // Give content a very wide working width so pips spread horizontally.
      host.style.width = '18in';
      host.style.maxWidth = 'none';
      host.style.position = 'fixed';
      host.style.left = '50%';
      host.style.top = '50%';
      host.style.transformOrigin = 'center center';

      // Reflow + compute pip layout for this wide width
      void host.getBoundingClientRect();
      recomputePipsBursty(4);

      // Measure and scale to fit HEIGHT (portrait/landscape)
      const naturalH = Math.max(host.scrollHeight, host.offsetHeight);
      const scale = Math.max(0.1, Math.min(2, pageH / naturalH));

      host.style.transform = `translate(-50%,-50%) scale(${scale})`;
    }

    function afterPrint(){
      const host = $("#trs80-sheet-host");
      if (!host) return;
      host.style.removeProperty('width');
      host.style.removeProperty('maxWidth');
      host.style.removeProperty('position');
      host.style.removeProperty('left');
      host.style.removeProperty('top');
      host.style.removeProperty('transformOrigin');
      host.style.removeProperty('transform');
    }

    if ('onbeforeprint' in window) {
      window.addEventListener('beforeprint', beforePrint);
      window.addEventListener('afterprint',  afterPrint);
    } else {
      const mql = matchMedia('print');
      const onChange = (e) => e.matches ? beforePrint() : afterPrint();
      if (mql.addEventListener) mql.addEventListener('change', onChange);
      else mql.addListener(onChange);
    }

    // button shortcut
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t && (t.id === 'trs80-sheet-print' || t.closest?.('#trs80-sheet-print'))) {
        beforePrint();
        requestAnimationFrame(() => window.print());
      }
    });

    API.print = () => { beforePrint(); window.print(); };
  })();

  // ---------------------- Drawing helpers ----------------------
  function parsePipCount(raw){
    if (typeof raw === "number") return Math.max(0, raw|0);
    if (raw == null) return 0;
    const m = String(raw).match(/\d+/);
    return m ? Math.max(0, parseInt(m[0],10)) : 0;
  }
  function armorFront(val){
    if (val == null) return 0;
    if (typeof val === 'object') return parsePipCount(val.a ?? val.A ?? val.front ?? val.value ?? val.armor);
    return parsePipCount(val);
  }
  function armorRear(val){
    if (val == null) return 0;
    if (typeof val === 'object') return parsePipCount(val.r ?? val.R ?? val.rear ?? val.value ?? val.armor);
    return parsePipCount(val);
  }
  function internalsVal(val){
    if (val == null) return 0;
    if (typeof val === 'object') return parsePipCount(val.s ?? val.S ?? val.structure ?? val.value);
    return parsePipCount(val);
  }

  function pipRow(label, count, cls){
    const r = document.createElement("div");
    r.className = "lrow";
    const cells = parsePipCount(count);
    const safeCls = cls ? String(cls).trim() : "";
    const pipHTML = `<div class="trs-pip${safeCls ? " " + safeCls : ""}"></div>`;
    r.innerHTML = `<div class="lab">${label}</div><div class="trs-pips" data-count="${cells}">${cells>0 ? pipHTML.repeat(cells) : ""}</div>`;
    return r;
  }

  function drawArmor(mech){
    const grid = $("#armorMatrix");
    grid.innerHTML = "";
    const ABL = mech.armorByLocation || {};
    const IBL = mech.internalByLocation || {};
    const Araw = mech.armor || {};
    const order = ["LA","HD","CT","RA","LL","LT","RT","RL"];
    const ROLL  = { LA:"[04-05]", HD:"[12]", RA:"[09-10]", LL:"[03]", LT:"[06]", CT:"[02/07]", RT:"[08]", RL:"[11]" };
    const front = {
      HD: armorFront(ABL.HD ?? Araw.head),
      CT: armorFront(ABL.CT ?? Araw.centerTorso),
      RT: armorFront(ABL.RT ?? Araw.rightTorso),
      LT: armorFront(ABL.LT ?? Araw.leftTorso),
      RA: armorFront(ABL.RA ?? Araw.rightArm),
      LA: armorFront(ABL.LA ?? Araw.leftArm),
      RL: armorFront(ABL.RL ?? Araw.rightLeg),
      LL: armorFront(ABL.LL ?? Araw.leftLeg),
    };
    const rear = {
      CT: armorFront(ABL.RTC ?? Araw.rearCenterTorso),
      RT: armorFront(ABL.RTR ?? Araw.rearRightTorso),
      LT: armorFront(ABL.RTL ?? Araw.rearLeftTorso),
    };
    const internals = {
      HD: internalsVal(IBL.HD), CT: internalsVal(IBL.CT),
      RT: internalsVal(IBL.RT), LT: internalsVal(IBL.LT),
      RA: internalsVal(IBL.RA), LA: internalsVal(IBL.LA),
      RL: internalsVal(IBL.RL), LL: internalsVal(IBL.LL),
    };
    for (const code of order) {
      const box = document.createElement("div");
      box.className = "loc";
      box.innerHTML = `<div class="locHeader"><div class="name">${code}</div><div class="roll">${ROLL[code]||"[—]"}</div></div>`;
      box.appendChild(pipRow("ARMOR",    front[code] || 0, "pip-armor"));
      box.appendChild(pipRow("INTERNAL", internals[code] || 0, "pip-internal"));
      if (code === "LT" || code === "CT" || code === "RT") {
        box.appendChild(pipRow("REAR", rear[code] || 0, "pip-rear"));
      }
      grid.appendChild(box);
    }
  }

  function drawWeapons(mech){
    const tbody = $("#weapRows");
    tbody.innerHTML = "";
    const tons = mech.tonnage ?? mech.Tonnage ?? mech.mass ?? 0;
    const punch = Math.ceil(tons / 10), kick = Math.ceil(tons / 5), charge = Math.ceil(tons / 10), dfa = Math.ceil(kick * 1.5);
    const melee = [
      ["Punch","Melee", punch,0,1,1,1,1,"∞"],
      ["Kick","Melee",  kick,0,1,1,1,1,"∞"],
      ["Charge","Melee",charge,0,1,1,1,1,"∞"],
      ["DFA","Melee",   dfa,  0,1,1,1,1,"∞"],
    ];
    for (const row of melee) tbody.insertAdjacentHTML("beforeend", `<tr>${row.map(c=>`<td>${c}</td>`).join("")}</tr>`);

    const list = Array.isArray(mech.weapons) ? mech.weapons : [];
    for (const w of list) {
      const name = w.name || w.type || "—";
      const rec = lookupWeapon(name);
      const r = rec?.range || {};
      const ammoTxt = (!rec) ? "" : (/^(energy|melee)$/i.test(String(rec.type||"")) ? "∞" : (rec.ammo ? String(rec.ammo) : ""));
      const row = [
        esc(name),
        esc(rec?.type ?? ""),
        rec?.damage ?? "",
        rec?.heat ?? "",
        getPB(r),
        r.short ?? "",
        r.medium ?? "",
        r.long ?? "",
        ammoTxt
      ];
      tbody.insertAdjacentHTML("beforeend", `<tr>${row.map(c=>`<td>${c}</td>`).join("")}</tr>`);
    }
  }

  function drawEquipment(mech){
    const eq = $("#equipRows");
    eq.innerHTML = "";
    const locs = mech.locations || {};
    const cols = ["LA","LL","LT","CT","HD","RT","RL","RA"];
    const map  = {LA:"leftArm",LL:"leftLeg",LT:"leftTorso",CT:"centerTorso",HD:"head",RT:"rightTorso",RL:"rightLeg",RA:"rightArm"};
    const BASE = 12;
    let maxLen = BASE;
    for (const c of cols) maxLen = Math.max(maxLen, (locs[map[c]]||[]).length);
    for (let i=1; i<=maxLen; i++){
      for (const c of cols) {
        eq.insertAdjacentHTML("beforeend", `<div class="eqSlot">[${String(i).padStart(2,"0")}]</div>`);
        const v = (locs[map[c]]||[])[i-1] || "";
        eq.insertAdjacentHTML("beforeend", `<div class="eqVal">${esc(v)}</div>`);
      }
    }
    eq.parentElement.parentElement.dataset.rows = String(maxLen);
  }

  function movementString(mech){
    const mv = mech._mv || mech.movement || mech.move || {};
    const walk = mv.walk ?? mv.Walk ?? mv.w ?? null;
    const run  = mv.run  ?? mv.Run  ?? mv.r ?? (walk!=null ? Math.ceil(Number(walk)*1.5) : null);
    const jump = mv.jump ?? mv.Jump ?? mv.j ?? null;
    const fmt = x => (x==null ? "—" : String(x));
    return `${fmt(walk)} / ${fmt(run)} / ${fmt(jump)}`;
  }

  // ---------------------- Render ----------------------
  let LAST_MECH = null;
  async function render(mech){
    LAST_MECH = mech || LAST_MECH;
    ensureStyle();
    const { host } = ensureRootAndHost();
    ensureWrapper();
    await ensureWeaponsLoaded();

    $("#mechChassis", host).textContent = esc(mech?.displayName || mech?.name || "—");
    $("#mechVariant", host).textContent = esc(mech?.model || mech?.variant || "—");
    $("#mechTech", host).textContent    = esc(mech?.techBase || mech?.tech || "—");
    $("#mechTonnage", host).textContent = esc(mech?.tonnage ?? mech?.Tonnage ?? mech?.mass ?? "—");
    $("#mechBV", host).textContent      = esc(mech?.bv ?? mech?.BV ?? "—");
    $("#mechMove", host).textContent    = movementString(mech);

    const hs = hsInfo(mech);
    $("#hsType", host).textContent     = esc(hs.type);
    $("#hsCount", host).textContent    = esc(hs.count);
    $("#hsCapacity", host).textContent = esc(hs.cap);

    drawArmor(mech);
    drawWeapons(mech);
    drawEquipment(mech);
    bindPipObservers(host);
    schedulePipLayout(3);

    updatePipCols();
    fitToViewport();
  }

  function hsInfo(mech){
    if (mech?.sinks?.count != null) {
      const cnt = num(mech.sinks.count,0), dbl = /double/i.test(String(mech.sinks.type||""));
      return { type: dbl ? "Double" : "Single", count: cnt, cap: cnt * (dbl?2:1) };
    }
    const s = String(mech?.heatSinks ?? "");
    const m = s.match(/(\d+)/); const cnt = m ? parseInt(m[1],10) : null; const dbl = /double/i.test(s);
    return { type: cnt==null ? "—" : (dbl?"Double":"Single"), count: cnt ?? "—", cap: cnt==null ? "—" : cnt*(dbl?2:1) };
  }

  // ---------------------- Public API ----------------------
  API.update = (mech) => render(mech);
  API.fit    = () => { ensureStyle(); ensureWrapper(); fitToViewport(); };
  API.print  = () => { const e = new Event('beforeprint'); window.dispatchEvent(e); window.print(); };

  window.TRS_SHEET = API;

  // ---------------------- Global listeners ----------------------
  window.addEventListener("resize", onViewportResize);
  window.addEventListener("orientationchange", onViewportResize);
  window.addEventListener("trs:mechSelected", () => { schedulePipLayout(3); fitToViewport(); });

  ensureStyle(); ensureWrapper();
  requestAnimationFrame(fitToViewport);
})();
