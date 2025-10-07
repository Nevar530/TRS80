/* ===== Gator Console — single-file script (organized) ===== */
(() => {
  'use strict';

/* -----------------------------------------
 *  STATE
 * --------------------------------------- */
const state = {
  mech: null,
  pilot: { name: '—', gunnery: 4, piloting: 5 },
  heat:  { current: 0, capacity: 0 },

  gator: { G:4, A:0, T:0, T_adv:{ jump:false, padj:false, prone:false, imm:false }, O:0, R:0, Rmin:'eq' },

  manifest: [],
  manifestUrl: '',

  weaponsDb: [],           // raw list
  weaponsMap: new Map(),   // lookup by id/name (lowercased)

  bvDb: [],                // raw bv list
  bvMap: new Map()         // lookup by multiple keys
};

/* ----- Filters (UI reads these; manifestFiltered null = no filters) ----- */
let manifestFiltered = null;
let filterState = {
  tech:"", classes:new Set(), canJump:false, minWalk:null, roles:[],
  rulesLevel:null, source:"", bvMin:null, bvMax:null,
  ownedOnly:false
};

/* -----------------------------------------
 *  SMALL HELPERS
 * --------------------------------------- */
const $    = (sel) => document.querySelector(sel);
const byId = (id)  => document.getElementById(id);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
));
const listify = (v, sep=',') =>
  Array.isArray(v) ? v :
  (typeof v === 'string' ? v.split(sep).map(s=>s.trim()).filter(Boolean) : []);
const toNum = (x) => { if (x == null || x === '') return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
const fmtMoney = (v) => {
  if (v == null || v === '') return '—';
  const n = toNum(String(v).replace(/[^\d.-]/g,''));
  return n == null ? String(v) : n.toLocaleString(undefined,{maximumFractionDigits:0}) + ' C-bills';
};
function showToast(msg, ms=1600){
  const t = byId('toast');
  if(!t){ console.log('[toast]', msg); return; }
  t.textContent = msg;
  t.hidden = false;
  t.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>{ t.hidden = true; t.style.display = 'none'; }, ms);
}

function getHeatCapacityFor(mech){
  if (!mech) return 0;

  // Explicit numeric wins
  if (Number.isFinite(mech.heatCapacity)) return mech.heatCapacity | 0;

  // Structured sinks
  if (mech?.sinks?.count != null) {
    const cnt = Number(mech.sinks.count) || 0;
    const tag = String(mech.sinks.type || '').toLowerCase();
    return /\bdouble\b/.test(tag) ? cnt * 2 : cnt;
  }

  // String forms like "13 IS Double"
  const hsStr = String(mech.heatSinks ?? mech.HeatSinks ?? '');
  const m = hsStr.match(/\d+/);
  const cnt = m ? parseInt(m[0], 10) : 0;
  return /\bdouble\b/i.test(hsStr) ? cnt * 2 : cnt;
}


/* -----------------------------------------
 *  KEYS + SORTING
 * --------------------------------------- */
const normKey = (s) => String(s||'').toLowerCase().replace(/[\s._\-\/]+/g, ' ').trim();

const _collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const chassisKey = (m) => String(m?.name ?? '').trim();
const variantKey = (m) => String(m?.variant ?? m?.model ?? '').trim();
function cmpMech(a, b) {
  const c = _collator.compare(chassisKey(a), chassisKey(b));
  if (c !== 0) return c;
  return _collator.compare(variantKey(a), variantKey(b));
}

/* Build many candidate keys for BV lookup */
function allMechKeys(m) {
  const name  = String(m?.displayName || m?.name || m?.Name || '').trim();
  const model = String(m?.model || m?.variant || m?.Model || '').trim();
  const tons  = m?.tonnage ?? m?.Tonnage ?? m?.mass ?? null;

  const keys = [];
  const n = name ? normKey(name) : '';
  const v = model ? normKey(model) : '';

  if (n && v) keys.push(`${n} ${v}`);
  if (v)      keys.push(v);
  if (n)      keys.push(n);
  if (m?.mulId != null) keys.push(String(m.mulId));
  if (tons != null && n && v) keys.push(`${n} ${v} ${tons}`);
  return Array.from(new Set(keys)).filter(Boolean);
}

/* Manifest → BV key (handles displayName including variant suffix) */
function keyForManifestItem(m){
  const rawName = String(m?.name || '').trim();
  const rawVar  = String(m?.variant || '').trim();

  let chassisName = rawName;
  if (rawName && rawVar) {
    const lcName = rawName.toLowerCase();
    const tail1  = (' ' + rawVar).toLowerCase(); // " ARC-2K"
    if (lcName.endsWith(tail1)) chassisName = rawName.slice(0, -tail1.length).trim();
  }
  const n = normKey(chassisName);
  const v = normKey(rawVar);
  if (n && v) return `${n} ${v}`;
  return n || v || null;
}
function bvForManifestItem(m){
  const k = keyForManifestItem(m);
  if (!k) return null;
  const bv = state.bvMap.get(k);
  return Number.isFinite(bv) ? bv : null;
}

/* -----------------------------------------
 *  RANGE UTIL
 * --------------------------------------- */
const getPB = (r = {}) => {
  const v = r.pointblank ?? r.pb ?? r.close ?? r.C ?? r.c;
  return Number.isFinite(v) ? v : 0;
};

/* -----------------------------------------
 *  LOADERS: Weapons + BV
 * --------------------------------------- */
async function loadWeaponsDb() {
  try {
    const list = await fetchJson('data/weapons.json');
    state.weaponsDb = Array.isArray(list) ? list : [];
    state.weaponsMap = new Map();

    for (const w of state.weaponsDb) {
      const keys = new Set();
      if (w.id)   keys.add(normKey(w.id));
      if (w.name) keys.add(normKey(w.name));
      const aliases = Array.isArray(w.aliases) ? w.aliases : [];
      for (const a of aliases) if (a) keys.add(normKey(a));
      for (const k of keys) if (k && !state.weaponsMap.has(k)) state.weaponsMap.set(k, w);
    }

    // one-time mini CSS for small tables
    if (!document.getElementById('weap-mini-css')) {
      const st = document.createElement('style');
      st.id = 'weap-mini-css';
      st.textContent = `
        .weapons-mini{width:100%;border-collapse:collapse;font-size:10px;margin-top:6px}
        .weapons-mini th,.weapons-mini td{padding:3px 6px;border-bottom:1px solid var(--border,#2a2f3a)}
        .weapons-mini thead th{text-align:left;background:#0e1522}
        .dim{opacity:.7}
      `;
      document.head.appendChild(st);
    }
  } catch (e) {
    console.warn('[weapons] failed to load weapons.json', e);
  }
}
function getWeaponRefByName(name){
  if (!name) return null;
  const key = normKey(name);
  return state.weaponsMap.get(key) || null;
}

async function loadBVDb() {
  try {
    const list = await fetchJson('data/bv.json'); // { name, model, bv, mulId, ... }
    state.bvDb = Array.isArray(list) ? list : [];

    const map = new Map();
    for (const e of state.bvDb) {
      const name  = String(e.name  ?? '').trim();
      const model = String(e.model ?? '').trim();
      const mulId = e.mulId != null ? String(e.mulId) : null;
      const bv    = Number(e.bv);
      if (!Number.isFinite(bv)) continue;

      const n = name  ? normKey(name)  : '';
      const v = model ? normKey(model) : '';

      const keys = new Set();
      if (n && v) keys.add(`${n} ${v}`);
      if (v)      keys.add(v);
      if (n)      keys.add(n);
      if (mulId)  keys.add(mulId);

      for (const k of keys) if (k && !map.has(k)) map.set(k, bv); // prefer first
    }
    state.bvMap = map;
  } catch (e) {
    console.warn('[bv] failed to load data/bv.json', e);
  }
}
function lookupBVForMech(mech) {
  if (!mech || !state.bvMap || !state.bvMap.size) return null;
  const keys = allMechKeys(mech);
  for (const k of keys) {
    const bv = state.bvMap.get(k);
    if (bv != null) return Number(bv);
  }
  return null;
}

/* -----------------------------------------
 *  BV ESTIMATOR (fallback if not in bv.json)
 * --------------------------------------- */
