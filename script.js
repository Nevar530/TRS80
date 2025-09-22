/* ===== Gator Console – script.js (Overview/Tech + Compact G.A.T.O.R. + SEARCH LOAD) ===== */
(() => {
  'use strict';

let manifest = [];
let manifestUrl;

async function loadManifest() {
  try {
    manifestUrl = new URL('data/manifest.json', document.baseURI).href;
    const res = await fetch(manifestUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} loading manifest.json`);
    const items = await res.json();
    manifest = items.map(m => ({
      ...m,
      path: (m.path || '').replace(/\\/g, '/').trim()
    }));
    console.log(`Manifest OK (${manifest.length})`, manifestUrl);
  } catch (err) {
    toast(`Failed to load manifest: ${err.message}`);
    console.error(err);
  }
}

async function loadMech(mechId) {
  try {
    const m = manifest.find(x => String(x.id) === String(mechId));
    if (!m) throw new Error(`Not in manifest: ${mechId}`);

    // ✅ resolves "a-f/..." relative to ".../data/manifest.json"
    const mechUrl = new URL(m.path, manifestUrl).href;
    console.debug('Fetching mech JSON:', mechUrl);

    const res = await fetch(mechUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${mechUrl}`);

    let data;
    try { data = await res.json(); }
    catch (e) { throw new Error(`Invalid JSON in ${mechUrl}: ${e.message}`); }

    updateOverview(data);
    updateTechReadout(data);
    toast(`${data.name || mechId} loaded`);
  } catch (err) {
    toast(`Failed to load mech JSON: ${err.message}`);
    console.error(err);
  }
}

// tiny toast helper if you don’t have one
function toast(msg) { 
  const t = document.querySelector('.toast'); 
  if (!t) { alert(msg); return; }
  t.textContent = msg; t.hidden = false; setTimeout(()=> t.hidden = true, 2500);
}

  
  /* ---------- DOM refs ---------- */
  const btnLoadManifest = document.getElementById('btn-load-manifest');
  const btnSettings     = document.getElementById('btn-settings');
  const btnLoadMech     = document.getElementById('btn-load-mech'); // replaced by search UI (kept hidden as fallback)
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
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
  const showToast = (msg, ms = 1800) => {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastEl.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toastEl.hidden = true;
      toastEl.style.display = 'none';
    }, ms);
  };
  const safeFetchJson = async (url) => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
    return res.json();
  };
  const encodeSpaces = (p) => p.replace(/ /g, '%20');

  /* ---------- Heat ---------- */
  const setHeat = (current, capacity) => {
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
  };

  /* ---------- Overview & Tech Readout ---------- */
  const updateOverview = () => {
    const m = state.mech, p = state.pilot;
    if (ovMech)   ovMech.textContent  = m?.displayName ?? m?.name ?? m?.Name ?? '—';
    if (ovVar)    ovVar.textContent   = m?.variant ?? m?.Model ?? '—';
    if (ovTons)   ovTons.textContent  = m?.tonnage != null ? String(m.tonnage) : (m?.Tonnage ?? '—');
    if (ovPilot)  ovPilot.textContent = p?.name || '—';
    if (ovGun)    ovGun.textContent   = p?.gunnery != null ? String(p.gunnery) : '—';
    if (ovPil)    ovPil.textContent   = p?.piloting != null ? String(p.piloting) : '—';
    if (ovMove)   ovMove.textContent  = m?.move
      ? `W ${m.move.walk ?? '—'} / R ${m.move.run ?? '—'}${m.move.jump ? ' / J '+m.move.jump : ''}`
      : (m?.Movement || '—');
    if (ovWeps)   ovWeps.textContent  = (m?.weapons?.length
      ? m.weapons.slice(0,6).map(w => `${w.name}${w.loc?' ['+w.loc+']':''}`).join(' • ')
      : (m?.Weapons ? m.Weapons.slice(0,6).map(w => w.Name || w.name).join(' • ') : '—'));
  };

  const fmtAS = (o) => (o ? `${o.a ?? o.A ?? '-'} / ${o.s ?? o.S ?? '-'}` : '—');
  const renderTechOut = () => {
    if (!techOut) return;
    const m = state.mech;
    if (!m) { techOut.innerHTML = '<div class="placeholder">Load or build a mech to view details.</div>'; return; }

    const armor = m.armor || m.Armor || {};
    techOut.innerHTML = `
      <div class="mono small dim" style="margin-bottom:6px;">${esc(m.id || m.ID || '')}</div>
      <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div><strong>Chassis</strong><br>${esc(m.displayName || m.name || m.Name || '—')} ${m.variant ? '('+esc(m.variant)+')' : (m.Model ? '('+esc(m.Model)+')' : '')}</div>
        <div><strong>Tonnage</strong><br>${m.tonnage ?? m.Tonnage ?? '—'}</div>
        <div><strong>Movement</strong><br>${m.move ? `W ${m.move.walk ?? '—'} / R ${m.move.run ?? '—'} ${m.move.jump ? '/ J '+m.move.jump : ''}` : (m.Movement || '—')}</div>
        <div><strong>Heat Sinks</strong><br>${m.sinks?.count ?? m.HeatSinks ?? '—'} ${m.sinks?.type || ''}</div>
        <div style="grid-column:1 / -1;">
          <strong>Armor (A/S)</strong><br>
          <span class="mono small dim">HD:${fmtAS(armor.HD)} CT:${fmtAS(armor.CT)} RT:${fmtAS(armor.RT)} LT:${fmtAS(armor.LT)} RA:${fmtAS(armor.RA)} LA:${fmtAS(armor.LA)} RL:${fmtAS(armor.RL)} LL:${fmtAS(armor.LL)}</span>
        </div>
        <div style="grid-column:1 / -1;"><strong>Weapons</strong><br>${
          (m.weapons?.length ? m.weapons.map(w => `${esc(w.name)}${w.loc?' ['+esc(w.loc)+']':''}`).join(' • ')
            : (m.Weapons?.length ? m.Weapons.map(w => `${esc(w.Name || '')}${w.Location ? ' ['+esc(w.Location)+']' : ''}`).join(' • ') : '—'))
        }</div>
      </div>
    `;
  };

  /* ===================== BEGIN GATOR LOGIC (compact) ===================== */
  const el = (sel) => document.querySelector(sel);

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
    tnEl.className = 'tn';
    if (sum <= 2) { tnEl.textContent = 'Auto'; tnEl.classList.add('tn-auto'); }
    else if (sum <= 9) { tnEl.textContent = `${sum}+`; tnEl.classList.add('tn-yellow'); }
    else { tnEl.textContent = `${sum}+`; tnEl.classList.add('tn-red'); }

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
    gunnerySel.value  = String(state.gator.G ?? 4);
    attackerSel.value = String(state.gator.A ?? 0);
    tgtBandSel.value  = String(state.gator.T ?? 0);

    // Wire changes
    gunnerySel.addEventListener('change', () => { state.gator.G = +gunnerySel.value; recomputeGator(); });
    attackerSel.addEventListener('change', () => { state.gator.A = +attackerSel.value; recomputeGator(); });
    tgtBandSel .addEventListener('change', () => { state.gator.T = +tgtBandSel.value; recomputeGator(); });
    tgtJumpChk.addEventListener('change', () => { state.gator.T_adv.jump = !!tgtJumpChk.checked; recomputeGator(); });

    function setPosture({padj=false, prone=false, imm=false}){
      state.gator.T_adv.padj = padj; state.gator.T_adv.prone = prone; state.gator.T_adv.imm = imm;
      recomputeGator();
    }
    tgtNone .addEventListener('change', ()=> setPosture({}));
    tgtPadj .addEventListener('change', ()=> setPosture({padj:true}));
    tgtProne.addEventListener('change', ()=> setPosture({prone:true}));
    tgtImm  .addEventListener('change', ()=> setPosture({imm:true}));

    function sumOther(){
      const v = (+wb.value||0)+(+wa.value||0)+(+ot.value||0)+(+st.value||0)+(+ht.value||0);
      state.gator.O = v; recomputeGator();
    }
    [wb,wa,ot,st,ht].forEach(s => s.addEventListener('change', sumOther));

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

  /* ---------- Loading / Import / Export ---------- */
  const loadMechFromFile = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const text = await file.text();
        const mech = JSON.parse(text);
        state.mech = mech;
        onMechChanged({ resetHeat: true });
        showToast(`${mech?.displayName || mech?.name || 'Mech'} loaded`);
      } catch (e) {
        console.error(e);
        showToast('Load failed (invalid JSON)');
      }
    };
    input.click();
  };

  const loadMechByPath = async (idOrPath) => {
    try {
      showToast('Loading mech…');
      const url = idOrPath && idOrPath.endsWith('.json') ? idOrPath : './mechs/example_mech.json';
      const mech = await safeFetchJson(url);
      state.mech = mech;
      onMechChanged({ resetHeat: true });
      showToast(`${mech?.displayName || mech?.name || 'Mech'} loaded`);
    } catch (err) {
      console.error(err);
      showToast('Failed to load mech');
    }
  };

  const importJson = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (data.mech || data.pilot || data.heat) {
          if (data.mech)  state.mech  = data.mech;
          if (data.pilot) state.pilot = data.pilot;
          if (data.heat)  state.heat  = data.heat;
          onMechChanged({ resetHeat: false });
        } else {
          state.mech = data;
          onMechChanged({ resetHeat: true });
        }
        showToast('JSON imported');
      } catch (e) {
        console.error(e);
        showToast('Import failed');
      }
    };
    input.click();
  };

  const exportState = () => {
    const payload = { mech: state.mech, pilot: state.pilot, heat: state.heat, gator: state.gator, timestamp: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gator_session_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Session exported');
  };

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
  function backdropClose(e){
    if (e.target === modal) closeModal();
  }
  function escClose(e){
    if (e.key === 'Escape') closeModal();
  }

  /* ---------- Change handlers ---------- */
  const onMechChanged = ({ resetHeat = true } = {}) => {
    const m = state.mech || DEMO_GRF1A; // demo fallback
    state.mech = m;
    const cap = Number.isFinite(m?.heatCapacity) ? m.heatCapacity : (m?.sinks?.count ?? m?.HeatSinks ?? 0);
    setHeat(resetHeat ? 0 : state.heat.current, cap);

    updateOverview();
    renderTechOut();
  };

  /* ---------- Wire UI ---------- */
  btnImport?.addEventListener('click', importJson);
  btnExport?.addEventListener('click', exportState);
  btnSettings?.addEventListener('click', openModal);
  footerAbout?.addEventListener('click', openModal);
  modalClose?.addEventListener('click', closeModal);
  modalOk?.addEventListener('click', closeModal);

  // Legacy load button (now hidden by search UI, but kept as fallback)
  btnLoadMech?.addEventListener('click', (e) => { if (e.altKey) loadMechByPath(); else loadMechFromFile(); });

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

  /* ===================== SEARCH LOAD (Typeahead over manifest; top 25) ===================== */
  (() => {
    try {
      const toolbar = document.querySelector('.actions--top');
      if (!toolbar || !btnLoadMech) return;

      // Build search UI next to the (now hidden) Load button
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
      panel.id = 'mech-results';
      Object.assign(panel.style, {
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: '0',
        zIndex: '100',
        minWidth: '280px',
        maxWidth: '380px',
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

      /* ------- Manifest load + index (in-memory) ------- */
      let entries = []; // {path,name?,id?,variant?, key (lowercased)}
      let open = false;
      let hi = -1; // highlighted index in current results
      let results = []; // current filtered
      let manifestLoaded = false;

      function normalizeManifest(raw){
        if (Array.isArray(raw)) return raw;
        if (raw && Array.isArray(raw.mechs)) return raw.mechs;
        // letter/grouped object
        const out = [];
        if (raw && typeof raw === 'object') {
          for (const v of Object.values(raw)) if (Array.isArray(v)) out.push(...v);
        }
        return out;
      }
      function makeKey(e){
        return [
          e.displayName, e.displayname, e.name, e.variant, e.id, e.path
        ].filter(Boolean).join(' ').toLowerCase();
      }
      async function loadManifestForSearch(){
        if (manifestLoaded) return;
        try{
          const res = await fetch('./data/manifest.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const raw = await res.json();
          const list = normalizeManifest(raw).filter(e => e && (e.path || e.url || e.file));
          entries = list.map(e => {
            const path = e.path || e.url || e.file;
            return {
              path,
              name: e.displayName || e.displayname || e.name || null,
              id: e.id || null,
              variant: e.variant || null,
              key: makeKey({ ...e, path })
            };
          });
          manifestLoaded = true;
          showToast(`Manifest ready — ${entries.length} mechs`);
        }catch(err){
          console.error(err);
          showToast('Failed to load manifest');
        }
      }

      // Manual refresh via button, plus auto-load on startup
      btnLoadManifest?.addEventListener('click', loadManifestForSearch);
      input.addEventListener('focus', () => { if (!manifestLoaded) loadManifestForSearch(); });
      // Auto-load when app starts (no button click required)
      loadManifestForSearch().catch(err => console.error('Manifest auto-load failed', err));

      /* ------- Search & render (debounced, top 25) ------- */
      function score(hit, terms){
        // simple score: +3 prefix, +2 word boundary, +1 substring per term
        let s = 0;
        for (const t of terms){
          const idx = hit.indexOf(t);
          if (idx < 0) return -1; // must contain all terms
          if (idx === 0) s += 3;
          else if (/\s/.test(hit[idx-1])) s += 2;
          else s += 1;
        }
        return s - Math.log1p(hit.length)/2; // light bonus for shorter strings
      }
      function tokenize(q){
        return q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0,5);
      }
      function search(q){
        if (!q) return [];
        const terms = tokenize(q);
        if (!terms.length) return [];
        const scored = [];
        for (const e of entries){
          const sc = score(e.key, terms);
          if (sc >= 0) scored.push([sc, e]);
        }
        scored.sort((a,b)=> b[0]-a[0]);
        return scored.slice(0,25).map(x=>x[1]);
      }

      function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
      function rowHtml(e, isHi){
        const label = e.name || e.id || e.variant || e.path;
        return `<div class="mech-row${isHi?' is-hi':''}" data-path="${escapeHtml(e.path)}" style="padding:6px 8px; cursor:pointer; display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--border);">
          <div class="mono" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:calc(100% - 60px);">
            ${escapeHtml(label)}
          </div>
          <div class="dim mono small" style="margin-left:auto;">${escapeHtml(e.id || e.variant || '')}</div>
        </div>`;
      }

      function openPanel(){ if (!open){ panel.style.display='block'; open = true; } }
      function closePanel(){ if (open){ panel.style.display='none'; open = false; hi = -1; } }
      function render(){
        if (!results.length){ panel.innerHTML = `<div class="dim small" style="padding:8px;">No matches</div>`; return; }
        panel.innerHTML = results.map((e,i)=> rowHtml(e, i===hi)).join('');
      }

      function highlight(delta){
        if (!results.length) return;
        hi = (hi + delta + results.length) % results.length;
        render();
        // ensure visible
        const rows = panel.querySelectorAll('.mech-row');
        const el = rows[hi];
        if (el){
          const boxTop = panel.scrollTop;
          const boxBot = boxTop + panel.clientHeight;
          const t = el.offsetTop, b = t + el.offsetHeight;
          if (t < boxTop) panel.scrollTop = t;
          else if (b > boxBot) panel.scrollTop = b - panel.clientHeight;
        }
      }

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
        }, 120); // debounce
      });

      panel.addEventListener('mousedown', (e) => {
        const row = e.target.closest('.mech-row');
        if (!row) return;
        pick(row.getAttribute('data-path'));
      });

      input.addEventListener('keydown', (e) => {
        if (!open && ['ArrowDown','Enter'].includes(e.key)) {
          if (input.value){ results = search(input.value); hi = results.length?0:-1; openPanel(); render(); }
        }
        if (!open) return;
        if (e.key === 'ArrowDown'){ e.preventDefault(); highlight(+1); }
        else if (e.key === 'ArrowUp'){ e.preventDefault(); highlight(-1); }
        else if (e.key === 'Enter'){ e.preventDefault(); const p = results[hi]?.path; if (p) pick(p); }
        else if (e.key === 'Escape'){ closePanel(); }
      });

      document.addEventListener('click', (e) => {
        if (wrap.contains(e.target)) return;
        closePanel();
      });

      // Hook when a mech is clicked from search results
function loadMech(mechId) {
  // Find the mech entry in manifest
  const mech = manifest.find(m => m.id === mechId);
  if (!mech) return;

  // Fetch the mech JSON file
  fetch(mech.path)
    .then(res => res.json())
    .then(data => {
      // Update Overview
      document.getElementById('mech-name').textContent = data.name;
      document.getElementById('mech-weight').textContent = data.weight + " tons";
      document.getElementById('mech-class').textContent = data.class;
      
      // Update Tech Readout
      const techPanel = document.getElementById('tech-readout');
      techPanel.innerHTML = `
        <h3>${data.name} (${data.variant})</h3>
        <p><b>Tonnage:</b> ${data.weight}</p>
        <p><b>Movement:</b> ${data.move}</p>
        <p><b>Armor:</b> ${data.armor}</p>
        <p><b>Weapons:</b></p>
        <ul>
          ${data.weapons.map(w => `<li>${w.name} (${w.location})</li>`).join('')}
        </ul>
      `;
    })
    .catch(err => console.error("Error loading mech:", err));
}


      /* ------- Pick & load a mech (calls your existing pipeline) ------- */
      async function pick(path){
        closePanel();
        input.blur();
        try{
          showToast('Loading mech…');
          const url = encodeSpaces(path);
          const mech = await safeFetchJson(url);
          state.mech = mech;
          onMechChanged({ resetHeat: true });
          showToast((mech.displayName || mech.name || mech.Model || 'Mech') + ' loaded');
        }catch(err){
          console.error(err);
          showToast('Failed to load mech JSON');
        }
      }
    } catch (e) {
      console.error('Search init failed', e);
      showToast('Search init failed');
    }
  })();
  /* ===================== END SEARCH LOAD ===================== */

