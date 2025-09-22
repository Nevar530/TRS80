/* ===== Gator Console – script.js (with manifest dropdown support) ===== */
(() => {
  'use strict';

  /* ---------- DOM refs ---------- */
  const btnLoadManifest = document.getElementById('btn-load-manifest');
  const btnSettings     = document.getElementById('btn-settings');
  const btnLoadMech     = document.getElementById('btn-load-mech');
  const btnCustomMech   = document.getElementById('btn-custom-mech');
  const btnImport       = document.getElementById('btn-import');
  const btnExport       = document.getElementById('btn-export');

  const mechDropdownWrap = document.createElement('div');
  mechDropdownWrap.style.marginLeft = '6px';
  const mechDropdown = document.createElement('select');
  mechDropdown.id = 'mech-dropdown';
  mechDropdown.className = 'btn ghost';
  mechDropdown.style.maxWidth = '180px';
  mechDropdown.innerHTML = `<option value="">— Select Mech —</option>`;
  mechDropdownWrap.appendChild(mechDropdown);
  document.querySelector('.actions--top').appendChild(mechDropdownWrap);

  /* ---------- State ---------- */
  let currentMech = null;
  let manifestData = null;

  /* ---------- Helpers ---------- */
  const toast = (msg, ms=2200) => {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.hidden = false;
    t.style.display = 'block';
    setTimeout(() => { t.hidden = true; t.style.display = 'none'; }, ms);
  };

  async function fetchManifest() {
    try {
      const res = await fetch('./data/manifest.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      manifestData = await res.json();
      toast('Manifest loaded.');
      populateDropdown();
    } catch (err) {
      console.error(err);
      toast('Failed to load manifest.');
    }
  }

  function populateDropdown() {
    if (!manifestData) return;
    mechDropdown.innerHTML = `<option value="">— Select Mech —</option>`;
    manifestData.forEach(entry => {
      const opt = document.createElement('option');
      opt.value = entry.path;
      opt.textContent = entry.displayName || entry.name || entry.path;
      mechDropdown.appendChild(opt);
    });
  }

  async function loadMechFromPath(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const mech = await res.json();
      currentMech = mech;
      updateOverview(mech);
      updateTechReadout(mech);
      toast(mech.displayName || mech.Name || 'Mech loaded.');
    } catch (err) {
      console.error(err);
      toast('Failed to load mech JSON.');
    }
  }

  function updateOverview(mech) {
    document.getElementById('ov-mech').textContent = mech.Name || '—';
    document.getElementById('ov-variant').textContent = mech.Model || '—';
    document.getElementById('ov-tons').textContent = mech.Tonnage || '—';
    document.getElementById('ov-pilot').textContent = mech.Pilot || '—';
    document.getElementById('ov-gun').textContent = mech.Gunnery || '—';
    document.getElementById('ov-pil').textContent = mech.Piloting || '—';
    document.getElementById('ov-move').textContent = mech.Movement || '—';
    document.getElementById('ov-weps').textContent =
      mech.Weapons ? mech.Weapons.map(w => w.Name).join(', ') : '—';
    document.getElementById('heat-cap').textContent = mech.HeatSinks || '—';
    document.getElementById('heat-now').textContent = '0';
    document.getElementById('vheat-fill').style.height = '0%';
  }

  function updateTechReadout(mech) {
    const wrap = document.getElementById('techout');
    if (!wrap) return;
    wrap.innerHTML = '';
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(mech, null, 2);
    wrap.appendChild(pre);
  }

  /* ---------- Events ---------- */
  btnLoadManifest?.addEventListener('click', fetchManifest);

  mechDropdown.addEventListener('change', e => {
    if (e.target.value) loadMechFromPath(e.target.value);
  });

  btnSettings?.addEventListener('click', () => {
    document.getElementById('settings-modal').hidden = false;
  });
  document.getElementById('modal-close')?.addEventListener('click', () => {
    document.getElementById('settings-modal').hidden = true;
  });
  document.getElementById('modal-ok')?.addEventListener('click', () => {
    document.getElementById('settings-modal').hidden = true;
  });

  /* Build info line */
  document.querySelector('[data-build-ts]')?.textContent =
    new Date().toLocaleString();
})();