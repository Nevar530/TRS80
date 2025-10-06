/* script.js (replacement) — ES Module
   Requires: <script type="module" src="./script.js"></script>
   Modules expected in ./modules/: techreadout.js, gator.js, weapons.js, lance.js, owned.js, images.js
*/

import * as TechReadout from './modules/techreadout.js';
import * as GATOR      from './modules/gator.js';
import * as Weapons    from './modules/weapons.js';

// Existing modules you already have:
import * as Lance      from './modules/lance.js';
import * as Owned      from './modules/owned.js';
import * as Images     from './modules/images.js';

/* ------------------------------ Config: selectors ------------------------------ */
const SEL = {
  // Sidebar / list
  side: {
    root:        '#sidebar',         // <aside> or container for the mech list (optional)
    list:        '#mech-list',       // <ul> or <div> list of mechs
    search:      '#side-search',     // <input> for text search
    count:       '#list-count',      // <span> results count (optional)
    filterBtn:   '#btn-filter',      // opens filter modal (optional)
    drawerScrim: '#side-scrim'       // mobile scrim (optional)
  },

  // Tabs → containers each module will fill (IDs should already exist in your HTML)
  tabs: {
    tech:    '#tab-tech',
    weapons: '#tab-weapons',
    gator:   '#tab-gator'
  },

  // Tech Readout sub-sections (inside the Tech tab)
  tech: {
    chassis:   '#tech-chassis',
    armor:     '#tech-armor',
    equipment: '#tech-equipment',
    lore:      '#tech-lore'    // image will be injected at the top of this section
  },

  // G.A.T.O.R. inputs / outputs (inside GATOR tab)
  gator: {
    gunnery:   '#gator-gunnery',
    attMove:   '#gator-att-move',
    tgtMove:   '#gator-tgt-move',
    range:     '#gator-range',
    other:     '#gator-other',
    total:     '#gator-total',
    breakdown: '#gator-breakdown'
  },

  // Topbar buttons (optional – wired if present)
  topbar: {
    openLance: '#btn-open-lance',
    openOwned: '#btn-open-owned',
    addToLance:'#btn-add-current',
    importBtn: '#btn-import-session',
    exportBtn: '#btn-export-session',
    settings:  '#btn-settings',
    about:     '#btn-about'
  },

  // Toast (optional)
  toast: '#toast'
};

/* ------------------------------ App state ------------------------------ */
const state = {
  manifest: [],        // array of entries { file?, displayName?, name, model, path, ... }
  filtered: [],        // filtered manifest
  current: null,       // current manifest entry
  mech: null,          // current mech JSON (raw/normalized enough for modules)
  filters: {
    text: '',
    ownedOnly: false,
    // (Optional) you can add techbase/weight/role filters here; applyFilters() will use them if present.
  }
};

