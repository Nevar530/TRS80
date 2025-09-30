/* ===== TRS:80 Lance Module (manifest-aware; pilots, skills, mobile, Skirmish export) =====
 * Public surface: Lance.init(api), Lance.setVisible(on), Lance.getState()
 * Host API (recommended):
 *   api.getCurrentMech(): { id?:string|null, name?:string|null, bv?:number|null, tonnage?:number|null, source?:string|null } | null
 *   api.openMechById(idOrSource: string): void
 *   api.onMenuDeselect(): void
 *   api.getManifestBySource?(sourcePath: string): ManifestEntry | null   // optional, preferred
 *
 * Global fallback (optional):
 *   window.MANIFEST_INDEX[pathOrFilename] = { displayName, name, model, path, ... }
 */
(function(){
  'use strict';

  const STORAGE_KEY = 'trs80:lance';
  const UI_STATE_KEY = 'trs80:lance:ui';
  const SCHEMA = 'trs80-lance@2';

  // Team → colorIndex mapping (for Skirmish token colors)
  const TEAM_COLOR = { Alpha:1, Bravo:0, Clan:4, Merc:3 };

  // Call signs
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

  // ---------- Types ----------
  /**
   * @typedef {{
   *   id: string|null,
   *   name: string,           // display name (chassis + variant)
   *   bv: number|null,
   *   tonnage: number|null,
   *   source: string,         // manifest path or id used by host
   *   pilotName: string,
   *   piloting: number,
   *   gunnery: number,
   *   team: "Alpha"|"Bravo"|"Clan"|"Merc",
   *   variantCode?: string    // short code like "MAD-6D", "VND-1R"
   * }} LanceUnit
   * @typedef {{ v:number, schema:string, name:string, units:LanceUnit[] }} LanceState
   * @typedef {{
   *   getCurrentMech: ()=>({id?:string|null,name?:string|null,bv?:number|null,tonnage?:number|null,source?:string|null})|null,
   *   openMechById: (idOrSource:string)=>void,
   *   onMenuDeselect: ()=>void,
   *   getManifestBySource?: (src:string)=>any|null
   * }} HostApi
   */

  /** @type {HostApi|null} */
  let host = null;

  /** @type {LanceState} */
  let _state = { v:1, schema:SCHEMA, name:'Unnamed Lance', units:[] };
  let _visible = false;

  // UI refs
  let _dock, _btn, _list, _totBV, _totTons, _totCount, _nameInp, _warn;

  const Lance = { init, setVisible, getState };
  window.Lance = Lance;

  // ---------- Init ----------
  function init(api){
    host = api || null;
    _btn  = document.getElementById('btn-lance');
    _dock = document.getElementById('lance-dock');
    if (!_dock){ console.warn('[Lance] #lance-dock not found'); return; }

    injectCssOnce();
    _state = loadState();
    _visible = loadUi().visible ?? false;

    // Defensive: seed pilots/skills and backfill variantCode from manifest/name if missing
    for (const u of _state.units){
      if (!u.pilotName) u.pilotName = nextCallsign();
      if (!Number.isFinite(u.piloting)) u.piloting = 4;
      if (!Number.isFinite(u.gunnery))  u.gunnery  = 4;
      if (!u.variantCode) {
        const ent = getManifestEntryBySource(u.source);
        u.variantCode = ent?.model || sniffVariantCode(u.name) || undefined;
      }
      // Ensure display name is chassis+variant when possible
      const ent = getManifestEntryBySource(u.source);
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

    const rows = _state.units.map((u, i)=>`
      <div class="lance-row" data-idx="${i}" role="listitem">
        <div class="l-col name mono" title="${esc(u.name)}">${esc(u.name)}</div>
        <div class="l-col ton mono small" title="Tonnage">${fmt(u.tonnage,'—')}</div>
        <div class="l-col bv mono small" title="BV">${fmt(u.bv,'—')}</div>

        <div class="l-col edit">
          <label class="small dim">Pilot</label>
          <input class="mini" data-field="pilotName" value="${esc(u.pilotName||'')}" maxlength="32" />
        </div>

        <div class="l-col edit">
          <label class="small dim">Piloting</label>
          <input class="mini num" data-field="piloting" type="number" min="0" max="9" step="1" value="${esc(u.piloting??4)}" />
        </div>

        <div class="l-col edit">
          <label class="small dim">Gunnery</label>
          <input class="mini num" data-field="gunnery" type="number" min="0" max="9" step="1" value="${esc(u.gunnery??4)}" />
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
      </div>
    `).join('');

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

    // Prefer manifest entry for accurate model/displayName
    const entry = getManifestEntryBySource(String(m.source));
    const variantCode = entry?.model || sniffVariantCode(m.name);
    const displayName = entry?.displayName || String(m.name);

    const unit = {
      id: m.id ?? null,
      name: displayName,                 // chassis + variant
      bv: numOrNull(m.bv),
      tonnage: numOrNull(m.tonnage),
      source: String(m.source),

      pilotName: nextCallsign() || 'Ghost',
      piloting: 4,
      gunnery: 4,
      team: 'Alpha',
      variantCode: variantCode || undefined
    };

    _state.units.push(unit);
    saveState();
    renderList();
    updateTotals();
    toast('Added to Lance (pilot seeded)');
  }

  function onRowEdit(e){
    const row = e.target.closest('.lance-row'); if(!row) return;
    const idx = Number(row.getAttribute('data-idx')); if(!Number.isFinite(idx)) return;
    const u = _state.units[idx]; if(!u) return;
    const field = e.target.getAttribute('data-field'); if(!field) return;

    if (field === 'pilotName') u.pilotName = e.target.value.trim().slice(0,32) || '—';
    else if (field === 'piloting') u.piloting = clampInt(e.target.value, 0, 9, 4);
    else if (field === 'gunnery')  u.gunnery  = clampInt(e.target.value, 0, 9, 4);
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

  function onImport(){
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.onchange = async ()=>{
      const file = input.files?.[0]; if(!file) return;
      try{
        const text = await file.text();
        const data = JSON.parse(text);
        const next = validateImport(data);
        _state = next; saveState(); renderDock(); renderList(); updateTotals();
        toast('Lance imported');
      }catch(err){ warn('Import failed'); console.warn('[Lance] import error', err); }
    };
    input.click();
  }

  // === Export to Skirmish format (array of tokens) ===
  function onExportSkirmish(){
    try{
      const items = _state.units.map((u, i)=>{
        const entry = getManifestEntryBySource(u.source);
        const code = u.variantCode || entry?.model || deriveLabelFromName(u.name);
        const longName = entry?.displayName ? ensureLongNameHasCode(entry.displayName, code)
                                            : ensureLongNameHasCode(u.name, code);
        const team = u.team || 'Alpha';
        const colorIndex = TEAM_COLOR[team] ?? 1;

        // Simple left-to-right row placement; Skirmish clamps if needed
        const q = i, r = 0;

        return {
          id: null,
          q, r,
          scale: 1,
          angle: 0,
          colorIndex,
          label: code,               // variant ID for token label (e.g., "MAD-6D")
          meta: {
            name: longName,          // chassis + variant (e.g., "Marauder II MAD-6D")
            pilot: formatPilot(u.pilotName, u.piloting, u.gunnery),
            team
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

  // ---------- Persistence ----------
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
        piloting: clampInt(u?.piloting ?? 4, 0, 9, 4),
        gunnery:  clampInt(u?.gunnery  ?? 4, 0, 9, 4),
        team: (['Alpha','Bravo','Clan','Merc'].includes(u?.team) ? u.team : 'Alpha'),
        variantCode: (typeof u?.variantCode === 'string' && u.variantCode) || ent?.model || sniffVariantCode(nameS) || undefined
      });
    }

    return { v:1, schema:SCHEMA, name, units:clean };
  }

  // ---------- Manifest resolver ----------
  function getManifestEntryBySource(src){
    if (!src) return null;

    // Host-provided hook
    if (host && typeof host.getManifestBySource === 'function') {
      try {
        const r = host.getManifestBySource(src);
        if (r) return r;
      } catch {}
    }

    // Global index fallback
    const idx = (window.MANIFEST_INDEX || window.MechManifestIndex || null);
    if (!idx) return null;

    // Try exact path, then filename
    const byPath = idx[src];
    if (byPath) return byPath;
    const fname = String(src).split('/').pop();
    return idx[fname] || null;
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

  // Variant helpers (kept as last-resort fallback)
  function sniffVariantCode(name){
    const s = String(name||'').toUpperCase();
    const m1 = s.match(/\b[A-Z0-9]{2,6}(?:-[A-Z0-9]+)+\b/); // MAD-6D, DWF-PRIME, TIM-PRIME
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
  function formatPilot(name, p, g){
    const nm = (String(name||'—').trim() || '—').slice(0,32);
    const ps = Number.isFinite(+p) ? +p : 4;
    const gs = Number.isFinite(+g) ? +g : 4;
    return `${nm} - P${ps}/G${gs}`;
  }

  // ---------- Scoped CSS (includes mobile stacking) ----------
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