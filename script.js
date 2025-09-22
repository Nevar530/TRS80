/* ===== Gator Console – script.js (Overview/Tech + Compact G.A.T.O.R. + SEARCH LOAD) ===== */
(() => {
  'use strict';

  /* ---------- Globals (manifest + base) ---------- */
  let manifest = [];     // [{ id?, name?, variant?, path, url }]
  let manifestUrl = '';  // absolute URL to .../data/manifest.json

  /* ---------- DOM refs ---------- */
  const btnLoadManifest = document.getElementById('btn-load-manifest');
  const btnSettings     = document.getElementById('btn-settings');
  const btnLoadMech     = document.getElementById('btn-load-mech'); // hidden, kept as fallback
  const btnCustomMech   = document.getElementById('btn-custom-mech');
  const btnImport       = document.getElementById('btn-import');
  const btnExport       = document.getElementById('btn-export');

  // Overview heat
  const vheatBar  = document.getElementById('vheat');
  const vheatFill = document.getElementById('vheat-fill');
  const heatNowTx = document.getElementById('heat-now');
  const heatCapTx = document.getElementById('heat-cap');

  // Top swapper tabs
  const topSwapper = document.getElementById('top-swapper');

  // Overview fields
  const ovMech   = document.getElementById('ov-mech');
  const ovVar    = document.getElementById('ov-variant');
  const ovTons   = document.getElementById('ov-tons');
  const ovPilot  = document.getElementById('ov-pilot');
  const ovGun    = document.getElementById('ov-gun');
  const ovPil    = document.getElementById('ov-pil');
  const ovMove   = document.getElementById('ov-move');
  const ovWeps   = document.getElementById('ov-weps');

  // Tech readout
  const techOut  = document.getElementById('techout');

  // G.A.T.O.R. panel
  const gCard    = document.getElementById('gator-card');

  // Footer & Modal
  const footerAbout = document.getElementById('footer-about');
  const modal       = document.getElementById('settings-modal');
  const modalClose  = document.getElementById('modal-close');
  const modalOk     = document.getElementById('modal-ok');
  const buildSpan   = document.querySelector('[data-build-ts]');

  // Toast
  const toastEl = document.getElementById('toast');

  /* ---------- App state ---------- */
  const state = {
    mech: null,
    pilot: { name: '—', gunnery: 4, piloting: 5 },
    heat: { current: 0, capacity: 0 },
    gator: { G:4, A:0, T:0, T_adv:{jump:false, padj:false, prone:false, imm:false}, O:0, R:0, Rmin:'eq' },
  };

  /* ---------- Utils ---------- */
  const el = (sel) => document.querySelector(sel);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));

  function showToast(msg, ms = 1800) {
    if (!toastEl) { console.log('[toast]', msg); return; }
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toastEl.hidden = true;
      toastEl.style.display = 'none';
    }, ms);
  }

  async function safeFetchJson(pathOrUrl) {
    // Resolve relative to manifest folder when possible
    const base = new URL('.', manifestUrl || document.baseURI);
    const url  = /^https?:/i.test(pathOrUrl) ? pathOrUrl : new URL(pathOrUrl, base).href;

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Fetch failed (HTTP ${res.status}) for ${url}`);
    try {
      return await res.json();
    } catch (e) {
      throw new Error(`Invalid JSON in ${url}: ${e.message}`);
    }
  }

  // ----- Tech Readout helpers -----
  const toNum = (x) => {
    if (x === null || x === undefined || x === '') return null;
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  };
  const calcRun = (walk) => {
    const w = toNum(walk);
    return w == null ? null : String(Math.ceil(w * 1.5)); // BT running = ceil(1.5 × walk)
  };
  function getMovement(m){
    const mv = m.move || m.movement || m.Movement || {};
    const walk = mv.walk ?? mv.Walk ?? mv.w ?? null;
    const run  = mv.run  ?? mv.Run  ?? mv.r ?? calcRun(walk);
    const jump = mv.jump ?? mv.Jump ?? mv.j ?? null;
    return { walk, run, jump };
  }
  const listify = (v, sep=',') => Array.isArray(v) ? v : (typeof v === 'string' ? v.split(sep).map(s=>s.trim()).filter(Boolean) : []);
  const fmtMoney = (v) => {
    if (v == null || v === '') return '—';
    const n = toNum(String(v).replace(/[^\d.-]/g,''));
    return n == null ? String(v) : n.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' C-bills';
  };
  const fmtMaybe = (v) => (v == null || v === '' ? '—' : String(v));

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

  // Pull armor/internal values from multiple shapes (armorByLocation, extras "LA armor", etc.)
  function getArmorCell(armorByLoc, extras, locKey, rearKey){
    // try structured armorByLocation first
    let front = armorByLoc?.[locKey];
    let rear  = rearKey ? (armorByLoc?.[rearKey]) : undefined;

    // If objects like {a: 47, s: 14} appear, try to extract 'a'
    const unpack = (val) => {
      if (val == null) return null;
      if (typeof val === 'object') {
        const a = val.a ?? val.A ?? val.front ?? val.value ?? val.armor ?? null;
        return a ?? null;
      }
      return val;
    };
    front = unpack(front);
    rear  = unpack(rear);

    // Fallback to extras keys like "LA armor" or "RTC armor"
    if (front == null) front = extras?.[`${locKey} armor`] ?? null;
    if (rearKey && rear == null) rear = extras?.[`${rearKey} armor`] ?? null;

    return { front: front ?? '—', rear: rearKey ? (rear ?? '—') : '—' };
  }
  function getInternalCell(internalByLoc, locKey){
    const val = internalByLoc?.[locKey];
    if (val == null) return '—';
    if (typeof val === 'object') {
      const s = val.s ?? val.S ?? val.structure ?? val.value;
      return s ?? JSON.stringify(val);
    }
    return String(val);
  }

  /* ---------- Overview & Tech Readout ---------- */
  function updateOverview() {
    const m = state.mech, p = state.pilot;
    if (ovMech) ovMech.textContent = m?.displayName ?? m?.name ?? m?.Name ?? '—';
    if (ovVar)  ovVar.textContent  = m?.variant ?? m?.model ?? m?.Model ?? '—';

    // Tonnage with mass fallback
    if (ovTons) {
      ovTons.textContent =
        m?.tonnage != null ? String(m.tonnage) :
        (m?.Tonnage != null ? String(m.Tonnage) :
        (m?.mass != null ? String(m.mass) : '—'));
    }

    if (ovPilot) ovPilot.textContent = p?.name || '—';
    if (ovGun)   ovGun.textContent   = p?.gunnery != null ? String(p.gunnery) : '—';
    if (ovPil)   ovPil.textContent   = p?.piloting != null ? String(p.piloting) : '—';

    const mv = getMovement(m || {});
    if (ovMove) {
      ovMove.textContent = (mv.walk || mv.run || mv.jump)
        ? `W ${mv.walk ?? '—'} / R ${mv.run ?? '—'}${mv.jump ? ' / J ' + mv.jump : ''}`
        : (m?.Movement || '—');
    }

    if (ovWeps) {
      const w = Array.isArray(m?.weapons) ? m.weapons : (Array.isArray(m?.Weapons) ? m.Weapons : []);
      ovWeps.textContent = w.length
        ? w.slice(0,6).map(wi => `${wi.name || wi.Name || 'Weapon'}${(wi.loc || wi.Location) ? ' ['+(wi.loc||wi.Location)+']' : ''}`).join(' • ')
        : '—';
    }
  }

  const fmtAS = (o) => (o ? `${o.a ?? o.A ?? '-'} / ${o.s ?? o.S ?? '-'}` : '—');

// --- Per-location breakdown helpers ---
const LOC_ORDER = [
  ["Head", "head"],
  ["Center Torso", "centerTorso"],
  ["Right Torso", "rightTorso"],
  ["Left Torso", "leftTorso"],
  ["Right Arm", "rightArm"],
  ["Left Arm", "leftArm"],
  ["Right Leg", "rightLeg"],
  ["Left Leg", "leftLeg"]
];

// collapse duplicates: ["LRM 15","LRM 15","Gyro","Gyro","Gyro"] -> "LRM 15 x2 • Gyro x3"
function collapseLine(items = []) {
  const seen = new Map();
  const order = [];
  for (const raw of items) {
    const s = String(raw).trim();
    if (!s) continue;
    if (!seen.has(s)) { seen.set(s, 1); order.push(s); }
    else seen.set(s, seen.get(s) + 1);
  }
  return order.map(k => seen.get(k) > 1 ? `${k} x${seen.get(k)}` : k).join(' • ');
}

// returns HTML string; safe to insert in renderTechOut
function renderLocationBreakdown(mech) {
  const locs = mech?.locations || null;
  if (!locs) return ''; // nothing to show
  const rows = LOC_ORDER.map(([label, key]) => {
    const items = Array.isArray(locs[key]) ? locs[key] : [];
    const line = collapseLine(items);
    return line ? `<tr><td>${label}</td><td class="mono">${line}</td></tr>` : '';
  }).join('');
  if (!rows.trim()) return '';
  return `
    <hr class="modal-divider">
    <div>
      <strong>Equipment by Location</strong>
      <table class="small mono" style="width:100%; border-collapse:collapse; margin-top:6px;">
        <thead>
          <tr style="text-align:left;">
            <th style="padding:4px 0; width:160px;">Location</th>
            <th style="padding:4px 0;">Items</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

  
  function renderTechOut() {
    if (!techOut) return;
    const m = state.mech;
    if (!m) { techOut.innerHTML = '<div class="placeholder">Load or build a mech to view details.</div>'; return; }

    // Primary facts
    const name    = m.displayName || m.name || m.Name || '—';
    const model   = m.model || m.variant || m.Model || '—';
    const tons    = m.tonnage ?? m.Tonnage ?? m.mass ?? '—';
    const tech    = m.techBase || m.TechBase || '—';
    const rules   = m.rulesLevel || m.Rules || '—';
    const engine  = m.engine || m.Engine || '—';
    const hs      = m.heatSinks || m.HeatSinks || (m.sinks ? `${m.sinks.count ?? '—'} ${m.sinks.type ?? ''}`.trim() : '—');
    const struct  = m.structure || m.Structure || '—';
    const cockpit = m.cockpit || m.Cockpit || '—';
    const gyro    = m.gyro || m.Gyro || '—';
    const role    = m.extras?.role || m.extras?.Role || '—';
    const cfg     = m.extras?.Config || m.extras?.config || '—';
    const myomer  = m.extras?.myomer || '—';

    const mv = getMovement(m || {});
    const mvStr = (mv.walk || mv.run || mv.jump)
      ? `W ${mv.walk ?? '—'} / R ${mv.run ?? '—'}${mv.jump ? ' / J ' + mv.jump : ''}`
      : (m?.Movement || '—');

    // Armor / Internals
    const armorSys = (typeof m.armor === 'string' ? m.armor : (m.armor?.total || m.armor?.type)) || m.Armor || '—';
    const armorBy  = m.armorByLocation || {};
    const internal = m.internalByLocation || {};
    const extras   = m.extras || {};

    const armorRows = LOCS.map(loc => {
      const a = getArmorCell(armorBy, extras, loc.key, loc.rearKey);
      const s = getInternalCell(internal, loc.key);
      return `<tr>
        <td>${loc.name}</td>
        <td class="mono">${esc(a.front)}</td>
        <td class="mono">${esc(a.rear)}</td>
        <td class="mono">${esc(s)}</td>
      </tr>`;
    }).join('');

    // Weapons / Equipment / Ammo (robust to different shapes)
    const weapons = Array.isArray(m.weapons) ? m.weapons
                  : Array.isArray(m.Weapons) ? m.Weapons : [];
    const equipment = Array.isArray(m.equipment) ? m.equipment
                    : Array.isArray(m.Equipment) ? m.Equipment : [];
    const ammo = Array.isArray(m.ammo) ? m.ammo
                : Array.isArray(m.Ammo) ? m.Ammo : [];

    const mapItem = (x) => esc(
      (x.name || x.Name || x.type || x.Type || 'Item') +
      ((x.loc || x.Location) ? ` [${x.loc || x.Location}]` : '') +
      (x.count ? ` x${x.count}` : '')
    );

    const weaponsHtml   = weapons.length   ? weapons.map(mapItem).join(' • ')   : '—';
    const equipHtml     = equipment.length ? equipment.map(mapItem).join(' • ') : '—';
    const ammoHtml      = ammo.length      ? ammo.map(mapItem).join(' • ')      : '—';

    // Narrative
    const overview     = m.extras?.overview     || '';
    const capabilities = m.extras?.capabilities || '';
    const deployment   = m.extras?.deployment   || '';
    const history      = m.extras?.history      || '';

    // Mfr / factories
    const manufacturers = listify(m.extras?.manufacturer);
    const factories     = listify(m.extras?.primaryfactory);
    const systems       = listify(m.extras?.systemmanufacturer);

    // Meta
    const bv   = m.bv ?? m.BV ?? '—';
    const cost = fmtMoney(m.cost ?? m.Cost ?? null);
    const era  = m.era || '—';
    const sourcesArr = Array.isArray(m.sources) ? m.sources : (m.sources ? [m.sources] : []);
    const sourcesHtml = sourcesArr.length ? sourcesArr.map(esc).join(' • ') : '—';

    // License
    const lic = m._source?.license || '';
    const licUrl = m._source?.license_url || '';
    const origin = m._source?.origin || '';
    const copyright = m._source?.copyright || '';
    const locBreakHtml = renderLocationBreakdown(m);

    techOut.innerHTML = `
      <div class="mono small dim" style="margin-bottom:6px;">${esc(m.id || m.ID || '')}</div>

      <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div><strong>Chassis</strong><br>${esc(name)} ${model ? '('+esc(model)+')' : ''}</div>
        <div><strong>Tonnage</strong><br>${esc(tons)}</div>
        <div><strong>Tech Base</strong><br>${esc(tech)}</div>
        <div><strong>Rules Level</strong><br>${esc(rules)}</div>
        <div><strong>Engine</strong><br>${esc(engine)}</div>
        <div><strong>Heat Sinks</strong><br>${esc(hs)}</div>
        <div><strong>Movement</strong><br>${esc(mvStr)}</div>
        <div><strong>Structure</strong><br>${esc(struct)}</div>
        <div><strong>Cockpit</strong><br>${esc(cockpit)}</div>
        <div><strong>Gyro</strong><br>${esc(gyro)}</div>
        <div><strong>Config</strong><br>${esc(cfg)}</div>
        <div><strong>Role</strong><br>${esc(role)}</div>
        <div><strong>Myomer</strong><br>${esc(myomer)}</div>
        <div><strong>Armor System</strong><br>${esc(armorSys)}</div>
      </div>

      <hr class="modal-divider">

      <div>
        <strong>Armor & Internals by Location</strong>
        <table class="small mono" style="width:100%; border-collapse:collapse; margin-top:6px;">
          <thead>
            <tr style="text-align:left;">
              <th style="padding:4px 0;">Location</th>
              <th style="padding:4px 0;">Armor</th>
              <th style="padding:4px 0;">Rear</th>
              <th style="padding:4px 0;">Internal</th>
            </tr>
          </thead>
          <tbody>
            ${armorRows}
          </tbody>
        </table>
      </div>

      <hr class="modal-divider">

      </table>
    </div>

    ${locBreakHtml}  <!-- NEW: per-location items -->

    <hr class="modal-divider">

      <div><strong>Weapons</strong><br>${weaponsHtml}</div>
      <div style="margin-top:6px;"><strong>Equipment</strong><br>${equipHtml}</div>
      <div style="margin-top:6px;"><strong>Ammo</strong><br>${ammoHtml}</div>

      <hr class="modal-divider">

      ${(overview || capabilities || deployment || history) ? `
        ${overview ? `<div style="margin-bottom:8px;"><strong>Overview</strong><br>${esc(overview)}</div>` : ''}
        ${capabilities ? `<div style="margin-bottom:8px;"><strong>Capabilities</strong><br>${esc(capabilities)}</div>` : ''}
        ${deployment ? `<div style="margin-bottom:8px;"><strong>Deployment</strong><br>${esc(deployment)}</div>` : ''}
        ${history ? `<div style="margin-bottom:8px;"><strong>History</strong><br>${esc(history)}</div>` : ''}
        <hr class="modal-divider">` : ''}

      <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div><strong>Battle Value (BV)</strong><br>${esc(bv)}</div>
        <div><strong>Cost</strong><br>${esc(cost)}</div>
        <div><strong>Era / Year</strong><br>${esc(era)}</div>
        <div><strong>Sources</strong><br>${sourcesHtml}</div>
      </div>

      ${(manufacturers.length || factories.length || systems.length) ? `
        <hr class="modal-divider">
        <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div><strong>Manufacturers</strong><br>${manufacturers.map(esc).join(' • ') || '—'}</div>
          <div><strong>Primary Factories</strong><br>${factories.map(esc).join(' • ') || '—'}</div>
          <div style="grid-column:1 / -1;"><strong>Systems</strong><br>${systems.map(esc).join(' • ') || '—'}</div>
        </div>
      ` : ''}

      ${lic || origin || copyright ? `
        <hr class="modal-divider">
        <div class="small dim">
          <div>${esc(origin || '')}</div>
          ${licUrl ? `<div>License: <a href="${esc(licUrl)}" target="_blank" rel="noopener">${esc(lic)}</a></div>` :
                      (lic ? `<div>License: ${esc(lic)}</div>` : '')}
          ${copyright ? `<div>${esc(copyright)}</div>` : ''}
        </div>
      ` : ''}
    `;
  }
  // Make sure it's callable regardless of scope
  window.renderTechOut = renderTechOut;

  // --- Minimal schema adapter: new JSON -> your current fields (DROP-IN) ---
  function adaptMechSchema(m) {
    if (!m || typeof m !== 'object') return m;

    const out = { ...m };
    out.extras = out.extras || {};

    // 1) Text/lore -> extras.* (your UI already reads these)
    if (m.text) {
      out.extras.overview     = out.extras.overview     ?? m.text.overview;
      out.extras.capabilities = out.extras.capabilities ?? m.text.capabilities;
      out.extras.deployment   = out.extras.deployment   ?? m.text.deployment;
      out.extras.history      = out.extras.history      ?? m.text.history;
    }

    // 2) Meta -> extras.* (role/Config/myomer/manufacturer/primaryfactory/systemmanufacturer)
    if (m.role != null)   out.extras.role   = out.extras.role   ?? m.role;
    if (m.config != null) out.extras.Config = out.extras.Config ?? m.config;
    if (m.myomer != null) out.extras.myomer = out.extras.myomer ?? m.myomer;

    // Manufacturer/Factories/Systems
    if (m.manufacturers) {
      const prim = m.manufacturers.primary || [];
      const fac  = m.manufacturers.primaryFactory || [];
      const sys  = m.manufacturers.systems || {};

      if (!out.extras.manufacturer && prim.length)  out.extras.manufacturer = prim.join(', ');
      if (!out.extras.primaryfactory && fac.length) out.extras.primaryfactory = fac;
      if (!out.extras.systemmanufacturer) {
        const sysList = [];
        if (sys.chassis)        sysList.push(`CHASSIS:${sys.chassis}`);
        if (sys.engine)         sysList.push(`ENGINE:${sys.engine}`);
        if (sys.armor)          sysList.push(`ARMOR:${sys.armor}`);
        if (sys.communications) sysList.push(`COMMUNICATIONS:${sys.communications}`);
        if (sys.targeting)      sysList.push(`TARGETING:${sys.targeting}`);
        if (sysList.length) out.extras.systemmanufacturer = sysList;
      }
    }

    // 3) Armor map -> armorByLocation + extras["<LOC> armor"] fallbacks your UI already supports
    if (m.armor && typeof m.armor === 'object') {
      out.armorByLocation = out.armorByLocation || {
        HD:  m.armor.head ?? null,
        CT:  m.armor.centerTorso ?? null,
        LT:  m.armor.leftTorso ?? null,
        RT:  m.armor.rightTorso ?? null,
        LA:  m.armor.leftArm ?? null,
        RA:  m.armor.rightArm ?? null,
        LL:  m.armor.leftLeg ?? null,
        RL:  m.armor.rightLeg ?? null,
        RTC: m.armor.rearCenterTorso ?? null,
        RTL: m.armor.rearLeftTorso ?? null,
        RTR: m.armor.rearRightTorso ?? null
      };

      out.extras["RTC armor"] = out.extras["RTC armor"] ?? m.armor.rearCenterTorso;
      out.extras["RTL armor"] = out.extras["RTL armor"] ?? m.armor.rearLeftTorso;
      out.extras["RTR armor"] = out.extras["RTR armor"] ?? m.armor.rearRightTorso;
      out.extras["HD armor"]  = out.extras["HD armor"]  ?? m.armor.head;
      out.extras["CT armor"]  = out.extras["CT armor"]  ?? m.armor.centerTorso;
      out.extras["LT armor"]  = out.extras["LT armor"]  ?? m.armor.leftTorso;
      out.extras["RT armor"]  = out.extras["RT armor"]  ?? m.armor.rightTorso;
      out.extras["LA armor"]  = out.extras["LA armor"]  ?? m.armor.leftArm;
      out.extras["RA armor"]  = out.extras["RA armor"]  ?? m.armor.rightArm;
      out.extras["LL armor"]  = out.extras["LL armor"]  ?? m.armor.leftLeg;
      out.extras["RL armor"]  = out.extras["RL armor"]  ?? m.armor.rightLeg;
    }

    // 4) Weapons -> normalize to {name, loc} for your UI
    if (Array.isArray(m.weapons)) {
      out.weapons = m.weapons.map(w => ({
        name: w.name || w.type || 'Weapon',
        loc:  w.loc  || w.location || ''
      }));
    }

    // 5) Era pass-through
    if (m.era != null && out.era == null) out.era = m.era;

    // 6) Ensure tonnage exists for UIs that read 'tonnage'
    if (out.tonnage == null && out.mass != null) out.tonnage = out.mass;

    // 7) Map single source -> sources[] so your UI shows it
    if (!out.sources && out.source) out.sources = [String(out.source)];

    // 8) Heat capacity hint from "heatSinks" like "12 Single"
    if (out.heatCapacity == null && out.heatSinks != null) {
      const mhs = String(out.heatSinks).match(/\d+/);
      if (mhs) out.heatCapacity = Number(mhs[0]);
    }

    return out;
  }

  /* ---------- Heat ---------- */
  function setHeat(current, capacity) {
    state.heat.current  = Math.max(0, current|0);
    state.heat.capacity = Math.max(0, capacity|0);
    const cap = state.heat.capacity || 1;
    const pct = clamp((state.heat.current / cap) * 100, 0, 100);

    if (vheatFill) vheatFill.style.height = pct.toFixed(1) + '%';
    if (vheatBar){
      vheatBar.setAttribute('aria-valuenow', String(state.heat.current));
      vheatBar.setAttribute('aria-valuemax', String(state.heat.capacity || 50));
    }
    if (heatNowTx) heatNowTx.textContent = String(state.heat.current);
    if (heatCapTx) heatCapTx.textContent = state.heat.capacity ? String(state.heat.capacity) : '—';
  }

  /* ---------- Overview & Tech Readout orchestration ---------- */
  function onMechChanged({ resetHeat = true } = {}) {
    const m = state.mech || null;
    if (!m) {
      setHeat(0, 0);
      updateOverview();
      if (typeof window.renderTechOut === 'function') {
        window.renderTechOut();
      } else if (techOut) {
        techOut.innerHTML = '<div class="placeholder">Load or build a mech to view details.</div>';
      }
      return;
    }
    const cap = Number.isFinite(m?.heatCapacity) ? m.heatCapacity : (m?.sinks?.count ?? m?.HeatSinks ?? 0);
    setHeat(resetHeat ? 0 : state.heat.current, cap);
    updateOverview();

    if (typeof window.renderTechOut === 'function') {
      window.renderTechOut();
    } else {
      console.warn('renderTechOut is not defined');
    }
  }

  /* ---------- Manifest loading ---------- */
  async function loadManifest() {
    try {
      manifestUrl = new URL('data/manifest.json', document.baseURI).href;

      const res = await fetch(manifestUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} loading manifest.json`);

      const raw = await res.json();

      // Normalize any supported shapes: array | { group: [] } | { mechs: [] }
      let items = [];
      if (Array.isArray(raw)) {
        items = raw;
      } else if (raw && Array.isArray(raw.mechs)) {
        items = raw.mechs;
      } else if (raw && typeof raw === 'object') {
        for (const v of Object.values(raw)) if (Array.isArray(v)) items.push(...v);
      }

      const base = new URL('.', manifestUrl); // folder of manifest (…/data/)
      manifest = items
        .filter(e => e && (e.path || e.url || e.file))
        .map(e => {
          const id  = e.id || null;
          const nm  = e.displayName || e.displayname || e.name || null;
          const varnt = e.variant || null;
          const rawPath = (e.path || e.url || e.file || '').replace(/\\/g, '/').trim(); // "a-f/Assassin ASN-21.json"
          const abs = /^https?:/i.test(rawPath) ? rawPath : new URL(rawPath, base).href; // …/data/a-f/Assassin%20ASN-21.json
          return { id, name: nm, variant: varnt, path: rawPath, url: abs };
        });

      console.log(`Manifest OK (${manifest.length}) base=`, base.href);
      showToast(`Manifest loaded — ${manifest.length} mechs`);
    } catch (err) {
      console.error(err);
      showToast(`Failed to load manifest: ${err.message}`);
    }
  }

  /* ---------- Load mech by absolute URL or by ID ---------- */
  async function loadMechFromUrl(url) {
    try {
      showToast('Loading mech…');
      const raw = await safeFetchJson(url);

      let mech = raw;
      try {
        mech = adaptMechSchema(raw) || raw;   // safe adapter + fallback
      } catch (e) {
        console.warn('[adapter] failed, using raw mech:', e);
        mech = raw;
      }

      state.mech = mech;
      window.DEBUG_MECH = mech;               // quick peek in console if needed
      onMechChanged({ resetHeat: true });
      showToast(`${mech?.displayName || mech?.name || mech?.Model || 'Mech'} loaded`);
    } catch (err) {
      console.error(err);
      showToast(`Failed to load mech JSON: ${err.message}`);
    }
  }

  async function loadMechById(id) {
    const m = manifest.find(x => String(x.id) === String(id));
    if (!m) { showToast(`Not in manifest: ${id}`); return; }
    return loadMechFromUrl(m.url);
  }

  /* ---------- Import / Export ---------- */
  function loadMechFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const text = await file.text();
        const raw  = JSON.parse(text);

        let mech = raw;
        try {
          mech = adaptMechSchema(raw) || raw; // safe adapter + fallback
        } catch (e) {
          console.warn('[adapter] failed, using raw mech:', e);
          mech = raw;
        }

        state.mech = mech;
        window.DEBUG_MECH = mech;
        onMechChanged({ resetHeat: true });
        showToast(`${mech?.displayName || mech?.name || 'Mech'} loaded`);
      } catch (e) {
        console.error(e);
        showToast('Load failed (invalid JSON)');
      }
    };
    input.click();
  }

  function importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (data.mech || data.pilot || data.heat) {
          // Session-style import
          if (data.mech) {
            try {
              state.mech = adaptMechSchema(data.mech) || data.mech;
            } catch (e) {
              console.warn('[adapter] session mech failed, using raw:', e);
              state.mech = data.mech;
            }
          }
          if (data.pilot) state.pilot = data.pilot;
          if (data.heat)  state.heat  = data.heat;
          window.DEBUG_MECH = state.mech;
          onMechChanged({ resetHeat: false });
        } else {
          // Plain mech JSON
          try {
            state.mech = adaptMechSchema(data) || data;
          } catch (e) {
            console.warn('[adapter] plain mech failed, using raw:', e);
            state.mech = data;
          }
          window.DEBUG_MECH = state.mech;
          onMechChanged({ resetHeat: true });
        }

        showToast('JSON imported');
      } catch (e) {
        console.error(e);
        showToast('Import failed');
      }
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

  /* ---------- Settings/About modal ---------- */
  function openModal(){
    if (!modal) return;
    modal.hidden = false;
    const focusable = modal.querySelector('#modal-close');
    focusable?.focus();
    if (buildSpan) buildSpan.textContent = new Date().toISOString();
    modal.addEventListener('click', backdropClose);
    window.addEventListener('keydown', escClose);
  }
  function closeModal(){
    if (!modal) return;
    modal.hidden = true;
    modal.removeEventListener('click', backdropClose);
    window.removeEventListener('keydown', escClose);
    btnSettings?.focus();
  }
  function backdropClose(e){ if (e.target === modal) closeModal(); }
  function escClose(e){ if (e.key === 'Escape') closeModal(); }

  /* ===================== SEARCH UI (Typeahead over manifest; top 25) ===================== */
  (function initSearch() {
    try {
      const toolbar = document.querySelector('.actions--top');
      if (!toolbar || !btnLoadMech) return;

      // Build search UI container
      const wrap = document.createElement('div');
      wrap.style.position = 'relative';
      wrap.style.display = 'inline-block';
      wrap.style.minWidth = '220px';
      wrap.style.marginLeft = '6px';

      const input = document.createElement('input');
      input.type = 'search';
      input.id = 'mech-search';
      input.placeholder = 'Search mechs…';
      input.autocomplete = 'off';
      input.spellcheck = false;
      Object.assign(input.style, {
        padding: '6px 10px',
        borderRadius: '6px',
        border: '1px solid var(--border)',
        background: '#0e1522',
        color: 'var(--ink)',
        width: '220px'
      });

      const panel = document.createElement('div');
      panel.id = 'search-results';
      Object.assign(panel.style, {
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: '0',
        zIndex: '100',
        minWidth: '280px',
        maxWidth: '420px',
        maxHeight: '50vh',
        overflowY: 'auto',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        background: 'var(--panel)',
        display: 'none',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
      });

      wrap.appendChild(input);
      wrap.appendChild(panel);
      btnLoadMech.insertAdjacentElement('afterend', wrap);
      btnLoadMech.style.display = 'none';

      let open = false;
      let hi = -1;
      let results = [];

      function openPanel(){ if (!open){ panel.style.display='block'; open = true; } }
      function closePanel(){ if (open){ panel.style.display='none'; open = false; hi = -1; } }

      function tokenize(q){
        return q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0,5);
      }
      function score(hit, terms){
        let s = 0;
        for (const t of terms){
          const idx = hit.indexOf(t);
          if (idx < 0) return -1;              // must contain all terms
          if (idx === 0) s += 3;
          else if (/\s/.test(hit[idx-1])) s += 2;
          else s += 1;
        }
        return s - Math.log1p(hit.length)/2;   // tiny bias to shorter labels
      }

      function labelFor(m){
        return m.name || m.id || m.variant || m.path;
      }

      function search(q){
        if (!q) return [];
        const terms = tokenize(q);
        if (!terms.length) return [];
        const scored = [];
        for (const e of manifest){
          const key = [e.name, e.variant, e.id, e.path].filter(Boolean).join(' ').toLowerCase();
          const sc = score(key, terms);
          if (sc >= 0) scored.push([sc, e]);
        }
        scored.sort((a,b)=> b[0]-a[0]);
        return scored.slice(0,25).map(x=>x[1]);
      }

      function render(){
        if (!results.length){
          panel.innerHTML = `<div class="dim small" style="padding:8px;">No matches</div>`;
          return;
        }
        panel.innerHTML = results.map((e,i)=> `
          <div class="result-item${i===hi?' is-hi':''}" data-url="${e.url}" data-id="${e.id||''}" tabindex="0" role="button" aria-label="${esc(labelFor(e))}" style="padding:6px 8px; display:block; border-bottom:1px solid var(--border); cursor:pointer;">
            <span class="result-name mono" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:calc(100% - 60px);">${esc(labelFor(e))}</span>
            <span class="result-variant dim mono small" style="float:right; margin-left:8px;">${esc(e.id || e.variant || '')}</span>
          </div>
        `).join('');
      }

      // Debounced input
      let tId = 0;
      input.addEventListener('input', () => {
        const q = input.value;
        clearTimeout(tId);
        if (!q){ closePanel(); return; }
        tId = setTimeout(() => {
          results = search(q);
          hi = results.length ? 0 : -1;
          openPanel();
          render();
        }, 120);
      });

      // Mouse select (mousedown beats blur)
      panel.addEventListener('mousedown', (e) => {
        const row = e.target.closest('.result-item');
        if (!row) return;
        const url = row.getAttribute('data-url');
        closePanel();
        input.blur();
        if (url) loadMechFromUrl(url);
      });

      // Keyboard nav
      input.addEventListener('keydown', (e) => {
        if (!open && ['ArrowDown','Enter'].includes(e.key)) {
          if (input.value){ results = search(input.value); hi = results.length?0:-1; openPanel(); render(); }
        }
        if (!open) return;
        if (e.key === 'ArrowDown'){ e.preventDefault(); hi = (hi + 1 + results.length) % results.length; render(); }
        else if (e.key === 'ArrowUp'){ e.preventDefault(); hi = (hi - 1 + results.length) % results.length; render(); }
        else if (e.key === 'Enter'){ e.preventDefault(); const m = results[hi]; if (m) { closePanel(); input.blur(); loadMechFromUrl(m.url); } }
        else if (e.key === 'Escape'){ closePanel(); }
      });

      // Close when clicking away
      document.addEventListener('click', (e) => {
        if (wrap.contains(e.target)) return;
        closePanel();
      });

      // Load manifest on focus or button click (and also once at start)
      btnLoadManifest?.addEventListener('click', loadManifest);
      input.addEventListener('focus', () => { if (!manifest.length) loadManifest(); });
      if (!manifest.length) loadManifest();
    } catch (e) {
      console.error('Search init failed', e);
      showToast('Search init failed');
    }
  })();
  /* ===================== END SEARCH UI ===================== */

  /* ===================== BEGIN GATOR LOGIC (compact) ===================== */
  function targetMovementModifierFromBand(band){
    const map = [0,1,2,3,4,5,6];
    const idx = Math.max(0, Math.min(6, band|0));
    return map[idx];
  }

  function recomputeGator(){
    const { G, A, T, T_adv, O, R } = state.gator;

    let T_total = targetMovementModifierFromBand(T);
    if (T_adv.jump) T_total += 1;

    if (T_adv.padj)       T_total = -2;
    else if (T_adv.prone) T_total = 1;
    else if (T_adv.imm)   T_total = -4;

    const sum = G + A + T_total + O + R;

    const tnEl = el('#gtr-total');
    if (tnEl){
      tnEl.className = 'tn';
      if (sum <= 2) { tnEl.textContent = 'Auto'; tnEl.classList.add('tn-auto'); }
      else if (sum <= 9) { tnEl.textContent = `${sum}+`; tnEl.classList.add('tn-yellow'); }
      else { tnEl.textContent = `${sum}+`; tnEl.classList.add('tn-red'); }
    }

    document.body.dataset.gatorTn = String(sum);
  }

  function initGatorPanel(){
    if (!gCard) return;

    // Select refs
    const gunnerySel = el('#gtr-gunnery-sel');
    const attackerSel = el('#gtr-attacker-sel');
    const tgtBandSel  = el('#gtr-target-band');
    const tgtJumpChk  = el('#gtr-tgt-jump');
    const tgtNone     = el('#gtr-tgt-none');
    const tgtPadj     = el('#gtr-tgt-padj');
    const tgtProne    = el('#gtr-tgt-prone');
    const tgtImm      = el('#gtr-tgt-imm');

    const wb = el('#gtr-wb'); const wa = el('#gtr-wa'); const ot = el('#gtr-ot'); const st = el('#gtr-st'); const ht = el('#gtr-ht');

    // Range segmented buttons + minimum dropdown
    const rangeSeg = el('#gtr-range-seg');
    const rmin = el('#gtr-min');

    // Initialize from state
    if (gunnerySel) gunnerySel.value  = String(state.gator.G ?? 4);
    if (attackerSel) attackerSel.value = String(state.gator.A ?? 0);
    if (tgtBandSel)  tgtBandSel.value  = String(state.gator.T ?? 0);

    // Wire changes
    gunnerySel?.addEventListener('change', () => { state.gator.G = +gunnerySel.value; recomputeGator(); });
    attackerSel?.addEventListener('change', () => { state.gator.A = +attackerSel.value; recomputeGator(); });
    tgtBandSel ?.addEventListener('change', () => { state.gator.T = +tgtBandSel.value; recomputeGator(); });
    tgtJumpChk?.addEventListener('change', () => { state.gator.T_adv.jump = !!tgtJumpChk.checked; recomputeGator(); });

    function setPosture({padj=false, prone=false, imm=false}){
      state.gator.T_adv.padj = padj; state.gator.T_adv.prone = prone; state.gator.T_adv.imm = imm;
      recomputeGator();
    }
    tgtNone ?.addEventListener('change', ()=> setPosture({}));
    tgtPadj ?.addEventListener('change', ()=> setPosture({padj:true}));
    tgtProne?.addEventListener('change', ()=> setPosture({prone:true}));
    tgtImm  ?.addEventListener('change', ()=> setPosture({imm:true}));

    function sumOther(){
      const v = (+wb.value||0)+(+wa.value||0)+(+ot.value||0)+(+st.value||0)+(+ht.value||0);
      state.gator.O = v; recomputeGator();
    }
    [wb,wa,ot,st,ht].forEach(s => s?.addEventListener('change', sumOther));

    function wireRangeSeg(){
      if(!rangeSeg) return;
      rangeSeg.addEventListener('click', (e)=>{
        const btn = e.target.closest('button[data-val]');
        if(!btn) return;
        rangeSeg.querySelectorAll('button').forEach(b=>b.classList.toggle('is-active', b===btn));
        state.gator.R = Number(btn.dataset.val)||0;
        recomputeGator();
      });
    }
    wireRangeSeg();

    rmin?.addEventListener('change', ()=> { state.gator.Rmin = rmin.value; });

    sumOther();
    recomputeGator();

    /* --- Dice roller --- */
    const attDice = el('#roll-att-dice'), attMod = el('#roll-att-mod'), attRes = el('#roll-att-res');
    const tgtDice = el('#roll-tgt-dice'), tgtMod = el('#roll-tgt-mod'), tgtRes = el('#roll-tgt-res');
    const btnAtt  = el('#btn-roll-att'), btnTgt = el('#btn-roll-tgt'), btnBoth = el('#btn-roll-both');

    function parseDice(str){ const m = (str||'2d6').match(/(\d+)d(\d+)/i); return m?{n:+m[1],s:+m[2]}:{n:2,s:6}; }
    const rollOne = (s)=> Math.floor(Math.random()*s)+1;
    function rollDice(str){ const {n,s}=parseDice(str); const r=[]; for(let i=0;i<n;i++) r.push(rollOne(s)); return r; }
    function bounce(el){ el.style.transform='translateY(-6px)'; el.style.transition='transform .15s ease'; requestAnimationFrame(()=> el.style.transform=''); }

    function doRoll(side){
      const isAtt = side==='att';
      const dice = isAtt? attDice.value : tgtDice?.value || '2d6';
      const mod  = Number((isAtt? attMod.value : tgtMod?.value) || 0);
      const res  = isAtt? attRes : tgtRes;

      const rolls = rollDice(dice);
      const total = rolls.reduce((a,b)=>a+b,0)+mod;
      if (res){ res.textContent = total; res.title = `rolls: ${rolls.join(', ')} + ${mod}`; bounce(res); }
      return total;
    }

    btnAtt?.addEventListener('click', ()=> doRoll('att'));
    btnTgt?.addEventListener('click', ()=> doRoll('tgt'));
    btnBoth?.addEventListener('click', ()=> { doRoll('att'); doRoll('tgt'); });

    window.addEventListener('keydown', (e)=>{
      if(e.key.toLowerCase()==='r' && !['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)){
        doRoll('att'); doRoll('tgt');
      }
    });
  }
  /* ===================== END GATOR LOGIC ===================== */

  /* ---------- Wire UI ---------- */
  btnImport?.addEventListener('click', importJson);
  btnExport?.addEventListener('click', exportState);
  btnSettings?.addEventListener('click', openModal);
  footerAbout?.addEventListener('click', openModal);
  modalClose?.addEventListener('click', closeModal);
  modalOk?.addEventListener('click', closeModal);

  // Legacy load button (now hidden by search UI, but kept as fallback)
  btnLoadMech?.addEventListener('click', (e) => { if (e.altKey) loadMechFromUrl('./mechs/example_mech.json'); else loadMechFromFile(); });

  // Top swapper
  if (topSwapper){
    const swapTabs = topSwapper.querySelectorAll('[data-swap]');
    topSwapper.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-swap]');
      if (!btn) return;
      const id = btn.getAttribute('data-swap');
      swapTabs.forEach(b => {
        const active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
      });
      topSwapper.querySelectorAll('.swap-pane').forEach(p => {
        p.classList.toggle('is-active', p.id === id);
      });
    });
  }

  /* ---------- Init ---------- */
  onMechChanged({ resetHeat: true });
  if (document.readyState !== 'loading') {
    initGatorPanel();
  } else {
    document.addEventListener('DOMContentLoaded', initGatorPanel);
  }

  console.info('Gator Console ready.');
})();
