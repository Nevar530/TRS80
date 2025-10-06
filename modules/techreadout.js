// modules/techreadout.js
// Self-contained island for the Tech Readout tab.
// Usage in script.js:
//   import * as Tech from "./modules/techreadout.js";
//   Tech.mount("#tech-root", { images: Images, imageMaxHeight: 320 });
//   Tech.render(currentMech);

let rootEl = null;
let styleEl = null;

const cfg = {
  images: null,          // { getFor: async (name) => ({ url, title?, credits? }) }
  imageMaxHeight: 320    // px
};

let currentMech = null;

/* ============================== API ============================== */
export function mount(root, options = {}) {
  if (rootEl) destroy();
  rootEl = (typeof root === "string") ? document.querySelector(root) : root;
  if (!rootEl) throw new Error("[techreadout] mount target not found");

  cfg.images = options.images || null;
  if (typeof options.imageMaxHeight === "number") cfg.imageMaxHeight = options.imageMaxHeight;

  injectMarkup();
  injectStyles();
  bindEvents();
}

export async function render(mech) {
  currentMech = mech || null;
  if (!rootEl) return;

  if (!mech) {
    clear();
    return;
  }

  // Fill each sub-section
  fillChassis(mech);
  fillArmorInternals(mech);
  fillEquipment(mech);
  await fillLoreWithImage(mech);
}

export function clear() {
  if (!rootEl) return;
  q("#tr-c-chassis").innerHTML = "";
  q("#tr-c-armor").innerHTML = "";
  q("#tr-c-equip").innerHTML = "";
  q("#tr-c-lore").innerHTML = "";
}

export function destroy() {
  if (!rootEl) return;
  rootEl.replaceChildren();
  if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
  rootEl = null;
  styleEl = null;
  currentMech = null;
}

/* ============================ Markup ============================= */
function injectMarkup() {
  rootEl.innerHTML = [
    '<div class="mod-tech" data-module="techreadout">',
    '  <div class="mt-subtabs" role="tablist" aria-label="Tech Readout sections">',
    '    <button class="mt-subtab is-active" role="tab" aria-selected="true"  data-t="C">Chassis &amp; Systems</button>',
    '    <button class="mt-subtab"           role="tab" aria-selected="false" data-t="AI">Armor &amp; Internals</button>',
    '    <button class="mt-subtab"           role="tab" aria-selected="false" data-t="EQ">Equipment</button>',
    '    <button class="mt-subtab"           role="tab" aria-selected="false" data-t="LORE">Lore &amp; History</button>',
    '  </div>',
    '  <div class="mt-panes">',
    '    <section class="mt-pane is-active" data-p="C"  role="tabpanel" aria-labelledby="Chassis & Systems">',
    '      <div id="tr-c-chassis"></div>',
    '    </section>',
    '    <section class="mt-pane" data-p="AI" role="tabpanel" aria-labelledby="Armor & Internals">',
    '      <div id="tr-c-armor"></div>',
    '    </section>',
    '    <section class="mt-pane" data-p="EQ" role="tabpanel" aria-labelledby="Equipment">',
    '      <div id="tr-c-equip"></div>',
    '    </section>',
    '    <section class="mt-pane" data-p="LORE" role="tabpanel" aria-labelledby="Lore & History">',
    '      <div id="tr-c-lore"></div>',
    '    </section>',
    '  </div>',
    '</div>'
  ].join("");
}

