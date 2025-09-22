import { Store } from './store.js';
import { GATOR } from './gator.js';
import { renderOverview, renderHeat } from './render-overview.js';
import { renderTechOutFromState } from './render-techout.js';
import { initSearchUI } from './search.js';
import { importJsonFromFile, exportSession } from './transport.js';

// Toast (kept minimal)
function showToast(msg, ms=1800) {
  const el = document.getElementById('toast');
  if (!el) { console.log('[toast]', msg); return; }
  el.textContent = msg; el.hidden = false; el.style.display = 'block';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; el.style.display = 'none'; }, ms);
}

// Modal
(function modalInit(){
  const footerAbout = document.getElementById('footer-about');
  const modal       = document.getElementById('settings-modal');
  const modalClose  = document.getElementById('modal-close');
  const modalOk     = document.getElementById('modal-ok');
  const buildSpan   = document.querySelector('[data-build-ts]');
  const btnSettings = document.getElementById('btn-settings');

  function openModal(){
    if (!modal) return;
    modal.hidden = false;
    modal.querySelector('#modal-close')?.focus();
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

  document.getElementById('btn-settings')?.addEventListener('click', openModal);
  footerAbout?.addEventListener('click', openModal);
  modalClose?.addEventListener('click', closeModal);
  modalOk?.addEventListener('click', closeModal);
})();

// Tabs (Overview / Tech Readout / GATOR)
(function tabsInit(){
  const topSwapper = document.getElementById('top-swapper');
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
    topSwapper.querySelectorAll('.swap-pane').forEach(p => {
      p.classList.toggle('is-active', p.id === id);
    });
  });
})();

// GATOR wiring
(function gatorInit(){
  const $ = (s) => document.querySelector(s);
  const s = Store.get();

  const gunnerySel = $('#gtr-gunnery-sel');
  const attackerSel= $('#gtr-attacker-sel');
  const tgtBandSel = $('#gtr-target-band');
  const tgtJumpChk = $('#gtr-tgt-jump');
  const tgtNone    = $('#gtr-tgt-none');
  const tgtPadj    = $('#gtr-tgt-padj');
  const tgtProne   = $('#gtr-tgt-prone');
  const tgtImm     = $('#gtr-tgt-imm');

  const wb = $('#gtr-wb'); const wa = $('#gtr-wa'); const ot = $('#gtr-ot'); const st = $('#gtr-st'); const ht = $('#gtr-ht');
  const rangeSeg = $('#gtr-range-seg'); const rmin = $('#gtr-min');

  if (gunnerySel) gunnerySel.value  = String(s.gator.G ?? 4);
  if (attackerSel) attackerSel.value= String(s.gator.A ?? 0);
  if (tgtBandSel)  tgtBandSel.value = String(s.gator.T ?? 0);

  const recompute = () => {
    const tnEl = document.getElementById('gtr-total');
    if (!tnEl) return;
    const res = GATOR.computeTN(Store.get().gator);
    tnEl.className = 'tn ' + res.cls;
    tnEl.textContent = res.text;
  };

  gunnerySel?.addEventListener('change', () => { Store.update('gator', { G:+gunnerySel.value }); recompute(); });
  attackerSel?.addEventListener('change', () => { Store.update('gator', { A:+attackerSel.value }); recompute(); });
  tgtBandSel ?.addEventListener('change', () => { Store.update('gator', { T:+tgtBandSel.value }); recompute(); });
  tgtJumpChk?.addEventListener('change', () => { const g = Store.get().gator; g.T_adv.jump = !!tgtJumpChk.checked; recompute(); });

  tgtNone ?.addEventListener('change', ()=> { const g=Store.get().gator; g.T_adv={jump:g.T_adv.jump,padj:false,prone:false,imm:false}; recompute(); });
  tgtPadj ?.addEventListener('change', ()=> { const g=Store.get().gator; g.T_adv={jump:g.T_adv.jump,padj:true,prone:false,imm:false}; recompute(); });
  tgtProne?.addEventListener('change', ()=> { const g=Store.get().gator; g.T_adv={jump:g.T_adv.jump,padj:false,prone:true,imm:false}; recompute(); });
  tgtImm  ?.addEventListener('change', ()=> { const g=Store.get().gator; g.T_adv={jump:g.T_adv.jump,padj:false,prone:false,imm:true}; recompute(); });

  function sumOther(){
    const v = (+wb.value||0)+(+wa.value||0)+(+ot.value||0)+(+st.value||0)+(+ht.value||0);
    Store.update('gator', { O:v }); recompute();
  }
  [wb,wa,ot,st,ht].forEach(s => s?.addEventListener('change', sumOther));

  rangeSeg?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-val]'); if(!btn) return;
    rangeSeg.querySelectorAll('button').forEach(b=>b.classList.toggle('is-active', b===btn));
    Store.update('gator', { R: Number(btn.dataset.val)||0 }); recompute();
  });
  rmin?.addEventListener('change', ()=> { Store.update('gator', { Rmin: rmin.value }); });

  // Dice
  const attDice = $('#roll-att-dice'), attMod = $('#roll-att-mod'), attRes = $('#roll-att-res');
  const btnAtt  = $('#btn-roll-att'), btnBoth = $('#btn-roll-both');
  const parseDice = (str)=> (str||'2d6').match(/(\d+)d(\d+)/i)?.slice(1).map(Number) || [2,6];
  const rollOne = (s)=> Math.floor(Math.random()*s)+1;
  const bounce = (el)=>{ el.style.transform='translateY(-6px)'; el.style.transition='transform .15s ease'; requestAnimationFrame(()=> el.style.transform=''); };
  function doRoll(){
    const [n,sides] = parseDice(attDice?.value); const mod = Number(attMod?.value||0);
    const rolls = Array.from({length:n}, ()=> rollOne(sides));
    const total = rolls.reduce((a,b)=>a+b,0)+mod;
    if (attRes){ attRes.textContent = total; attRes.title = `rolls: ${rolls.join(', ')} + ${mod}`; bounce(attRes); }
    return total;
  }
  btnAtt?.addEventListener('click', doRoll);
  btnBoth?.addEventListener('click', doRoll);
  window.addEventListener('keydown', (e)=>{ if(e.key.toLowerCase()==='r' && !['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) doRoll(); });

  recompute();
})();

// Import/Export
document.getElementById('btn-import')?.addEventListener('click', importJsonFromFile);
document.getElementById('btn-export')?.addEventListener('click', exportSession);

// Reactive renders
Store.subscribe((state) => {
  renderOverview(state);
  renderHeat(state);
  renderTechOutFromState(state);
});

// Initial draw (empty state)
renderOverview(Store.get());
renderHeat(Store.get());
renderTechOutFromState(Store.get());

// Typeahead search over manifest
import { initSearchUI } from './search.js';
initSearchUI();

console.info('Gator Console (modular) ready.');