// ---- Search dropdown behavior (hover, click, keyboard-safe) ----
const searchInput   = document.getElementById('mech-search');
const resultsBox    = document.getElementById('search-results');
let blurHideTimer   = null;

// Show results helper (call this after filtering manifest)
function renderResults(items) {
  resultsBox.innerHTML = items.map(m => `
    <div class="result-item" data-id="${m.id}" tabindex="0" role="button" aria-label="${m.name}">
      <span class="result-name">${m.name}</span>
      ${m.variant ? `<span class="result-variant"> ${m.variant}</span>` : ''}
    </div>
  `).join('');
  resultsBox.hidden = items.length === 0;
}

// Prevent the “blur kills click” problem:
// Use mousedown so selection happens before the input loses focus.
resultsBox.addEventListener('mousedown', (e) => {
  const item = e.target.closest('.result-item');
  if (!item) return;
  e.preventDefault();                 // keep focus so blur handler doesn’t hide early
  const mechId = item.dataset.id;
  loadMech(mechId);                   // your existing loader
  hideResults();
});

// Also support keyboard Enter on a focused result
resultsBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const item = e.target.closest('.result-item');
    if (!item) return;
    const mechId = item.dataset.id;
    loadMech(mechId);
    hideResults();
  }
});

// Input focus/blur handling with a tiny delay so mousedown can run first
searchInput.addEventListener('focus', () => {
  clearTimeout(blurHideTimer);
  if (resultsBox.children.length) resultsBox.hidden = false;
});

searchInput.addEventListener('blur', () => {
  clearTimeout(blurHideTimer);
  blurHideTimer = setTimeout(hideResults, 120);
});

function hideResults() {
  resultsBox.hidden = true;
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