function sumArmorPoints(armorBy = {}) {
  const keys = ['HD','CT','RT','LT','RA','LA','RL','LL','RTC','RTR','RTL'];
  let s = 0;
  for (const k of keys) {
    const v = armorBy[k];
    if (v == null) continue;
    if (typeof v === 'object') s += Number(v.a ?? v.A ?? v.front ?? v.value ?? v.armor ?? 0);
    else s += Number(v) || 0;
  }
  return s;
}
function sumInternalPoints(internalBy = {}) {
  const keys = ['HD','CT','RT','LT','RA','LA','RL','LL'];
  let s = 0;
  for (const k of keys) {
    const v = internalBy[k];
    if (v == null) continue;
    if (typeof v === 'object') s += Number(v.s ?? v.S ?? v.structure ?? v.value ?? 0);
    else s += Number(v) || 0;
  }
  return s;
}
function tmmFromWalk(walkMP) {
  const w = Number(walkMP)||0;
  if (w <= 2) return 0;
  if (w <= 4) return 1;
  if (w <= 6) return 2;
  if (w <= 9) return 3;
  if (w <= 17) return 4;
  return 5;
}
function weaponAlpha(mech) {
  const list = Array.isArray(mech?.weapons) ? mech.weapons : [];
  let dmgShort=0, dmgMed=0, dmgLong=0, heat=0;
  for (const w of list) {
    const ref = getWeaponRefByName(w.name);
    if (!ref) continue;
    const r = ref.range || {};
    const d = Number(ref.damage)||0;
    if (r.short != null)  dmgShort += d;
    if (r.medium != null) dmgMed   += d;
    if (r.long != null)   dmgLong  += d;
    heat += Number(ref.heat)||0;
  }
  return { dmgShort, dmgMed, dmgLong, heat };
}
function sustainableFactor(alphaHeat, heatCap) {
  if (!alphaHeat) return 1;
  const over = Math.max(0, alphaHeat - (Number(heatCap)||0));
  if (over <= 0) return 1;
  const f = 1 - (over / (alphaHeat*1.5));
  return Math.max(0.5, Math.min(1, f));
}
function estimateBV(mech) {
  const mv = mech?._mv || {};
  const walk = Number(mv.walk)||0;
  const armorPts = sumArmorPoints(mech.armorByLocation || {});
  const structPts= sumInternalPoints(mech.internalByLocation || {});
  const { dmgShort, dmgMed, dmgLong, heat } = weaponAlpha(mech);
  const heatCap = Number(mech?.heatCapacity)||0;

  const expectedDmg = (dmgShort*0.6) + (dmgMed*0.3) + (dmgLong*0.1);
  const sustain     = sustainableFactor(heat, heatCap);
  const offense     = expectedDmg * sustain * 16;

  const bestMP        = Math.max(Number(mv.walk)||0, Number(mv.run)||0, Number(mv.jump)||0);
  const tmmVal        = bestMP <= 2 ? 0 : bestMP <= 4 ? 1 : bestMP <= 6 ? 2 : bestMP <= 9 ? 3 : bestMP <= 17 ? 4 : 5;
  const mobilityBonus = 1 + (0.15 * tmmVal) + (0.05 * Math.min(Number(mv.jump)||0, 6));
  const defense       = (armorPts + structPts) * 2.25 * mobilityBonus;

  const text = JSON.stringify(mech.equipment || mech.extras || {}).toLowerCase();
  let specials = 1;
  if (/\b(ecm|guardian ecm|angel ecm)\b/.test(text)) specials += 0.03;
  if (/\bams\b/.test(text))                           specials += 0.02;
  if (/\bcase ii\b/.test(text))                       specials += 0.03;
  else if (/\bcase\b/.test(text))                     specials += 0.02;

  const bv = Math.round((offense + defense) * specials);
  return Math.max(1, bv);
}
function ensureBV(mech){
  if (!mech) return mech;
  if (mech.bv == null && mech.BV == null) {
    const found = lookupBVForMech(mech);
    if (Number.isFinite(found)) { mech.bv = Math.round(found); return mech; }
    mech.bv = estimateBV(mech); // fallback
  }
  return mech;
}

/* -----------------------------------------
 *  INTERNALS (fallback by tonnage)
 * --------------------------------------- */
function getInternalsByTonnage(t) {
  const ton = Math.max(20, Math.min(100, Number(t)||0));
  let CT, ST, ARM, LEG;
  if (ton <= 35)      { CT = 10; ST = 7;  ARM = 5;  LEG = 7;  }
  else if (ton <= 55) { CT = 18; ST = 13; ARM = 9;  LEG = 13; }
  else if (ton <= 75) { CT = 22; ST = 15; ARM = 11; LEG = 15; }
  else                { CT = 31; ST = 21; ARM = 15; LEG = 21; }
  return { HD:3, CT, RT:ST, LT:ST, RA:ARM, LA:ARM, RL:LEG, LL:LEG };
}
function ensureInternals(mech){
  if (!mech) return mech;
  const ibl = mech.internalByLocation;
  const empty = !ibl || Object.values(ibl).every(v => v == null || v === '—');
  if (empty && mech.tonnage != null) mech.internalByLocation = getInternalsByTonnage(mech.tonnage);
  return mech;
}

/* -----------------------------------------
 *  FETCH + MANIFEST
 * --------------------------------------- */