function injectStyles() {
  styleEl = document.createElement("style");
  styleEl.setAttribute("data-mod", "techreadout");
  const maxH = cfg.imageMaxHeight;               // figure max height
  const innerH = Math.max(80, maxH - 24);        // inner container height (image box)
  styleEl.textContent =
    ".mod-tech{display:flex;flex-direction:column;gap:.5rem;}" +
    ".mod-tech .mt-subtabs{display:flex;gap:.25rem;flex-wrap:wrap}" +
    ".mod-tech .mt-subtab{padding:.3rem .5rem;border-radius:6px;background:transparent;border:1px solid var(--line,rgba(255,255,255,.1))}" +
    ".mod-tech .mt-subtab.is-active{background:rgba(255,255,255,.06)}" +
    ".mod-tech .mt-panes{border-top:1px solid var(--line,rgba(255,255,255,.08));padding-top:.5rem}" +
    ".mod-tech .mt-pane{display:none}" +
    ".mod-tech .mt-pane.is-active{display:block}" +
    ".mod-tech .trs-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.5rem .75rem;align-items:flex-start}" +
    ".mod-tech .trs-table{width:100%;border-collapse:collapse}" +
    ".mod-tech .trs-table th,.mod-tech .trs-table td{padding:.4rem .5rem;border-top:1px solid var(--line,rgba(255,255,255,.08))}" +
    ".mod-tech .trs-table thead th{border-top:0;opacity:.8;text-align:left}" +
    ".mod-tech figure.trs-fig{width:100%;max-height:" + maxH + "px;margin:0 0 .75rem 0;display:grid;grid-template-rows:1fr auto;gap:.25rem}" +
    ".mod-tech .trs-fig-box{min-height:100px;max-height:" + innerH + "px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--panel-bg,rgba(255,255,255,.03));border-radius:6px}" +
    ".mod-tech .trs-fig-box img{width:100%;height:100%;object-fit:contain;display:block}" +
    ".mod-tech figure.trs-fig figcaption{opacity:.7;font-size:.85em}";
  document.head.appendChild(styleEl);
}

/* ============================ Events ============================= */
function bindEvents() {
  rootEl.addEventListener("click", function (e) {
    const tab = e.target && e.target.closest(".mt-subtab");
    if (!tab) return;
    const t = tab.getAttribute("data-t");
    if (!t) return;

    rootEl.querySelectorAll(".mt-subtab").forEach(function (b) {
      b.classList.toggle("is-active", b === tab);
      b.setAttribute("aria-selected", b === tab ? "true" : "false");
    });
    rootEl.querySelectorAll(".mt-pane").forEach(function (p) {
      p.classList.toggle("is-active", p.getAttribute("data-p") === t);
    });
  });
}

