// techreadout.js
// Owns the Tech Readout tab, including an image at the top of Lore & History.
// No HTML/CSS changes required. Wire it later from script.js via .init() and .render(mech).

/** @typedef {{ url:string, title?:string|null, credits?:string|null }} ImageMeta */

let cfg = {
  containers: {
    root: null,        // Element for the whole Tech tab (optional; not required)
    chassis: null,     // Chassis & Systems container
    armor: null,       // Armor & Internals container
    equipment: null,   // Equipment container
    lore: null         // Lore & History container (image goes here at top)
  },
  images: {
    /** @param {string} name */ getFor: async (_name) => null // injected from images.js
  },
  imageMaxHeight: 320
};

export function init(options = {}) {
  cfg = deepMerge(cfg, options);
  assertContainers(['chassis','armor','equipment','lore']);
}

export async function render(mech) {
  if (!mech) return clear();

  // Fill sections
  cfg.containers.chassis.innerHTML   = renderChassisSystems(mech);
  cfg.containers.armor.innerHTML     = renderArmorInternals(mech);
  cfg.containers.equipment.innerHTML = renderEquipment(mech);

  // Lore & image
  await renderLoreWithImage(mech, cfg.containers.lore);
}

export function clear() {
  const { chassis, armor, equipment, lore } = cfg.containers;
  if (chassis)   chassis.innerHTML = '';
  if (armor)     armor.innerHTML = '';
  if (equipment) equipment.innerHTML = '';
  if (lore)      lore.innerHTML = '';
}

/* ----------------- Section Renderers ----------------- */

function renderChassisSystems(mech) {
  const name   = mech.displayName || [mech.name, mech.model].filter(Boolean).join(' ') || '—';
  const mass   = safe(mech.mass ?? '—');
  const base   = safe(mech.techBase ?? '—');
  const era    = safe(mech.era ?? mech.year ?? '—');
  const rules  = safe(mech.rulesLevel ?? mech.rules ?? '—');
  const role   = safe(mech.role ?? '—');
  const move   = mech.movement || {};
  const walk   = safe(move.walk ?? move.run ?? '—');
  const jump   = safe(move.jump ?? 0);
  const src    = safe(mech.source ?? '—');
  const bv     = safe(mech.bv ?? mech.battleValue ?? '—');

  return /* html */`
    <div class="trs-tech-grid">
      <div><strong>Name</strong><div>${safe(name)}</div></div>
      <div><strong>Mass</strong><div>${mass} t</div></div>
      <div><strong>Tech Base</strong><div>${base}</div></div>
      <div><strong>Era</strong><div>${era}</div></div>
      <div><strong>Rules</strong><div>${rules}</div></div>
      <div><strong>Role</strong><div>${role}</div></div>
      <div><strong>Walk / Jump</strong><div>${walk} / ${jump}</div></div>
      <div><strong>Source</strong><div>${src}</div></div>
      <div><strong>BV</strong><div>${bv}</div></div>
    </div>
  `;
}

function renderArmorInternals(mech) {
  const armor = mech.armorByLocation || mech.armor || {};
  const intr  = mech.internalsByLocation || mech.internals || {};
  const rows = [
    ['Head','head','HD'],
    ['Center Torso','ct','CT'],
    ['Left Torso','lt','LT'],
    ['Right Torso','rt','RT'],
    ['Left Arm','la','LA'],
    ['Right Arm','ra','RA'],
    ['Left Leg','ll','LL'],
    ['Right Leg','rl','RL'],
  ];
  const tr = rows.map(([label,key,fallback])=>{
    const a = getLoc(armor, key, fallback);
    const i = getLoc(intr,  key, fallback);
    return `<tr><th>${label}</th><td>${safe(a)}</td><td>${safe(i)}</td></tr>`;
  }).join('');

  return /* html */`
    <table class="trs-table">
      <thead><tr><th>Location</th><th>Armor</th><th>Internals</th></tr></thead>
      <tbody>${tr}</tbody>
    </table>
  `;
}

