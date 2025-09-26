/* ===== TRS:80 – Owned Chassis (drop-in module) ===== */
(() => {
  'use strict';

  const STORAGE_KEY = 'trs80:owned@1';

  // ------- internal state -------
  let hooks = {
    getManifest: () => [],
    applyOwnedFilter: (on) => {}
  };
  let owned = new Set();      // chassis names
  let isFilterOn = false;     // UI toggle state
  let chassisIndex = [];      // [{ name, count }]
  let dom = {};               // refs

  // ------- storage -------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && data.v === 1 && Array.isArray(data.owned)) {
        owned = new Set(data.owned.map(String));
      }
    } catch (e) { /* ignore */ }
  }
  function save() {
    try {
      const payload = { v: 1, owned: Array.from(owned), updatedAt: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) { /* ignore */ }
  }

  // ------- manifest → chassis list -------
  function buildChassisIndex() {
    const manifest = Array.isArray(hooks.getManifest?.()) ? hooks.getManifest() : [];
    const map = new Map();
    for (const m of manifest) {
      const name = (m?.name || '').trim();
      if (!name) continue;
      map.set(name, (map.get(name) || 0) + 1);
    }
    chassisIndex = Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  // ------- DOM helpers -------
  const $ = (sel, root=document) => root.querySelector(sel);
  const el = (tag, attrs={}, html='') => {
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    if (html) n.innerHTML = html;
    return n;
  };

  function ensureDock() {
    let dock = document.getElementById('owned-dock');
    if (!dock) {
      // fallback: create inside .col-right if user forgot to add it
      const right = document.querySelector('.col-right') || document.body;
      dock = el('div', { id:'owned-dock', hidden:'' });
      right.prepend(dock);
    }
    return dock;
  }

  // ------- minimal styles (scoped) -------
  function injectCss() {
    if (document.getElementById('owned-css')) return;
    const st = el('style', { id:'owned-css' }); st.textContent = `
#owned-dock{background:var(--panel);border:1px solid var(--border);border-radius:8px;margin:0 0 12px 0}
#owned-dock .od-h{display:flex;align-items:center;gap:8px;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border)}
#owned-dock .od-title{font-weight:700}
#owned-dock .od-c{padding:8px 10px}
#owned-dock .od-f{display:flex;gap:8px;justify-content:flex-end;padding:8px 10px;border-top:1px solid var(--border)}
#owned-search{width:220px;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:#0e1522;color:var(--ink)}
#owned-list{max-height:42vh;overflow:auto;border:1px solid var(--border);border-radius:6px}
#owned-list .row{display:flex;align-items:center;gap:10px;padding:6px 8px;border-bottom:1px solid var(--border)}
#owned-list .row:last-child{border-bottom:0}
#owned-list .row .name{font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#owned-list .row .count{margin-left:auto;opacity:.65;font-size:12px}
#owned-dock .btn.sm{padding:4px 8px;font-size:13px}
#owned-empty{padding:8px 10px}
.toggle{display:flex;align-items:center;gap:8px}
    `;
    document.head.appendChild(st);
  }

  // ------- render -------
  function renderList(filter='') {
    const host = dom.list;
    if (!host) return;
    const q = filter.trim().toLowerCase();
    const src = chassisIndex.filter(c => !q || c.name.toLowerCase().includes(q));
    if (!src.length) {
      host.innerHTML = `<div class="dim small" id="owned-empty">No chassis${q ? ' match' : ''}.</div>`;
      return;
    }

    host.innerHTML = src.map(c => {
      const checked = owned.has(c.name) ? 'checked' : '';
      return `<div class="row">
        <label class="chk" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" data-chassis="${c.name.replace(/"/g,'&quot;')}" ${checked}>
          <span class="name" title="${c.name.replace(/"/g,'&quot;')}">${c.name}</span>
        </label>
        <span class="count mono small">(${c.count})</span>
      </div>`;
    }).join('');
  }

  function renderDock() {
    const dock = ensureDock();
    injectCss();

    dock.innerHTML = `
      <div class="od-h">
        <div class="od-title">Owned Chassis</div>
        <div class="toggle">
          <label class="chk small">
            <input type="checkbox" id="owned-filter-toggle"${isFilterOn ? ' checked' : ''}>
            Use Owned filter in list
          </label>
          <input id="owned-search" type="search" placeholder="Search chassis…" autocomplete="off" spellcheck="false">
          <div class="actions" style="display:flex;gap:6px;">
            <button id="owned-select-all" class="btn ghost sm" title="Select all">All</button>
            <button id="owned-clear-all" class="btn ghost sm" title="Clear all">None</button>
            <button id="owned-hide" class="btn ghost sm" title="Hide">Hide</button>
          </div>
        </div>
      </div>
      <div class="od-c">
        <div id="owned-list"></div>
      </div>
      <div class="od-f">
        <button id="owned-import" class="btn sm" title="Import JSON">Import</button>
        <button id="owned-export" class="btn sm" title="Export JSON">Export</button>
      </div>
    `;

    // refs
    dom = {
      dock,
      list: $('#owned-list', dock),
      search: $('#owned-search', dock),
      hideBtn: $('#owned-hide', dock),
      selectAll: $('#owned-select-all', dock),
      clearAll: $('#owned-clear-all', dock),
      imp: $('#owned-import', dock),
      exp: $('#owned-export', dock),
      filterToggle: $('#owned-filter-toggle', dock)
    };

    // events
    dom.search?.addEventListener('input', () => renderList(dom.search.value));
    dom.hideBtn?.addEventListener('click', () => close());
    dom.selectAll?.addEventListener('click', () => {
      for (const c of chassisIndex) owned.add(c.name);
      save(); renderList(dom.search.value);
    });
    dom.clearAll?.addEventListener('click', () => {
      owned.clear(); save(); renderList(dom.search.value);
    });
    dom.exp?.addEventListener('click', () => doExport());
    dom.imp?.addEventListener('click', () => doImport());
    dom.filterToggle?.addEventListener('change', () => {
      isFilterOn = !!dom.filterToggle.checked;
      try { hooks.applyOwnedFilter?.(isFilterOn); } catch {}
    });

    dom.list?.addEventListener('change', (e) => {
      const cb = e.target.closest('input[type="checkbox"][data-chassis]');
      if (!cb) return;
      const name = cb.getAttribute('data-chassis');
      if (!name) return;
      if (cb.checked) owned.add(name);
      else owned.delete(name);
      save();
    });

    // initial list
    renderList('');
  }

  // ------- import/export -------
  function doExport() {
    const payload = { v: 1, owned: Array.from(owned), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `owned_chassis_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function doImport() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || data.v !== 1 || !Array.isArray(data.owned)) throw new Error('Bad schema');
        owned = new Set(data.owned.map(String));
        save();
        renderList(dom.search?.value || '');
      } catch (e) {
        console.warn('[owned] import failed', e);
        alert('Import failed: invalid JSON structure.');
      }
    };
    input.click();
  }

  // ------- public API -------
  function open()  { const d = ensureDock(); d.hidden = false; }
  function close() { const d = ensureDock(); d.hidden = true; }
  function toggle(){ const d = ensureDock(); d.hidden = !d.hidden; }

  function isOwned(name) { return owned.has(String(name || '').trim()); }

  function init(opts = {}) {
    // store hooks
    hooks.getManifest = opts.getManifest || hooks.getManifest;
    hooks.applyOwnedFilter = opts.applyOwnedFilter || hooks.applyOwnedFilter;

    // wire button (module self-wires to avoid core edits)
    const btn = document.getElementById('btn-owned');
    if (btn && !btn._ownedHooked) {
      btn.addEventListener('click', () => {
        if (ensureDock().hidden) refreshAndShow();
        else close();
      });
      btn._ownedHooked = true;
    }

    // state
    load();
    buildChassisIndex();
    renderDock();
  }

  function refreshAndShow() {
    buildChassisIndex();
    renderDock();
    open();
  }

  // Expose globally
  window.Owned = { init, isOwned, open, close, toggle };
})();