async function fetchJson(pathOrUrl) {
  const base = new URL('.', state.manifestUrl || document.baseURI);
  const url  = /^https?:/i.test(pathOrUrl) ? pathOrUrl : new URL(pathOrUrl, base).href;
  const res = await fetch(url, { cache:'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function loadManifest() {
  try {
    state.manifestUrl = new URL('data/manifest.json', document.baseURI).href;
    const raw = await fetchJson(state.manifestUrl);

    let items = [];
    if (Array.isArray(raw)) items = raw;
    else if (raw?.mechs) items = raw.mechs;
    else if (raw && typeof raw === 'object') {
      for (const v of Object.values(raw)) if (Array.isArray(v)) items.push(...v);
    }

    const base = new URL('.', state.manifestUrl);
    state.manifest = items
      .filter(e => e && (e.path || e.url || e.file))
      .map(e => {
        const path = (e.path || e.url || e.file || '').replace(/\\/g, '/').trim();
        const abs  = /^https?:/i.test(path) ? path : new URL(path, base).href;

        const mv = e.movement ?? e.move ?? {};
        const w  = Number(mv.walk ?? mv.w ?? 0) || 0;
        const j  = Number(mv.jump ?? mv.j ?? 0) || 0;

        return {
          id:       e.id || null,
          name:     e.name || e.displayName || e.displayname || null, 
          variant:  e.variant || e.model || null,
          path,
          url:      abs,
          tons:     e.tons ?? e.tonnage ?? e.mass,
          tech:     e.tech ?? e.techBase,
          role:     e.role,
          source:   e.source || (Array.isArray(e.sources) ? e.sources.join(' • ') : null),
          class:    e.class,
          move:     { w, walk: w, j, jump: j },
          rulesLevel: e.rules ?? e.rulesLevel ?? e.Rules ?? null
        };
      });

    state.manifest.sort(cmpMech);
    window._rebuildSearchIndex?.();
    showToast(`Manifest loaded — ${state.manifest.length} mechs`);
  } catch (err) {
    console.error(err);
    showToast(`Failed to load manifest: ${err.message}`);
  }
}

/* -----------------------------------------
 *  MECH NORMALIZATION
 * --------------------------------------- */
function normalizeMech(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const out = { ...raw, extras: { ...(raw.extras||{}) } };

  out.displayName = out.displayName || out.name || out.Name || '—';
  out.model       = out.model || out.variant || out.Model || '—';
  out.tonnage     = out.tonnage ?? out.Tonnage ?? out.mass ?? null;

  const mv = raw.move || raw.movement || raw.Movement || {};
  const walk = mv.walk ?? mv.Walk ?? mv.w ?? null;
  const run  = mv.run  ?? mv.Run  ?? mv.r ?? (walk != null ? String(Math.ceil(walk * 1.5)) : null);
  const jump = mv.jump ?? mv.Jump ?? mv.j ?? null;
  out._mv = { walk, run, jump };

  if (!out.armorByLocation && raw.armor && typeof raw.armor === 'object') {
    out.armorByLocation = {
      HD:  raw.armor.head ?? null,
      CT:  raw.armor.centerTorso ?? null,
      LT:  raw.armor.leftTorso ?? null,
      RT:  raw.armor.rightTorso ?? null,
      LA:  raw.armor.leftArm ?? null,
      RA:  raw.armor.rightArm ?? null,
      LL:  raw.armor.leftLeg ?? null,
      RL:  raw.armor.rightLeg ?? null,
      RTC: raw.armor.rearCenterTorso ?? null,
      RTL: raw.armor.rearLeftTorso ?? null,
      RTR: raw.armor.rearRightTorso ?? null
    };
  }

  if (raw.text) {
    out.extras.overview     ??= raw.text.overview;
    out.extras.capabilities ??= raw.text.capabilities;
    out.extras.deployment   ??= raw.text.deployment;
    out.extras.history      ??= raw.text.history;
  }

  if (Array.isArray(raw.weapons)) {
    out.weapons = raw.weapons.map(w => ({
      name: w.name || w.type || 'Weapon',
      loc:  w.loc  || w.location || ''
    }));
  }

  out.era = out.era ?? raw.era ?? '—';
  if (!out.sources && raw.source) out.sources = [String(raw.source)];

 if (out.heatCapacity == null) {
  // Prefer structured sinks if present
  if (out?.sinks?.count != null) {
    const cnt = Number(out.sinks.count) || 0;
    const tag = String(out.sinks.type || '').toLowerCase();
    out.heatCapacity = /\bdouble\b/.test(tag) ? cnt * 2 : cnt;
  } else if (out.heatSinks != null || out.HeatSinks != null) {
    const hsStr = String(out.heatSinks ?? out.HeatSinks ?? '');
    const m = hsStr.match(/\d+/);
    const cnt = m ? parseInt(m[0], 10) : 0;
    out.heatCapacity = /\bdouble\b/i.test(hsStr) ? cnt * 2 : cnt;
  }
} 
if (out.tonnage == null && out.mass != null) out.tonnage = out.mass;

  return out;
}

/* -----------------------------------------
 *  HEAT + OVERVIEW
 * --------------------------------------- */
function setHeat(current, capacity) {
  state.heat.current  = Math.max(0, current|0);
  state.heat.capacity = Math.max(0, capacity|0);

  const cap = state.heat.capacity || 1;
  const pct = clamp((state.heat.current / cap) * 100, 0, 100);

  byId('vheat-fill').style.height = pct.toFixed(1) + '%';
  byId('vheat').setAttribute('aria-valuenow', String(state.heat.current));
  byId('vheat').setAttribute('aria-valuemax', String(state.heat.capacity || 50));
  byId('heat-now').textContent = String(state.heat.current);
  byId('heat-cap').textContent = state.heat.capacity ? String(state.heat.capacity) : '—';
}

function updateOverview() {
  const m = state.mech, p = state.pilot;
  byId('ov-mech').textContent = m?.displayName ?? '—';
  byId('ov-variant').textContent = m?.model ?? '—';
  byId('ov-tons').textContent = m?.tonnage ?? '—';
  byId('ov-pilot').textContent = p?.name ?? '—';
  byId('ov-gun').textContent = p?.gunnery ?? '—';
  byId('ov-pil').textContent = p?.piloting ?? '—';

  const mv = m ? m._mv : null;
  const mvStr = mv && (mv.walk || mv.run || mv.jump)
    ? `W ${mv.walk ?? '—'} / R ${mv.run ?? '—'}${mv.jump ? ' / J ' + mv.jump : ''}`
    : '—';
  byId('ov-move').textContent = mvStr;

  const w = Array.isArray(m?.weapons) ? m.weapons : [];
  byId('ov-weps').textContent = w.length
    ? w.slice(0,6).map(wi => `${wi.name}${wi.loc?` [${wi.loc}]`:''}`).join(' • ')
    : '—';

  // ----- Heat capacity calculation -----
  let cap = 0;

  if (m?.heatSinks) {
    const match = m.heatSinks.match(/\d+/);   // pull the number
    if (match) {
      cap = parseInt(match[0], 10);
      if (/double/i.test(m.heatSinks)) {
        cap *= 2; // double heat sinks count double
      }
    }
  }

  if (m?.heatCapacity) {
    cap = m.heatCapacity; // explicit override
  }

  state.heat.capacity = cap;

  // mini stats table under "Key Weapons"
  renderOverviewWeaponsMini(m);
}

/* -----------------------------------------
 *  OVERVIEW — WEAPONS MINI TABLE
 * --------------------------------------- */
function renderOverviewWeaponsMini(mech) {
  const host = document.getElementById('ov-weps');
  if (!host) return;

  // ensure a sibling container just under the "Key Weapons" line
  let wrap = document.getElementById('ov-weps-mini');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'ov-weps-mini';
    wrap.className = 'weapon-block';
    host.insertAdjacentElement('afterend', wrap);
  }

  const list = Array.isArray(mech?.weapons) ? mech.weapons : [];
  if (!list.length) { wrap.innerHTML = ''; return; }

  const rows = list.map(w => {
    const ref = getWeaponRefByName(w.name);
    if (!ref) {
      return `<tr>
        <td>${esc(w.name)}${w.loc ? ` [${esc(w.loc)}]` : ''}</td>
        <td class="dim">—</td>  <!-- Type -->
        <td class="dim">—</td>  <!-- Dmg -->
        <td class="dim">—</td>  <!-- Ht  -->
        <td class="dim">—</td>  <!-- Ammo -->
        <td class="dim">—</td>  <!-- Min   -->
        <td class="dim">—</td>  <!-- S   -->
        <td class="dim">—</td>  <!-- M   -->
        <td class="dim">—</td>  <!-- L   -->
      </tr>`;
    }
    const r = ref.range || {};
    return `<tr>
      <td>${esc(ref.name || w.name)}${w.loc ? ` [${esc(w.loc)}]` : ''}</td>
      <td>${esc(ref.type ?? '—')}</td>
      <td>${ref.damage ?? '—'}</td>
      <td>${ref.heat ?? '—'}</td>
      <td>${ref.ammo ?? '—'}</td>
      <td>${getPB(r)}</td>
      <td>${r.short ?? '—'}</td>
      <td>${r.medium ?? '—'}</td>
      <td>${r.long ?? '—'}</td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="weapons-mini">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Dmg</th>
          <th>Ht</th>
          <th>Ammo</th>
          <th>Min</th>
          <th>S</th>
          <th>M</th>
          <th>L</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}



/* -----------------------------------------
 *  WEAPONS TAB (catalog)
 * --------------------------------------- */
function renderWeaponsTab(){
  const host = document.getElementById('weapons-list');
  if (!host) return;

  const list = Array.isArray(state.weaponsDb) ? state.weaponsDb.slice() : [];
  if (!list.length) {
    host.innerHTML = '<div class="dim small">No weapons loaded.</div>';
    return;
  }

  // Group by type, sort by damage desc then name
  const groups = new Map();
  for (const w of list) {
    const t = w.type || 'Other';
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(w);
  }
  const typeOrder = Array.from(groups.keys()).sort((a,b)=> a.localeCompare(b));

  let html = '';
  for (const t of typeOrder) {
    const rows = groups.get(t)
      .slice()
      .sort((a,b) => (Number(b.damage)||0) - (Number(a.damage)||0) || String(a.name||'').localeCompare(b.name||''))
      .map(w => {
        const r = w.range || {};
        return `<tr>
          <td class="mono">${esc(w.name||w.id||'—')}</td>
          <td class="mono" style="text-align:right;">${w.damage ?? '—'}</td>
          <td class="mono" style="text-align:right;">${w.heat ?? '—'}</td>
          <td class="mono">${esc(w.ammo ?? '—')}</td>
          <td class="mono" style="text-align:right;">${getPB(r)}</td>
          <td class="mono" style="text-align:right;">${r.short  ?? '—'}</td>
          <td class="mono" style="text-align:right;">${r.medium ?? '—'}</td>
          <td class="mono" style="text-align:right;">${r.long   ?? '—'}</td>
        </tr>`;
      }).join('');

    html += `
      <h3 style="margin:12px 0 6px;">${esc(t)}</h3>
      <table class="weapons-mini" style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px;border-bottom:1px solid var(--border,#2a2f3a);">Name</th>
            <th style="text-align:right;padding:6px;border-bottom:1px solid var(--border,#2a2f3a);">Dmg</th>
            <th style="text-align:right;padding:6px;border-bottom:1px solid var(--border,#2a2f3a);">Ht</th>
            <th style="text-align:left;padding:6px;border-bottom:1px solid var(--border,#2a2f3a);">Ammo</th>
            <th style="text-align:right;padding:6px;border-bottom:1px solid var(--border,#2a2f3a);">Min</th>
            <th style="text-align:right;padding:6px;border-bottom:1px solid var(--border,#2a2f3a);">S</th>
            <th style="text-align:right;padding:6px;border-bottom:1px solid var(--border,#2a2f3a);">M</th>
            <th style="text-align:right;padding:6px;border-bottom:1px solid var(--border,#2a2f3a);">L</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  host.innerHTML = html;
}

  /* -----------------------------------------
 *  TECH READOUT — TABLE + META
 * --------------------------------------- */
const LOCS = [
  {key:'HD', name:'Head'},
  {key:'CT', name:'Center Torso', rearKey:'RTC'},
  {key:'RT', name:'Right Torso',  rearKey:'RTR'},
  {key:'LT', name:'Left Torso',   rearKey:'RTL'},
  {key:'RA', name:'Right Arm'},
  {key:'LA', name:'Left Arm'},
  {key:'RL', name:'Right Leg'},
  {key:'LL', name:'Left Leg'},
];

const LOC_ORDER = [
  ['Head','head'],['Center Torso','centerTorso'],['Right Torso','rightTorso'],
  ['Left Torso','leftTorso'],['Right Arm','rightArm'],['Left Arm','leftArm'],
  ['Right Leg','rightLeg'],['Left Leg','leftLeg']
];

function getMovement(m){
  const mv = m.move || m.movement || m.Movement || {};
  const walk = mv.walk ?? mv.Walk ?? mv.w ?? null;
  const run  = mv.run  ?? mv.Run  ?? mv.r ?? (walk != null ? String(Math.ceil(walk * 1.5)) : null);
  const jump = mv.jump ?? mv.Jump ?? mv.j ?? null;
  return { walk, run, jump };
}
function getArmorCell(armorByLoc, extras, locKey, rearKey){
  let front = armorByLoc?.[locKey];
  let rear  = rearKey ? (armorByLoc?.[rearKey]) : undefined;
  const unpack = (val) => {
    if (val == null) return null;
    if (typeof val === 'object') {
      const a = val.a ?? val.A ?? val.front ?? val.value ?? val.armor ?? null;
      return a ?? null;
    }
    return val;
  };
  front = unpack(front); rear = unpack(rear);
  if (front == null) front = extras?.[`${locKey} armor`] ?? null;
  if (rearKey && rear == null) rear = extras?.[`${rearKey} armor`] ?? null;
  return { front: front ?? '—', rear: rearKey ? (rear ?? '—') : '—' };
}
function getInternalCell(internalByLoc, locKey){
  const val = internalByLoc?.[locKey];
  if (val == null) return '—';
  if (typeof val === 'object') return (val.s ?? val.S ?? val.structure ?? val.value) ?? JSON.stringify(val);
  return String(val);
}
function collapseLine(items = []) {
  const seen = new Map(); const order = [];
  for (const raw of items) {
    const s = String(raw).trim(); if (!s) continue;
    if (!seen.has(s)) { seen.set(s, 1); order.push(s); } else seen.set(s, seen.get(s) + 1);
  }
  return order.map(k => seen.get(k) > 1 ? `${k} x${seen.get(k)}` : k).join(' • ');
}

function fillTechReadout() {
  const m = state.mech;

  if (!m) {
    // Clear basic headline items; rest can keep placeholders
    [
      'tr-name','tr-model','tr-tons','tr-tech','tr-rules','tr-engine','tr-hs','tr-move',
      'tr-structure','tr-cockpit','tr-gyro','tr-config','tr-role','tr-myomer','tr-armor-sys',
      'tr-bv','tr-cost','tr-era','tr-sources'
    ].forEach(id => byId(id).textContent = '—');
    ['loc-equip-wrap','tr-overview-wrap','tr-capabilities-wrap','tr-deployment-wrap','tr-history-wrap','tr-mfr-wrap','tr-license-wrap']
      .forEach(id => byId(id).hidden = true);

    // Armor table
    ['HD','CT','RT','LT','RA','LA','RL','LL','RTC','RTR','RTL']
      .forEach(k => { const cell = byId('ar-'+k); if (cell) cell.textContent = '—'; });

    ['HD','CT','RT','LT','RA','LA','RL','LL']
      .forEach(k => { const cell = byId('in-'+k); if (cell) cell.textContent = '—'; });

    byId('tr-weapons').textContent   = '—';
    byId('tr-equipment').textContent = '—';
    byId('tr-ammo').textContent      = '—';
    return;
  }

  // Basics
  byId('tr-name').textContent  = m.displayName || m.name || m.Name || '—';
  byId('tr-model').textContent = m.model || m.variant || m.Model || '—';
  byId('tr-tons').textContent  = m.tonnage ?? m.Tonnage ?? m.mass ?? '—';
  byId('tr-tech').textContent  = m.techBase || m.TechBase || '—';
  byId('tr-rules').textContent = m.rulesLevel || m.Rules || '—';
  byId('tr-engine').textContent= m.engine || m.Engine || '—';
  const hs = m.heatSinks || m.HeatSinks || (m.sinks ? `${m.sinks.count ?? '—'} ${m.sinks.type ?? ''}`.trim() : '—');
  byId('tr-hs').textContent    = hs;

  const mv = getMovement(m || {});
  const mvStr = (mv.walk || mv.run || mv.jump)
    ? `W ${mv.walk ?? '—'} / R ${mv.run ?? '—'}${mv.jump ? ' / J ' + mv.jump : ''}`
    : (m?.Movement || '—');
  byId('tr-move').textContent  = mvStr;

  byId('tr-structure').textContent = m.structure || m.Structure || '—';
  byId('tr-cockpit').textContent   = m.cockpit || m.Cockpit || '—';
  byId('tr-gyro').textContent      = m.gyro || m.Gyro || '—';
  byId('tr-config').textContent    = m.extras?.Config || m.extras?.config || '—';
  byId('tr-role').textContent      = m.role || m.extras?.role || m.extras?.Role || '—';
  byId('tr-myomer').textContent    = m.extras?.myomer || '—';
  byId('tr-armor-sys').textContent = (typeof m.armor === 'string' ? m.armor : (m.armor?.total || m.armor?.type)) || m.Armor || '—';

  // Armor/Internals table
  const armorBy  = m.armorByLocation || {};
  const internal = m.internalByLocation || {};
  const extras   = m.extras || {};
  for (const loc of LOCS) {
    const a = getArmorCell(armorBy, extras, loc.key, loc.rearKey);
    const s = getInternalCell(internal, loc.key);
    const arCell = byId('ar-'+loc.key);
    if (arCell) arCell.textContent = a.front;
    if (loc.rearKey) {
      const rearCell = byId('ar-'+loc.rearKey);
      if (rearCell) rearCell.textContent = a.rear;
    }
    const inCell = byId('in-'+loc.key);
    if (inCell) inCell.textContent = s;
  }

  // Per-location equipment
  const locs = m?.locations || null;
  if (locs) {
    const tbody = byId('loc-equip-body');
    if (tbody) {
      tbody.innerHTML = '';
      let rows = 0;
      for (const [label, key] of LOC_ORDER) {
        const items = Array.isArray(locs[key]) ? locs[key] : [];
        const line = collapseLine(items);
        if (!line) continue;
        const tr = document.createElement('tr');
        const tdL = document.createElement('td'); tdL.textContent = label;
        const tdR = document.createElement('td'); tdR.className='mono'; tdR.textContent = line;
        tr.appendChild(tdL); tr.appendChild(tdR); tbody.appendChild(tr);
        rows++;
      }
      byId('loc-equip-wrap').hidden = rows === 0;
    }
  } else {
    byId('loc-equip-wrap').hidden = true;
  }

  // Weapons / Equipment / Ammo
  const mapItem = (x) => (x.name || x.Name || x.type || x.Type || 'Item') +
                         ((x.loc||x.Location)?` [${x.loc||x.Location}]`:'') +
                         (x.count?` x${x.count}`:'');
  const weapons   = Array.isArray(m.weapons) ? m.weapons : (Array.isArray(m.Weapons) ? m.Weapons : []);
  const equipment = Array.isArray(m.equipment) ? m.equipment : (Array.isArray(m.Equipment) ? m.Equipment : []);
  const ammo      = Array.isArray(m.ammo) ? m.ammo : (Array.isArray(m.Ammo) ? m.Ammo : []);
  byId('tr-weapons').textContent   = weapons.length   ? weapons.map(mapItem).join(' • ')   : '—';
  byId('tr-equipment').textContent = equipment.length ? equipment.map(mapItem).join(' • ') : '—';
  byId('tr-ammo').textContent      = ammo.length      ? ammo.map(mapItem).join(' • ')      : '—';

  // Narrative
  const setBlock = (key, wrapId, textId) => {
    const val = m.extras?.[key] || '';
    const wrap = byId(wrapId), tx = byId(textId);
    if (val) { tx.textContent = val; wrap.hidden = false; } else { wrap.hidden = true; tx.textContent=''; }
  };
  setBlock('overview',     'tr-overview-wrap',     'tr-overview');
  setBlock('capabilities', 'tr-capabilities-wrap', 'tr-capabilities');
  setBlock('deployment',   'tr-deployment-wrap',   'tr-deployment');
  setBlock('history',      'tr-history-wrap',      'tr-history');

  // Meta
  byId('tr-bv').textContent    = m.bv ?? m.BV ?? '—';
  byId('tr-cost').textContent  = fmtMoney(m.cost ?? m.Cost ?? null);
  byId('tr-era').textContent   = m.era || '—';
  const sourcesArr = Array.isArray(m.sources) ? m.sources : (m.sources ? [m.sources] : []);
  byId('tr-sources').textContent = sourcesArr.length ? sourcesArr.join(' • ') : '—';

  const manufacturers = listify(m.extras?.manufacturer);
  const factories     = listify(m.extras?.primaryfactory);
  const systems       = listify(m.extras?.systemmanufacturer);
  const mfrWrap = byId('tr-mfr-wrap');
  if (manufacturers.length || factories.length || systems.length) {
    byId('tr-mfrs').textContent = manufacturers.join(' • ') || '—';
    byId('tr-factories').textContent = factories.join(' • ') || '—';
    byId('tr-systems').textContent = systems.join(' • ') || '—';
    mfrWrap.hidden = false;
  } else mfrWrap.hidden = true;

  const licWrap = byId('tr-license-wrap');
  const lic = m._source?.license || '';
  const licUrl = m._source?.license_url || '';
  const origin = m._source?.origin || '';
  const copyright = m._source?.copyright || '';
  if (lic || origin || copyright) {
    byId('tr-origin').textContent = origin || '';
    byId('tr-license').innerHTML = licUrl
      ? `License: <a href="${esc(licUrl)}" target="_blank" rel="noopener">${esc(lic)}</a>`
      : (lic ? `License: ${esc(lic)}` : '');
    byId('tr-copyright').textContent = copyright || '';
    licWrap.hidden = false;
  } else licWrap.hidden = true;
}

/* -----------------------------------------
 *  MECH LOAD + IMPORT/EXPORT
 * --------------------------------------- */
async function loadMechFromUrl(url) {
  try {
    showToast('Loading mech…');
    const raw  = await fetchJson(url);
    const mech = ensureBV(ensureInternals(normalizeMech(raw) || raw));
    mech._sourceUrl = url; // allow Lance to reopen this mech

    state.mech = mech; window.DEBUG_MECH = mech;

    const cap = (getHeatCapacityFor(mech) | 0);
    setHeat(0, cap);
    updateOverview();
    fillTechReadout();
    window.Images?.setChassis(state.mech?.displayName || state.mech?.name || '');
    window.TRS_SHEET && window.TRS_SHEET.update(state.mech);
    window.dispatchEvent(new CustomEvent('trs:mechSelected', { detail: { mech: state.mech } }));

    showToast(`${mech?.displayName || mech?.name || 'Mech'} loaded`);
  } catch (err) {
    console.error(err);
    showToast(`Failed to load mech JSON: ${err.message}`);
  }
}

function importJson() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json';
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file) return;
    try {
      const text = await file.text(); const data = JSON.parse(text);
      if (data.mech || data.pilot || data.heat) {
        if (data.mech) state.mech = ensureBV(ensureInternals(normalizeMech(data.mech) || data.mech));
        if (data.pilot) state.pilot = data.pilot;
        if (data.heat)  state.heat  = data.heat;
        window.DEBUG_MECH = state.mech;
        setHeat(state.heat.current|0, state.heat.capacity|0);
        updateOverview(); fillTechReadout();
        window.Images?.setChassis(state.mech?.displayName || state.mech?.name || '');
        window.TRS_SHEET && window.TRS_SHEET.update(state.mech);
window.dispatchEvent(new CustomEvent('trs:mechSelected', { detail: { mech: state.mech } }));
      } else {
        state.mech = ensureBV(ensureInternals(normalizeMech(data) || data));
window.DEBUG_MECH = state.mech;

const cap = (getHeatCapacityFor(state.mech) | 0);
setHeat(0, cap);
updateOverview();
fillTechReadout();
window.Images?.setChassis(state.mech?.displayName || state.mech?.name || '');

window.TRS_SHEET && window.TRS_SHEET.update(state.mech);
window.dispatchEvent(new CustomEvent('trs:mechSelected', { detail: { mech: state.mech } }));


      }
      showToast('JSON imported');
    } catch (e) { console.error(e); showToast('Import failed'); }
  };
  input.click();
}

function exportState() {
  const payload = {
    mech: state.mech, pilot: state.pilot, heat: state.heat, gator: state.gator,
    timestamp: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gator_session_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Session exported');
}

/* -----------------------------------------
 *  SETTINGS MODAL (about)
 * --------------------------------------- */
function openModal(){
  const modal = byId('settings-modal');
  if (!modal) return;
  modal.hidden = false;
  modal.querySelector('#modal-close')?.focus();
  const buildSpan = document.querySelector('[data-build-ts]');
  if (buildSpan) buildSpan.textContent = new Date().toISOString();
  modal.addEventListener('click', backdropClose);
  window.addEventListener('keydown', escClose);
}
function closeModal(){
  const modal = byId('settings-modal');
  if (!modal) return;
  modal.hidden = true;
  modal.removeEventListener('click', backdropClose);
  window.removeEventListener('keydown', escClose);
  byId('btn-settings')?.focus();
}
function backdropClose(e){ if (e.target === byId('settings-modal')) closeModal(); }
function escClose(e){ if (e.key === 'Escape') closeModal(); }

/* -----------------------------------------
 *  FILTER MODAL + PREDICATE
 * --------------------------------------- */
const btnCustomMech = byId('btn-custom-mech'); // opens filter modal
const fModal   = document.getElementById('filter-modal');
const fClose   = document.getElementById('filter-close');
const fApply   = document.getElementById('filter-apply');
const fClear   = document.getElementById('filter-clear');

const fTech    = document.getElementById('f-tech');
const fClassL  = document.getElementById('f-class-L');
const fClassM  = document.getElementById('f-class-M');
const fClassH  = document.getElementById('f-class-H');
const fClassA  = document.getElementById('f-class-A');
const fJump    = document.getElementById('f-jump');
const fMinWalk = document.getElementById('f-minwalk');
const fRoles   = document.getElementById('f-roles');
const fRules   = document.getElementById('f-rules');
const fSource  = document.getElementById('f-source');
const fBVMin   = document.getElementById('f-bv-min');
const fBVMax   = document.getElementById('f-bv-max');

function openFilterModal(){
  if (!fModal) return;
  document.body.classList.add('modal-open');
  fModal.hidden = false;
  // preload UI from state
  if (fTech)    fTech.value = filterState.tech || '';
  if (fClassL)  fClassL.checked = filterState.classes.has('Light');
  if (fClassM)  fClassM.checked = filterState.classes.has('Medium');
  if (fClassH)  fClassH.checked = filterState.classes.has('Heavy');
  if (fClassA)  fClassA.checked = filterState.classes.has('Assault');
  if (fJump)    fJump.checked   = !!filterState.canJump;
  if (fMinWalk) fMinWalk.value  = filterState.minWalk ?? '';
  if (fRoles)   fRoles.value    = filterState.roles.join(', ');
  if (fRules)   fRules.value    = filterState.rulesLevel ?? '';
  if (fSource)  fSource.value   = filterState.source || '';
  if (fBVMin)   fBVMin.value    = filterState.bvMin ?? '';
  if (fBVMax)   fBVMax.value    = filterState.bvMax ?? '';
}
function closeFilterModal(){
  if (!fModal) return;
  fModal.hidden = true;
  document.body.classList.remove('modal-open');
  btnCustomMech?.focus();
}

btnCustomMech?.addEventListener('click', openFilterModal);
fClose?.addEventListener('click', closeFilterModal);

function applyFilters(){
  // capture state
  const classes = new Set();
  if (fClassL?.checked) classes.add('Light');
  if (fClassM?.checked) classes.add('Medium');
  if (fClassH?.checked) classes.add('Heavy');
  if (fClassA?.checked) classes.add('Assault');

  // roles from checkboxes
  const roles = Array.from(document.querySelectorAll('.f-role:checked'))
    .map(cb => (cb.dataset.role || '').toLowerCase());

filterState = {
  tech: fTech?.value || '',
  classes,
  canJump: !!fJump?.checked,
  minWalk: !fMinWalk || fMinWalk.value === '' ? null : Number(fMinWalk.value),
  roles,
  rulesLevel: (fRules?.value || '') || null,
  source: fSource?.value || '',
  bvMin: fBVMin && fBVMin.value !== '' ? Number(fBVMin.value) : null,
  bvMax: fBVMax && fBVMax.value !== '' ? Number(fBVMax.value) : null,
  ownedOnly: !!filterState.ownedOnly      // ← keep the toggle
};

  if ((filterState.bvMin != null || filterState.bvMax != null) && !state.bvMap.size) {
    showToast('BV database not loaded yet');
  }

  // predicate
  const pred = (m) => {
    const tons = m.tons ?? m.tonnage ?? m.mass ?? null;
    const cls  = m.class || (tons!=null ? (tons>=80?'Assault':tons>=60?'Heavy':tons>=40?'Medium':'Light') : null);
    const mv   = m.move || {};
    const w    = mv.w ?? mv.walk ?? null;
    const j    = mv.j ?? mv.jump ?? 0;
    const role = (m.role || (m.extras?.role) || '').toLowerCase();
    const tech = m.tech || m.techBase || '';

    // Owned-only gate (by chassis; Owned.isOwned tolerates variant suffixes)
if (filterState.ownedOnly) {
  if (!(window.Owned?.isOwned(m.name))) return false;
}

    if (filterState.tech && tech !== filterState.tech) return false;
    if (filterState.classes.size && !filterState.classes.has(cls)) return false;
    if (filterState.canJump && !(j > 0)) return false;
    if (filterState.minWalk != null && !(Number(w) >= filterState.minWalk)) return false;

if (filterState.roles.length) {
  const choose  = new Set(filterState.roles);
  const hasNone = choose.has('none');
  const roleStr = String(m.role || m.extras?.role || '').toLowerCase().trim();
  if (!(hasNone && !roleStr)) {
    const hasAny = [...choose].filter(r => r !== 'none').some(r => roleStr.includes(r));
    if (!hasAny) return false;
  }
}


    

    // BV range (from bv.json via bvMap)
    if (filterState.bvMin != null || filterState.bvMax != null) {
      const bv = bvForManifestItem(m);
      if (bv == null) return false;
      if (filterState.bvMin != null && bv < filterState.bvMin) return false;
      if (filterState.bvMax != null && bv > filterState.bvMax) return false;
    }

    if (filterState.source) {
      const wanted = String(filterState.source).toLowerCase().replace(/\s+/g, ' ').trim();
      const srcStr = String(
        m.source || (Array.isArray(m.sources) ? m.sources.join(' • ') : '')
      ).toLowerCase().replace(/\s+/g, ' ').trim();
      if (!srcStr.includes(wanted)) return false;
    }

    const rules = m.rules ?? m.rulesLevel ?? m.Rules ?? null;
    if (filterState.rulesLevel && String(rules) !== String(filterState.rulesLevel)) return false;

    return true;
  };

  // expose a tiny internal so other modules can re-apply filters without touching the modal
window._applyFiltersInternal = function() {
  const anyOn = filterState.tech
    || filterState.classes.size
    || filterState.canJump
    || filterState.minWalk != null
    || filterState.roles.length
    || (filterState.rulesLevel != null && String(filterState.rulesLevel) !== '')
    || filterState.source
    || filterState.bvMin != null
    || filterState.bvMax != null
    || filterState.ownedOnly;

  manifestFiltered = anyOn ? state.manifest.filter(pred) : null;
  window._rebuildSidebarList?.();
  window._rebuildSearchIndex?.();
  closeFilterModal();
    document.querySelector('#mech-search')?.dispatchEvent(new Event('input'));
};

  window._applyFiltersInternal();
}

function clearFilters(){
  filterState = { tech:'', classes:new Set(), canJump:false, minWalk:null, roles:[], rulesLevel:null, source:'', bvMin:null, bvMax:null, ownedOnly:false };
  manifestFiltered = null;
  window._rebuildSidebarList?.();
  window._rebuildSearchIndex?.();
  closeFilterModal();
  document.querySelector('#mech-search')?.dispatchEvent(new Event('input'));
}

fApply?.addEventListener('click', applyFilters);
fClear?.addEventListener('click', clearFilters);

  /* -----------------------------------------
 *  TABS (top-level)
 * --------------------------------------- */
function initTabs(){
  const topSwapper = byId('top-swapper');
  if (!topSwapper) return;
  const swapTabs = topSwapper.querySelectorAll('[data-swap]');

  topSwapper.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-swap]');
    if (!btn) return;

    const id = btn.getAttribute('data-swap');

    // toggle tabs
    swapTabs.forEach(b => {
      const active = b === btn;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });

    // toggle panes
    topSwapper.querySelectorAll('.swap-pane').forEach(
      p => p.classList.toggle('is-active', p.id === id)
    );

    // render weapons tab on demand
    if (id === 'tab-weapons') renderWeaponsTab();
  });
}

