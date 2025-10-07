// modules/sheet.js — matches your CodePen layout 1:1, no routers, self-contained
(() => {
  const API = {};
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (x) => (x == null ? "—" : String(x));

  // build once
  function ensureDOM() {
    let root = $("#sheet-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "sheet-root";
      document.body.appendChild(root);
    }

    // inject CodePen CSS (trimmed only for fonts reset; core layout kept 1:1)
    if (!$("#trs80-sheet-style")) {
      const s = document.createElement("style");
      s.id = "trs80-sheet-style";
      s.textContent = `
:root{
  --bg:#111; --pane:#0b0b0b; --line:#2a2a2a; --ink:#eaeaea; --muted:#9bb;
  --font:"Inter", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto;
  /* pips */
  --pip-size:0.09in; --pip-cell:0.12in; --pip-gap:0.01in;
}
.sheet{font-family:var(--font); color:var(--ink)}
.sheet .grid{display:grid; grid-template-columns:310px 1fr 220px; grid-template-rows:auto auto auto; gap:12px;
  grid-template-areas: "pilot armor heat" "weapons weapons heat" "equipment equipment heat";
}
.card{background:var(--pane); border:1px solid var(--line); padding:10px}
.pilot{grid-area:pilot}
.armor{grid-area:armor}
.heat{grid-area:heat}
.weapons{grid-area:weapons}
.equipment{grid-area:equipment}
.sheet__title{margin:0 0 8px 0; font-size:1.1rem}
.grid2{display:grid; grid-template-columns:120px 1fr; gap:4px 8px; font-size:12px}
.grid2 .lab{color:var(--muted)}
.grid2 .val{white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.hints{margin-top:6px; display:flex; gap:14px; font-size:11px; color:var(--muted)}
/* Armor matrix */
.armorMatrix{display:grid; grid-template-columns:repeat(4,1fr); grid-template-rows:1fr 1fr; gap:8px}
.loc{border:1px solid var(--line); padding:6px; background:#0b0b0b; display:flex; flex-direction:column; gap:4px}
.locHeader{display:flex; justify-content:space-between; align-items:center}
.locHeader .name{font-weight:600}
.locHeader .roll{color:var(--muted); font-size:11px}
.lrow{display:grid; grid-template-columns:50px 1fr; gap:6px; align-items:center}
.lrow .lab{color:var(--muted); font-size:10px}
/* Pips */
.pips{display:grid; grid-template-columns: repeat(var(--pip-cols, 10), var(--pip-cell)); grid-auto-rows: var(--pip-cell);
  gap: calc(var(--pip-gap) * 0.5) var(--pip-gap); justify-content:start; align-content:start}
.pip{width:var(--pip-size); height:var(--pip-size); border:1px solid #aab; background:transparent}
.pip.armor{border-radius:50%}
.pip.internal{border-radius:2px; transform:rotate(45deg)}
.pip.rear{border-radius:2px}
/* Heat */
.heatTable{width:100%; table-layout:fixed; border-collapse:collapse; font-size:10px}
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
/* Equipment grid */
.equipGrid{display:grid; grid-template-columns:repeat(8,36px minmax(0,1fr)); column-gap:4px; row-gap:4px; font-size:10px}
.eqH{font-weight:600}
.equipGrid .eqH:nth-child(odd){text-align:right; padding-right:2px}
.equipGrid .eqH:nth-child(even){text-align:left}
.eqRows{grid-column:1 / -1; display:grid; grid-template-columns:inherit; column-gap:4px; row-gap:4px}
.eqSlot{color:var(--muted); font-size:10px; text-align:right; padding-right:2px}
.eqVal{border-bottom:1px solid var(--line); min-height:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:10px}
@media print{ @page{size:11in 8.5in; margin:0.25in} .pips{--pip-cols:10 !important} }
      `;
      document.head.appendChild(s);
    }

    // inject CodePen markup (scoped inside our pane)
    if (!$("#trs80-sheet-host")) {
      const host = document.createElement("section");
      host.id = "trs80-sheet-host";
      host.className = "sheet";
      host.innerHTML = `
<header class="sheet__bar">
  <div class="sheet__controls">
    <!-- we don't need the CodePen selector/print for in-app; keep title in the card instead -->
  </div>
</header>

<div class="grid">
  <!-- TOP LEFT -->
  <section class="card pilot" aria-label="Pilot & Mech">
    <h1 class="sheet__title">Technical Readout Sheet</h1>
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

  <!-- TOP CENTER -->
  <section class="card armor" aria-label="Armor / Structure">
    <h2>Armor / Structure by Location</h2>
    <div id="armorMatrix" class="armorMatrix"></div>
  </section>

  <!-- RIGHT COLUMN -->
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

  <!-- MIDDLE -->
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

  <!-- BOTTOM -->
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
  Unofficial, non-commercial fan work. BattleTech®, BattleMech®, ’Mech®, and AeroTech® are trademarks or registered trademarks of The Topps Company, Inc. Catalyst Game Labs and the Catalyst Game Labs logo are trademarks of InMediaRes Productions, LLC. This sheet is not affiliated with, or endorsed by those rights holders.
</footer>
      `;
      root.appendChild(host);

      // Static heat rows (30 → 1)
      const HEAT = {
        30:"Shutdown", 28:"Ammo explosion chk (8+)", 26:"Shutdown (10+)",
        25:"-5 MP", 24:"+4 To-Hit", 23:"Ammo explosion chk (6+)",
        22:"Shutdown (8+)", 20:"-4 MP", 19:"Ammo explosion chk (4+)",
        17:"Shutdown (6+)", 15:"+3 To-Hit", 14:"-3 MP", 12:"+2 To-Hit",
        10:"-2 MP", 8:"+1 To-Hit"
      };
      const heatBody = $("#heatRows", host);
      for (let h=30; h>=1; h--) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>[${String(h).padStart(2,"0")}]</td><td>${HEAT[h] || "—"}</td>`;
        heatBody.appendChild(tr);
      }
    }

    return $("#trs80-sheet-host");
  }

  // helpers
  const get = (m, p, d=null) => p.split(".").reduce((o,k)=> (o && o[k] != null ? o[k] : null), m) ?? d;
  const num = (x, d=0) => (Number.isFinite(Number(x)) ? Number(x) : d);

  function hsInfo(mech){
    if (mech?.sinks?.count != null) {
      const cnt = num(mech.sinks.count,0), dbl = /double/i.test(String(mech.sinks.type||""));
      return { type: dbl ? "Double" : "Single", count: cnt, cap: cnt * (dbl?2:1) };
    }
    const s = String(mech?.heatSinks ?? "");
    const m = s.match(/(\d+)/); const cnt = m ? parseInt(m[1],10) : null; const dbl = /double/i.test(s);
    return { type: cnt==null ? "—" : (dbl?"Double":"Single"), count: cnt ?? "—", cap: cnt==null ? "—" : cnt*(dbl?2:1) };
  }

  function pipRow(label, count, cls){
    const r = document.createElement("div"); r.className = "lrow";
    r.innerHTML = `<div class="lab">${label}</div><div class="pips">${"<div class='pip "+cls+"'></div>".repeat(Math.max(0, count))}</div>`;
    return r;
  }

  function drawArmor(mech, host){
    const grid = $("#armorMatrix", host);
    grid.innerHTML = "";
    const order = ["LA","HD","CT","RA","LL","LT","RT","RL"];
    const A = mech.armor || {};
    const front = {
      LA: get(A,"leftArm",0), HD: get(A,"head",0), CT: get(A,"centerTorso",0), RA: get(A,"rightArm",0),
      LL: get(A,"leftLeg",0), LT: get(A,"leftTorso",0), RT: get(A,"rightTorso",0), RL: get(A,"rightLeg",0)
    };
    const rear = {
      LT: get(A,"rearLeftTorso",0), CT: get(A,"rearCenterTorso",0), RT: get(A,"rearRightTorso",0)
    };
    const ROLL = { LA:"[04-05]", HD:"[12]", RA:"[09-10]", LL:"[03]", LT:"[06]", CT:"[02/07]", RT:"[08]", RL:"[11]" };
    const INTERNALS = {HD:3, CT:11, LT:8, RT:8, LA:5, RA:5, LL:7, RL:7};

    for (const code of order) {
      const box = document.createElement("div"); box.className = "loc";
      box.innerHTML = `<div class="locHeader"><div class="name">${code}</div><div class="roll">${ROLL[code]||"[—]"}</div></div>`;
      box.appendChild(pipRow("ARMOR", num(front[code],0), "armor"));
      box.appendChild(pipRow("INTERNAL", INTERNALS[code]||0, "internal"));
      if (code === "LT" || code === "CT" || code === "RT") {
        box.appendChild(pipRow("REAR", num(rear[code],0), "rear"));
      }
      grid.appendChild(box);
    }
  }

  function drawWeapons(mech, host){
    const tbody = $("#weapRows", host);
    tbody.innerHTML = "";
    // melee conveniences from tonnage
    const tons = mech.tonnage ?? mech.Tonnage ?? mech.mass ?? 0;
    const punch = Math.ceil(tons / 10), kick = Math.ceil(tons / 5), charge = Math.ceil(tons / 10), dfa = Math.ceil(kick*1.5);
    const melee = [
      ["Punch","Melee", punch,0,1,1,1,1,"∞"],
      ["Kick","Melee",  kick,0,1,1,1,1,"∞"],
      ["Charge","Melee",charge,0,1,1,1,1,"∞"],
      ["DFA","Melee",   dfa,  0,1,1,1,1,"∞"]
    ];
    for (const row of melee) tbody.insertAdjacentHTML("beforeend", `<tr>${row.map(c=>`<td>${c}</td>`).join("")}</tr>`);

    const list = Array.isArray(mech.weapons) ? mech.weapons : [];
    if (!list.length) return;

    for (const w of list) {
      // we only have names/locs in mech JSON; the detailed stats table cells will be left blank if unknown
      const row = [
        esc(w.name || w.type || "—"),
        "", "", "", "", "", "", "", ""   // TYPE / DMG / HEAT / ranges / ammo — optional if you later wire a catalog
      ];
      tbody.insertAdjacentHTML("beforeend", `<tr>${row.map(c=>`<td>${c}</td>`).join("")}</tr>`);
    }
  }

  function drawEquipment(mech, host){
    const eq = $("#equipRows", host);
    eq.innerHTML = "";
    const locs = mech.locations || {};
    const cols = ["LA","LL","LT","CT","HD","RT","RL","RA"];
    const map  = {LA:"leftArm",LL:"leftLeg",LT:"leftTorso",CT:"centerTorso",HD:"head",RT:"rightTorso",RL:"rightLeg",RA:"rightArm"};
    // baseline 12 rows like CodePen
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
    // optional: compact visual if many rows
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

  function render(mech){
    const host = ensureDOM();
    // header meta
    $("#mechChassis", host).textContent = esc(mech?.displayName || mech?.name || "—");
    $("#mechVariant", host).textContent = esc(mech?.model || mech?.variant || "—");
    $("#mechTech", host).textContent    = esc(mech?.techBase || mech?.tech || "—");
    $("#mechTonnage", host).textContent = esc(mech?.tonnage ?? mech?.Tonnage ?? mech?.mass ?? "—");
    $("#mechBV", host).textContent      = esc(mech?.bv ?? mech?.BV ?? "—");
    $("#mechMove", host).textContent    = movementString(mech);

    const hs = (()=>{
      if (mech?.sinks?.count != null) {
        const cnt = +mech.sinks.count || 0, dbl = /double/i.test(String(mech.sinks.type||""));
        return { type: dbl?"Double":"Single", count: cnt, cap: cnt*(dbl?2:1) };
      }
      const s = String(mech?.heatSinks ?? "");
      const m = s.match(/(\d+)/); const cnt = m ? parseInt(m[1],10) : null; const dbl = /double/i.test(s);
      return { type: cnt==null?"—":(dbl?"Double":"Single"), count: cnt ?? "—", cap: cnt==null?"—":cnt*(dbl?2:1) };
    })();
    $("#hsType", host).textContent     = esc(hs.type);
    $("#hsCount", host).textContent    = esc(hs.count);
    $("#hsCapacity", host).textContent = esc(hs.cap);

    // sections
    drawArmor(mech, host);
    drawWeapons(mech, host);
    drawEquipment(mech, host);
  }

  API.update = (mech) => render(mech);
  window.TRS_SHEET = API;
})();
