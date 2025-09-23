/* ===== Gator Console – single-file script (clean, with search + filters + tabs) ===== */
(() => {
  'use strict';

  /* ---------- State ---------- */
const state = {
  mech: null,
  pilot: { name: '—', gunnery: 4, piloting: 5 },
  heat: { current: 0, capacity: 0 },
  gator: { G:4, A:0, T:0, T_adv:{jump:false, padj:false, prone:false, imm:false}, O:0, R:0, Rmin:'eq' },
  manifest: [],
  manifestUrl: '',
  weaponsDb: [],            // <— NEW: raw list
  weaponsMap: new Map()     // <— NEW: lookup by id/name (lowercased)
};

  /* ----- Filter state (UI reads these; manifest must be enriched to use fully) ----- */
  let manifestFiltered = null;       // null = no filters; otherwise filtered array
  let filterState = { tech:"", classes:new Set(), canJump:false, minWalk:null, roles:[] };

  /* ---------- Helpers ---------- */
  const $ = (sel) => document.querySelector(sel);
  const byId = (id) => document.getElementById(id);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
  const listify = (v, sep=',') => Array.isArray(v) ? v : (typeof v === 'string' ? v.split(sep).map(s=>s.trim()).filter(Boolean) : []);
  const toNum = (x) => { if (x == null || x === '') return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
  const fmtMoney = (v) => { if (v == null || v === '') return '—'; const n = toNum(String(v).replace(/[^\d.-]/g,'')); return n == null ? String(v) : n.toLocaleString(undefined,{maximumFractionDigits:0}) + ' C-bills'; };
  function showToast(msg, ms=1600){ const t = byId('toast'); if(!t){console.log('[toast]',msg);return;} t.textContent=msg; t.hidden=false; t.style.display='block'; clearTimeout(showToast._t); showToast._t=setTimeout(()=>{ t.hidden=true; t.style.display='none'; },ms); }

async function loadWeaponsDb() {
  try {
    const list = await fetchJson('data/weapons.json');
    state.weaponsDb = Array.isArray(list) ? list : [];
    state.weaponsMap = new Map();

    for (const w of state.weaponsDb) {
      const keys = new Set();
      if (w.id)   keys.add(normKey(w.id));
      if (w.name) keys.add(normKey(w.name));
      // NEW: alias indexing
      const aliases = Array.isArray(w.aliases) ? w.aliases : [];
      for (const a of aliases) if (a) keys.add(normKey(a));

      for (const k of keys) if (k && !state.weaponsMap.has(k)) state.weaponsMap.set(k, w);
    }
    // inject tiny CSS once
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

  const normKey = (s) => String(s||'')
  .toLowerCase()
  .replace(/[\s._\-\/]+/g, ' ')  // collapse punctuation-ish to spaces
  .trim();

  
  /* ---------- Manifest + Fetch ---------- */
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
      else if (raw && typeof raw === 'object') for (const v of Object.values(raw)) if (Array.isArray(v)) items.push(...v);

      const base = new URL('.', state.manifestUrl);
      state.manifest = items
        .filter(e => e && (e.path || e.url || e.file))
        .map(e => {
          const path = (e.path || e.url || e.file || '').replace(/\\/g,'/').trim();
          const abs  = /^https?:/i.test(path) ? path : new URL(path, base).href;
          return {
            id: e.id || null,
            name: e.displayName || e.displayname || e.name || null,
            variant: e.variant || null,
            path,
            url: abs,
            // optional enriched fields for filtering (if present in manifest)
            tons: e.tons ?? e.tonnage ?? e.mass,
            tech: e.tech ?? e.techBase,
            role: e.role,
            class: e.class,
            move: e.move
          };
        });

      // Refresh search index if search has mounted
      window._rebuildSearchIndex?.();
      showToast(`Manifest loaded — ${state.manifest.length} mechs`);
    } catch (err) {
      console.error(err);
      showToast(`Failed to load manifest: ${err.message}`);
    }
  }

  /* ---------- Schema normalization ---------- */
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

    if (out.heatCapacity == null && out.heatSinks != null) {
      const mhs = String(out.heatSinks).match(/\d+/);
      if (mhs) out.heatCapacity = Number(mhs[0]);
    }
    if (out.tonnage == null && out.mass != null) out.tonnage = out.mass;

    return out;
  }

  /* ---------- Heat + Overview fill ---------- */
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

    const mv = m? m._mv : null;
    const mvStr = mv && (mv.walk || mv.run || mv.jump)
      ? `W ${mv.walk ?? '—'} / R ${mv.run ?? '—'}${mv.jump ? ' / J ' + mv.jump : ''}` : '—';
    byId('ov-move').textContent = mvStr;

const w = Array.isArray(m?.weapons) ? m.weapons : [];
byId('ov-weps').textContent = w.length
  ? w.slice(0,6).map(wi => `${wi.name}${wi.loc?` [${wi.loc}]`:''}`).join(' • ')
  : '—';

// NEW: render the mini stats table under the line above
renderOverviewWeaponsMini(m);

  }

function renderOverviewWeaponsMini(mech){
  const host = byId('ov-weps');
  if (!host) return;

  // ensure a sibling container just under the "Key Weapons" line
  let wrap = byId('ov-weps-mini');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'ov-weps-mini';
    wrap.className = 'weapon-block';
    // insert after #ov-weps
    host.insertAdjacentElement('afterend', wrap);
  }

  const list = Array.isArray(mech?.weapons) ? mech.weapons : [];
  if (!list.length) { wrap.innerHTML = ''; return; }

  const rows = list.map(w => {
    const ref = getWeaponRefByName(w.name);
    if (!ref) {
      // unknown: show blanks per your rule
      return `<tr>
        <td>${esc(w.name)}${w.loc ? ` [${esc(w.loc)}]` : ''}</td>
        <td class="dim">—</td><td class="dim">—</td><td class="dim">—</td>
        <td class="dim">—</td><td class="dim">—</td><td class="dim">—</td><td class="dim">—</td>
      </tr>`;
    }
    const r = ref.range || {};
    return `<tr>
      <td>${esc(ref.name || w.name)}${w.loc ? ` [${esc(w.loc)}]` : ''}</td>
      <td>${esc(ref.type ?? '—')}</td>
      <td>${ref.damage ?? '—'}</td>
      <td>${ref.heat ?? '—'}</td>
      <td>${ref.ammo ?? '—'}</td>
      <td>${r.pointblank ?? 0}</td>
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
        <th>A</th>
        <th>C</th><th>S</th><th>M</th><th>L</th>
      </tr>
    </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

  
  
  /* ---------- Tech Readout fill (no innerHTML building of layout) ---------- */
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
    ["Head", "head"],["Center Torso", "centerTorso"],["Right Torso", "rightTorso"],
    ["Left Torso", "leftTorso"],["Right Arm", "rightArm"],["Left Arm", "leftArm"],
    ["Right Leg", "rightLeg"],["Left Leg", "leftLeg"]
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
      if (typeof val === 'object') { const a = val.a ?? val.A ?? val.front ?? val.value ?? val.armor ?? null; return a ?? null; }
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
    ['tr-name','tr-model','tr-tons','tr-tech','tr-rules','tr-engine','tr-hs','tr-move','tr-structure','tr-cockpit','tr-gyro','tr-config','tr-role','tr-myomer','tr-armor-sys','tr-bv','tr-cost','tr-era','tr-sources']
      .forEach(id => byId(id).textContent = '—');
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
    return; // <-- early exit when no mech loaded
  } // <-- CLOSE the if (!m) block

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
  const mvStr = (mv.walk || mv.run || mv.jump) ? `W ${mv.walk ?? '—'} / R ${mv.run ?? '—'}${mv.jump ? ' / J ' + mv.jump : ''}` : (m?.Movement || '—');
  byId('tr-move').textContent  = mvStr;

  byId('tr-structure').textContent = m.structure || m.Structure || '—';
  byId('tr-cockpit').textContent   = m.cockpit || m.Cockpit || '—';
  byId('tr-gyro').textContent      = m.gyro || m.Gyro || '—';
  byId('tr-config').textContent    = m.extras?.Config || m.extras?.config || '—';
  byId('tr-role').textContent      = m.extras?.role || m.extras?.Role || '—';
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
    byId('tr-license').innerHTML = licUrl ? `License: <a href="${esc(licUrl)}" target="_blank" rel="noopener">${esc(lic)}</a>` :
                                           (lic ? `License: ${esc(lic)}` : '');
    byId('tr-copyright').textContent = copyright || '';
    licWrap.hidden = false;
  } else licWrap.hidden = true;
}


  /* ---------- Mech load ---------- */
  async function loadMechFromUrl(url) {
    try {
      showToast('Loading mech…');
      const raw = await fetchJson(url);
      const mech = normalizeMech(raw) || raw;
      state.mech = mech; window.DEBUG_MECH = mech;
      const cap = Number.isFinite(mech?.heatCapacity) ? mech.heatCapacity : (mech?.sinks?.count ?? mech?.HeatSinks ?? 0);
      setHeat(0, cap|0);
      updateOverview();
      fillTechReadout();
      showToast(`${mech?.displayName || mech?.name || 'Mech'} loaded`);
    } catch (err) {
      console.error(err);
      showToast(`Failed to load mech JSON: ${err.message}`);
    }
  }

  /* ---------- Import / Export ---------- */
  function importJson() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const text = await file.text(); const data = JSON.parse(text);
        if (data.mech || data.pilot || data.heat) {
          if (data.mech) state.mech = normalizeMech(data.mech) || data.mech;
          if (data.pilot) state.pilot = data.pilot;
          if (data.heat)  state.heat  = data.heat;
          window.DEBUG_MECH = state.mech;
          setHeat(state.heat.current|0, state.heat.capacity|0);
          updateOverview(); fillTechReadout();
        } else {
          state.mech = normalizeMech(data) || data;
          window.DEBUG_MECH = state.mech;
          const cap = Number.isFinite(state.mech?.heatCapacity) ? state.mech.heatCapacity : (state.mech?.sinks?.count ?? state.mech?.HeatSinks ?? 0);
          setHeat(0, cap|0); updateOverview(); fillTechReadout();
        }
        showToast('JSON imported');
      } catch (e) { console.error(e); showToast('Import failed'); }
    };
    input.click();
  }
  function exportState() {
    const payload = { mech: state.mech, pilot: state.pilot, heat: state.heat, gator: state.gator, timestamp: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gator_session_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Session exported');
  }

  /* ---------- Modal ---------- */
  function openModal(){
    const modal = byId('settings-modal');
    if (!modal) return;
    modal.hidden = false;
    modal.querySelector('#modal-close')?.focus();
    const buildSpan = document.querySelector('[data-build-ts]'); if (buildSpan) buildSpan.textContent = new Date().toISOString();
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

  /* ---------- Filter modal ---------- */
  const btnCustomMech = byId('btn-custom-mech'); // used to open filter modal
  const fModal      = document.getElementById('filter-modal');
  const fClose      = document.getElementById('filter-close');
  const fApply      = document.getElementById('filter-apply');
  const fClear      = document.getElementById('filter-clear');

  const fTech       = document.getElementById('f-tech');
  const fClassL     = document.getElementById('f-class-L');
  const fClassM     = document.getElementById('f-class-M');
  const fClassH     = document.getElementById('f-class-H');
  const fClassA     = document.getElementById('f-class-A');
  const fJump       = document.getElementById('f-jump');
  const fMinWalk    = document.getElementById('f-minwalk');
  const fRoles      = document.getElementById('f-roles');

  function openFilterModal(){
    if (!fModal) return;
    document.body.classList.add('modal-open');
    fModal.hidden = false;
    // preload UI from state
    if (fTech) fTech.value = filterState.tech || "";
    if (fClassL) fClassL.checked = filterState.classes.has('Light');
    if (fClassM) fClassM.checked = filterState.classes.has('Medium');
    if (fClassH) fClassH.checked = filterState.classes.has('Heavy');
    if (fClassA) fClassA.checked = filterState.classes.has('Assault');
    if (fJump) fJump.checked   = !!filterState.canJump;
    if (fMinWalk) fMinWalk.value  = filterState.minWalk ?? "";
    if (fRoles) fRoles.value    = filterState.roles.join(', ');
  }

  function closeFilterModal(){
    if (!fModal) return;
    fModal.hidden = true;
    document.body.classList.remove('modal-open');
    btnCustomMech?.focus();
  }

  btnCustomMech?.addEventListener('click', openFilterModal);
  fClose?.addEventListener('click', closeFilterModal);

  /* Build predicate from controls, filter manifest, and close */
  function applyFilters(){
    // capture state
    const classes = new Set();
    if (fClassL?.checked) classes.add('Light');
    if (fClassM?.checked) classes.add('Medium');
    if (fClassH?.checked) classes.add('Heavy');
    if (fClassA?.checked) classes.add('Assault');

    filterState = {
      tech: fTech?.value || "",
      classes,
      canJump: !!fJump?.checked,
      minWalk: !fMinWalk || fMinWalk.value === "" ? null : Number(fMinWalk.value),
      roles: (fRoles?.value || "")
              .split(/[,\s]+/)
              .map(s=>s.trim())
              .filter(Boolean)
              .map(s=>s.toLowerCase())
    };

    // turn state into a predicate (requires enriched manifest entries to be effective)
    const pred = (m) => {
      const tons = m.tons ?? m.tonnage ?? m.mass ?? null;
      const cls  = m.class || (tons!=null ? (tons>=80?'Assault':tons>=60?'Heavy':tons>=40?'Medium':'Light') : null);
      const mv   = m.move || {};
      const w    = mv.w ?? mv.walk ?? null;
      const j    = mv.j ?? mv.jump ?? 0;
      const role = (m.role || (m.extras?.role) || "").toLowerCase();
      const tech = m.tech || m.techBase || "";

      if (filterState.tech && tech !== filterState.tech) return false;
      if (filterState.classes.size && !filterState.classes.has(cls)) return false;
      if (filterState.canJump && !(j > 0)) return false;
      if (filterState.minWalk != null && !(Number(w) >= filterState.minWalk)) return false;
      if (filterState.roles.length){
        const tokens = role.split(/[\/, ]+/).filter(Boolean);
        const hit = tokens.some(t => filterState.roles.includes(t));
        if (!hit) return false;
      }
      return true;
    };

    // apply over full manifest (if no filters active -> null to use full set)
    const anyOn = filterState.tech || filterState.classes.size || filterState.canJump ||
                  filterState.minWalk != null || filterState.roles.length;
    manifestFiltered = anyOn ? state.manifest.filter(pred) : null;

    // tell search UI to rebuild its index from the filtered set
    window._rebuildSearchIndex?.();

    closeFilterModal();

    // if search UI is open, re-render its list
    document.querySelector('#mech-search')?.dispatchEvent(new Event('input'));
  }

  function clearFilters(){
    filterState = { tech:"", classes:new Set(), canJump:false, minWalk:null, roles:[] };
    manifestFiltered = null;
    window._rebuildSearchIndex?.();
    closeFilterModal();
    document.querySelector('#mech-search')?.dispatchEvent(new Event('input'));
  }

  fApply?.addEventListener('click', applyFilters);
  fClear?.addEventListener('click', clearFilters);

  /* ---------- Tabs ---------- */
  function initTabs(){
    const topSwapper = byId('top-swapper');
    if (!topSwapper) return;
    const swapTabs = topSwapper.querySelectorAll('[data-swap]');
    topSwapper.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-swap]'); if (!btn) return;
      const id = btn.getAttribute('data-swap');
      swapTabs.forEach(b => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
      });
      topSwapper.querySelectorAll('.swap-pane').forEach(p => p.classList.toggle('is-active', p.id === id));
    });
  }

  /* ---------- Search (mounts input into toolbar) ---------- */
  function initSearchUI(){
    const toolbar = document.querySelector('.actions--top');
    if (!toolbar) return console.warn('[search] toolbar not found');

    const btnLoadMech = byId('btn-load-mech');
    const anchor = btnLoadMech || byId('btn-load-manifest') || toolbar.lastElementChild;

    const wrap = document.createElement('div');
    Object.assign(wrap.style, { position:'relative', display:'inline-block', minWidth:'200px', marginLeft:'6px' });

    const input = document.createElement('input');
    Object.assign(input, { type:'search', id:'mech-search', placeholder:'Search mechs…', autocomplete:'off', spellcheck:false });
    Object.assign(input.style, { padding:'6px 10px', borderRadius:'6px', border:'1px solid var(--border)', background:'#0e1522', color:'var(--ink)', width:'200px' });

    const panel = document.createElement('div');
    panel.id = 'search-results';
    Object.assign(panel.style, {
      position:'absolute', top:'calc(100% + 4px)', left:'0', zIndex:'100',
      minWidth:'200px', maxWidth:'300px', maxHeight:'50vh', overflowY:'auto',
      border:'1px solid var(--border)', borderRadius:'8px', background:'var(--panel)',
      display:'none', boxShadow:'0 8px 24px rgba(0,0,0,0.35)'
    });

    wrap.appendChild(input); wrap.appendChild(panel);
    if (anchor && anchor.parentNode) anchor.insertAdjacentElement('afterend', wrap); else toolbar.appendChild(wrap);
    if (btnLoadMech) btnLoadMech.style.display = 'none';

    let open = false, hi = -1, results = [], index = [];

    const openPanel  = () => { if (!open){ panel.style.display='block'; open = true; } };
    const closePanel = () => { if (open){ panel.style.display='none'; open = false; hi = -1; } };

    function currentList() {
      return manifestFiltered ?? state.manifest;
    }
    function buildIndex(list) {
      return list.map(m => {
        const label = [m.name, m.variant, m.id, m.path].filter(Boolean).join(' ').toLowerCase();
        return { ...m, _key: ' ' + label + ' ' };
      });
    }
    function scoreHit(key, terms) {
      let s = 0;
      for (const t of terms) { const idx = key.indexOf(t); if (idx < 0) return -1; s += (idx === 1 ? 3 : (key[idx-1] === ' ' ? 2 : 1)); }
      return s;
    }
    function searchIndex(idx, q) {
      const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0,5);
      if (!terms.length) return [];
      const out = [];
      for (const m of idx) { const sc = scoreHit(m._key, terms); if (sc >= 0) out.push([sc, m]); }
      out.sort((a,b)=> b[0]-a[0]); return out.slice(0,25).map(x=>x[1]);
    }
    function render(){
      if (!results.length){ panel.innerHTML = `<div class="dim small" style="padding:8px;">No matches</div>`; return; }
      panel.innerHTML = results.map((e,i)=> `
        <div class="result-item${i===hi?' is-hi':''}" data-url="${e.url}" tabindex="0" role="button"
             aria-label="${(e.name || e.id || e.variant || e.path || '').replace(/"/g,'&quot;')}"
             style="padding:6px 8px; display:block; border-bottom:1px solid var(--border); cursor:pointer;">
          <span class="result-name mono" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:calc(100% - 60px);">${e.name || e.id || e.variant || e.path}</span>
          <span class="result-variant dim mono small" style="float:right; margin-left:8px;">${e.id || e.variant || ''}</span>
        </div>`).join('');
    }

    function rebuildIndex() { index = buildIndex(currentList()); }
    window._rebuildSearchIndex = rebuildIndex; // expose for filters/manifest loader

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

  /* ---------- GATOR ---------- */
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
      return sum <= 2 ? { text:'Auto', cls:'tn-auto', val:sum }
           : sum <= 9 ? { text: `${sum}+`, cls:'tn-yellow', val:sum }
                      : { text: `${sum}+`, cls:'tn-red',    val:sum };
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
      attDetail = byId('roll-att-detail'); // ← NEW (optional)

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

    // focus first control in the newly active pane
    const pane = document.getElementById(id);
    const first = pane && pane.querySelector('select, input, button, [tabindex]');
    if (first) setTimeout(() => first.focus(), 0);
  });
}


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


  /* ---------- Wire UI ---------- */
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
    initSearchUI();
    initGator();
    initGatorSubtabs();
    initTechSubtabs();
  }

  /* ---------- Init ---------- */
function init(){
  loadWeaponsDb().then(()=> {
    renderOverviewWeaponsMini(state.mech);
  });
  setHeat(0,0);
  updateOverview();
  fillTechReadout();
  initUI();
  console.info('Gator Console ready (single-file).');
}


  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