/* -----------------------------------------
 *  SEARCH (toolbar dropdown)
 * --------------------------------------- */
function initSearchUI(){
  const toolbar = document.querySelector('.actions--top');
  if (!toolbar) return console.warn('[search] toolbar not found');

  const btnLoadMech = byId('btn-load-mech');
  const anchor = btnLoadMech || byId('btn-load-manifest') || toolbar.lastElementChild;

  const wrap = document.createElement('div');
  Object.assign(wrap.style, { position:'relative', display:'inline-block', minWidth:'140px', marginLeft:'6px' });

  const input = document.createElement('input');
  Object.assign(input, { type:'search', id:'mech-search', placeholder:'Search mechs…', autocomplete:'off', spellcheck:false });
  Object.assign(input.style, { padding:'6px 10px', borderRadius:'6px', border:'1px solid var(--border)', background:'#0e1522', color:'var(--ink)', width:'140px' });

  const panel = document.createElement('div');
  panel.id = 'search-results';
  Object.assign(panel.style, {
    position:'absolute', top:'calc(100% + 4px)', left:'0', zIndex:'100',
    minWidth:'200px', maxWidth:'300px', maxHeight:'50vh', overflowY:'auto',
    border:'1px solid var(--border)', borderRadius:'8px', background:'var(--panel)',
    display:'none', boxShadow:'0 8px 24px rgba(0,0,0,0.35)'
  });

  wrap.appendChild(input); wrap.appendChild(panel);
  if (anchor && anchor.parentNode) anchor.insertAdjacentElement('afterend', wrap);
  else toolbar.appendChild(wrap);
  if (btnLoadMech) btnLoadMech.style.display = 'none';

  let open = false, hi = -1, results = [], index = [];

  const openPanel  = () => { if (!open){ panel.style.display='block'; open = true; } };
  const closePanel = () => { if (open){ panel.style.display='none'; open = false; hi = -1; } };

  const currentList = () => (manifestFiltered ?? state.manifest);

  const buildIndex = (list) => {
    const sorted = list.slice().sort(cmpMech);
    return sorted.map(m => {
      const label = [m.name, m.variant, m.id, m.path].filter(Boolean).join(' ').toLowerCase();
      return { ...m, _key: ' ' + label + ' ' };
    });
  };

  const scoreHit = (key, terms) => {
    let s = 0;
    for (const t of terms) {
      const idx = key.indexOf(t);
      if (idx < 0) return -1;
      s += (idx === 1 ? 3 : (key[idx-1] === ' ' ? 2 : 1));
    }
    return s;
  };

  const searchIndex = (idx, q) => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0,5);
    if (!terms.length) return [];
    const out = [];
    for (const m of idx) { const sc = scoreHit(m._key, terms); if (sc >= 0) out.push([sc, m]); }
    out.sort((a,b)=> b[0]-a[0]); return out.slice(0,25).map(x=>x[1]);
  };

  function render(){
    if (!results.length){
      panel.innerHTML = `<div class="dim small" style="padding:8px;">No matches</div>`;
      return;
    }
    panel.innerHTML = results.map((e,i)=> `
      <div class="result-item${i===hi?' is-hi':''}" data-url="${e.url}" tabindex="0" role="button"
           aria-label="${(e.name || e.id || e.variant || e.path || '').replace(/"/g,'&quot;')}"
           style="padding:6px 8px; display:block; border-bottom:1px solid var(--border); cursor:pointer;">
        <span class="result-name mono" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:calc(100% - 60px);">${e.name || e.id || e.variant || e.path}</span>
        <span class="result-variant dim mono small" style="float:right; margin-left:8px;">${e.id || e.variant || ''}</span>
      </div>`).join('');
  }

  function rebuildIndex(){ index = buildIndex(currentList()); }
  window._rebuildSearchIndex = rebuildIndex;

  let tId = 0;
  input.addEventListener('input', () => {
    const q = input.value;
    clearTimeout(tId);
    if (!q){ closePanel(); return; }
    tId = setTimeout(() => {
      results = searchIndex(index, q);
      hi = results.length ? 0 : -1;
      openPanel();
      render();
    }, 120);
  });

  panel.addEventListener('mousedown', (e) => {
    const row = e.target.closest('.result-item'); if (!row) return;
    const url = row.getAttribute('data-url');
    closePanel(); input.blur();
    if (url) loadMechFromUrl(url);
  });

  input.addEventListener('keydown', (e) => {
    if (!open && ['ArrowDown','Enter'].includes(e.key)) {
      if (!state.manifest.length) return;
      results = searchIndex(index, input.value); hi = results.length?0:-1; openPanel(); render();
    }
    if (!open) return;
    if (e.key === 'ArrowDown'){ e.preventDefault(); hi = (hi + 1 + results.length) % results.length; render(); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); hi = (hi - 1 + results.length) % results.length; render(); }
    else if (e.key === 'Enter'){ e.preventDefault(); const m = results[hi]; if (m) { closePanel(); input.blur(); loadMechFromUrl(m.url); } }
    else if (e.key === 'Escape'){ closePanel(); }
  });

  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) closePanel(); });

  // manifest hooks
  byId('btn-load-manifest')?.addEventListener('click', async () => {
    await loadManifest(); rebuildIndex();
  });
  input.addEventListener('focus', async () => {
    if (!state.manifest.length) { await loadManifest(); rebuildIndex(); }
  });

  // autoload once
  (async ()=>{ if (!state.manifest.length) { await loadManifest(); rebuildIndex(); } else { rebuildIndex(); } })();
}

