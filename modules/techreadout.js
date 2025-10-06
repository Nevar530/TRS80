// /modules/techreadout.js
// Island module: owns Tech Readout tab (subtabs + content).
// Embeds mech image at top of Lore & History (height-constrained, aspect preserved).

const DEFAULTS = {
  images: { getFor: async (_name) => null }, // inject your images module
  imageMaxPx: 320
};
let cfg = { ...DEFAULTS };
let rootEl = null;

export function mount(root, options = {}) {
  cfg = { ...DEFAULTS, ...options };
  rootEl = getEl(root);
  if (!rootEl) {
    console.warn("[techreadout] mount root not found:", root);
    return;
  }

  rootEl.classList.add("mod-tech");
  rootEl.innerHTML = `
    <div class="tr-compact">
      <div class="gtr-subtabs" role="tablist" aria-label="Tech Readout sections">
        <button class="gtr-subtab is-active" role="tab" aria-selected="true"  data-tr-tab="tr-pane-C">Chassis &amp; Systems</button>
        <button class="gtr-subtab"           role="tab" aria-selected="false" data-tr-tab="tr-pane-AI">Armor &amp; Internals</button>
        <button class="gtr-subtab"           role="tab" aria-selected="false" data-tr-tab="tr-pane-EQ">Equipment</button>
        <button class="gtr-subtab"           role="tab" aria-selected="false" data-tr-tab="tr-pane-LORE">Lore &amp; History</button>
      </div>

      <section id="tr-pane-C" class="gtr-pane is-active" role="tabpanel" aria-labelledby="Chassis & Systems">
        <div id="tr-sys"></div>
        <hr class="modal-divider">
        <div><strong>Weapons</strong><div class="mt6" id="tr-wep-summary">—</div></div>
        <hr class="modal-divider">
        <div id="tr-misc"></div>
        <div id="tr-mfr-wrap" hidden></div>
        <div id="tr-license-wrap" class="small dim" hidden></div>
      </section>

      <section id="tr-pane-AI" class="gtr-pane" role="tabpanel" aria-labelledby="Armor & Internals">
        <div id="tr-armor-table"></div>
        <hr class="modal-divider">
      </section>

      <section id="tr-pane-EQ" class="gtr-pane" role="tabpanel" aria-labelledby="Equipment">
        <div id="loc-equip-wrap" hidden>
          <strong>Equipment by Location</strong>
          <table class="small mono fullw">
            <thead><tr><th style="width:160px;">Location</th><th>Items</th></tr></thead>
            <tbody id="loc-equip-body"></tbody>
          </table>
        </div>
        <div id="tr-equipment" hidden></div>
        <div id="tr-ammo" hidden></div>
      </section>

      <section id="tr-pane-LORE" class="gtr-pane" role="tabpanel" aria-labelledby="Lore & History">
        <div id="tr-lore-img"></div>
        <div id="tr-lore-content" class="mt6"><!-- paragraphs --></div>
      </section>
    </div>
  `;

  wireSubtabs();
}

export function destroy() {
  if (!rootEl) return;
  rootEl.innerHTML = "";
}

export function clear() {
  if (!rootEl) return;
  sel("#tr-sys").innerHTML = "";
  sel("#tr-wep-summary").textContent = "—";
  sel("#tr-misc").innerHTML = "";
  sel("#tr-armor-table").innerHTML = "";
  sel("#loc-equip-body").innerHTML = "";
  sel("#tr-equipment").innerHTML = "";
  sel("#tr-ammo").innerHTML = "";
  sel("#tr-lore-img").innerHTML = "";
  sel("#tr-lore-content").innerHTML = "";
}

export async function render(mech) {
  if (!rootEl || !mech) return clear();

  // Chassis & Systems
  sel("#tr-sys").innerHTML = sysHtml(mech);
  sel("#tr-wep-summary").innerHTML = weaponsSummary(mech);
  sel("#tr-misc").innerHTML = miscHtml(mech);

  // Armor & Internals
  sel("#tr-armor-table").innerHTML = armorHtml(mech);

  // Equipment
  renderEquipment(mech);

  // Lore & Image
  await renderLoreWithImage(mech);
}

/* -------------------- Internals -------------------- */

function wireSubtabs() {
  const tabs = rootEl.querySelectorAll(".gtr-subtab");
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.trTab;
      rootEl.querySelectorAll(".gtr-subtab").forEach(b => {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-selected", String(b === btn));
      });
      rootEl.querySelectorAll(".gtr-pane").forEach(p => {
        p.classList.toggle("is-active", p.id === id);
      });
    });
  });
}

