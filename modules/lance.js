/* ===== TRS:80 Lance Module (drop-in) =====
 * Self-contained roster/lance panel with localStorage.
 *
 * Contract expected from host app (set in script.js):
 *   App.getCurrentMechSummary(): { id,name,bv,tonnage,source } | null
 *   App.openMech(idOrSource: string): void
 *   App.clearMenuSelection(): void
 *
 * Minimal HTML expected:
 *   <button id="btn-lance" class="btn ghost" title="Show Lance" aria-controls="lance-dock">Lance</button>
 *   <div id="lance-dock" class="hidden"></div>
 */
(function(){
  'use strict';

  const STORAGE_KEY = 'trs80:lance';
  const UI_STATE_KEY = 'trs80:lance:ui';
  const SCHEMA = 'trs80-lance@1';

  // Public surface
  const Lance = {
    init,
    setVisible,
    getState,
  };
  window.Lance = Lance;

  // ---------- Internal state ----------
  let _state = /** @type {LanceState} */ ({ v:1, schema:SCHEMA, name:'Unnamed Lance', units:[] });
  let _visible = false;
  let _dock, _btn, _list, _totBV, _totTons, _totCount, _nameInp, _warn;

  // ---------- Types (JSDoc) ----------
  /**
   * @typedef {{id?:string|null,name:string,bv?:number|null,tonnage?:number|null,source:string}} LanceUnit
   * @typedef {{v:number,schema:string,name:string,units:LanceUnit[]}} LanceState
   * @typedef {{
   *   getCurrentMech: ()=>({id?:string|null,name?:string|null,bv?:number|null,tonnage?:number|null,source?:string|null})|null,
   *   openMechById: (idOrSource:string)=>void,
   *   onMenuDeselect: ()=>void,
   * }} HostApi
   */

  /** @type {HostApi|null} */
  let host = null;

  // ---------- Init ----------
  function init(api /** @type {HostApi} */){
    host = api || null;
    _btn = document.getElementById('btn-lance');
    _dock = document.getElementById('lance-dock');

    if (!_dock) {
      console.warn('[Lance] #lance-dock not found');
      return;
    }

    // Inject minimal scoped CSS (inside shadow-ish class namespace)
    injectCssOnce();

    // Load state & UI prefs
    _state = loadState();
    _visible = loadUi().visible ?? false;

    // Render UI scaffold
    renderDock();
    renderList();
    updateTotals();

    // Wire toggle button
    if (_btn) {
      _btn.addEventListener('click', () => setVisible(!_visible));
      _btn.setAttribute('aria-expanded', String(_visible));
    }

    // First visibility
    setVisible(_visible);

    // Keyboard: Alt+L toggle
    window.addEventListener('keydown', (e) => {
      if ((e.altKey || e.metaKey) && (e.key.toLowerCase() === 'l')) {
        e.preventDefault(); setVisible(!_visible);
      }
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
            <button id="lance-export" class="btn ghost sm" title="Export lance JSON">Export</button>
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

    _list = document.getElementById('lance-list');
    _totBV = document.getElementById('lance-tot-bv');
    _totTons = document.getElementById('lance-tot-tons');
    _totCount = document.getElementById('lance-tot-count');
    _nameInp = document.getElementById('lance-name');
    _warn = document.getElementById('lance-warn');

    // Wire header actions
    document.getElementById('lance-add')   ?.addEventListener('click', onAddCurrent);
    document.getElementById('lance-import')?.addEventListener('click', onImport);
    document.getElementById('lance-export')?.addEventListener('click', onExport);
    document.getElementById('lance-clear') ?.addEventListener('click', onClear);
    document.getElementById('lance-hide')  ?.addEventListener('click', () => setVisible(false));

    // Name edit
    _nameInp?.addEventListener('change', () => { _state.name = _nameInp.value.trim() || 'Unnamed Lance'; saveState(); });
    _nameInp?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') e.currentTarget.blur(); });
  }

  function renderList(){
    if (!_list) return;
    if (!_state.units.length) {
      _list.innerHTML = `<div class="dim small" style="padding:6px;">No units yet. Use <strong>Add Current</strong>.</div>`;
      return;
    }

    const rows = _state.units.map((u, i) => `
      <div class="lance-row" data-idx="${i}" role="listitem">
        <div class="l-col name mono" title="${esc(u.name)}">${esc(u.name)}</div>
        <div class="l-col ton mono small" title="Tonnage">${fmt(u.tonnage,'—')}</div>
        <div class="l-col bv mono small" title="BV">${fmt(u.bv,'—')}</div>
        <div class="l-col actions">
          <button class="linklike" data-act="view" title="Open in viewer">View</button>
          <span class="dim">•</span>
          <button class="linklike" data-act="remove" title="Remove from lance">Remove</button>
        </div>
      </div>`).join('');

    _list.innerHTML = rows;

    // event delegation for row actions
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

    const unit = {
      id: m.id ?? null,
      name: String(m.name),
      bv: numOrNull(m.bv),
      tonnage: numOrNull(m.tonnage),
      source: String(m.source)
    };
    _state.units.push(unit);
    saveState();
    renderList();
    updateTotals();
    toast('Added to Lance');
  }

  function onImport(){
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
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

  function onExport(){
    try{
      const blob = new Blob([JSON.stringify(_state, null, 2)], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const safe = (_state.name || 'lance').toLowerCase().replace(/[^a-z0-9._-]+/g,'-');
      a.download = `lance_${safe || 'roster'}.json`;
      a.click(); URL.revokeObjectURL(a.href);
      toast('Lance exported');
    }catch(err){ warn('Export failed'); }
  }

  function onClear(){
    if (!confirm('Clear the current lance?')) return;
    _state.units = []; saveState(); renderList(); updateTotals();
  }

  function onRowAction(e){
    const btn = e.target.closest('button[data-act]'); if(!btn) return;
    const row = e.target.closest('.lance-row'); if(!row) return;
    const idx = Number(row.getAttribute('data-idx')); if(!Number.isFinite(idx)) return;
    const act = btn.getAttribute('data-act');

    const u = _state.units[idx]; if(!u) return;

    if (act === 'view') {
      if (!host || !host.openMechById) return warn('Host API missing: openMechById');
      try{
        host.onMenuDeselect?.();
        host.openMechById(u.source);
      }catch(err){ warn('Open failed'); }
    }
    else if (act === 'remove') {
      _state.units.splice(idx,1);
      saveState(); renderList(); updateTotals();
    }
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
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    }catch(err){ warn('Saving failed (storage)'); }
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

  function validateImport(x){
    if (!x || typeof x !== 'object') throw new Error('bad json');
    const schema = x.schema || SCHEMA;
    if (schema !== SCHEMA) console.warn('[Lance] schema mismatch, attempting soft parse:', schema);
    const name = typeof x.name === 'string' && x.name.trim() ? x.name.trim() : 'Unnamed Lance';
    const units = Array.isArray(x.units) ? x.units : [];
    const clean = [];
    for (const u of units) {
      const nameS = String(u?.name || '').trim();
      const srcS  = String(u?.source || '').trim();
      if (!nameS || !srcS) continue; // require minimal fields
      clean.push({
        id: u?.id ?? null,
        name: nameS,
        bv: numOrNull(u?.bv),
        tonnage: numOrNull(u?.tonnage),
        source: srcS
      });
    }
    /** @type {LanceState} */
    const out = { v:1, schema:SCHEMA, name, units:clean };
    return out;
  }

  // ---------- Utilities ----------
  function numOrNull(v){ const n = Number(v); return Number.isFinite(n) ? n : null; }
  function esc(s){ return String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
  function fmt(v, dash='—'){ return (v==null || v==='') ? dash : String(v); }

  function toast(msg){
    // reuse host toast if present, else simple inline flash
    const t = document.getElementById('toast');
    if (t) {
      t.textContent = msg; t.hidden = false; t.style.display='block';
      clearTimeout(toast._t); toast._t = setTimeout(()=>{ t.hidden = true; t.style.display='none'; }, 1400);
      return;
    }
    // fallback: header blip
    if (_warn) { _warn.hidden=false; _warn.textContent=msg; setTimeout(()=>{ if(_warn) _warn.hidden=true; }, 1000); }
  }

  function warn(msg){ if (_warn){ _warn.hidden = false; _warn.textContent = msg; setTimeout(()=>{ _warn.hidden=true; }, 1800); } }

  function injectCssOnce(){
    if (document.getElementById('lance-css')) return;
    const st = document.createElement('style'); st.id = 'lance-css';
    st.textContent = `
      /* Scoped Lance styles */
      #lance-dock.hidden{ display:none; }
      #lance-dock .lance.panel{ margin:12px; border-radius:var(--radius,8px); }
      #lance-dock .lance-h{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
      #lance-dock .lance-title{ display:flex; align-items:center; gap:8px; min-width:0; }
      #lance-dock .lance-name{ width:min(260px, 50vw); padding:4px 8px; border-radius:6px; border:1px solid var(--border,#2a2f3a); background:#0e1522; color:var(--ink,#e8eef6); }
      #lance-dock .lance-actions{ display:flex; gap:6px; flex-wrap:wrap; }
      #lance-dock .lance-warn{ font-size:12px; color:var(--bt-amber,#ffd06e); }
      #lance-dock .lance-totals{ display:flex; gap:14px; margin:6px 0 10px; }
      #lance-dock .lance-list{ display:flex; flex-direction:column; gap:4px; }
      #lance-dock .lance-row{ display:grid; grid-template-columns: 1fr 70px 90px auto; gap:8px; align-items:center; padding:6px 8px; border:1px solid var(--border,#1f2a3a); border-radius:8px; background:linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.02)); }
      #lance-dock .l-col.name{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      #lance-dock .l-col.actions{ justify-self:end; display:flex; gap:8px; }
      #lance-dock .linklike{ background:transparent; border:0; color:var(--accent,#ffd06e); cursor:pointer; text-decoration:underline; padding:0; font-size:12.5px; }
      @media (max-width:800px){
        #lance-dock .lance-row{ grid-template-columns: 1fr auto; }
        #lance-dock .l-col.ton, #lance-dock .l-col.bv{ display:none; }
      }
    `;
    document.head.appendChild(st);
  }
})();
