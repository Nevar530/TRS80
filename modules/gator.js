// gator.js
// Owns the G.A.T.O.R. tab UI + math, without changing HTML/CSS.
// Later, wire inputs via .init({ selectors }) and call .render(mech) on selection.

let cfg = {
  container: null, // root GATOR tab (optional)
  selectors: {
    gunnery: null,       // input[type=number] or select
    attMove: null,       // attacker movement mod (number/select)
    tgtMove: null,       // target movement mod (number/select)
    range: null,         // range mod (number/select)
    other: null,         // other modifiers (number)
    total: null,         // element to display final TN
    breakdown: null      // element to display text breakdown
  },
  clampMin: 2
};

let state = {
  mech: null
};

export function init(options = {}) {
  cfg = { ...cfg, ...options, selectors: { ...cfg.selectors, ...(options.selectors||{}) } };
  bindEvents();
}

export function render(mech) {
  state.mech = mech || null;
  recalc(); // recompute with current inputs
}

/* ----------------- Internal ----------------- */

function bindEvents() {
  const inputs = [
    cfg.selectors.gunnery,
    cfg.selectors.attMove,
    cfg.selectors.tgtMove,
    cfg.selectors.range,
    cfg.selectors.other
  ].map(sel => sel && document.querySelector(sel)).filter(Boolean);

  inputs.forEach(el => {
    el.addEventListener('input', recalc);
    el.addEventListener('change', recalc);
  });
}

function recalc() {
  const $ = sel => sel ? document.querySelector(sel) : null;

  const gun   = readNum($(cfg.selectors.gunnery));
  const att   = readNum($(cfg.selectors.attMove));
  const tgt   = readNum($(cfg.selectors.tgtMove));
  const rng   = readNum($(cfg.selectors.range));
  const other = readNum($(cfg.selectors.other));

  const tnRaw = gun + att + tgt + rng + other;
  const tn    = Math.max(cfg.clampMin, tnRaw);

  const totalEl = $(cfg.selectors.total);
  if (totalEl) totalEl.textContent = String(tn);

  const bd = $(cfg.selectors.breakdown);
  if (bd) {
    bd.textContent = `Gunnery ${fmt(gun)} + Attacker ${fmt(att)} + Target ${fmt(tgt)} + Range ${fmt(rng)} + Other ${fmt(other)} = ${tnRaw} → TN ${tn}`;
  }
}

function readNum(el){
  if (!el) return 0;
  const v = (el.value ?? el.textContent ?? '').toString().trim();
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n){
  return (n >= 0 ? `+${n}` : `${n}`);
}