/* ========================= Section Fillers ======================= */
function fillChassis(mech) {
  const name = displayName(mech) || "—";
  const tons = mech.mass != null ? String(mech.mass) : (mech.tonnage != null ? String(mech.tonnage) : "—");
  const base = mech.techBase != null ? mech.techBase : "—";
  const rules = mech.rulesLevel != null ? mech.rulesLevel : (mech.rules != null ? mech.rules : "—");
  const engine = mech.engine || "—";
  const sinks = mech.heatSinks != null ? mech.heatSinks : (mech.heatCapacity != null ? mech.heatCapacity : "—");
  const move = mech.movement ? fmtMove(mech.movement) : "—";
  const struct = mech.structure || "—";
  const cockpit = mech.cockpit || "—";
  const gyro = mech.gyro || "—";
  const config = mech.config || "—";
  const role = mech.role || "—";
  const myomer = mech.myomer || "—";
  const armorSys = mech.armorSystem || "—";
  const weapons = summarizeWeapons(mech) || "—";
  const bv = (mech.bv != null ? mech.bv : (mech.battleValue != null ? mech.battleValue : "—"));
  const cost = mech.cost != null ? mech.cost : "—";
  const era = mech.era || mech.year || "—";
  const sources = mech.source || mech.sources || "—";

  q("#tr-c-chassis").innerHTML = [
    '<div class="trs-grid">',
    '  <div><strong>Name</strong><div>' + esc(name) + '</div></div>',
    '  <div><strong>Tonnage</strong><div>' + esc(tons) + ' t</div></div>',
    '  <div><strong>Tech Base</strong><div>' + esc(base) + '</div></div>',
    '  <div><strong>Rules Level</strong><div>' + esc(rules) + '</div></div>',
    '  <div><strong>Engine</strong><div>' + esc(engine) + '</div></div>',
    '  <div><strong>Heat Sinks</strong><div>' + esc(sinks) + '</div></div>',
    '  <div><strong>Movement</strong><div>' + esc(move) + '</div></div>',
    '  <div><strong>Structure</strong><div>' + esc(struct) + '</div></div>',
    '  <div><strong>Cockpit</strong><div>' + esc(cockpit) + '</div></div>',
    '  <div><strong>Gyro</strong><div>' + esc(gyro) + '</div></div>',
    '  <div><strong>Config</strong><div>' + esc(config) + '</div></div>',
    '  <div><strong>Role</strong><div>' + esc(role) + '</div></div>',
    '  <div><strong>Myomer</strong><div>' + esc(myomer) + '</div></div>',
    '  <div><strong>Armor System</strong><div>' + esc(armorSys) + '</div></div>',
    '</div>',
    '<hr class="modal-divider">',
    '<div><strong>Weapons</strong><div class="mt6">' + esc(weapons) + '</div></div>',
    '<hr class="modal-divider">',
    '<div class="trs-grid">',
    '  <div><strong>Battle Value (BV)</strong><div>' + esc(bv) + '</div></div>',
    '  <div><strong>Cost</strong><div>' + esc(cost) + '</div></div>',
    '  <div><strong>Era / Year</strong><div>' + esc(era) + '</div></div>',
    '  <div><strong>Sources</strong><div>' + esc(sources) + '</div></div>',
    '</div>'
  ].join("");
}

function fillArmorInternals(mech) {
  const armor = mech.armorByLocation || mech.armor || {};
  const rear  = mech.rearArmorByLocation || mech.rearArmor || {};
  const intr  = mech.internalsByLocation || mech.internals || {};

  function loc(a, key, def) {
    // accept both short keys (ct) and capitals (CT)
    const k1 = key;
    const k2 = key.toUpperCase ? key.toUpperCase() : key;
    return (a && (a[k1] != null ? a[k1] : (a[k2] != null ? a[k2] : (a[def] != null ? a[def] : "—")))) || "—";
  }

  const rows = [
    ["Head [2|12]", "hd", "HD"],
    ["Center Torso [7]", "ct", "CT"],
    ["Right Torso [6]", "rt", "RT"],
    ["Left Torso [8]", "lt", "LT"],
    ["Right Arm [3|4]", "ra", "RA"],
    ["Left Arm [10|11]", "la", "LA"],
    ["Right Leg [5]", "rl", "RL"],
    ["Left Leg [9]", "ll", "LL"]
  ];

  const tr = rows.map(function (r) {
    const label = r[0], key = r[1], cap = r[2];
    const a = loc(armor, key, cap);
    const rr = loc(rear, key, "R" + cap);
    const i = loc(intr, key, cap);
    return "<tr><td>" + esc(label) + "</td><td>" + esc(a) + "</td><td>" + esc(rr) + "</td><td>" + esc(i) + "</td></tr>";
  }).join("");

  q("#tr-c-armor").innerHTML = [
    '<table class="trs-table">',
    '  <thead><tr><th>Location</th><th>Armor</th><th>Rear</th><th>Internal</th></tr></thead>',
    '  <tbody>' + tr + '</tbody>',
    '</table>'
  ].join("");
}

function fillEquipment(mech) {
  // Only non-weapon equipment here; Weapons get their own module/tab.
  const raw = (mech.equipment || []);
  const eq = raw.filter(function (e) { return !isWeaponLike(e); });
  if (!eq.length) {
    q("#tr-c-equip").innerHTML = "<div>—</div>";
    return;
  }

  const rows = eq.map(function (e) {
    const name = e && (e.name != null ? e.name : (e.item != null ? e.item : "—"));
    const loc  = e && (e.location != null ? e.location : (e.loc != null ? e.loc : ""));
    const note = e && (e.notes != null ? e.notes : (e.special != null ? e.special : ""));
    return "<tr><td>" + esc(name) + "</td><td>" + esc(loc) + "</td><td>" + esc(note) + "</td></tr>";
  }).join("");

  q("#tr-c-equip").innerHTML = [
    '<table class="trs-table">',
    '  <thead><tr><th>Item</th><th>Loc</th><th>Notes</th></tr></thead>',
    '  <tbody>' + rows + '</tbody>',
    '</table>'
  ].join("");
}

async function fillLoreWithImage(mech) {
  const wrap = q("#tr-c-lore");
  if (!wrap) return;

  const name = displayName(mech);
  const lore = firstNonEmpty(
    mech.lore, mech.history, mech.overview, mech.fluff, mech.capabilities, mech.deployment
  );

  // Try image
  let figureHtml = "";
  try {
    if (cfg.images && typeof cfg.images.getFor === "function" && name) {
      const meta = await cfg.images.getFor(name);
      if (meta && meta.url) {
        const cap = [meta.title, meta.credits].filter(Boolean).join(" — ");
        figureHtml =
          '<figure class="trs-fig">' +
          '  <div class="trs-fig-box">' +
          '    <img src="' + escAttr(meta.url) + '" alt="' + escAttr(name) + '">' +
          '  </div>' +
          (cap ? ('  <figcaption>' + esc(cap) + '</figcaption>') : '') +
          '</figure>';
      }
    }
  } catch (e) {
    // silent fallback
  }

  // Lore paragraphs
  const loreHtml = lore ? toParagraphs(String(lore)) : "<div>—</div>";

  wrap.innerHTML = figureHtml + '<div class="trs-lore">' + loreHtml + "</div>";
}

/* ============================= Helpers =========================== */
function q(sel) { return rootEl.querySelector(sel); }

function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, function (m) {
    return m === "&" ? "&amp;" :
           m === "<" ? "&lt;" :
           m === ">" ? "&gt;" :
           m === '"' ? "&quot;" : "&#39;";
  });
}
function escAttr(v) { return esc(v); }

function toParagraphs(text) {
  const parts = String(text).trim().split(/\n{2,}/g);
  return parts.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
}

function firstNonEmpty() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v != null && String(v).trim() !== "") return v;
  }
  return null;
}

function displayName(mech) {
  if (!mech) return "";
  if (mech.displayName) return mech.displayName;
  const n = mech.name || "";
  const m = mech.model || "";
  return (n && m) ? (n + " " + m) : (n || m);
}

function fmtMove(m) {
  const w = (m.walk != null ? m.walk : (m.run != null ? m.run : "—"));
  const j = (m.jump != null ? m.jump : 0);
  return j ? (w + " / J" + j) : String(w);
}

function summarizeWeapons(mech) {
  const w = mech && (mech.weapons || mech.armaments) || [];
  if (!w.length) return "";
  const names = w.map(function (x) { return (typeof x === "string" ? x : (x && x.name) || ""); })
                 .filter(function (s) { return s && s.trim(); });
  const counts = {};
  for (let i = 0; i < names.length; i++) {
    const nm = names[i];
    counts[nm] = (counts[nm] || 0) + 1;
  }
  const out = [];
  for (const k in counts) {
    if (!counts.hasOwnProperty(k)) continue;
    const c = counts[k];
    out.push(c > 1 ? (k + " (x" + c + ")") : k);
  }
  return out.slice(0, 6).join(" · ");
}

function isWeaponLike(e) {
  const n = (e && (e.name || e.item) || "").toString().toLowerCase();
  return /\b(laser|ppc|gauss|ac\s*\d+|ac-\d+|ac\d+|srm|lrm|flamer|machine\s*gun|mg)\b/.test(n);
}
