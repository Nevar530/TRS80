/* ===== Gator Console – script.js (Overview/Tech + Compact G.A.T.O.R. panel) ===== */
(() => {
  'use strict';

  /* ---------- DOM refs ---------- */
  const btnLoadManifest = document.getElementById('btn-load-manifest');
  const btnSettings     = document.getElementById('btn-settings');
  const btnLoadMech     = document.getElementById('btn-load-mech');
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

  /* ---------- DEMO placeholder: Griffin GRF-1A ---------- */
  const DEMO_GRF1A = {
    id: "grf_1a_demo",
    name: "Griffin",
    variant: "GRF-1A",
    tonnage: 60,
    move: { walk: 4, run: 6, jump: 3 },
    sinks: { count: 11, type: "Single" },
    weapons: [
      { name: "Prototype PPC", loc: "RA" },
      { name: "LRM-5",         loc: "RT" },
      { name: "LRM-5 Ammo (1t)", loc: "RT" }
    ]
  };

  /* ---------- Utils ---------- */
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
    if (ovMech)   ovMech.textContent  = m?.name ?? '—';
    if (ovVar)    ovVar.textContent   = m?.variant ?? '—';
    if (ovTons)   ovTons.textContent  = m?.tonnage != null ? String(m.tonnage) : '—';
    if (ovPilot)  ovPilot.textContent = p?.name || '—';
    if (ovGun)    ovGun.textContent   = p?.gunnery != null ? String(p.gunnery) : '—';
    if (ovPil)    ovPil.textContent   = p?.piloting != null ? String(p.piloting) : '—';
    if (ovMove)   ovMove.textContent  = m?.move
      ? `W ${m.move.walk ?? '—'} / R ${m.move.run ?? '—'}${m.move.jump ? ' / J '+m.move.jump : ''}`
      : '—';
    if (ovWeps)   ovWeps.textContent  = (m?.weapons?.length
      ? m.weapons.slice(0,6).map(w => `${w.name}${w.loc?' ['+w.loc+']':''}`).join(' • ')
      : '—');
  };

  const fmtAS = (o) => (o ? `${o.a ?? '-'} / ${o.s ?? '-'}` : '—');
  const renderTechOut = () => {
    if (!techOut) return;
    const m = state.mech;
    if (!m) { techOut.innerHTML = '<div class="placeholder">Load or build a mech to view details.</div>'; return; }

    const armor = m.armor || {};
    techOut.innerHTML = `
      <div class="mono small dim" style="margin-bottom:6px;">${esc(m.id || '')}</div>
      <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div><strong>Chassis</strong><br>${esc(m.name || '—')} ${m.variant ? '('+esc(m.variant)+')' : ''}</div>
        <div><strong>Tonnage</strong><br>${m.tonnage ?? '—'}</div>
        <div><strong>Movement</strong><br>W ${m.move?.walk ?? '—'} / R ${m.move?.run ?? '—'} ${m.move?.jump ? '/ J '+m.move.jump : ''}</div>
        <div><strong>Heat Sinks</strong><br>${m.sinks?.count ?? '—'} ${m.sinks?.type || ''}</div>
        <div style="grid-column:1 / -1;">
          <strong>Armor (A/S)</strong><br>
          <span class="mono small dim">HD:${fmtAS(armor.HD)} CT:${fmtAS(armor.CT)} RT:${fmtAS(armor.RT)} LT:${fmtAS(armor.LT)} RA:${fmtAS(armor.RA)} LA:${fmtAS(armor.LA)} RL:${fmtAS(armor.RL)} LL:${fmtAS(armor.LL)}</span>
        </div>
        <div style="grid-column:1 / -1;"><strong>Weapons</strong><br>${
          (m.weapons?.length ? m.weapons.map(w => `${esc(w.name)}${w.loc?' ['+esc(w.loc)+']':''}`).join(' • ') : '—')
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
  const loadManifest = async () => {
    try {
      showToast('Loading manifest…');
      const data = await safeFetchJson('./manifest.json');
      console.info('[Manifest]', data);
      showToast('Manifest loaded');
    } catch (err) {
      console.error(err);
      showToast('Failed to load manifest');
    }
  };

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
        showToast(`${mech?.name || 'Mech'} loaded`);
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
      showToast(`${mech?.name || 'Mech'} loaded`);
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
    // trap focus basics
    const focusable = modal.querySelector('#modal-close');
    focusable?.focus();
    // set build timestamp
    if (buildSpan) buildSpan.textContent = new Date().toISOString();
    // dismiss on backdrop click
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
    const cap = Number.isFinite(m?.heatCapacity) ? m.heatCapacity : (m?.sinks?.count ?? 0);
    setHeat(resetHeat ? 0 : state.heat.current, cap);

    updateOverview();
    renderTechOut();
  };

  /* ---------- Wire UI ---------- */
  btnLoadManifest?.addEventListener('click', loadManifest);
  btnLoadMech?.addEventListener('click', (e) => { if (e.altKey) loadMechByPath(); else loadMechFromFile(); });
  btnCustomMech?.addEventListener('click', () => showToast('Builder coming soon (placeholder)'));
  btnImport?.addEventListener('click', importJson);
  btnExport?.addEventListener('click', exportState);
  btnSettings?.addEventListener('click', openModal);
  footerAbout?.addEventListener('click', openModal);
  modalClose?.addEventListener('click', closeModal);
  modalOk?.addEventListener('click', closeModal);

  // top swapper
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
  if (document.readyState !== 'loading') { initGatorPanel(); }
  else document.addEventListener('DOMContentLoaded', initGatorPanel);

  console.info('Gator Console ready.');
})();