/* -----------------------------------------
 *  SIDEBAR LIST (grouped by chassis, collapsible)
 * --------------------------------------- */
function initSidebarList(){
  const listEl   = byId('mech-list');
  const searchEl = byId('side-search');
  if (!listEl || !searchEl) return;

  // minimal styles for group headers; injected once
  if (!document.getElementById('mech-groups-css')) {
    const st = document.createElement('style');
    st.id = 'mech-groups-css';
    st.textContent = `
      .group-row{display:flex;align-items:center;gap:8px; padding:6px 8px;
        border-bottom:1px solid var(--border,#2a2f3a); cursor:pointer; user-select:none}
      .group-row:hover{background:rgba(255,255,255,.04)}
      .group-caret{width:1em; text-align:center; opacity:.8}
      .group-name{flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
      .group-count{opacity:.6; font-variant-numeric:tabular-nums}
      .var-row{display:flex; justify-content:space-between; padding:4px 28px 4px 28px; cursor:pointer}
      .var-row:hover{background:rgba(255,255,255,.03)}
      .var-row.is-active{background:rgba(255,255,255,.07)}
      .var-name,.var-variant{white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
      .var-variant{opacity:.7}
    `;
    document.head.appendChild(st);
  }

  let selectedUrl = null;
  function _clearMenuSelection(){
    selectedUrl = null;
    byId('mech-list')?.querySelectorAll('.var-row.is-active')
      .forEach(n => n.classList.remove('is-active'));
  }

  // remember which chassis are expanded
  const openGroups = new Set();

  let index = [];
  const currentList = () => (manifestFiltered ?? state.manifest);

  // Build per-variant search index
  const buildIndex = (list) => list.map(m => {
    const label = [m.name, m.variant, m.id, m.path].filter(Boolean).join(' ').toLowerCase();
    return { ...m, _key: ' ' + label + ' ' };
  });

  const scoreHit = (key, terms) => {
    let s = 0;
    for (const t of terms) {
      const idx = key.indexOf(t);
      if (idx < 0) return -1;
      s += (idx === 1 ? 3 : (key[idx-1] === ' ' ? 2 : 1));
    }
    return s;
  };

  const searchIndex = (idx, q) => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0,5);
    if (!terms.length) return idx.slice(0, 1000);
    const out = [];
    for (const m of idx) {
      const sc = scoreHit(m._key, terms);
      if (sc >= 0) out.push([sc, m]);
    }
    out.sort((a,b)=> b[0]-a[0]);
    return out.map(x=>x[1]).slice(0, 1000);
  };

  // Group an array of manifest items by chassis (m.name)
  function groupByChassis(arr){
    const map = new Map();
    for (const m of arr) {
      const chassis = m.name || '—';
      if (!map.has(chassis)) map.set(chassis, []);
      map.get(chassis).push(m);
    }
    // keep deterministic chassis order (locale/numeric)
    const keys = Array.from(map.keys()).sort((a,b)=> a.localeCompare(b, undefined, {numeric:true, sensitivity:'base'}));
    return { map, order: keys };
  }

  function render(){
    const q   = searchEl.value || '';
    const src = searchIndex(index, q);

    if (!src.length) {
      listEl.innerHTML = `<div class="dim small" style="padding:8px;">No matches</div>`;
      return;
    }

    const { map, order } = groupByChassis(src);

    // auto-open groups when searching; otherwise keep user toggles
    if (q.trim()) {
      openGroups.clear();
      for (const [ch, items] of map.entries()) if (items && items.length) openGroups.add(ch);
    }

    let html = '';
    for (const ch of order) {
      const items = map.get(ch) || [];
      const isOpen = openGroups.has(ch);
      const caret  = isOpen ? '▾' : '▸';
      html += `
        <div class="group-row" data-chassis="${esc(ch)}" tabindex="0" role="button" aria-expanded="${isOpen}">
          <span class="group-caret mono">${caret}</span>
          <span class="group-name mono" title="${esc(ch)}">${esc(ch)}</span>
          <span class="group-count mono small">${items.length}</span>
        </div>
      `;
      if (isOpen) {
        // stable per-variant ordering (variant then id)
        const rows = items.slice().sort((a,b)=>{
          const v = (a.variant||'').localeCompare(b.variant||'', undefined, {numeric:true, sensitivity:'base'});
          return v || (a.id||'').localeCompare(b.id||'', undefined, {numeric:true, sensitivity:'base'});
        }).map(m=>{
          const nm  = esc(m.name || m.id || m.variant || m.path || '—');
          const vr  = esc(m.variant || '');
          const url = esc(m.url || '');
          const activeCls = (url && selectedUrl === url) ? ' is-active' : '';
          return `<div class="var-row${activeCls}" data-url="${url}" tabindex="0" role="option" aria-label="${nm} ${vr}">
                    <span class="var-name mono" title="${nm}">${nm}</span>
                    <span class="var-variant mono small">${vr}</span>
                  </div>`;
        }).join('');
        html += rows;
      }
    }

    listEl.innerHTML = html;
  }

  function rebuild() {
    index = buildIndex(currentList());
    render();
  }

  window._renderSidebarList  = render;
  window._rebuildSidebarList = rebuild;

  // Toggle groups
  listEl.addEventListener('click', (e) => {
    const grp = e.target.closest('.group-row');
    if (grp) {
      const chassis = grp.getAttribute('data-chassis') || '';
      if (openGroups.has(chassis)) openGroups.delete(chassis); else openGroups.add(chassis);
      render();
      return;
    }
    const row = e.target.closest('.var-row');
    if (!row) return;
    const url = row.getAttribute('data-url');
    if (url) {
      selectedUrl = url;
      loadMechFromUrl(url);
      listEl.querySelectorAll('.var-row.is-active').forEach(n => n.classList.remove('is-active'));
      row.classList.add('is-active');
    }
  });

  // Keyboard: Enter toggles/open/loads
  listEl.addEventListener('keydown', (e) => {
    const grp = e.target.closest('.group-row');
    if (grp && e.key === 'Enter') {
      const chassis = grp.getAttribute('data-chassis') || '';
      if (openGroups.has(chassis)) openGroups.delete(chassis); else openGroups.add(chassis);
      render();
      return;
    }
    const row = e.target.closest('.var-row');
    if (row && e.key === 'Enter') {
      const url = row.getAttribute('data-url');
      if (url) {
        selectedUrl = url;
        loadMechFromUrl(url);
        listEl.querySelectorAll('.var-row.is-active').forEach(n => n.classList.remove('is-active'));
        row.classList.add('is-active');
      }
    }
  });

  // Debounced search → re-render (auto-opens matched groups)
  let tId = 0;
  searchEl.addEventListener('input', () => {
    clearTimeout(tId);
    tId = setTimeout(render, 100);
  });

  (async () => {
    if (!state.manifest.length) await loadManifest();
    rebuild();
  })();

  byId('btn-load-manifest')?.addEventListener('click', async () => {
    await loadManifest();
    rebuild();
  });

  // expose clear for Lance module
  window.App = window.App || {};
  App.clearMenuSelection = _clearMenuSelection;
}

