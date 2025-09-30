/* ===== TRS:80 Lance Module (manifest-aware; pilots, skills, mobile, Skirmish export) =====
 * Public surface: Lance.init(api), Lance.setVisible(on), Lance.getState()
 */
(function(){
  'use strict';

  const STORAGE_KEY = 'trs80:lance';
  const UI_STATE_KEY = 'trs80:lance:ui';
  const SCHEMA = 'trs80-lance@2';

  const TEAM_COLOR = { Alpha:1, Bravo:0, Clan:4, Merc:3 };

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

  let host = null;
  let _state = { v:1, schema:SCHEMA, name:'Unnamed Lance', units:[] };
  let _visible = false;

  let _dock, _btn, _list, _totBV, _totTons, _totCount, _nameInp, _warn;

  const Lance = { init, setVisible, getState };
  window.Lance = Lance;

  function init(api){
    host = api || null;
    _btn  = document.getElementById('btn-lance');
    _dock = document.getElementById('lance-dock');
    if (!_dock){ console.warn('[Lance] #lance-dock not found'); return; }

    injectCssOnce();
    _state = loadState();
    _visible = loadUi().visible ?? false;

    for (const u of _state.units){
      if (!u.pilotName) u.pilotName = nextCallsign();
      if (!Number.isFinite(u.piloting)) u.piloting = 4;
      if (!Number.isFinite(u.gunnery))  u.gunnery  = 4;
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
            <button id="lance-add" class="btn sm">Add Current</button>
            <button id="lance-import" class="btn ghost sm">Import</button>
            <button id="lance-export" class="btn ghost sm">Export</button>
            <button id="lance-clear" class="btn ghost sm">Clear</button>
            <button id="lance-hide" class="btn sm">Hide</button>
          </div>
        </header>
        <div class="panel-c">
          <div class="lance-totals mono">
            <div><label class="dim small">BV</label> <span id="lance-tot-bv">0</span></div>
            <div><label class="dim small">Tons</label> <span id="lance-tot-tons">0</span></div>
            <div><label class="dim small">Units</label> <span id="lance-tot-count">0</span></div>
          </div>
          <div id="lance-list" class="lance-list" role="list"></div>
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
  }

  function renderList(){
    if (!_list) return;
    if (!_state.units.length){
      _list.innerHTML = `<div class="dim small" style="padding:6px;">No units yet.</div>`;
      return;
    }

    const rows = _state.units.map((u,i)=>{
      const nm = splitDisplay(u.name, u.source, u.variantCode);
      return `
        <div class="lance-row" data-idx="${i}" role="listitem">
          <div class="l-col name mono" title="${esc(nm.full)}">
            <span class="chassis">${esc(nm.chassis)}</span>
            ${nm.code ? `<sup class="variant-sup">${esc(nm.code)}</sup>` : ``}
          </div>
          <div class="l-col ton mono small">${fmt(u.tonnage,'—')}</div>
          <div class="l-col bv mono small">${fmt(u.bv,'—')}</div>
          <div class="l-col edit">
            <input class="mini" data-field="pilotName" value="${esc(u.pilotName||'')}" maxlength="32" />
          </div>
          <div class="l-col edit"><input class="mini num" data-field="piloting" type="number" value="${esc(u.piloting??4)}"/></div>
          <div class="l-col edit"><input class="mini num" data-field="gunnery" type="number" value="${esc(u.gunnery??4)}"/></div>
          <div class="l-col edit">
            <select class="mini sel" data-field="team">
              ${['Alpha','Bravo','Clan','Merc'].map(t=>`<option${u.team===t?' selected':''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="l-col actions">
            <button class="linklike" data-act="view">View</button>
            <span class="dim">•</span>
            <button class="linklike" data-act="remove">Remove</button>
          </div>
        </div>`;
    }).join('');

    _list.innerHTML = rows;
    _list.addEventListener('input', onRowEdit, { once:true });
    _list.addEventListener('change', onRowEdit);
    _list.addEventListener('click', onRowAction);
  }

  function updateTotals(){
    const bv = _state.units.reduce((s,u)=> s+(+u.bv||0),0);
    const tons = _state.units.reduce((s,u)=> s+(+u.tonnage||0),0);
    if (_totBV) _totBV.textContent = String(bv);
    if (_totTons) _totTons.textContent = String(tons);
    if (_totCount) _totCount.textContent = String(_state.units.length);
  }

  // ---------- Actions ----------
  function onAddCurrent(){
    if (!host || !host.getCurrentMech) return;
    const m = host.getCurrentMech();
    if (!m) return;
    const entry = getManifestEntryBySource(String(m.source));
    const variantCode = entry?.model || sniffVariantCode(m.name);
    const displayName = entry?.displayName || String(m.name);

    const unit = {
      id: m.id ?? null,
      name: displayName,
      bv: numOrNull(m.bv),
      tonnage: numOrNull(m.tonnage),
      source: String(m.source),
      pilotName: nextCallsign(),
      piloting: 4, gunnery: 4,
      team: 'Alpha',
      variantCode: variantCode || undefined
    };
    _state.units.push(unit);
    saveState(); renderList(); updateTotals();
  }

  function onRowEdit(e){
    const row = e.target.closest('.lance-row'); if(!row) return;
    const idx = +row.dataset.idx; const u=_state.units[idx]; if(!u) return;
    const f = e.target.getAttribute('data-field');
    if (f==='pilotName') u.pilotName = e.target.value.trim()||'—';
    if (f==='piloting') u.piloting = clampInt(e.target.value,0,9,4);
    if (f==='gunnery')  u.gunnery  = clampInt(e.target.value,0,9,4);
    if (f==='team')     u.team     = e.target.value;
    saveState();
  }

  function onRowAction(e){
    const btn=e.target.closest('button[data-act]'); if(!btn) return;
    const row=btn.closest('.lance-row'); const idx=+row.dataset.idx; const u=_state.units[idx];
    if (btn.dataset.act==='view'){ host?.openMechById?.(u.source); }
    if (btn.dataset.act==='remove'){ _state.units.splice(idx,1); saveState(); renderList(); updateTotals(); }
  }

  function onImport(){ /* unchanged from your version */ }
  function onClear(){ if(confirm('Clear lance?')){ _state.units=[]; saveState(); renderList(); updateTotals(); } }

  // ---------- Export ----------
  function onExportSkirmish(){
    try{
      const items=_state.units.map((u,i)=>{
        const entry=getManifestEntryBySource(u.source);
        const code=u.variantCode||entry?.model||sniffVariantCode(u.name);
        const long=entry?.displayName?ensureLongNameHasCode(entry.displayName,code):ensureLongNameHasCode(u.name,code);
        return {
          id:null,q:i,r:0,scale:1,angle:0,
          colorIndex:TEAM_COLOR[u.team]??1,
          label:code,
          meta:{name:long,pilot:formatPilot(u.pilotName,u.piloting,u.gunnery),team:u.team}
        };
      });
      const blob=new Blob([JSON.stringify(items,null,2)],{type:'application/json'});
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=`${(_state.name||'lance').toLowerCase()}.json`; a.click();
    }catch(err){warn('Export failed');}
  }

  // ---------- Persistence ----------
  function loadState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||_state;}catch{return _state;}}
  function saveState(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(_state));}catch{}}
  function loadUi(){try{return JSON.parse(localStorage.getItem(UI_STATE_KEY)||'{}');}catch{return {};}}
  function saveUi(o){localStorage.setItem(UI_STATE_KEY,JSON.stringify(o));}

  // ---------- Utils ----------
  function numOrNull(v){const n=+v;return Number.isFinite(n)?n:null;}
  function clampInt(v,min,max,dflt){const n=Math.round(+v);if(!Number.isFinite(n))return dflt;return Math.min(max,Math.max(min,n));}
  function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function fmt(v,d='—'){return (v==null||v==='')?d:String(v);}
  function warn(msg){if(_warn){_warn.hidden=false;_warn.textContent=msg;setTimeout(()=>_warn.hidden=true,1400);}}

  function sniffVariantCode(name){const s=String(name||'').toUpperCase();const m=s.match(/\b[A-Z0-9]{2,6}(?:-[A-Z0-9]+)+\b/);return m?m[0]:'';}
  function ensureLongNameHasCode(n,c){if(!c)return n;return n.toUpperCase().includes(c.toUpperCase())?n:`${n} ${c}`;}
  function formatPilot(n,p,g){return `${n} - P${p}/G${g}`;}

  function splitDisplay(display,src,variantCode){
    const ent=getManifestEntryBySource(src);
    const disp=String(ent?.displayName||display||'—');
    const code=String(variantCode||ent?.model||sniffVariantCode(disp)||'').trim();
    let chassis=disp;
    if(code&&disp.toUpperCase().endsWith(code.toUpperCase())){
      chassis=disp.slice(0,-code.length).trim();
    }
    return {chassis,chassis,code,full:ensureLongNameHasCode(disp,code)};
  }

  function getManifestEntryBySource(src){
    const idx=window.MANIFEST_INDEX||window.MechManifestIndex||{};
    return idx[src]||idx[String(src).split('/').pop()]||null;
  }

  function injectCssOnce(){
    if(document.getElementById('lance-css'))return;
    const st=document.createElement('style');st.id='lance-css';
    st.textContent=`
      #lance-dock .l-col.name .chassis{font-weight:600;}
      #lance-dock .variant-sup{font-size:.8em;vertical-align:super;opacity:.85;margin-left:6px;}
    `;
    document.head.appendChild(st);
  }
})();