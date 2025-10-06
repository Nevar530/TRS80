// modules/weapons.js
// Self-contained Weapons tab (island).
// Public API:
//   mount(rootEl, { resolveWeapon? }?)
//   render(mech)
//   clear()
//   destroy()
//
// - rootEl must be a DOM element (not a selector).
// - No auto-mounts, no globals, no external IDs.
// - Minimal namespaced CSS is injected and removed on destroy.

let root = null;
let styleNode = null;

const cfg = {
  resolveWeapon: null // optional: (nameOrAbbr) => { name, notes? }
};

export function mount(rootEl, options = {}) {
  if (!rootEl || rootEl.nodeType !== 1) {
    throw new Error("[weapons] mount(rootEl) requires a DOM element");
  }
  if (root) destroy(); // safety if double-mounted

  root = rootEl;
  if (typeof options.resolveWeapon === "function") {
    cfg.resolveWeapon = options.resolveWeapon;
  }

  // Inject markup (module owns everything inside root)
  root.innerHTML =
    '<div class="mod-weapons" data-module="weapons">' +
      '<div class="mw-head">' +
        '<div class="mw-title">Weapons</div>' +
      '</div>' +
      '<div class="mw-body"></div>' +
    '</div>';

  // Inject tiny, namespaced styles
  styleNode = document.createElement("style");
  styleNode.setAttribute("data-mod", "weapons");
  styleNode.textContent =
    ".mod-weapons{display:block}" +
    ".mod-weapons .mw-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem}" +
    ".mod-weapons .mw-title{font-weight:600;opacity:.9}" +
    ".mod-weapons .mw-body{min-height:2rem}" +
    ".mod-weapons .mw-table{width:100%;border-collapse:collapse}" +
    ".mod-weapons .mw-table thead th{border-bottom:1px solid var(--line,rgba(255,255,255,.12));padding:.45rem .55rem;text-align:left;opacity:.85}" +
    ".mod-weapons .mw-table td{border-top:1px solid var(--line,rgba(255,255,255,.08));padding:.45rem .55rem;vertical-align:top}" +
    ".mod-weapons .mw-note{opacity:.75}";
  document.head.appendChild(styleNode);
}

export function render(mech) {
  if (!root) return;

  const tgt = q(".mw-body");
  if (!tgt) return;

  const list = normalizeWeapons(mech);
  if (!list.length) {
    tgt.innerHTML = "<div>—</div>";
    return;
  }

  // Build rows via safe string concatenation (avoids template literal pitfalls)
  let rows = "";
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    const name = esc(resolveName(w.name));
    const loc  = esc(first(w.location, w.loc, ""));
    const heat = esc(first(w.heat, w.heatPerShot, "—"));
    const dmg  = esc(first(w.damage, w.dmg, "—"));
    const sr   = esc(first(w.short, w.sr, "—"));
    const mr   = esc(first(w.medium, w.mr, "—"));
    const lr   = esc(first(w.long, w.lr, "—"));
    const notes= esc(first(w.notes, w.special, ""));

    rows += (
      "<tr>" +
        "<td>" + name + "</td>" +
        "<td>" + loc + "</td>" +
        "<td>" + heat + "</td>" +
        "<td>" + dmg + "</td>" +
        "<td>" + sr + "</td>" +
        "<td>" + mr + "</td>" +
        "<td>" + lr + "</td>" +
        "<td class=\"mw-note\">" + notes + "</td>" +
      "</tr>"
    );
  }

  tgt.innerHTML =
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
}

export function clear() {
  if (!root) return;
  const tgt = q(".mw-body");
  if (tgt) tgt.innerHTML = "";
}

export function destroy() {
  if (!root) return;
  root.replaceChildren();
  if (styleNode && styleNode.parentNode) styleNode.parentNode.removeChild(styleNode);
  root = null;
  styleNode = null;
}

/* ------------------------------ utils ------------------------------ */

function q(sel) { return root ? root.querySelector(sel) : null; }

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
