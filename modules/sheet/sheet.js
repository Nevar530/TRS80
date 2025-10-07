/* modules/sheet/sheet.js
   TRS:80 — Printable Character Sheet (self-contained)
   - No internal mech selector: mirrors app’s current selection
   - Listens to: 'mech:selected' and 'route:sheet' (configurable)
   - Data: /data/manifest.json, /data/weapons.json, /data/bv.json
*/
(function () {
  const NS = (window.TRS80 = window.TRS80 || {});
  const Sheet = (NS.Sheet = NS.Sheet || {});

  // --- Config ----------------------------------------------------------------
  const ROUTE_EVENT = "route:sheet";         // change if your router uses a different event
  const MECH_SELECTED_EVENT = "mech:selected";
  const DATA_BASE = (NS.DATA_BASE && NS.DATA_BASE()) || ""; // allow apps to override (else relative)
  const EQUIP_BASE_ROWS = 12;

  // --- Internal state ---------------------------------------------------------
  let bus = null;
  let getCurrentMechKey = null; // () => string | {name, model}
  let root = null;              // module root element
  let lastKey = null;           // cached selection identity
  let caches = {
    manifest: null, // { items: [...] }
    weapons: null,  // array -> we build lookups
    bv: null,       // array -> we build lookups
    maps: {
      weapByName: new Map(),
      weapByAlias: new Map(),
      bvByKey: new Map(), // "name|model" -> bv
      manifestByDisplay: new Map(), // "Name Model" -> item
      manifestByKey: new Map(),     // "name|model" -> item
    },
  };

  // --- Public API -------------------------------------------------------------
  Sheet.init = function init(options = {}) {
    bus = options.bus || null;
    getCurrentMechKey = options.getCurrentMechKey || null;

    injectStyle();
    root = buildDOM();
    attachListeners();

    // Lazy load on first open to keep boot fast
    // (will load when route is opened or a mech is selected)
  };

  Sheet.open = async function open() {
    showRoot(true);
    await ensureDataLoaded();
    const key = resolveCurrentKey();
    if (!key) return renderAwaitSelection();
    lastKey = key;
    renderForKey(key);
  };

  Sheet.close = function close() {
    showRoot(false);
  };

  Sheet.print = function printSheet() {
    // small layout tick to ensure pips resolved
    requestAnimationFrame(() => window.print());
  };

  // --- Event wiring -----------------------------------------------------------
  function attachListeners() {
    if (bus && typeof bus.addEventListener === "function") {
      bus.addEventListener(ROUTE_EVENT, (ev) => {
        // optional: payload may include current key
        if (ev && ev.detail && ev.detail.key) lastKey = normalizeKeyInput(ev.detail.key);
        Sheet.open();
      });
      bus.addEventListener(MECH_SELECTED_EVENT, (ev) => {
        const nextKey = ev && ev.detail ? normalizeKeyInput(ev.detail.key ?? ev.detail) : resolveCurrentKey();
        if (!nextKey) return;
        lastKey = nextKey;
        if (isVisible()) renderForKey(lastKey);
      });
    } else {
      // Fallback: watch hash route changes (optional)
      window.addEventListener("hashchange", () => {
        if (location.hash.replace("#", "") === "sheet") Sheet.open();
        else if (isVisible()) Sheet.close();
      });
    }

    // Responsive pips recompute
    window.addEventListener("resize", updatePipCols);
    // Print button
    root.querySelector('[data-action="print"]').addEventListener("click", Sheet.print);
  }

  // --- Data loading & lookups -------------------------------------------------
  async function ensureDataLoaded() {
    if (!caches.manifest) {
      caches.manifest = await fetchJSON(`${DATA_BASE}/data/manifest.json`);
      indexManifest(caches.manifest);
    }
    if (!caches.weapons) {
      caches.weapons = await fetchJSON(`${DATA_BASE}/data/weapons.json`);
      indexWeapons(caches.weapons);
    }
    if (!caches.bv) {
      caches.bv = await fetchJSON(`${DATA_BASE}/data/bv.json`);
      indexBV(caches.bv);
    }
  }

  function indexManifest(manifest) {
    caches.maps.manifestByDisplay.clear();
    caches.maps.manifestByKey.clear();
    const items = manifest.items || manifest || [];
    for (const it of items) {
      const display = it.displayName || `${it.name} ${it.model}`.trim();
      caches.maps.manifestByDisplay.set(safeKey(display), it);
      if (it.name && it.model) {
        caches.maps.manifestByKey.set(safeKey(`${it.name}|${it.model}`), it);
      }
    }
  }

  function indexWeapons(list) {
    caches.maps.weapByName.clear();
    caches.maps.weapByAlias.clear();
    for (const w of list) {
      const n = (w.name || w.id || "").trim();
      if (n) caches.maps.weapByName.set(safeKey(n), w);
      const aliases = Array.isArray(w.aliases) ? w.aliases : [];
      for (const a of aliases) {
        const ak = safeKey(a);
        if (!caches.maps.weapByAlias.has(ak)) caches.maps.weapByAlias.set(ak, w);
      }
    }
  }

  function indexBV(list) {
    caches.maps.bvByKey.clear();
    for (const r of list) {
      const n = (r.name || "").trim();
      const m = (r.model || "").trim();
      if (!n || !m) continue;
      caches.maps.bvByKey.set(safeKey(`${n}|${m}`), r.bv);
    }
  }

  // --- Rendering --------------------------------------------------------------
  async function renderForKey(key) {
    const container = root.querySelector(".trs80-sheet__grid");
    container.classList.remove("is-empty");
    container.querySelector(".trs80-sheet__empty").hidden = true;

    // resolve manifest item
    const manItem = resolveManifestItem(key);
    if (!manItem) return renderError(`Mech not found in manifest: ${JSON.stringify(key)}`);

    // fetch mech json
    const mechPath = `${DATA_BASE}/data/${manItem.path}`;
    const mech = await fetchJSON(mechPath);

    // meta values
    const chassis = mech.name || mech.chassis || manItem.name || "—";
    const variant = mech.model || manItem.model || "—";
    const techBase = manItem.techBase || mech.tech || "—";
    const tons = mech.mass ?? manItem.mass ?? "—";

    // movement (R computed)
    const walk = getNum(mech.movement?.walk ?? manItem.movement?.walk, 0);
    const jump = getNum(mech.movement?.jump ?? manItem.movement?.jump, 0);
    const run = Math.ceil(walk * 1.5);
    const moveStr = `${walk} / ${run} / ${jump}`;

    // BV
    const bv = caches.maps.bvByKey.get(safeKey(`${chassis}|${variant}`)) ?? "—";

    // heat sinks
    const hsParsed = parseHeatSinks(mech.heatSinks);
    const hsTypeTxt = hsParsed.isDouble ? "Double" : "Single";

    // Populate pilot/meta
    setText("#mechChassis", chassis);
    setText("#mechVariant", variant);
    setText("#mechTech", techBase);
    setText("#mechTonnage", tons);
    setText("#mechBV", bv);
    setText("#mechMove", moveStr);
    setText("#hsType", hsTypeTxt);
    setText("#hsCount", hsParsed.count ?? "—");
    setText("#hsCapacity", hsParsed.capacity ?? "—");

    // Armor grid
    drawArmor(mech);

    // Weapons
    drawWeapons(mech, tons);

    // Equipment
    drawEquipment(mech);

    // Finish
    updatePipCols();
  }

  function drawArmor(mech) {
    const host = root.querySelector("#armorMatrix");
    host.innerHTML = "";
    const order = ["LA", "HD", "CT", "RA", "LL", "LT", "RT", "RL"];
    const A = mech.armor || {};
    const front = {
      LA: A.leftArm || 0,
      HD: A.head || 0,
      CT: A.centerTorso || 0,
      RA: A.rightArm || 0,
      LL: A.leftLeg || 0,
      LT: A.leftTorso || 0,
      RT: A.rightTorso || 0,
      RL: A.rightLeg || 0,
    };
    const rear = {
      LT: A.rearLeftTorso || 0,
      CT: A.rearCenterTorso || 0,
      RT: A.rearRightTorso || 0,
    };
    const ROLL = { LA: "[04-05]", HD: "[12]", RA: "[09-10]", LL: "[03]", LT: "[06]", CT: "[02/07]", RT: "[08]", RL: "[11]" };

    for (const code of order) {
      const box = el("div", "loc");
      const head = el("div", "locHeader");
      head.append(el("div", "name", code), el("div", "roll", ROLL[code] || "[—]"));
      box.appendChild(head);
      box.appendChild(pipRow("ARMOR", front[code] || 0, "armor"));
      box.appendChild(pipRow("INTERNAL", internalCount(code), "internal"));
      if (code === "LT" || code === "CT" || code === "RT") {
        box.appendChild(pipRow("REAR", rear[code] || 0, "rear"));
      }
      host.appendChild(box);
    }
  }

  function drawWeapons(mech, tons) {
    const tbody = root.querySelector("#weapRows");
    tbody.innerHTML = "";

    // Melee first
    const punch = Math.ceil(tons / 10);
    const kick = Math.ceil(tons / 5);
    const charge = Math.ceil(tons / 10);
    const dfa = Math.ceil(kick * 1.5);
    const melee = [
      ["Punch", "Melee", punch, 0, 1, 1, 1, 1, "∞"],
      ["Kick", "Melee", kick, 0, 1, 1, 1, 1, "∞"],
      ["Charge", "Melee", charge, 0, 1, 1, 1, 1, "∞"],
      ["DFA", "Melee", dfa, 0, 1, 1, 1, 1, "∞"],
    ];
    for (const row of melee) tbody.insertAdjacentHTML("beforeend", tr(row));

    // Ranged weapons: mech.weapons is array of {type: "LRM 15", location:"LT", ...}
    const list = Array.isArray(mech.weapons) ? mech.weapons : [];
    for (const w of list) {
      const rec = lookupWeapon(w.type);
      // Range mapping: in your catalog, "pointblank" is what we’ll use as MIN
      const min = val(rec?.range?.pointblank);
      const row = [
        w.type || "—",
        rec?.type || "",
        val(rec?.damage),
        val(rec?.heat),
        min,
        val(rec?.range?.short),
        val(rec?.range?.medium),
        val(rec?.range?.long),
        ammoText(rec),
      ];
      tbody.insertAdjacentHTML("beforeend", tr(row));
    }
  }

  function drawEquipment(mech) {
    const eqHost = root.querySelector("#equipRows");
    eqHost.innerHTML = "";
    const locs = mech.locations || {};
    const cols = ["LA", "LL", "LT", "CT", "HD", "RT", "RL", "RA"];
    const map = {
      LA: "leftArm",
      LL: "leftLeg",
      LT: "leftTorso",
      CT: "centerTorso",
      HD: "head",
      RT: "rightTorso",
      RL: "rightLeg",
      RA: "rightArm",
    };
    // Determine rows: baseline 12, extend to longest list
    let maxLen = EQUIP_BASE_ROWS;
    for (const c of cols) {
      const arr = locs[map[c]] || [];
      if (arr.length > maxLen) maxLen = arr.length;
    }
    for (let i = 1; i <= maxLen; i++) {
      for (const c of cols) {
        eqHost.appendChild(el("div", "eqSlot", `[${String(i).padStart(2, "0")}]`));
        const v = (locs[map[c]] || [])[i - 1] || "";
        const cell = el("div", "eqVal", v);
        eqHost.appendChild(cell);
      }
    }

    // Compact modes if long
    const card = root.querySelector(".card.equipment");
    card.dataset.rows = String(maxLen);
  }

  // --- Helpers ----------------------------------------------------------------
  function resolveManifestItem(key) {
    // Try displayName first
    const display = keyToDisplay(key);
    let it = caches.maps.manifestByDisplay.get(safeKey(display));
    if (it) return it;

    // Try name|model
    const pair = keyToPair(key);
    it = caches.maps.manifestByKey.get(safeKey(`${pair.name}|${pair.model}`));
    if (it) return it;

    // Fallback: loose match by stripping punctuation/case
    for (const [k, v] of caches.maps.manifestByDisplay.entries()) {
      if (k === safeKey(display)) return v;
    }
    return null;
  }

  function lookupWeapon(name) {
    if (!name) return null;
    const k = safeKey(name);
    return (
      caches.maps.weapByName.get(k) ||
      caches.maps.weapByAlias.get(k) ||
      null
    );
  }

  function ammoText(rec) {
    if (!rec) return "";
    // Energy/melee → ∞ ; else show ammo kind string if present
    if (String(rec.type || "").toLowerCase() === "energy" || String(rec.type || "").toLowerCase() === "melee") return "∞";
    return rec.ammo ? String(rec.ammo) : "";
  }

  function parseHeatSinks(hsStr) {
    // examples: "10 Single", "22 Double", "12 IS Double", "11 Clan Double"
    if (!hsStr || typeof hsStr !== "string") return { count: 0, isDouble: false, capacity: 0 };
    const m = hsStr.match(/(\d+)\s+(.+)/i);
    const count = m ? parseInt(m[1], 10) : 0;
    const rest = (m ? m[2] : "").toLowerCase();
    const isDouble = rest.includes("double");
    const capacity = count * (isDouble ? 2 : 1);
    return { count, isDouble, capacity };
  }

  function pipRow(label, count, cls) {
    const r = el("div", "lrow");
    r.appendChild(el("div", "lab", label));
    const p = el("div", "pips");
    for (let i = 0; i < count; i++) p.appendChild(el("div", `pip ${cls}`));
    r.appendChild(p);
    return r;
  }

  function internalCount(loc) {
    switch (loc) {
      case "HD": return 3;
      case "CT": return 11;
      case "LT":
      case "RT": return 8;
      case "LA":
      case "RA": return 5;
      case "LL":
      case "RL": return 7;
      default: return 0;
    }
  }

  function tr(arr) {
    return `<tr>${arr.map((v) => `<td>${v ?? ""}</td>`).join("")}</tr>`;
  }

  function setText(sel, val) {
    const el = root.querySelector(sel);
    if (el) el.textContent = String(val);
  }

  function el(tag, cls, txt) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (txt != null) d.textContent = String(txt);
    return d;
  }

  function getNum(v, d) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  function val(x) {
    return x === 0 || !!x ? x : "";
  }

  function keyToDisplay(key) {
    if (typeof key === "string") return key;
    if (key && key.name) return `${key.name} ${key.model || ""}`.trim();
    return "";
  }

  function keyToPair(key) {
    if (typeof key === "string") {
      const m = key.trim().match(/^(.*?)\s+([^\s]+)$/);
      return { name: (m ? m[1] : key).trim(), model: (m ? m[2] : "").trim() };
    }
    return { name: (key?.name || "").trim(), model: (key?.model || "").trim() };
  }

  function normalizeKeyInput(key) {
    return typeof key === "string" || (key && (key.name || key.model)) ? key : null;
  }

  function safeKey(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function resolveCurrentKey() {
    if (getCurrentMechKey) {
      return normalizeKeyInput(getCurrentMechKey());
    }
    return lastKey;
  }

  function showRoot(show) {
    root.hidden = !show;
  }

  function isVisible() {
    return !root.hidden;
  }

  // --- DOM scaffold -----------------------------------------------------------
  function buildDOM() {
    const host = document.createElement("section");
    host.className = "trs80-sheet";
    host.hidden = true;
    host.innerHTML = `
      <header class="sheet__bar">
        <h1 class="sheet__title">Technical Readout Sheet</h1>
        <div class="sheet__controls">
          <button data-action="print" title="Print this sheet">Print</button>
        </div>
      </header>

      <div class="trs80-sheet__grid is-empty">
        <div class="trs80-sheet__empty">Select a ’Mech to view its printable sheet.</div>

        <section class="card pilot" aria-label="Pilot & Mech">
          <div class="grid2">
            <div class="lab">PILOT</div> <div contenteditable="true" class="editable" id="pilotName" data-placeholder="Type name…"></div>
            <div class="lab">CALL SIGN</div> <div contenteditable="true" class="editable" id="pilotCallsign" data-placeholder="Type callsign…"></div>
            <div class="lab">GUNNERY (G)</div> <div contenteditable="true" class="editable short" id="pilotG" data-placeholder="—"></div>
            <div class="lab">PILOTING (P)</div> <div contenteditable="true" class="editable short" id="pilotP" data-placeholder="—"></div>
            <div class="lab">HITS TAKEN</div> <div class="val">|01| |02| |03| |04| |05| |06|</div>
            <div class="lab">CONSCIOUSNESS #</div> <div class="val">|03| |05| |07| |10| |11| |KIA|</div>
          </div>
          <hr/>
          <div class="grid2">
            <div class="lab">CHASSIS</div> <div class="val"><span id="mechChassis">—</span><sup id="mechVariant">—</sup></div>
            <div class="lab">TECH BASE</div> <div class="val" id="mechTech">—</div>
            <div class="lab">TONNAGE</div> <div class="val" id="mechTonnage">—</div>
            <div class="lab">BV</div> <div class="val" id="mechBV">—</div>
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

      <footer class="sheet__legal">
        <p><strong>Unofficial, non-commercial fan work.</strong></p>
        <p>BattleTech®, BattleMech®, ’Mech®, and AeroTech® are trademarks or registered trademarks of The Topps Company, Inc.</p>
        <p>Catalyst Game Labs and the Catalyst Game Labs logo are trademarks of InMediaRes Productions, LLC.</p>
        <p>MechWarrior® and related marks are trademarks of Microsoft Corporation.</p>
        <p>This sheet is not affiliated with, endorsed, or sponsored by The Topps Company, Inc., Catalyst Game Labs, or Microsoft.</p>
      </footer>
    `;

    // Heat table rows (30 -> 1)
    const HEAT = {
      30: "Shutdown", 28: "Ammo explosion chk (8+)", 26: "Shutdown (10+)",
      25: "-5 MP", 24: "+4 To-Hit", 23: "Ammo explosion chk (6+)",
      22: "Shutdown (8+)", 20: "-4 MP", 19: "Ammo explosion chk (4+)",
      17: "Shutdown (6+)", 15: "+3 To-Hit", 14: "-3 MP", 12: "+2 To-Hit",
      10: "-2 MP", 8: "+1 To-Hit"
    };
    const heatBody = host.querySelector("#heatRows");
    for (let h = 30; h >= 1; h--) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>[${String(h).padStart(2, "0")}]</td><td>${HEAT[h] || "—"}</td>`;
      heatBody.appendChild(tr);
    }

    document.body.appendChild(host);
    return host;
  }

  function renderAwaitSelection() {
    const grid = root.querySelector(".trs80-sheet__grid");
    grid.classList.add("is-empty");
    grid.querySelector(".trs80-sheet__empty").hidden = false;
  }

  function renderError(msg) {
    const grid = root.querySelector(".trs80-sheet__grid");
    grid.classList.add("is-empty");
    const empty = grid.querySelector(".trs80-sheet__empty");
    empty.textContent = msg;
    empty.hidden = false;
  }

  // --- Responsive pips --------------------------------------------------------
  function updatePipCols() {
    root.querySelectorAll(".pips").forEach((p) => {
      const cs = getComputedStyle(p);
      const gap = parseFloat(cs.columnGap) || 0;
      const cellRaw = cs.getPropertyValue("--pip-cell").trim();
      const cellNum = parseFloat(cellRaw);
      const cellPx = cellRaw.endsWith("in") ? cellNum * 96 : cellNum; // assume 96dpi
      const width = p.clientWidth;
      const maxCols = 10;
      const cols = Math.max(1, Math.min(maxCols, Math.floor((width + gap) / (cellPx + gap))));
      p.style.setProperty("--pip-cols", cols);
    });
  }

  // --- Style injection (scoped) -----------------------------------------------
  function injectStyle() {
    if (document.getElementById("trs80-sheet-style")) return;
    const s = document.createElement("style");
    s.id = "trs80-sheet-style";
    s.textContent = `
:root{
  --bg:#111; --pane:#0b0b0b; --line:#2a2a2a; --ink:#eaeaea; --muted:#9bb;
  --font:"Inter",ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto;
  --pip-size:0.09in; --pip-cell:0.12in; --pip-gap:0.01in;
}
.trs80-sheet{max-width:1500px;margin:12px auto;padding:0 8px}
.trs80-sheet[hidden]{display:none!important}
.trs80-sheet .sheet__bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.trs80-sheet .sheet__title{margin:0;font-size:1.1rem}
.trs80-sheet .sheet__controls button{background:#151515;border:1px solid var(--line);color:var(--ink);padding:6px 10px;cursor:pointer}
.trs80-sheet__grid{
  display:grid;
  grid-template-columns:310px 1fr 220px;
  grid-template-rows:auto auto auto;
  gap:12px;
  grid-template-areas:"pilot armor heat" "weapons weapons heat" "equipment equipment heat";
  position:relative;
}
.trs80-sheet__grid.is-empty .card,
.trs80-sheet__grid.is-empty .sheet__legal{opacity:.15;pointer-events:none;filter:grayscale(1)}
.trs80-sheet__empty{
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  font-size:14px; color:var(--muted); background:linear-gradient(transparent, rgba(0,0,0,.25) 30%, transparent);
}

/* Cards */
.trs80-sheet .card{background:var(--pane);border:1px solid var(--line);padding:10px;min-width:0;min-height:0;display:flex;flex-direction:column}
.trs80-sheet .card h2{margin:0 0 8px 0;font-size:1rem}

.trs80-sheet .pilot{grid-area:pilot}
.trs80-sheet .card.armor{grid-area:armor}
.trs80-sheet .heat{grid-area:heat}
.trs80-sheet .weapons{grid-area:weapons}
.trs80-sheet .equipment{grid-area:equipment}

.trs80-sheet .grid2{display:grid;grid-template-columns:120px 1fr;gap:4px 8px;font-size:12px}
.trs80-sheet .grid2 .lab{color:var(--muted)}
.trs80-sheet .grid2 .val{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.trs80-sheet .editable{min-height:14px;border-bottom:1px solid var(--line);padding:0 2px}
.trs80-sheet .editable.short{max-width:36px;text-align:center}
.trs80-sheet .editable:empty:before{content:attr(data-placeholder); color:var(--muted)}

.trs80-sheet .hints{margin-top:6px;display:flex;gap:14px;font-size:11px;color:var(--muted)}

/* Armor matrix */
.trs80-sheet .armorMatrix{display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:1fr 1fr;gap:8px;min-height:0}
.trs80-sheet .loc{border:1px solid var(--line);padding:6px;background:#0b0b0b;display:flex;flex-direction:column;gap:4px}
.trs80-sheet .locHeader{display:flex;justify-content:space-between;align-items:center}
.trs80-sheet .locHeader .name{font-weight:600}
.trs80-sheet .locHeader .roll{color:var(--muted);font-size:11px}
.trs80-sheet .lrow{display:grid;grid-template-columns:50px 1fr;gap:6px;align-items:center}
.trs80-sheet .lrow .lab{color:var(--muted);font-size:10px}
.trs80-sheet .pips{
  display:grid;
  grid-template-columns: repeat(var(--pip-cols, 10), var(--pip-cell));
  grid-auto-rows: var(--pip-cell);
  gap: calc(var(--pip-gap) * 0.5) var(--pip-gap);
  justify-content:start; align-content:start;
}
@media print{ .trs80-sheet .pips{ --pip-cols: 10 !important; } }
.trs80-sheet .pip{width:var(--pip-size);height:var(--pip-size);border:1px solid #aab;background:transparent}
.trs80-sheet .pip.armor{border-radius:50%}
.trs80-sheet .pip.internal{border-radius:2px;transform:rotate(45deg)}
.trs80-sheet .pip.rear{border-radius:2px}

/* Heat */
.trs80-sheet .heat{display:flex}
.trs80-sheet .heatTable{width:100%;table-layout:fixed;border-collapse:collapse;font-size:10px;flex:1}
.trs80-sheet .heatTable th,.trs80-sheet .heatTable td{border:1px solid var(--line);padding:2px 4px;vertical-align:top}
.trs80-sheet .heatTable th{background:#1a1a1a;font-weight:600}
.trs80-sheet .heatTable th:first-child,.trs80-sheet .heatTable td:first-child{width:56px;text-align:center}
.trs80-sheet .heatTotal{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border-top:1px solid var(--line);font-size:14px;padding-top:6px;font-weight:600}
.trs80-sheet .heatTotal .hsField{display:flex;flex-direction:column;gap:2px;font-weight:600}
.trs80-sheet .heatTotal .sup{font-size:10px;color:var(--muted);font-weight:400}

/* Weapons */
.trs80-sheet .weapTable{width:100%;table-layout:fixed;border-collapse:collapse;font-size:12px}
.trs80-sheet .weapTable th,.trs80-sheet .weapTable td{border:1px solid var(--line);padding:3px 4px;text-align:center}
.trs80-sheet .weapTable th{background:#1a1a1a;font-weight:600}
.trs80-sheet .weapTable th:nth-child(1){width:32%}.trs80-sheet .weapTable td:nth-child(1){text-align:left}
.trs80-sheet .weapTable th:nth-child(2){width:14%}
.trs80-sheet .weapTable th:nth-child(3),.trs80-sheet .weapTable th:nth-child(4){width:7%}
.trs80-sheet .weapTable th:nth-child(5){width:6%}
.trs80-sheet .weapTable th:nth-child(6){width:8%}
.trs80-sheet .weapTable th:nth-child(7){width:10%}
.trs80-sheet .weapTable th:nth-child(8){width:10%}
.trs80-sheet .weapTable th:nth-child(9){width:6%}

/* Equipment grid */
.trs80-sheet .equipGrid{display:grid;grid-template-columns:repeat(8,36px minmax(0,1fr));column-gap:4px;row-gap:4px;font-size:10px}
.trs80-sheet .eqH{font-weight:600}
.trs80-sheet .equipGrid .eqH:nth-child(odd){ text-align:right; padding-right:2px }
.trs80-sheet .equipGrid .eqH:nth-child(even){ text-align:left }
.trs80-sheet .eqRows{grid-column:1 / -1; display:grid; grid-template-columns:inherit; column-gap:4px; row-gap:4px}
.trs80-sheet .eqSlot{ color:var(--muted); font-size:10px; text-align:right; padding-right:2px }
.trs80-sheet .eqVal{ border-bottom:1px solid var(--line); min-height:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:10px }

/* Footer */
.trs80-sheet .sheet__legal{opacity:.8;font-size:9px;margin-top:6px}

/* Print */
@media print{
  @page{size:11in 8.5in; margin:0.25in}
  body{background:#fff;color:#000}
  .trs80-sheet{max-width:none;margin:0}
  .trs80-sheet .sheet__controls{display:none}
  .trs80-sheet .card{border-color:#000}
  .trs80-sheet .weapTable th,.trs80-sheet .weapTable td,.trs80-sheet .heatTable th,.trs80-sheet .heatTable td{border-color:#000;background:#fff;color:#000}
  .trs80-sheet .pip{border-color:#000}
}
    `;
    document.head.appendChild(s);
  }

  // --- Fetch helper -----------------------------------------------------------
  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.json();
  }
})();
