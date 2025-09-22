import { Store } from './store.js';
import { loadMechFromUrl, loadManifest } from './transport.js'; 

function buildIndex(manifest) {
  return manifest.map(m => {
    const label = [m.name, m.variant, m.id, m.path].filter(Boolean).join(' ').toLowerCase();
    return { ...m, _key: ' ' + label + ' ' };
  });
}
function scoreHit(key, terms) {
  let s = 0;
  for (const t of terms) {
    const idx = key.indexOf(t);
    if (idx < 0) return -1;
    s += (idx === 1 ? 3 : (key[idx-1] === ' ' ? 2 : 1));
  }
  return s;
}
function searchIndex(idx, q) {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0,5);
  if (!terms.length) return [];
  const out = [];
  for (const m of idx) {
    const sc = scoreHit(m._key, terms);
    if (sc >= 0) out.push([sc, m]);
  }
  out.sort((a,b)=> b[0]-a[0]);
  return out.slice(0,25).map(x=>x[1]);
}

export function initSearchUI() {
  const toolbar = document.querySelector('.actions--top');
  const btnLoadMech = document.getElementById('btn-load-mech');
  const btnLoadManifest = document.getElementById('btn-load-manifest');
  if (!toolbar || !btnLoadMech) return;

  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  wrap.style.display = 'inline-block';
  wrap.style.minWidth = '220px';
  wrap.style.marginLeft = '6px';

  const input = document.createElement('input');
  Object.assign(input, { type:'search', id:'mech-search', placeholder:'Search mechs…', autocomplete:'off', spellcheck:false });
  Object.assign(input.style, { padding:'6px 10px', borderRadius:'6px', border:'1px solid var(--border)', background:'#0e1522', color:'var(--ink)', width:'220px' });

  const panel = document.createElement('div');
  panel.id = 'search-results';
  Object.assign(panel.style, {
    position:'absolute', top:'calc(100% + 4px)', left:'0', zIndex:'100',
    minWidth:'280px', maxWidth:'420px', maxHeight:'50vh', overflowY:'auto',
    border:'1px solid var(--border)', borderRadius:'8px', background:'var(--panel)',
    display:'none', boxShadow:'0 8px 24px rgba(0,0,0,0.35)'
  });

  wrap.appendChild(input); wrap.appendChild(panel);
  btnLoadMech.insertAdjacentElement('afterend', wrap);
  btnLoadMech.style.display = 'none';

  let open = false, hi = -1, results = [], index = [];

  const openPanel  = () => { if (!open){ panel.style.display='block'; open = true; } };
  const closePanel = () => { if (open){ panel.style.display='none'; open = false; hi = -1; } };

  function render() {
    if (!results.length) { panel.innerHTML = `<div class="dim small" style="padding:8px;">No matches</div>`; return; }
    panel.innerHTML = results.map((e,i)=> `
      <div class="result-item${i===hi?' is-hi':''}" data-url="${e.url}" tabindex="0" role="button"
           aria-label="${(e.name || e.id || e.variant || e.path || '').replace(/"/g,'&quot;')}"
           style="padding:6px 8px; display:block; border-bottom:1px solid var(--border); cursor:pointer;">
        <span class="result-name mono" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:calc(100% - 60px);">${e.name || e.id || e.variant || e.path}</span>
        <span class="result-variant dim mono small" style="float:right; margin-left:8px;">${e.id || e.variant || ''}</span>
      </div>
    `).join('');
  }

  // Search behavior
  let tId = 0;
  input.addEventListener('input', () => {
    const q = input.value;
    clearTimeout(tId);
    if (!q){ closePanel(); return; }
    tId = setTimeout(() => {
      results = searchIndex(index, q);
      hi = results.length ? 0 : -1;
      openPanel(); render();
    }, 120);
  });

  panel.addEventListener('mousedown', (e) => {
    const row = e.target.closest('.result-item');
    if (!row) return;
    const url = row.getAttribute('data-url');
    closePanel(); input.blur();
    if (url) loadMechFromUrl(url);
  });

  input.addEventListener('keydown', (e) => {
    if (!open && ['ArrowDown','Enter'].includes(e.key)) {
      const m = Store.get().manifest;
      if (!m.length) return;
      results = searchIndex(index, input.value); hi = results.length?0:-1; openPanel(); render();
    }
    if (!open) return;
    if (e.key === 'ArrowDown'){ e.preventDefault(); hi = (hi + 1 + results.length) % results.length; render(); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); hi = (hi - 1 + results.length) % results.length; render(); }
    else if (e.key === 'Enter'){ e.preventDefault(); const m = results[hi]; if (m) { closePanel(); input.blur(); loadMechFromUrl(m.url); } }
    else if (e.key === 'Escape'){ closePanel(); }
  });

  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) closePanel(); });

  // Manifest loading hooks
  btnLoadManifest?.addEventListener('click', async () => {
    await loadManifest();
    index = buildIndex(Store.get().manifest);
  });
  input.addEventListener('focus', async () => {
    if (!Store.get().manifest.length) { await loadManifest(); index = buildIndex(Store.get().manifest); }
  });

  // Auto-load once (optional)
  if (!Store.get().manifest.length) (async ()=>{ await loadManifest(); index = buildIndex(Store.get().manifest); })();
}
