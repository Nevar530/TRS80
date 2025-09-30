/* ===== TRS:80 Lance Module (manifest-aware; pilots, skills, mobile, Skirmish export, compact mobile) ===== */
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
  let _cs = shuffle([...CALLSIGNS]), _csIdx = 0;
  function nextCallsign(){ if(_csIdx>=_cs.length){_cs=shuffle([...CALLSIGNS]);_csIdx=0;} return _cs[_csIdx++]; }
  function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

  let host=null,_state={v:1,schema:SCHEMA,name:'Unnamed Lance',units:[]},_visible=false;
  let _dock,_btn,_list,_totBV,_totTons,_totCount,_nameInp,_warn;

  const Lance={init,setVisible,getState}; window.Lance=Lance;

  function init(api){
    host=mkHost(api||{});
    _btn=document.getElementById('btn-lance');
    _dock=document.getElementById('lance-dock');
    if(!_dock){console.warn('[Lance] #lance-dock not found');return;}
    injectCssOnce();
    _state=loadState();
    _visible=loadUi().visible??false;
    for(const u of _state.units){
      if(!u.pilotName) u.pilotName=nextCallsign();
      if(!Number.isFinite(u.gunnery)) u.gunnery=4;
      if(!Number.isFinite(u.piloting)) u.piloting=5;
      const ent=getManifestEntryBySource(u.source);
      u.variantCode=u.variantCode||ent?.model||sniffVariantCode(u.name)||undefined;
      if(ent?.displayName) u.name=ent.displayName;
    }
    renderDock(); renderList(); updateTotals();
    if(_btn){_btn.addEventListener('click',()=>setVisible(!_visible));_btn.setAttribute('aria-expanded',String(_visible));}
    setVisible(_visible);
    window.addEventListener('keydown',(e)=>{if((e.altKey||e.metaKey)&&e.key.toLowerCase()==='l'){e.preventDefault();setVisible(!_visible);}});
  }

  function setVisible(on){_visible=!!on;if(_dock)_dock.classList.toggle('hidden',!_visible);if(_btn)_btn.setAttribute('aria-expanded',String(_visible));saveUi({visible:_visible});}
  function getState(){return structuredClone(_state);}

  function renderDock(){
    if(!_dock) return;
    _dock.innerHTML=`
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
    _list=document.getElementById('lance-list');
    _totBV=document.getElementById('lance-tot-bv');
    _totTons=document.getElementById('lance-tot-tons');
    _totCount=document.getElementById('lance-tot-count');
    _nameInp=document.getElementById('lance-name');
    _warn=document.getElementById('lance-warn');
    document.getElementById('lance-add')?.addEventListener('click',onAddCurrent);
    document.getElementById('lance-import')?.addEventListener('click',onImport);
    document.getElementById('lance-export')?.addEventListener('click',onExportSkirmish);
    document.getElementById('lance-clear')?.addEventListener('click',onClear);
    document.getElementById('lance-hide')?.addEventListener('click',()=>setVisible(false));
    _nameInp?.addEventListener('change',()=>{_state.name=_nameInp.value.trim()||'Unnamed Lance';saveState();});
  }

  function renderList(){
  if(!_list) return;
  if(!_state.units.length){
    _list.innerHTML = `<div class="dim small" style="padding:6px;">No units yet. Use <strong>Add Current</strong>.</div>`;
    return;
  }

  const rows = _state.units.map((u, i)=>{
    const nm = splitDisplay(u.name, u.source, u.variantCode);
    return `
    <div class="lance-row" data-idx="${i}" role="listitem">
      <!-- Name -->
      <div class="l-col name mono" title="${esc(nm.full)}">
        <span class="chassis">${esc(nm.chassis)}</span>
        ${nm.code ? `<sup class="variant-sup">${esc(nm.code)}</sup>` : ``}
      </div>

      <!-- Compact meta line (mobile shows this; desktop keeps Ton/BV cols) -->
      <div class="l-col meta mono small">
        <span class="chip">${fmt(u.tonnage,'—')}t</span>
        <span class="chip">${fmt(u.bv,'—')} BV</span>
      </div>

      <!-- Desktop Ton/BV -->
      <div class="l-col ton mono small" title="Tonnage">${fmt(u.tonnage,'—')}</div>
      <div class="l-col bv  mono small" title="BV">${fmt(u.bv,'—')}</div>

      <!-- Pilot inline: name + G + P on one line -->
      <div class="l-col pilotline">
        <label class="small dim">Pilot</label>
        <input class="mini" data-field="pilotName" value="${esc(u.pilotName||'')}" maxlength="32" />
        <span class="sep">•</span>
        <label class="small dim">G</label>
        <input class="mini num" data-field="gunnery" type="number" min="0" max="9" step="1" value="${esc(u.gunnery??4)}" />
        <label class="small dim">P</label>
        <input class="mini num" data-field="piloting" type="number" min="0" max="9" step="1" value="${esc(u.piloting??5)}" />
      </div>

      <!-- Actions: Team select inline with View / Remove -->
      <div class="l-col actions">
        <label class="small dim team-lab">Team</label>
        <select class="mini sel" data-field="team">
          ${['Alpha','Bravo','Clan','Merc'].map(t=>`<option${u.team===t?' selected':''}>${t}</option>`).join('')}
        </select>
        <span class="flex-gap"></span>
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


  function updateTotals(){const bv=_state.units.reduce((s,u)=>s+(+u.bv||0),0);const tons=_state.units.reduce((s,u)=>s+(+u.tonnage||0),0);const n=_state.units.length;_totBV.textContent=bv;_totTons.textContent=tons;_totCount.textContent=n;}

  // … (all your existing action, import/export, manifest, and utils code stays unchanged) …

  function injectCssOnce(){
  if (document.getElementById('lance-css')) return;
  const st = document.createElement('style'); st.id = 'lance-css';
  st.textContent = `
    #lance-dock.hidden{ display:none; }
    #lance-dock .lance.panel{ margin:12px; border-radius:var(--radius,8px); }
    #lance-dock .lance-list{ display:flex; flex-direction:column; gap:8px; }

    /* Desktop grid: Name | Ton | BV | Pilotline | Actions */
    #lance-dock .lance-row{
      display:grid;
      grid-template-columns: 1fr 56px 80px minmax(360px, 1.2fr) auto;
      align-items:center; gap:8px; padding:8px;
      border:1px solid var(--border,#1f2a3a);
      border-radius:8px;
      background:linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.02));
    }
    #lance-dock .l-col.name{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #lance-dock .l-col.name .chassis{ font-weight:600; letter-spacing:.2px; }
    #lance-dock .variant-sup{ font-size:.8em; vertical-align: super; opacity:.85; margin-left:6px; }

    /* Pilotline inline */
    #lance-dock .pilotline{ display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    #lance-dock .pilotline .sep{ color:#93a1b5; opacity:.8; }
    #lance-dock .mini{ width:140px; padding:4px 6px; border-radius:6px; border:1px solid var(--border,#2a2f3a); background:#0e1522; color:var(--ink,#e8eef6); }
    #lance-dock .mini.num{ width:70px; text-align:center; }
    #lance-dock .mini.sel{ width:110px; }

    /* Actions with Team inline */
    #lance-dock .l-col.actions{ display:flex; align-items:center; gap:8px; justify-self:end; }
    #lance-dock .l-col.actions .flex-gap{ flex:1 1 auto; }
    #lance-dock .linklike{ background:transparent; border:0; color:var(--accent,#ffd06e); cursor:pointer; text-decoration:underline; padding:0; font-size:12.5px; }
    #lance-dock .small{ font-size:12px; }
    #lance-dock .dim{ color:#a9b4c2; }
    #lance-dock .chip{
      display:inline-block; padding:2px 6px; border:1px solid var(--border,#2a2f3a);
      border-radius:999px; font-size:11px; line-height:1.2; margin-right:6px; opacity:.9;
    }
    #lance-dock .meta{ display:none; } /* hidden on desktop */

    /* Tablet: compress pilotline column before full stack */
    @media (max-width: 980px){
      #lance-dock .lance-row{ grid-template-columns: 1fr 56px 80px minmax(280px, 1fr) auto; }
    }

    /* Phones: tight 2-col layout, chips visible, Ton/BV columns hidden */
    @media (max-width: 800px){
      #lance-dock .lance-row{
        grid-template-columns: 1fr 1fr;
        gap:6px; padding:6px;
      }
      #lance-dock .l-col.name{ grid-column: 1 / -1; }
      #lance-dock .meta{ display:block; grid-column: 1 / -1; margin-top:-2px; }
      #lance-dock .l-col.ton, #lance-dock .l-col.bv{ display:none !important; }

      /* Pilotline spans full width; shrink inputs */
      #lance-dock .pilotline{ grid-column: 1 / -1; gap:6px; }
      #lance-dock .mini{ flex:1 1 120px; min-width:0; }
      #lance-dock .mini.num{ flex:0 0 70px; }

      /* Actions: put at bottom-right; Team inline with actions */
      #lance-dock .l-col.actions{
        grid-column: 2 / 3; justify-self:end; gap:8px; flex-wrap:wrap;
      }
      #lance-dock .team-lab{ display:none; } /* save space on phones */
      #lance-dock .mini.sel{ max-width: 140px; }
    }

    /* Ultra-small phones */
    @media (max-width: 380px){
      #lance-dock .mini.sel{ max-width:120px; }
      #lance-dock .mini.num{ max-width:70px; }
    }
  `;
  document.head.appendChild(st);
}

})();