function sysHtml(m) {
  const name   = dname(m);
  const mass   = d(m.mass ?? m.tonnage, "—");
  const base   = d(m.techBase, "—");
  const rules  = d(m.rulesLevel ?? m.rules, "—");
  const engine = d(m.engine, "—");
  const hs     = d(m.heatSinks ?? m.heatSinksType ?? m.hst, "—");
  const move   = d(m.movement?.text || m.movement?.walk || m.walk, "—");
  const struct = d(m.structure, "—");
  const cockpit= d(m.cockpit, "—");
  const gyro   = d(m.gyro, "—");
  const config = d(m.config, "—");
  const role   = d(m.role, "—");

  return `
    <div class="tro-grid">
      <div><strong>Chassis</strong><br><span>${esc(name)}</span></div>
      <div><strong>Tonnage</strong><br><span>${esc(mass)} t</span></div>
      <div><strong>Tech Base</strong><br><span>${esc(base)}</span></div>
      <div><strong>Rules Level</strong><br><span>${esc(rules)}</span></div>
      <div><strong>Engine</strong><br><span>${esc(engine)}</span></div>
      <div><strong>Heat Sinks</strong><br><span>${esc(hs)}</span></div>
      <div><strong>Movement</strong><br><span>${esc(move)}</span></div>
      <div><strong>Structure</strong><br><span>${esc(struct)}</span></div>
      <div><strong>Cockpit</strong><br><span>${esc(cockpit)}</span></div>
      <div><strong>Gyro</strong><br><span>${esc(gyro)}</span></div>
      <div><strong>Config</strong><br><span>${esc(config)}</span></div>
      <div><strong>Role</strong><br><span>${esc(role)}</span></div>
    </div>
  `;
}

function weaponsSummary(m) {
  const ws = (m.weapons || m.armaments || []);
  if (!ws.length) return "—";
  const names = ws.map(w => (typeof w === "string" ? w : (w.name || w.item || ""))).filter(Boolean);
  return esc(names.join(", "));
}

function miscHtml(m) {
  const bv    = d(m.bv ?? m.battleValue, "—");
  const cost  = d(m.cost, "—");
  const era   = d(m.era ?? m.year, "—");
  const src   = d(m.source ?? m.sources, "—");
  const mfr   = m.manufacturers || m.mfrs || null;
  const fac   = m.factories || null;
  const sys   = m.systems || null;
  const origin= m.origin || null;
  const license= m.license || null;
  const cr    = m.copyright || null;

  let html = `
    <div class="tro-grid">
      <div><strong>Battle Value (BV)</strong><br><span>${esc(bv)}</span></div>
      <div><strong>Cost</strong><br><span>${esc(cost)}</span></div>
      <div><strong>Era / Year</strong><br><span>${esc(era)}</span></div>
      <div><strong>Sources</strong><br><span>${esc(src)}</span></div>
    </div>
  `;

  if (mfr || fac || sys) {
    html += `
      <div class="tro-grid" style="margin-top:.5rem">
        ${mfr ? `<div><strong>Manufacturers</strong><br><span>${esc(mfr)}</span></div>` : ""}
        ${fac ? `<div><strong>Primary Factories</strong><br><span>${esc(fac)}</span></div>` : ""}
        ${sys ? `<div style="grid-column:1/-1;"><strong>Systems</strong><br><span>${esc(sys)}</span></div>` : ""}
      </div>
    `;
  }

  if (origin || license || cr) {
    html += `
      <div class="small dim" style="margin-top:.5rem">
        ${origin ? `<div>${esc(origin)}</div>` : ""}
        ${license ? `<div>${esc(license)}</div>` : ""}
        ${cr ? `<div>${esc(cr)}</div>` : ""}
      </div>
    `;
  }

  return html;
}