/* -----------------------------------------
 *  GATOR — COMBAT MOD CALC
 * --------------------------------------- */
const GATOR = {
  targetBandToMod: [0,1,2,3,4,5,6],
  posture: { padj:-2, prone:1, imm:-4 },
  computeTN({G,A,T, T_adv, O, R}) {
    let t = GATOR.targetBandToMod[Math.max(0, Math.min(6, T||0))];
    if (T_adv?.jump) t += 1;
    if (T_adv?.padj) t = GATOR.posture.padj;
    else if (T_adv?.prone) t = GATOR.posture.prone;
    else if (T_adv?.imm)   t = GATOR.posture.imm;
    const sum = (G|0) + (A|0) + t + (O|0) + (R|0);
    return sum <= 2 ? { text:'Auto', cls:'tn-auto',   val:sum }
         : sum <= 9 ? { text:`${sum}+`, cls:'tn-yellow', val:sum }
                    : { text:`${sum}+`, cls:'tn-red',    val:sum };
  }
};

function initGator(){
  const gunnerySel = byId('gtr-gunnery-sel');
  const attackerSel= byId('gtr-attacker-sel');
  const tgtBandSel = byId('gtr-target-band');
  const tgtJumpChk = byId('gtr-tgt-jump');
  const tgtNone    = byId('gtr-tgt-none');
  const tgtPadj    = byId('gtr-tgt-padj');
  const tgtProne   = byId('gtr-tgt-prone');
  const tgtImm     = byId('gtr-tgt-imm');

  const wb = byId('gtr-wb'), wa = byId('gtr-wa'), ot = byId('gtr-ot'), st = byId('gtr-st'), ht = byId('gtr-ht');
  const rangeSeg = byId('gtr-range-seg'); const rmin = byId('gtr-min');
  const tnEl = byId('gtr-total');

  function recompute() {
    const res = GATOR.computeTN(state.gator);
    tnEl.className = 'tn ' + res.cls;
    tnEl.textContent = res.text;
  }

  if (gunnerySel) gunnerySel.value  = String(state.gator.G ?? 4);
  if (attackerSel) attackerSel.value= String(state.gator.A ?? 0);
  if (tgtBandSel)  tgtBandSel.value = String(state.gator.T ?? 0);

  gunnerySel?.addEventListener('change', ()=>{ state.gator.G=+gunnerySel.value; recompute(); });
  attackerSel?.addEventListener('change', ()=>{ state.gator.A=+attackerSel.value; recompute(); });
  tgtBandSel ?.addEventListener('change', ()=>{ state.gator.T=+tgtBandSel.value; recompute(); });
  tgtJumpChk?.addEventListener('change', ()=>{ state.gator.T_adv.jump = !!tgtJumpChk.checked; recompute(); });

  function setPosture(p){ state.gator.T_adv = { ...state.gator.T_adv, padj:false, prone:false, imm:false, ...p }; recompute(); }
  tgtNone ?.addEventListener('change', ()=> setPosture({}));
  tgtPadj ?.addEventListener('change', ()=> setPosture({padj:true}));
  tgtProne?.addEventListener('change', ()=> setPosture({prone:true}));
  tgtImm  ?.addEventListener('change', ()=> setPosture({imm:true}));

  function sumOther(){
    const v = (+wb.value||0)+(+wa.value||0)+(+ot.value||0)+(+st.value||0)+(+ht.value||0);
    state.gator.O = v; recompute();
  }
  [wb,wa,ot,st,ht].forEach(s => s?.addEventListener('change', sumOther));

  rangeSeg?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-val]'); if(!btn) return;
    rangeSeg.querySelectorAll('button').forEach(b=>b.classList.toggle('is-active', b===btn));
    state.gator.R = Number(btn.dataset.val)||0; recompute();
  });
  rmin?.addEventListener('change', ()=> { state.gator.Rmin = rmin.value; });

  // Dice
  const attDice = byId('roll-att-dice'),
        attMod  = byId('roll-att-mod'),
        attRes  = byId('roll-att-res'),
        btnAtt  = byId('btn-roll-att'),
        btnBoth = byId('btn-roll-both'),
        attDetail = byId('roll-att-detail');

  const parseDice = (str)=> (str||'2d6').match(/(\d+)d(\d+)/i)?.slice(1).map(Number) || [2,6];
  const rollOne   = (s)=> Math.floor(Math.random()*s)+1;
  const bounce    = (el)=>{ el.style.transform='translateY(-6px)'; el.style.transition='transform .15s ease'; requestAnimationFrame(()=> el.style.transform=''); };

  function doRoll(){
    const [n, sides] = parseDice(attDice?.value);
    const mod = Number(attMod?.value || 0);
    const rolls = Array.from({ length: n }, () => rollOne(sides));
    const sum   = rolls.reduce((a,b)=> a+b, 0);
    const total = sum + mod;

    if (attRes){
      attRes.textContent = total;
      attRes.title = `rolls: ${rolls.join(', ')}${mod ? ` + ${mod}` : ''}`;
      bounce(attRes);
    }
    if (attDetail){
      attDetail.textContent = `[${rolls.join(' + ')}]${mod ? ` + ${mod}` : ''}`;
    }
    return total;
  }

  btnAtt ?.addEventListener('click', doRoll);
  btnBoth?.addEventListener('click', doRoll);
  window.addEventListener('keydown', (e)=>{
    if (e.key.toLowerCase()==='r' && !['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) doRoll();
  });

  sumOther(); recompute();
}

/* Subtabs inside compact Gator */
function initGatorSubtabs(){
  const root = document.getElementById('gator-compact');
  if (!root) return;

  const tabs  = root.querySelectorAll('.gtr-subtab');
  const panes = root.querySelectorAll('.gtr-pane');

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.gtr-subtab');
    if (!btn) return;
    const id = btn.getAttribute('data-gtr-tab');

    tabs.forEach(b => {
      const active = b === btn;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });
    panes.forEach(p => p.classList.toggle('is-active', p.id === id));

    const pane = document.getElementById(id);
    const first = pane && pane.querySelector('select, input, button, [tabindex]');
    if (first) setTimeout(() => first.focus(), 0);
  });
}

