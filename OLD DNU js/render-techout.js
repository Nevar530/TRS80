// Your helpers + constants (from your current script)
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
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
));
const listify = (v, sep=',') => Array.isArray(v) ? v : (typeof v === 'string' ? v.split(sep).map(s=>s.trim()).filter(Boolean) : []);
const toNum = (x) => { if (x==null||x==='') return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
const calcRun = (walk) => { const w = toNum(walk); return w==null ? null : String(Math.ceil(w*1.5)); };
function getMovement(m){
  const mv = m.move || m.movement || m.Movement || {};
  const walk = mv.walk ?? mv.Walk ?? mv.w ?? null;
  const run  = mv.run  ?? mv.Run  ?? mv.r ?? calcRun(walk);
  const jump = mv.jump ?? mv.Jump ?? mv.j ?? null;
  return { walk, run, jump };
}
const fmtMoney = (v) => {
  if (v == null || v === '') return '—';
  const n = toNum(String(v).replace(/[^\d.-]/g,'')); return n == null ? String(v) : n.toLocaleString(undefined,{maximumFractionDigits:0})+' C-bills';
};

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
// collapse dups for per-location items
function collapseLine(items = []) {
  const seen = new Map(); const order = [];
  for (const raw of items) {
    const s = String(raw).trim(); if (!s) continue;
    if (!seen.has(s)) { seen.set(s, 1); order.push(s); } else seen.set(s, seen.get(s) + 1);
  }
  return order.map(k => seen.get(k) > 1 ? `${k} x${seen.get(k)}` : k).join(' • ');
}
function renderLocationBreakdown(mech) {
  const locs = mech?.locations || null;
  if (!locs) return '';
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

export function renderTechOutFromState(state){
  const techOut = document.getElementById('techout');
  if (!techOut) return;
  const m = state.mech;
  if (!m) { techOut.innerHTML = '<div class="placeholder">Load or build a mech to view details.</div>'; return; }

  // (This block is identical to your current renderTechOut body, trimmed only for module scope)
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
    ? `W ${mv.walk ?? '—'} / R ${mv.run ?? '—'}${mv.jump ? ' / J ' + mv.jump : ''}` : (m?.Movement || '—');

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

  const weapons   = Array.isArray(m.weapons) ? m.weapons : (Array.isArray(m.Weapons) ? m.Weapons : []);
  const equipment = Array.isArray(m.equipment) ? m.equipment : (Array.isArray(m.Equipment) ? m.Equipment : []);
  const ammo      = Array.isArray(m.ammo) ? m.ammo : (Array.isArray(m.Ammo) ? m.Ammo : []);

  const mapItem = (x) => esc((x.name || x.Name || x.type || x.Type || 'Item') + ((x.loc||x.Location)?` [${x.loc||x.Location}]`:'') + (x.count?` x${x.count}`:''));
  const weaponsHtml = weapons.length ? weapons.map(mapItem).join(' • ') : '—';
  const equipHtml   = equipment.length ? equipment.map(mapItem).join(' • ') : '—';
  const ammoHtml    = ammo.length ? ammo.map(mapItem).join(' • ') : '—';

  const overview     = m.extras?.overview     || '';
  const capabilities = m.extras?.capabilities || '';
  const deployment   = m.extras?.deployment   || '';
  const history      = m.extras?.history      || '';

  const manufacturers = listify(m.extras?.manufacturer);
  const factories     = listify(m.extras?.primaryfactory);
  const systems       = listify(m.extras?.systemmanufacturer);

  const bv   = m.bv ?? m.BV ?? '—';
  const cost = fmtMoney(m.cost ?? m.Cost ?? null);
  const era  = m.era || '—';
  const sourcesArr = Array.isArray(m.sources) ? m.sources : (m.sources ? [m.sources] : []);
  const sourcesHtml = sourcesArr.length ? sourcesArr.map(esc).join(' • ') : '—';

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
        <tbody>${armorRows}</tbody>
      </table>
    </div>

    <hr class="modal-divider">

    ${locBreakHtml}

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