/* ------------------------------ Utilities ------------------------------ */
const $  = (sel, root = document) => (typeof sel === 'string' ? root.querySelector(sel) : sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function toast(msg, ms = 1600){
  const el = $(SEL.toast);
  if (!el) { console.info('[toast]', msg); return; }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(()=> el.classList.remove('show'), ms);
}

function displayNameOf(entry){
  return entry.displayName || [entry.name, entry.model].filter(Boolean).join(' ') || entry.file || '—';
}

function mechKey(entry){
  // stable key for maps: prefer path or "name|model"
  return entry.path || `${entry.name || ''}|${entry.model || ''}`;
}

/* ------------------------------ Bootstrap ------------------------------ */
document.addEventListener('DOMContentLoaded', init);

async function init(){
  // Initialize modules (Tech pulls art from Images; limit image height inside lore)
  TechReadout.init({
    containers: {
      chassis:   $(SEL.tech.chassis),
      armor:     $(SEL.tech.armor),
      equipment: $(SEL.tech.equipment),
      lore:      $(SEL.tech.lore)
    },
    images: {
      getFor: Images.getFor   // your existing images.js API
    },
    imageMaxHeight: 320
  });

  GATOR.init({
    selectors: {
      gunnery:   SEL.gator.gunnery,
      attMove:   SEL.gator.attMove,
      tgtMove:   SEL.gator.tgtMove,
      range:     SEL.gator.range,
      other:     SEL.gator.other,
      total:     SEL.gator.total,
      breakdown: SEL.gator.breakdown
    },
    clampMin: 2
  });

  Weapons.init({
    container: $(SEL.tabs.weapons)
    // resolveWeapon: optional resolver if you have a DB → (abbrOrName) => meta
  });

  // Features (existing)
  Lance.init?.();
  Owned.init?.({
    onFilterToggle: (ownedOnly) => {
      state.filters.ownedOnly = !!ownedOnly;
      applyFilters();
      renderList();
    }
  });

  wireTopbar();
  wireSidebar();

  await loadManifest();
  applyFilters();
  renderList();

  // Optionally, focus search on desktop
  const search = $(SEL.side.search);
  if (search && window.matchMedia('(pointer:fine)').matches) {
    search.focus();
  }

  toast('Manifest loaded');
}

/* ------------------------------ Data loading ------------------------------ */
async function loadManifest(){
  try {
    const res = await fetch('data/manifest.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // Expecting an array; if object with property, adjust here.
    state.manifest = Array.isArray(json) ? json : (json?.items || []);
  } catch (err) {
    console.error('Failed to load manifest:', err);
    state.manifest = [];
  }
}

/* ------------------------------ Sidebar / filters ------------------------------ */
function wireSidebar(){
  const search = $(SEL.side.search);
  if (search){
    search.addEventListener('input', () => {
      state.filters.text = (search.value || '').trim();
      applyFilters();
      renderList();
    });
  }

  // If you have a Filter button & modal, wire it here (optional)
  const filterBtn = $(SEL.side.filterBtn);
  if (filterBtn){
    filterBtn.addEventListener('click', () => {
      // open your existing modal here (no change to your modal code)
      // when filters apply, call applyFilters(); renderList();
      // For now, we just re-run with current ownedOnly/text.
      applyFilters();
      renderList();
    });
  }
}

function applyFilters(){
  const text = state.filters.text.toLowerCase();
  const ownedOnly = !!state.filters.ownedOnly;

  state.filtered = state.manifest.filter(entry => {
    if (text){
      const hay = [
        displayNameOf(entry),
        entry.name, entry.model, entry.role, entry.techBase
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(text)) return false;
    }
    if (ownedOnly){
      const chassisName = entry.name || displayNameOf(entry);
      if (typeof Owned.isOwned === 'function'){
        if (!Owned.isOwned(chassisName)) return false;
      }
    }
    // (Optional) add tech base / weight / role filtering here if you already have UI controls
    return true;
  });
}

function renderList(){
  const listEl = $(SEL.side.list);
  if (!listEl) return;

  const items = state.filtered.length ? state.filtered : state.manifest;

  listEl.innerHTML = items.map((e, idx) => {
    const name = displayNameOf(e);
    const role = e.role ? `<span class="role">${escapeHtml(e.role)}</span>` : '';
    const mass = (e.mass != null) ? `<span class="mass">${e.mass}t</span>` : '';
    // Mark owned if available
    const isOwned = typeof Owned.isOwned === 'function' && Owned.isOwned(e.name || name);
    const star = isOwned ? '★ ' : '';
    return `
      <li class="mech-row" data-key="${escapeAttr(mechKey(e))}" tabindex="0" role="option" aria-label="${escapeAttr(name)}">
        <div class="title">${star}${escapeHtml(name)}</div>
        <div class="meta">${mass}${role}</div>
      </li>`;
  }).join('');

  // count label
  const countEl = $(SEL.side.count);
  if (countEl){
    const n = items.length;
    countEl.textContent = `${n} mech${n===1?'':'s'}`;
  }

  // selection wiring
  $$('.mech-row', listEl).forEach(li => {
    li.addEventListener('click', onRowSelect);
    li.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onRowSelect.call(li, ev); }
    });
  });
}

async function onRowSelect(){
  const key = this.getAttribute('data-key');
  const entry = (state.filtered.length ? state.filtered : state.manifest)
    .find(e => mechKey(e) === key);
  if (!entry) return;

  await loadMech(entry);
}

/* ------------------------------ Load a mech ------------------------------ */
async function loadMech(entry){
  try {
    // fetch JSON
    const url = normalizeDataPath(entry);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    const mech = await res.json();

    state.current = entry;
    state.mech = mech;

    // Render tabs
    await updatePanels();

    toast(`Loaded: ${displayNameOf(entry)}`);
  } catch (err) {
    console.error('Failed to load mech JSON:', err);
    toast('Failed to load mech');
  }
}

function normalizeDataPath(entry){
  // manifest entry may contain "path" pointing under data/
  // If path looks relative, prefix with "data/"
  const p = entry.path || entry.file || '';
  if (!p) return '';
  return /^https?:\/\//i.test(p) ? p : `data/${p}`;
}