function armorHtml(m) {
  const armor = m.armorByLocation || m.armor || {};
  const rear  = m.rearArmorByLocation || m.rearArmor || {};
  const intr  = m.internalsByLocation || m.internals || {};

  const rows = [
    ['Head','HD'],
    ['Center Torso','CT'],
    ['Right Torso','RT'],
    ['Left Torso','LT'],
    ['Right Arm','RA'],
    ['Left Arm','LA'],
    ['Right Leg','RL'],
    ['Left Leg','LL']
  ].map(([label,k]) => {
    const a  = pick(armor, k);
    const ar = pick(rear,  k);
    const i  = pick(intr,  k);
    return `<tr><td>${label}</td><td>${esc(a ?? "—")}</td><td>${esc(ar ?? "—")}</td><td>${esc(i ?? "—")}</td></tr>`;
  }).join("");

  return `
    <div>
      <strong>Armor &amp; Internals by Location</strong>
      <table class="small mono fullw">
        <thead><tr><th>Location</th><th>Armor</th><th>Rear</th><th>Internal</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderEquipment(m) {
  const eq = (m.equipment || []).filter(e => !isWeaponLike(e));
  const byLoc = groupByLoc(eq);

  const locWrap = sel("#loc-equip-wrap");
  const tbody = sel("#loc-equip-body");
  const eqDiv = sel("#tr-equipment");
  const ammoDiv = sel("#tr-ammo");

  if (byLoc.size) {
    locWrap.hidden = false;
    tbody.innerHTML = [...byLoc.entries()].map(([loc, items]) => {
      return `<tr><td>${esc(loc)}</td><td>${items.map(i => esc(nameOf(i))).join(", ")}</td></tr>`;
    }).join("");
  } else {
    locWrap.hidden = true;
    tbody.innerHTML = "";
  }

  const misc = eq.filter(e => !e.location && !e.loc);
  eqDiv.hidden = misc.length === 0;
  if (!eqDiv.hidden) eqDiv.innerHTML = `<strong>Equipment</strong><div class="mt6">${misc.map(i => esc(nameOf(i))).join(", ")}</div>`;

  const ammo = (m.ammo || []).map(a => a.name || a.item || a.type).filter(Boolean);
  ammoDiv.hidden = ammo.length === 0;
  if (!ammoDiv.hidden) ammoDiv.innerHTML = `<strong>Ammunition</strong><div class="mt6">${ammo.map(esc).join(", ")}</div>`;
}

async function renderLoreWithImage(m) {
  const imgWrap = sel("#tr-lore-img");
  const loreWrap = sel("#tr-lore-content");
  imgWrap.innerHTML = "";
  loreWrap.innerHTML = "";

  const nameForArt = dname(m);
  let meta = null;
  try {
    meta = await cfg.images.getFor(nameForArt);
  } catch { /* ignore */ }

  if (meta?.url) {
    const cap = [meta.title, meta.credits].filter(Boolean).join(" — ");
    imgWrap.innerHTML = `
      <figure class="trs-lore-figure" style="
        width:100%;max-height:${cfg.imageMaxPx}px;margin:0 0 .75rem 0;display:grid;grid-template-rows:1fr auto;gap:.25rem;">
        <div style="min-height:100px;max-height:${cfg.imageMaxPx - 24}px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--panel-bg, rgba(255,255,255,0.03));border-radius:6px;">
          <img src="${esc(meta.url)}" alt="${esc(nameForArt)}" style="width:100%;height:100%;object-fit:contain;display:block;">
        </div>
        ${cap ? `<figcaption style="opacity:.7;font-size:.85em;">${esc(cap)}</figcaption>` : ""}
      </figure>
    `;
  }

  const lore = m.lore || m.history || m.overview || "";
  loreWrap.innerHTML = toParas(lore || "—");
}

/* -------------------- Helpers -------------------- */

function getEl(x){ return (typeof x === "string") ? document.querySelector(x) : x; }
function sel(s){ return rootEl.querySelector(s); }
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }
function d(v, fallback=""){ return (v == null || v === "") ? fallback : v; }
function dname(m){ return m.displayName || [m.name, m.model].filter(Boolean).join(" ") || ""; }
function pick(obj, k){ return obj?.[k] ?? obj?.[k?.toUpperCase?.()] ?? null; }
function isWeaponLike(e){ const n=(e?.name||e?.item||"").toLowerCase(); return /\b(laser|ppc|ac[-\s]?\d|gauss|srm|lrm|flamer|mg)\b/.test(n); }
function groupByLoc(items){
  const map = new Map();
  items.forEach(i => {
    const loc = i.location || i.loc || "—";
    if (!map.has(loc)) map.set(loc, []);
    map.get(loc).push(i);
  });
  return map;
}
function nameOf(e){ return e?.name ?? e?.item ?? "—"; }
function toParas(text){
  return String(text).trim().split(/\n{2,}/g).map(p => `<p>${esc(p)}</p>`).join("");
}