/* Subtabs inside compact Tech panel */
function initTechSubtabs(){
  const root = document.getElementById('tech-compact');
  if (!root) return;

  const tabs  = root.querySelectorAll('.gtr-subtab');
  const panes = root.querySelectorAll('.gtr-pane');

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.gtr-subtab');
    if (!btn) return;
    const id = btn.getAttribute('data-tr-tab');

    tabs.forEach(b => {
      const active = b === btn;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });
    panes.forEach(p => p.classList.toggle('is-active', p.id === id));

    const pane = document.getElementById(id);
    const first = pane && pane.querySelector('select, input, button, [tabindex]');
    if (first) setTimeout(() => first.focus(), 0);
  });
}

/* -----------------------------------------
 *  WIRE UI
 * --------------------------------------- */
function initUI(){
  byId('btn-import')?.addEventListener('click', importJson);
  byId('btn-export')?.addEventListener('click', exportState);
  byId('btn-settings')?.addEventListener('click', openModal);
  byId('footer-about')?.addEventListener('click', openModal);
  byId('modal-close')?.addEventListener('click', closeModal);
  byId('modal-ok')?.addEventListener('click', closeModal);

  // Legacy load button (fallback)
  byId('btn-load-mech')?.addEventListener('click', (e) => {
    if (e.altKey) loadMechFromUrl('./mechs/example_mech.json');
    else importJson();
  });

  initTabs();

  // use sidebar search if present; otherwise mount the dropdown search
  if (!byId('side-search')) initSearchUI();
  initSidebarList();

  byId('btn-side-filter')?.addEventListener('click', openFilterModal);

  initGator();
  initGatorSubtabs();
  initTechSubtabs();
}