function renderEquipment(mech) {
  // Show non-weapon equipment (weapons tab will handle weapons in its own module)
  const eq = (mech.equipment || []).filter(e => !isWeaponLike(e));
  if (!eq.length) return `<div>—</div>`;
  return /* html */`
    <table class="trs-table">
      <thead><tr><th>Item</th><th>Loc</th><th>Notes</th></tr></thead>
      <tbody>
        ${eq.map(e => {
          const name = safe(e.name ?? e.item ?? '—');
          const loc  = safe(e.location ?? e.loc ?? '');
          const note = safe(e.notes ?? e.special ?? '');
          return `<tr><td>${name}</td><td>${loc}</td><td>${note}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function renderLoreWithImage(mech, loreEl) {
  const nameForArt = (mech.displayName || [mech.name, mech.model].filter(Boolean).join(' ') || '').trim();
  const loreText   = (mech.lore ?? mech.history ?? mech.fluff ?? '—').toString();

  // Try to fetch image via injected images module
  /** @type {ImageMeta|null} */
  let meta = null;
  try {
    if (cfg.images && typeof cfg.images.getFor === 'function' && nameForArt) {
      meta = await cfg.images.getFor(nameForArt);
    }
  } catch { /* fall back silently */ }

  // Build image figure (if available)
  let figure = '';
  if (meta && meta.url) {
    const cap = [meta.title, meta.credits].filter(Boolean).join(' — ');
    figure = /* html */`
      <figure class="trs-lore-figure" style="
        width:100%;
        max-height:${cfg.imageMaxHeight}px;
        margin:0 0 0.75rem 0;
        display:grid;
        grid-template-rows: 1fr auto;
        gap:0.25rem;
      ">
        <div style="
          min-height:100px;
          max-height:${cfg.imageMaxHeight - 24}px;
          overflow:hidden;
          display:flex;align-items:center;justify-content:center;
          background:var(--panel-bg, rgba(255,255,255,0.03));
          border-radius:6px;
        ">
          <img src="${safeAttr(meta.url)}" alt="${safeAttr(nameForArt)}" style="
            width:100%;
            height:100%;
            object-fit:contain;
            display:block;
          ">
        </div>
        ${cap ? `<figcaption style="opacity:.7; font-size:.85em;">${safe(cap)}</figcaption>` : ''}
      </figure>
    `;
  }

  loreEl.innerHTML = /* html */`
    ${figure}
    <div class="trs-lore-text">${para(loreText)}</div>
  `;
}

/* ----------------- Helpers ----------------- */

function para(text) {
  // Split double newlines into paragraphs
  const parts = String(text).trim().split(/\n{2,}/g);
  return parts.map(p => `<p>${safe(p)}</p>`).join('');
}

function getLoc(obj, key, alt) {
  if (!obj) return '—';
  return obj[key] ?? obj[key?.toUpperCase?.()] ?? obj[alt] ?? '—';
}

function isWeaponLike(e) {
  const n = (e?.name ?? e?.item ?? '').toString().toLowerCase();
  return /\blaser|ppc|ac[-\s]?\d|gauss|sr[m]|lr[m]|flamer|mg\b/.test(n);
}

function safe(v) {
  return String(v ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[m]);
}
function safeAttr(v){ return safe(v); }

function assertContainers(keys){
  for (const k of keys){
    if (!cfg.containers[k]) {
      console.warn(`[techreadout] Missing container: ${k}`);
    }
  }
}
function deepMerge(base, patch){
  if (!patch || typeof patch !== 'object') return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(patch)){
    const bv = base?.[k], pv = patch[k];
    out[k] = (bv && typeof bv === 'object' && pv && typeof pv === 'object')
      ? deepMerge(bv, pv) : pv;
  }
  return out;
}
