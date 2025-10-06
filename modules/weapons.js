// weapons.js
// Owns the Weapons tab: renders mech weapons exactly from provided data.
// No DB assumptions; optionally accept a resolver in init().

let cfg = {
  container: null,                 // selector or element for Weapons tab content
  resolveWeapon: null              // optional: (abbrOrName) => { name, notes, ... }
};

export function init(options = {}) {
  cfg = { ...cfg, ...options };
}

export function render(mech) {
  const root = getEl(cfg.container);
  if (!root) return;

  const list = normalizeWeapons(mech);
  if (!list.length) {
    root.innerHTML = `<div>—</div>`;
    return;
  }

  root.innerHTML = /* html */`
    <table class="trs-table">
      <thead>
        <tr>
          <th>Weapon</th>
          <th>Loc</th>
          <th>Heat</th>
          <th>Dmg</th>
          <th>SR</th>
          <th>MR</th>
          <th>LR</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(w => row(w)).join('')}
      </tbody>
    </table>
  `;
}

function row(w){
  const name = resolveName(w.name);
  const loc  = safe(w.location ?? w.loc ?? '');
  const heat = safe(w.heat ?? w.heatPerShot ?? '—');
  const dmg  = safe(w.damage ?? w.dmg ?? '—');
  const sr   = safe(w.short ?? w.sr ?? '—');
  const mr   = safe(w.medium ?? w.mr ?? '—');
  const lr   = safe(w.long ?? w.lr ?? '—');
  const notes= safe(w.notes ?? w.special ?? '');

  return `<tr>
    <td>${name}</td>
    <td>${loc}</td>
    <td>${heat}</td>
    <td>${dmg}</td>
    <td>${sr}</td>
    <td>${mr}</td>
    <td>${lr}</td>
    <td>${notes}</td>
  </tr>`;
}

function normalizeWeapons(mech){
  const arr = (mech?.weapons ?? mech?.armaments ?? []);
  return arr.map(w => (typeof w === 'string' ? { name: w } : w));
}

function resolveName(n){
  if (!n) return '—';
  if (typeof cfg.resolveWeapon === 'function') {
    const meta = cfg.resolveWeapon(n);
    if (meta && meta.name) return safe(meta.name);
  }
  return safe(n);
}

function getEl(selOrEl){
  if (!selOrEl) return null;
  return (typeof selOrEl === 'string') ? document.querySelector(selOrEl) : selOrEl;
}

function safe(v) {
  return String(v ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[m]);
}