/* -----------------------------------------
 *  SIDEBAR DRAWER (mobile)
 * --------------------------------------- */
function initSidebarDrawer(){
  const sidebar = document.getElementById('mech-sidebar');
  const scrim   = document.getElementById('sidebar-scrim');
  const btn     = document.getElementById('btn-side-toggle');
  if (!sidebar || !btn || !scrim) return;

  const open = () => {
    sidebar.classList.add('is-open');
    scrim.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    sidebar.querySelector('#side-search')?.focus();
  };
  const close = () => {
    sidebar.classList.remove('is-open');
    scrim.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
  };
  const isMobile = () => window.matchMedia('(max-width: 800px)').matches;
  const toggle = () => (sidebar.classList.contains('is-open') ? close() : open());

  btn.addEventListener('click', () => { if (isMobile()) toggle(); });
  scrim.addEventListener('click', () => { if (isMobile()) close(); });
  window.addEventListener('keydown', (e) => { if (isMobile() && e.key === 'Escape' && sidebar.classList.contains('is-open')) close(); });

  document.getElementById('mech-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('.mech-row');
    if (item && isMobile()) close();
  });
}

/* ===== TRS:80 • Technical Readout Boot ===== */
(() => {
  const root   = document.getElementById('troBoot');
  if (!root) return;

  const logEl  = document.getElementById('troLog');
  const barEl  = document.getElementById('troBar');
  const hintEl = document.getElementById('troHint');

  // Optional boot speed override: window.trsBoot = { speed: 'fast'|'standard'|'cinematic' }
  const speed = (window.trsBoot && window.trsBoot.speed) || 'standard';
  const pace  = speed === 'fast' ? [60, 120] : speed === 'cinematic' ? [180, 320] : [120, 220];

  const LINES = [
    '[PWR]  TRS:80 Loader • Bootstrap OK',
    '[FS]   Manifest Index • parsing /data/mechs/*.json',
    '[DB]   Weapons Catalog • bound',
    '[BV]   BattleValue Engine • ready',
    '[NAV]  TRO Layout • online',
    '[I/O]  Lance Builder • handshake OK',
    '[UX]   G.A.T.O.R. Console • widgets alive',
    '[MEM]  Local Save State • present',
    '[REF]  TechReadout Schema • v1.3 loaded',
    '[SYS]  All modules nominal • commit → UI'
  ];

  // Utilities
  const rand = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
  const setProgress = p => { if (barEl) barEl.style.width = Math.max(0, Math.min(100, p)) + '%'; };
  const appendLine = line => {
    if (!logEl) return;
    logEl.textContent += line + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  };

  let i = 0;
  function next(){
    if (i < LINES.length){
      appendLine(LINES[i]);
      setProgress(Math.round(((i+1) / (LINES.length + 2)) * 100));
      i++;
      // a couple of longer beats to feel "calibration-y"
      const longBeat = (i === 3 || i === 6) ? 260 : 0;
      setTimeout(next, rand(pace[0], pace[1]) + longBeat);
    } else {
      setTimeout(() => setProgress(100), 180);
      if (hintEl) hintEl.textContent = 'PRESS ENTER TO OPEN TRO ▌ • OR WAIT';
      enableDismiss();
      // brief binding beat then auto-hide
      setTimeout(hideBoot, 650);
    }
  }

  function hideBoot(){
    if (!root) return;
    root.classList.add('tro-boot--hidden');
    // After transition, remove node and announce launch
    const onEnd = () => {
      root.removeEventListener('transitionend', onEnd);
      if (root && root.parentNode) root.parentNode.removeChild(root);
      window.dispatchEvent(new Event('trs:trolaunch'));
    };
    root.addEventListener('transitionend', onEnd);
    // Fallback in case transitionend doesn’t fire
    setTimeout(onEnd, 700);
  }

  function enableDismiss(){
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        cleanup();
        hideBoot();
      }
    };
    const onClick = () => { cleanup(); hideBoot(); };

    function cleanup(){
      window.removeEventListener('keydown', onKey);
      root.removeEventListener('click', onClick);
    }

    window.addEventListener('keydown', onKey, { passive:false });
    root.addEventListener('click', onClick, { once:true });
  }

  // Kick off on window load so the overlay doesn't block app init
  window.addEventListener('load', () => {
    if (logEl) logEl.textContent = '';
    if (barEl) barEl.style.width = '0%';
    next();
  }, { once:true });
})();

  
/* -----------------------------------------
 *  BOOT
 * --------------------------------------- */
function init(){
  Promise.all([loadWeaponsDb(), loadBVDb()]).then(()=>{
    renderOverviewWeaponsMini(state.mech);
    renderWeaponsTab();
  });

  setHeat(0,0);
  updateOverview();
  fillTechReadout();
  initUI();
  initSidebarDrawer();
  console.info('Gator Console ready (single-file).');

  // Expose minimal API for modules
  window.App = window.App || {};
  App.getCurrentMechSummary = () => {
    const m = state.mech;
    if (!m) return null;
    return {
      id: m.displayName || m.name || m.Model || null,
      name: m.displayName || m.name || m.Model || '—',
      bv: m.bv ?? m.BV ?? null,
      tonnage: m.tonnage ?? m.Tonnage ?? m.mass ?? null,
      source: m._sourceUrl || null
    };
  };
  App.openMech = (idOrSource) => loadMechFromUrl(idOrSource);
  App.getManifest = () => state.manifest;
App.applyOwnedFilter = (on) => {
  filterState.ownedOnly = !!on;
  applyFilters();   // reuse the same filter logic as the modal
};

  // Now that UI + sidebar are ready, hook up modules
  Lance.init({
    getCurrentMech: App.getCurrentMechSummary,
    openMechById: App.openMech,
    onMenuDeselect: App.clearMenuSelection
  });

  Owned.init({
    getManifest: App.getManifest,
    applyOwnedFilter: App.applyOwnedFilter
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();

 
