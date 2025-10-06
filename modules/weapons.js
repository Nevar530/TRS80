// /modules/weapons.js
// Island module: owns the Weapons tab markup + rendering from mech data.

let rootEl = null;

export function mount(root) {
  rootEl = getEl(root);
  if (!rootEl) { console.warn("[weapons] mount root not found:", root); return; }
  rootEl.classList.add("mod-weapons");
  rootEl.innerHTML = `
    <div class="wep-wrap" style="padding:10px;">
      <table class="trs-table" id="wep-table">
        <thead>
          <tr>
            <th>Weapon</th><th>Loc</th><th>Heat</th><th>Dmg</th>
            <th>SR</th><th>MR</th><th>LR</th><th>Notes</th>
          </tr>
        </thead>
        <tbody id="wep-tbody"></tbody>
      </table>
    </div>
  `;
}

export function destroy(){ if (rootEl) rootEl.innerHTML = ""; }
export function clear(){ if (rootEl) rootEl.querySelector("#wep-tbody").innerHTML = ""; }

export function render(mech) {
  if (!rootEl || !mech) return clear();
  const list = normalizeWeapons(mech);
  const tb = rootEl.querySelector("#wep-tbody");
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="8">—</td></tr>`;
    return;
  }
  tb.innerHTML = list.map(w => row(w)).join("");
}

/* ---------------- helpers ---------------- */
function row(w){
  const name = esc(w.name ?? w.item ?? "—");
  const loc  = esc(w.location ?? w.loc ?? "");
  const heat = esc(w.heat ?? w.heatPerShot ?? "—");
  const dmg  = esc(w.damage ?? w.dmg ?? "—");
  const sr   = esc(w.short ?? w.sr ?? "—");
  const mr   = esc(w.medium ?? w.mr ?? "—");
  const lr   = esc(w.long ?? w.lr ?? "—");
  const notes= esc(w.notes ?? w.special ?? "");
  return `<tr>
    <td>${name}</td><td>${loc}</td><td>${heat}</td><td>${dmg}</td>
    <td>${sr}</td><td>${mr}</td><td>${lr}</td><td>${notes}</td>
  </tr>`;
}
function normalizeWeapons(m){ const arr=(m?.weapons ?? m?.armaments ?? []); return arr.map(w=> typeof w==="string" ? {name:w} : w); }
function getEl(x){ return (typeof x === "string") ? document.querySelector(x) : x; }
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }
