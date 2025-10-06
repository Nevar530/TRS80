// modules/weapons.js
// Self-contained Weapons tab (island). No global IDs; no template literals.
// Usage in script.js:
//   import * as Weapons from "./modules/weapons.js";
//   Weapons.mount("#weapons-root");
//   Weapons.render(currentMech);

let rootEl = null;
let styleEl = null;

const cfg = {
  // Optional resolver to map abbreviations → pretty names
  // resolveWeapon: (nameOrAbbr) => ({ name: "ER Medium Laser", notes: "…" })
  resolveWeapon: null
};

export function mount(root, options = {}) {
  if (rootEl) destroy();
  rootEl = (typeof root === "string") ? document.querySelector(root) : root;
  if (!rootEl) throw new Error("[weapons] mount target not found");

  if (typeof options.resolveWeapon === "function") {
    cfg.resolveWeapon = options.resolveWeapon;
  }

  injectMarkup();
  injectStyles();
}

export function render(mech) {
  if (!rootEl) return;
  const list = normalizeWeapons(mech);
  if (!list.length) {
    q(".mw-body").innerHTML = "<div>—</div>";
    return;
  }

  // Rows
  let rows = "";
  for (let i = 0; i < list.length; i++) {
    rows += buildRow(list[i]);
  }

  const html =
    '<table class="mw-table">' +
      '<thead>' +
        '<tr>' +
          '<th>Weapon</th>' +
          '<th>Loc</th>' +
          '<th>Heat</th>' +
          '<th>Dmg</th>' +
          '<th>SR</th>' +
          '<th>MR</th>' +
          '<th>LR</th>' +
          '<th>Notes</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';

  q(".mw-body").innerHTML = html;
}

export function clear() {
  if (!rootEl) return;
  q(".mw-body").innerHTML = "";
}

export function destroy() {
  if (!rootEl) return;
  rootEl.replaceChildren();
  if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
  rootEl = null;
  styleEl = null;
}

/* ---------------------------- internals ---------------------------- */

function injectMarkup() {
  rootEl.innerHTML =
    '<div class="mod-weapons" data-module="weapons">' +
      '<div class="mw-body"></div>' +
    '</div>';
}

function injectStyles() {
  styleEl = document.createElement("style");
  styleEl.setAttribute("data-mod", "weapons");
  styleEl.textContent =
    ".mod-weapons{display:block}" +
    ".mod-weapons .mw-table{width:100%;border-collapse:collapse}" +
    ".mod-weapons .mw-table th,.mod-weapons .mw-table td{padding:.4rem .5rem;border-top:1px solid var(--line,rgba(255,255,255,.08));text-align:left}" +
    ".mod-weapons .mw-table thead th{border-top:0;opacity:.8}";
  document.head.appendChild(styleEl);
}

function buildRow(w) {
  const name  = esc(resolveName(w.name));
  const loc   = esc(first(w.location, w.loc, ""));
  const heat  = esc(first(w.heat, w.heatPerShot, "—"));
  const dmg   = esc(first(w.damage, w.dmg, "—"));
  const sr    = esc(first(w.short, w.sr, "—"));
  const mr    = esc(first(w.medium, w.mr, "—"));
  const lr    = esc(first(w.long, w.lr, "—"));
  const notes = esc(first(w.notes, w.special, ""));

  return (
    "<tr>" +
      "<td>" + name + "</td>" +
      "<td>" + loc + "</td>" +
      "<td>" + heat + "</td>" +
      "<td>" + dmg + "</td>" +
      "<td>" + sr + "</td>" +
      "<td>" + mr + "</td>" +
      "<td>" + lr + "</td>" +
      "<td>" + notes + "</td>" +
    "</tr>"
  );
}

function normalizeWeapons(mech) {
  const arr = (mech && (mech.weapons || mech.armaments)) || [];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const w = arr[i];
    if (typeof w === "string") out.push({ name: w });
    else if (w && typeof w === "object") out.push(w);
  }
  return out;
}

function resolveName(n) {
  if (!n) return "—";
  if (typeof cfg.resolveWeapon === "function") {
    try {
      const meta = cfg.resolveWeapon(n);
      if (meta && meta.name) return meta.name;
    } catch { /* ignore resolver errors */ }
  }
  return String(n);
}

function first() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, function (m) {
    return m === "&" ? "&amp;" :
           m === "<" ? "&lt;" :
           m === ">" ? "&gt;" :
           m === '"' ? "&quot;" : "&#39;";
  });
}

function q(sel) { return rootEl.querySelector(sel); }