/* ------------------------------ Render panels ------------------------------ */
async function updatePanels(){
  const mech = state.mech;

  // Tech Readout (includes image inside Lore & History)
  if (mech) {
    await TechReadout.render(mech);
  } else {
    TechReadout.clear();
  }

  // Weapons
  Weapons.render(mech || null);

  // G.A.T.O.R.
  GATOR.render(mech || null);
}

/* ------------------------------ Topbar actions ------------------------------ */
function wireTopbar(){
  const openLance = $(SEL.topbar.openLance);
  if (openLance && typeof Lance.open === 'function'){
    openLance.addEventListener('click', () => Lance.open());
  }

  const openOwned = $(SEL.topbar.openOwned);
  if (openOwned && typeof Owned.open === 'function'){
    openOwned.addEventListener('click', () => Owned.open());
  }

  const addToLance = $(SEL.topbar.addToLance);
  if (addToLance && typeof Lance.addCurrent === 'function'){
    addToLance.addEventListener('click', () => {
      if (!state.mech) { toast('Select a mech first'); return; }
      Lance.addCurrent({
        // pass through a minimal payload used by your Lance module
        name: state.mech.displayName || [state.mech.name, state.mech.model].filter(Boolean).join(' '),
        mech: state.mech,
        manifest: state.current || null
      });
      toast('Added to Lance');
    });
  }

  const importBtn = $(SEL.topbar.importBtn);
  if (importBtn){
    importBtn.addEventListener('click', async () => {
      try {
        const text = await promptFileOpen('.json');
        if (!text) return;
        const payload = JSON.parse(text);

        // Restore minimal session: search, ownedOnly, last selected mech path
        if (payload.filters){
          state.filters.text = payload.filters.text || '';
          const search = $(SEL.side.search);
          if (search) search.value = state.filters.text;
          state.filters.ownedOnly = !!payload.filters.ownedOnly;
        }
        applyFilters();
        renderList();

        if (payload.selectedPath){
          const entry = state.manifest.find(e => (e.path || e.file) === payload.selectedPath);
          if (entry) await loadMech(entry);
        }

        // Optionally hand off to Lance/Owned modules if they expose importers
        if (payload.lance && typeof Lance.import === 'function'){
          Lance.import(payload.lance);
        }
        if (payload.owned && typeof Owned.import === 'function'){
          Owned.import(payload.owned);
        }

        toast('Session imported');
      } catch (e){
        console.error(e);
        toast('Import failed');
      }
    });
  }

  const exportBtn = $(SEL.topbar.exportBtn);
  if (exportBtn){
    exportBtn.addEventListener('click', async () => {
      const payload = {
        version: 1,
        selectedPath: state.current?.path || state.current?.file || null,
        filters: {
          text: state.filters.text,
          ownedOnly: state.filters.ownedOnly
        }
      };
      // Optionally include Lance/Owned state if modules expose exporters
      if (typeof Lance.export === 'function') payload.lance = Lance.export();
      if (typeof Owned.export === 'function') payload.owned = Owned.export();

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const dt   = new Date();
      const fn   = `trs80-session-${dt.toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
      downloadURL(url, fn);
      setTimeout(()=> URL.revokeObjectURL(url), 2500);

      toast('Session exported');
    });
  }
}

/* ------------------------------ File helpers (import/export) ------------------------------ */
function promptFileOpen(accept = '.json'){
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
    input.click();
  });
}

function downloadURL(url, filename){
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ------------------------------ Escaping ------------------------------ */
function escapeHtml(v){
  return String(v ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[m]);
}
function escapeAttr(v){ return escapeHtml(v); }

/* ------------------------------ Legacy window.App surface (optional) ------------------------------ */
window.App = Object.assign(window.App || {}, {
  // For external buttons that might call into the app:
  selectByPath: async (path) => {
    const entry = state.manifest.find(e => (e.path || e.file) === path);
    if (entry) await loadMech(entry);
  },
  refreshList: () => { applyFilters(); renderList(); },
  addCurrentToLance: () => {
    if (!state.mech || typeof Lance.addCurrent !== 'function') return;
    Lance.addCurrent({
      name: state.mech.displayName || [state.mech.name, state.mech.model].filter(Boolean).join(' '),
      mech: state.mech, manifest: state.current || null
    });
  },
  // Expose modules (debug-friendly)
  TechReadout, GATOR, Weapons, Lance, Owned, Images
});
