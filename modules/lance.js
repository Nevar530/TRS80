/* ===== TRS:80 Lance Module (manifest-aware; pilots, skills, mobile, Skirmish export) =====
 * Public: Lance.init(api), Lance.setVisible(on), Lance.getState()
 * Expects host API:
 *   api.getCurrentMech(): { id?:string|null, name?:string|null, bv?:number|null, tonnage?:number|null, source?:string|null } | null
 *   api.openMechById(idOrSource: string): void
 *   api.onMenuDeselect(): void
 *   api.getManifestBySource?(sourcePathOrUrl: string): ManifestEntry | null   // optional
 *
 * Fallbacks used automatically if the host doesn’t provide getManifestBySource:
 *   - window.App.getManifest()  (your main app exposes this)
 *   - window.MANIFEST_INDEX[pathOrFilename] = { displayName, name, model, path, url, ... }
 */
(function(){
  'use strict';

  const STORAGE_KEY = 'trs80:lance';
  const UI_STATE_KEY = 'trs80:lance:ui';
  const SCHEMA = 'trs80-lance@2';

  // Skirmish token color indexes per team
  const TEAM_COLOR = { Alpha:1, Bravo:0, Clan:4, Merc:3 };

  // Callsigns
  const CALLSIGNS = [
    'Ghost','Reaper','Shadow','Viper','Echo','Frost','Blaze','Onyx','Phantom','Apex',
    'Striker','Nova','Havoc','Iron','Vector','Zero','Rift','Cinder','Talon','Ash'
  ];
  let _cs = shuffle([...CALLSIGNS]);
  let _csIdx = 0;
  function nextCallsign(){
    if (_csIdx >= _cs.length){ _cs = shuffle([...CALLSIGNS]); _csIdx = 0; }
    return _cs[_csIdx++];
  }
  function shuffle(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

  // Host + state
  /** @type {ReturnType<typeof mkHost>|null} */
  let host = null;
  let _state = { v:1, schema:SCHEMA, name:'Unnamed Lance', units:[] };
  let _visible = false;

  // UI refs
  let _dock, _btn, _list, _totBV, _totTons, _totCount, _nameInp, _warn;

  const Lance = { init, setVisible, getState };
  window.Lance = Lance;

  // ---------- Init ----------
  function init(api){
    host = mkHost(api || {});
    _btn  = document.getElementById('btn-lance');
    _dock = document.getElementById('lance-dock');
    if (!_dock){ console.warn('[Lance] #lance-dock not found'); return; }

    injectCssOnce();
    _state = loadState();
    _visible = loadUi().visible ?? false;

    // Seed defaults, firm up names/variants from manifest if possible
    for (const u of _state.units){
      if (!u.pilotName) u.pilotName = nextCallsign();
      if (!Number.isFinite(u.gunnery)) u.gunnery = 4;
      if (!Number.isFinite(u.piloting))  u.piloting  = 5;
      const ent = getManifestEntryBySource(u.source);
      u.variantCode = u.variantCode || ent?.model || sniffVariantCode(u.name) || undefined;
      if (ent?.displayName) u.name = ent.displayName;
    }

    renderDock();
    renderList();
    updateTotals();

    if (_btn) {
      _btn.addEventListener('click', ()=> setVisible(!_visible));
      _btn.setAttribute('aria-expanded', String(_visible));
    }
    setVisible(_visible);

    window.addEventListener('keydown', (e)=>{
      if ((e.altKey || e.metaKey) && e.key.toLowerCase()==='l'){ e.preventDefault(); setVisible(!_visible); }
    });

    console.info('[Lance] ready. Units:', _state.units.length);
  }

  function setVisible(on){
    _visible = !!on;
    if (_dock) _dock.classList.toggle('hidden', !_visible);
    if (_btn)  _btn.setAttribute('aria-expanded', String(_visible));
    saveUi({ visible:_visible });
  }
  function getState(){ return structuredClone(_state); }

  // ---------- Rendering ----------
  function renderDock(){
    if (!_dock) return;
    _dock.innerHTML = `
      <section class="lance panel">
        <header class="panel-h lance-h">
          <div class="lance-title">
            <input id="lance-name" class="lance-name" value="${esc(_state.name||'Unnamed Lance')}" aria-label="Lance name"/>
            <span id="lance-warn" class="lance-warn" hidden></span>
          </div>
          <div class="lance-actions">
            <button id="lance-add" class="btn sm" title="Add current mech">Add Current</button>
            <button id="lance-import" class="btn ghost sm" title="Import lance JSON">Import</button>
            <button id="lance-export" class="btn ghost sm" title="Export Skirmish JSON">Export</button>
            <button id="lance-clear" class="btn ghost sm" title="Clear roster">Clear</button>
            <button id="lance-hide" class="btn sm" title="Hide panel">Hide</button>
          </div>
        </header>
        <div class="panel-c">
          <div class="lance-totals mono">
            <div><label class="dim small">BV</label> <span id="lance-tot-bv">0</span></div>
            <div><label class="dim small">Tons</label> <span id="lance-tot-tons">0</span></div>
            <div><label class="dim small">Units</label> <span id="lance-tot-count">0</span></div>
          </div>
          <div id="lance-list" class="lance-list" role="list" aria-label="Lance roster"></div>
        </div>
      </section>`;

    _list     = document.getElementById('lance-list');
    _totBV    = document.getElementById('lance-tot-bv');
    _totTons  = document.getElementById('lance-tot-tons');
    _totCount = document.getElementById('lance-tot-count');
    _nameInp  = document.getElementById('lance-name');
    _warn     = document.getElementById('lance-warn');

    document.getElementById('lance-add')   ?.addEventListener('click', onAddCurrent);
    document.getElementById('lance-import')?.addEventListener('click', onImport);
    document.getElementById('lance-export')?.addEventListener('click', onExportSkirmish);
    document.getElementById('lance-clear') ?.addEventListener('click', onClear);
    document.getElementById('lance-hide')  ?.addEventListener('click', ()=> setVisible(false));

    _nameInp?.addEventListener('change', ()=>{ _state.name = _nameInp.value.trim() || 'Unnamed Lance'; saveState(); });
    _nameInp?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') e.currentTarget.blur(); });
  }

  function renderList(){
    if (!_list) return;
    if (!_state.units.length){
      _list.innerHTML = `<div class="dim small" style="padding:6px;">No units yet. Use <strong>Add Current</strong>.</div>`;
      return;
    }

    const rows = _state.units.map((u, i)=>{
      const nm = splitDisplay(u.name, u.source, u.variantCode);
      return `
      <div class="lance-row" data-idx="${i}" role="listitem">
        <div class="l-col name mono" title="${esc(nm.full)}">
          <span class="chassis">${esc(nm.chassis)}</span>
          ${nm.code ? `<sup class="variant-sup">${esc(nm.code)}</sup>` : ``}
        </div>
        <div class="l-col ton mono small" title="Tonnage">${fmt(u.tonnage,'—')}</div>
        <div class="l-col bv mono small" title="BV">${fmt(u.bv,'—')}</div>

        <div class="l-col edit">
          <label class="small dim">Pilot</label>
          <input class="mini" data-field="pilotName" value="${esc(u.pilotName||'')}" maxlength="32" />
        </div>

        <div class="l-col edit">
          <label class="small dim">Gunnery</label>
          <input class="mini num" data-field="gunnery" type="number" min="0" max="9" step="1" value="${esc(u.gunnery??4)}" />
        </div>

        <div class="l-col edit">
          <label class="small dim">Piloting</label>
          <input class="mini num" data-field="piloting" type="number" min="0" max="9" step="1" value="${esc(u.piloting??5)}" />
        </div>

        <div class="l-col edit">
          <label class="small dim">Team</label>
          <select class="mini sel" data-field="team">
            ${['Alpha','Bravo','Clan','Merc'].map(t=>`<option${u.team===t?' selected':''}>${t}</option>`).join('')}
          </select>
        </div>

        <div class="l-col actions">
          <button class="linklike" data-act="view" title="Open in viewer">View</button>
          <span class="dim">•</span>
          <button class="linklike" data-act="remove" title="Remove">Remove</button>
        </div>
      </div>`;
    }).join('');

    _list.innerHTML = rows;

    _list.addEventListener('input', onRowEdit, { once:true });
    _list.addEventListener('change', onRowEdit);
    _list.addEventListener('click', onRowAction);
  }

  function updateTotals(){
    const bv = _state.units.reduce((s,u)=> s + (Number(u.bv)||0), 0);
    const tons = _state.units.reduce((s,u)=> s + (Number(u.tonnage)||0), 0);
    const n = _state.units.length;
    if (_totBV) _totBV.textContent = String(bv);
    if (_totTons) _totTons.textContent = String(tons);
    if (_totCount) _totCount.textContent = String(n);
  }

  // ---------- Actions ----------
  function onAddCurrent(){
    if (!host || !host.getCurrentMech) return warn('Host API missing: getCurrentMech');
    const m = host.getCurrentMech();
    if (!m || !m.name || !m.source) return warn('No current mech or missing source');

    // Resolve manifest entry for accurate displayName + model
    const entry = getManifestEntryBySource(String(m.source));
    const variantCode = entry?.model || sniffVariantCode(m.name);
    const displayName = entry?.displayName || (m.name && variantCode ? ensureLongNameHasCode(m.name, variantCode) : String(m.name));

    const unit = {
      id: m.id ?? null,
      name: displayName,                 // chassis + variant
      bv: numOrNull(m.bv),
      tonnage: numOrNull(m.tonnage),
      source: String(m.source),

      pilotName: nextCallsign() || 'Ghost',
      gunnery: 4,
      piloting: 5,
      team: 'Alpha',
      variantCode: variantCode || undefined
    };

    _state.units.push(unit);
    saveState();
    renderList();
    updateTotals();
    toast('Added to Lance');
  }

  function onRowEdit(e){
    const row = e.target.closest('.lance-row'); if(!row) return;
    const idx = Number(row.getAttribute('data-idx')); if(!Number.isFinite(idx)) return;
    const u = _state.units[idx]; if(!u) return;
    const field = e.target.getAttribute('data-field'); if(!field) return;

    if (field === 'pilotName') u.pilotName = e.target.value.trim().slice(0,32) || '—';
    else if (field === 'gunnery') u.gunnery = clampInt(e.target.value, 0, 9, 4);
    else if (field === 'piloting')  u.piloting  = clampInt(e.target.value, 0, 9, 5);
    else if (field === 'team')     u.team     = (['Alpha','Bravo','Clan','Merc'].includes(e.target.value)? e.target.value : 'Alpha');

    saveState();
  }

  function onRowAction(e){
    const btn = e.target.closest('button[data-act]'); if(!btn) return;
    const row = e.target.closest('.lance-row'); if(!row) return;
    const idx = Number(row.getAttribute('data-idx')); if(!Number.isFinite(idx)) return;
    const act = btn.getAttribute('data-act');
    const u = _state.units[idx]; if(!u) return;

    if (act === 'view') {
      if (!host || !host.openMechById) return warn('Host API missing: openMechById');
      try{ host.onMenuDeselect?.(); host.openMechById(u.source); }
      catch{ warn('Open failed'); }
    }
    else if (act === 'remove') {
      _state.units.splice(idx,1);
      saveState(); renderList(); updateTotals();
    }
  }

// === IMPORT (file picker + dispatch) ===
function onImport(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async ()=>{
    const file = input.files?.[0]; if(!file) return;
    try{
      const text = await file.text();
      const data = JSON.parse(text);
      const next = validateImport(data);           // ← handles TRS80, Skirmish, and saved objects
      _state = next;
      saveState(); renderDock(); renderList(); updateTotals();
      toast('Lance imported');
    }catch(err){
      console.warn('[Lance] import error', err);
      warn('Import failed (bad JSON)');
    }
  };
  input.click();
}


// === NORMALIZER (accepts TRS80 array, Skirmish array, or saved object) ===
function validateImport(x){
  // helpers local to import
  const numOrNull = (v)=>{ const n = Number(v); return Number.isFinite(n) ? n : null; };
  const clampInt  = (v, min, max, dflt)=>{ const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt; };

  function parsePilot(str){
    const s = String(str||'').trim();
    // Formats like "Echo - G4/P5" or "Echo G4/P5"
    const m = s.match(/^(.+?)\s*(?:-\s*)?G(\d+)\s*\/\s*P(\d+)$/i);
    if (m) return { name:m[1].trim(), g:Number(m[2]), p:Number(m[3]) };
    // Fallbacks: try simple split "Name - something"
    const n = s.split(' - ')[0] || s;
    return { name:n.trim() || '—', g:4, p:5 };
  }
  function tokenToUnit(tok){
    // TRS80 & Skirmish tokens look the same for our needs
    const meta = tok?.meta || {};
    const src  = String(meta.source || '').trim();
    const long = String(meta.name   || tok?.label || '').trim();
    const team = String(meta.team   || 'Alpha');
    const { name: pilotName, g, p } = parsePilot(meta.pilot);

    // Try to pull display + variant from manifest; else sniff from label/name
    const ent = getManifestEntryBySource(src);
    const code = (tok?.label || ent?.model || sniffVariantCode(long) || '').toUpperCase();
    const display = ent?.displayName ? ensureLongNameHasCode(ent.displayName, code)
                                     : ensureLongNameHasCode(long || 'MECH', code);

    return {
      id: null,
      name: display,
      bv: numOrNull(meta.bv),
      tonnage: numOrNull(meta.tonnage),
      source: src,
      pilotName: pilotName || nextCallsign(),
      gunnery: clampInt(g, 0, 9, 4),
      piloting: clampInt(p, 0, 9, 5),
      team: (['Alpha','Bravo','Clan','Merc'].includes(team) ? team : 'Alpha'),
      variantCode: code || undefined
    };
  }

  // 1) If it’s an ARRAY → treat as TRS80/Skirmish token list
  if (Array.isArray(x)){
    const units = x
      .filter(t => t && t.meta && t.meta.source)
      .map(tokenToUnit);
    return { v:1, schema:SCHEMA, name: _state?.name || 'Imported Lance', units };
  }

  // 2) If it’s an OBJECT with .units (our saved format) → sanitize
  if (x && typeof x === 'object'){
    const name  = typeof x.name === 'string' && x.name.trim() ? x.name.trim() : 'Imported Lance';
    const arr   = Array.isArray(x.units) ? x.units : [];
    const clean = [];

    for (const u of arr){
      const srcS  = String(u?.source || '').trim();
      const nameS = String(u?.name   || '').trim();
      if (!srcS) continue;

      const ent  = getManifestEntryBySource(srcS);
      const code = (typeof u?.variantCode === 'string' && u.variantCode)
                || ent?.model
                || sniffVariantCode(nameS)
                || '';

      clean.push({
        id: u?.id ?? null,
        name: ent?.displayName || ensureLongNameHasCode(nameS || 'MECH', code),
        bv: numOrNull(u?.bv),
        tonnage: numOrNull(u?.tonnage),
        source: srcS,
        pilotName: String(u?.pilotName ?? u?.pilot ?? '').trim() || nextCallsign(),
        gunnery: clampInt(u?.gunnery ?? 4, 0, 9, 4),
        piloting: clampInt(u?.piloting ?? 5, 0, 9, 5),
        team: (['Alpha','Bravo','Clan','Merc'].includes(u?.team) ? u.team : 'Alpha'),
        variantCode: code || undefined
      });
    }

    return { v:1, schema:SCHEMA, name, units: clean };
  }

  throw new Error('Unrecognized import format');
}



  // === Export to Skirmish format (array of tokens) ===
  function onExportSkirmish(){
    try{
      const items = _state.units.map((u, i)=>{
        const entry = getManifestEntryBySource(u.source);
        const code = (u.variantCode || entry?.model || sniffVariantCode(u.name) || deriveLabelFromName(u.name)).toUpperCase();
        const longName = entry?.displayName ? ensureLongNameHasCode(entry.displayName, code)
                                            : ensureLongNameHasCode(u.name, code);
        const team = u.team || 'Alpha';
        const colorIndex = TEAM_COLOR[team] ?? 1;

        // Simple left-to-right row placement; Skirmish will clamp if needed
        const q = i, r = 0;

        return {
          id: null,
          q, r,
          scale: 1,
          angle: 0,
          colorIndex,
          label: code,               // e.g., "ARC-2K"
          meta: {
            name: longName,          // e.g., "Archer ARC-2K"
            pilot: formatPilot(u.pilotName, u.gunnery, u.piloting),
            team,
            bv: u.bv ?? null,
            tonnage: u.tonnage ?? null,
            source: u.source || ''
          }
        };
      });

      const json = JSON.stringify(items, null, 2);
      const blob = new Blob([json], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const safe = (_state.name || 'lance').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'') || 'lance';
      a.download = `${safe}.json`;  // filename = Lance name
      a.click(); URL.revokeObjectURL(a.href);
      toast(`Exported ${safe}.json`);
    }catch(err){ warn('Export failed'); }
  }

  function onClear(){
    if (!confirm('Clear the current lance?')) return;
    _state.units = []; saveState(); renderList(); updateTotals();
  }

  // ---------- State (persist) ----------
  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { v:1, schema:SCHEMA, name:'Unnamed Lance', units:[] };
      const data = JSON.parse(raw);
      return validateImport(data);
    }catch(err){
      console.warn('[Lance] corrupt save, resetting', err);
      return { v:1, schema:SCHEMA, name:'Unnamed Lance', units:[] };
    }
  }
  function saveState(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); }
    catch{ warn('Saving failed (storage)'); }
  }
  function loadUi(){
    try{ return JSON.parse(localStorage.getItem(UI_STATE_KEY)||'{}') || {}; }
    catch{ return {}; }
  }
  function saveUi(obj){
    try{
      const cur = loadUi();
      localStorage.setItem(UI_STATE_KEY, JSON.stringify({ ...cur, ...obj }));
    }catch{}
  }

  // ---------- Validation / migration ----------
  function validateImport(x){
    if (!x || typeof x !== 'object') throw new Error('bad json');
    const name = typeof x.name === 'string' && x.name.trim() ? x.name.trim() : 'Unnamed Lance';
    const units = Array.isArray(x.units) ? x.units : [];
    const clean = [];

    for (const u of units){
      const nameS = String(u?.name || '').trim();
      const srcS  = String(u?.source || '').trim();
      if (!nameS || !srcS) continue;

      const ent = getManifestEntryBySource(srcS);

      clean.push({
        id: u?.id ?? null,
        name: ent?.displayName || nameS,
        bv: numOrNull(u?.bv),
        tonnage: numOrNull(u?.tonnage),
        source: srcS,

        pilotName: String(u?.pilotName ?? u?.pilot ?? '').trim() || nextCallsign(),
        gunnery: clampInt(u?.gunnery ?? 4, 0, 9, 4),
        piloting:  clampInt(u?.piloting  ?? 5, 0, 9, 4),
        team: (['Alpha','Bravo','Clan','Merc'].includes(u?.team) ? u.team : 'Alpha'),
        variantCode: (typeof u?.variantCode === 'string' && u.variantCode) || ent?.model || sniffVariantCode(nameS) || undefined
      });
    }

    return { v:1, schema:SCHEMA, name, units:clean };
  }

  // ---------- Manifest resolver ----------
  // Robust resolver: host hook > App.getManifest() > MANIFEST_INDEX
  // Matches by:
  //   - exact path (manifest.path)
  //   - absolute URL (manifest.url)
  //   - filename (last segment)
  function getManifestEntryBySource(src){
    if (!src) return null;

    // 1) Host-provided function
    if (typeof host.getManifestBySource === 'function') {
      try {
        const r = host.getManifestBySource(src);
        if (r) return r;
      } catch {}
    }

    // 2) Use App.getManifest() if available
    const app = (window.App || null);
    if (app && typeof app.getManifest === 'function') {
      try {
        const list = app.getManifest() || [];
        if (Array.isArray(list) && list.length) {
          const idx = _lazyIndexFromManifest(list);
          const hit = idxLookup(idx, src);
          if (hit) return hit;
        }
      } catch {}
    }

    // 3) Fallback global index (simple object map)
    const globalIdx = (window.MANIFEST_INDEX || window.MechManifestIndex || null);
    if (globalIdx && typeof globalIdx === 'object') {
      // direct
      if (globalIdx[src]) return globalIdx[src];
      // filename
      const fname = lastSegment(src);
      if (globalIdx[fname]) return globalIdx[fname];
      // path normalization: try stripping base URLs
      for (const [k,v] of Object.entries(globalIdx)) {
        if (lastSegment(k) === fname) return v;
      }
    }

    return null;
  }

  // Build a flexible index from App.getManifest() once per page
  let _manifestFlexIndex = null;
  function _lazyIndexFromManifest(list){
    if (_manifestFlexIndex) return _manifestFlexIndex;

    const mapBy = new Map(); // keys → entry
    for (const e of list){
      const entry = {
        displayName: e.displayName || e.name || null,
        name:       e.name || null,
        model:      e.variant || e.model || null,
        path:       e.path || e.url || e.file || null,
        url:        e.url || null
      };
      const path = String(entry.path || '').replace(/\\/g,'/').trim();
      const url  = String(entry.url  || '').trim();
      const file = lastSegment(path || url);

      const keys = new Set([path, url, file].filter(Boolean));
      // Also index by "name + model" for good measure
      const nm = [entry.name, entry.model].filter(Boolean).join(' ');
      if (nm) keys.add(nm);
      for (const k of keys) if (k && !mapBy.has(k)) mapBy.set(k, entry);
    }
    _manifestFlexIndex = mapBy;
    return mapBy;
  }
  function idxLookup(idx, src){
    if (!idx) return null;
    const s = String(src||'').replace(/\\/g,'/').trim();
    const file = lastSegment(s);
    return idx.get(s) || idx.get(file) || null;
  }
  function lastSegment(p){
    const s = String(p||'').split(/[\\/]/); return s[s.length-1] || '';
  }

  // ---------- Utilities ----------
  function numOrNull(v){ const n = Number(v); return Number.isFinite(n) ? n : null; }
  function clampInt(v, min, max, dflt){
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return dflt;
    return Math.min(max, Math.max(min, n));
  }
  function esc(s){ return String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
  function fmt(v, dash='—'){ return (v==null || v==='') ? dash : String(v); }
  function toast(msg){
    const t = document.getElementById('toast');
    if (t) {
      t.textContent = msg; t.hidden = false; t.style.display='block';
      clearTimeout(toast._t); toast._t = setTimeout(()=>{ t.hidden = true; t.style.display='none'; }, 1400);
      return;
    }
    if (_warn) { _warn.hidden=false; _warn.textContent=msg; setTimeout(()=>{ if(_warn) _warn.hidden=true; }, 1000); }
  }
  function warn(msg){ if (_warn){ _warn.hidden = false; _warn.textContent = msg; setTimeout(()=>{ _warn.hidden=true; }, 1800); } }

  // Variant helpers
  function sniffVariantCode(name){
    const s = String(name||'').toUpperCase();
    const m1 = s.match(/\b[A-Z0-9]{2,6}(?:-[A-Z0-9]+)+\b/); // MAD-6D, ARC-2K, DWF-PRIME
    if (m1) return m1[0];
    const tokens = s.trim().split(/\s+/);
    const last = tokens[tokens.length-1] || '';
    if (/^[A-Z0-9]{2,12}$/.test(last)) return last;
    return '';
  }
  function ensureLongNameHasCode(displayName, code){
    const nm = String(displayName||'MECH');
    const c  = String(code||'').trim();
    if (!c) return nm;
    if (nm.toUpperCase().includes(c.toUpperCase())) return nm;
    return `${nm} ${c}`;
  }
  function deriveLabelFromName(name){
    const compact = String(name||'MECH').toUpperCase().replace(/[^A-Z0-9]+/g,'');
    return compact ? compact.slice(0,12) : 'MECH';
  }
  function formatPilot(name, g, p){
    const nm = (String(name||'—').trim() || '—').slice(0,32);
    const ps = Number.isFinite(+p) ? +p : 5;
    const gs = Number.isFinite(+g) ? +g : 4;
    return `${nm} - G${gs}/P${ps}`;
  }
  function splitDisplay(display, src, variantCode){
    const ent  = getManifestEntryBySource(src);
    const disp = String(ent?.displayName || display || '—');
    const code = String(variantCode || ent?.model || sniffVariantCode(disp) || '').trim();
    let chassis = disp;

    if (code){
      const upDisp = disp.toUpperCase();
      const upCode = code.toUpperCase();
      const idx = upDisp.lastIndexOf(upCode);
      if (idx > 0 && idx + upCode.length === upDisp.length){
        chassis = disp.slice(0, idx).trim();
        if (chassis.endsWith('-')) chassis = chassis.slice(0, -1).trim();
      }
    }
    return { chassis: chassis || disp, code, full: ensureLongNameHasCode(disp, code) };
  }

  // ---------- Host wrapper ----------
  function mkHost(api){
    const h = {
      getCurrentMech: typeof api.getCurrentMech === 'function' ? api.getCurrentMech : ()=>null,
      openMechById:   typeof api.openMechById   === 'function' ? api.openMechById   : ()=>{},
      onMenuDeselect: typeof api.onMenuDeselect === 'function' ? api.onMenuDeselect : ()=>{},
      getManifestBySource: typeof api.getManifestBySource === 'function' ? api.getManifestBySource : null
    };
    return h;
  }

  // ---------- Scoped CSS ----------
  function injectCssOnce(){
    if (document.getElementById('lance-css')) return;
    const st = document.createElement('style'); st.id = 'lance-css';
    st.textContent = `
      #lance-dock.hidden{ display:none; }
      #lance-dock .lance.panel{ margin:12px; border-radius:var(--radius,8px); }
      #lance-dock .lance-h{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
      #lance-dock .lance-title{ display:flex; align-items:center; gap:8px; min-width:0; }
      #lance-dock .lance-name{ width:min(260px, 50vw); padding:4px 8px; border-radius:6px; border:1px solid var(--border,#2a2f3a); background:#0e1522; color:var(--ink,#e8eef6); }
      #lance-dock .lance-actions{ display:flex; gap:6px; flex-wrap:wrap; }
      #lance-dock .lance-warn{ font-size:12px; color:var(--bt-amber,#ffd06e); }
      #lance-dock .lance-totals{ display:flex; gap:14px; margin:6px 0 10px; }
      #lance-dock .lance-list{ display:flex; flex-direction:column; gap:8px; }

      #lance-dock .lance-row{
        display:grid;
        grid-template-columns: 1fr 56px 80px auto auto auto auto auto;
        gap:8px; align-items:center; padding:8px;
        border:1px solid var(--border,#1f2a3a);
        border-radius:8px;
        background:linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.02));
      }
      #lance-dock .l-col.name{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      #lance-dock .l-col.actions{ justify-self:end; display:flex; gap:8px; }
      #lance-dock .mini{ width:140px; padding:4px 6px; border-radius:6px; border:1px solid var(--border,#2a2f3a); background:#0e1522; color:var(--ink,#e8eef6); }
      #lance-dock .mini.num{ width:70px; text-align:center; }
      #lance-dock .mini.sel{ width:110px; }
      #lance-dock .small{ font-size:12px; }
      #lance-dock .dim{ color:#a9b4c2; }
      #lance-dock .linklike{ background:transparent; border:0; color:var(--accent,#ffd06e); cursor:pointer; text-decoration:underline; padding:0; font-size:12.5px; }

      /* Name styling (chassis + superscript variant) */
      #lance-dock .l-col.name .chassis{ font-weight:600; letter-spacing:.2px; }
      #lance-dock .variant-sup{ font-size:.8em; vertical-align: super; opacity:.85; margin-left:6px; }

      /* Tablet: compress a bit */
      @media (max-width: 980px){
        #lance-dock .lance-row{ grid-template-columns: 1fr 56px 80px auto auto auto auto; }
      }

      /* Phones: stack to multi-row card */
      @media (max-width: 800px){
        #lance-dock .lance-row{
          grid-template-columns: 1fr;
          grid-auto-rows: auto;
          row-gap: 6px;
        }
        #lance-dock .l-col.name{ order:0; }
        #lance-dock .l-col.ton, #lance-dock .l-col.bv{ order:1; display:block; }
        #lance-dock .l-col.edit{ order:2; }
        #lance-dock .l-col.actions{ order:3; justify-self:start; }
        #lance-dock .mini{ width:100%; max-width: 220px; }
        #lance-dock .mini.num{ max-width: 100px; }
        #lance-dock .mini.sel{ max-width: 140px; }
      }
    `;
    document.head.appendChild(st);
  }
})();
