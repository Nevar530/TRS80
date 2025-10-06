// /modules/sidebar.js
// Island module: owns sidebar + filter modal + manifest loading + list + search + filter.
// Emits selected mech via onSelect callback.

const DEFAULTS = {
  manifestUrl: "./data/manifest.json",
  selectors: {
    // Optional external controls (if present in topbar)
    toggleBtn: "#btn-side-toggle",
    loadManifestBtn: "#btn-load-manifest"
  },
  onSelect: (mechObj) => {}, // injected by script.js
  onManifestLoaded: (count) => {},
  filterHost: "body", // where to inject modal (keep "body")
  ownedResolver: null // optional: (chassisName) => boolean to show owned stars
};

let cfg = { ...DEFAULTS };
let mountEl = null;  // <aside> target
let scrimEl = null;  // overlay for mobile
let modalEl = null;  // filter modal
let manifest = [];   // raw manifest entries
let filtered = [];   // filtered entries
let searchTerm = "";
let filterState = {
  tech: "",      // "" | "Inner Sphere" | "Clan"
  rules: "",     // "" | 1..4
  jump: false,
  minWalk: null, // number|null
  bvMin: null,
  bvMax: null,
  classes: new Set(), // 'L','M','H','A'
  roles: new Set(),
  source: ""     // exact string match if set
};

export function mount(root, options = {}) {
  cfg = deepMerge(DEFAULTS, options);
  mountEl = getEl(root);

  if (!mountEl) {
    console.warn("[sidebar] mount root not found:", root);
    return;
  }

  // Scrim stays sibling of sidebar
  scrimEl = document.getElementById("sidebar-scrim");
  if (!scrimEl) {
    scrimEl = document.createElement("div");
    scrimEl.id = "sidebar-scrim";
    scrimEl.hidden = true;
    mountEl.insertAdjacentElement("afterend", scrimEl);
  }

  // Inject sidebar markup (self-contained)
  mountEl.setAttribute("aria-label", "Mech List");
  mountEl.classList.add("mod-sidebar");
  mountEl.innerHTML = `
    <div class="panel">
      <div class="panel-h" style="gap:8px;">
        <input id="side-search" type="search" placeholder="Search mechs…" autocomplete="off" spellcheck="false" />
        <button id="btn-side-filter" class="btn sm ghost" title="Open filters">Filter</button>
      </div>
      <div class="panel-c">
        <div id="mech-list" role="listbox" aria-label="Mechs" tabindex="0"></div>
      </div>
    </div>
  `;

  // Inject filter modal (if not already present)
  modalEl = document.getElementById("filter-modal");
  if (!modalEl) {
    modalEl = createFilterModal();
    const host = getEl(cfg.filterHost) || document.body;
    host.appendChild(modalEl);
  }

  bindSidebarEvents();
  bindExternalButtons();

  // Try to load manifest immediately (safe, idempotent)
  loadManifest();
}

export function destroy() {
  if (!mountEl) return;
  unbindExternalButtons();
  // Remove injected modal only if we created it
  if (modalEl && modalEl.dataset.owner === "sidebar") {
    modalEl.remove();
  }
  mountEl.innerHTML = "";
}

export function clear() {
  const list = mountEl.querySelector("#mech-list");
  if (list) list.innerHTML = "";
}

/* -------------------- Internals -------------------- */

function bindSidebarEvents() {
  const search = mountEl.querySelector("#side-search");
  const btnFilter = mountEl.querySelector("#btn-side-filter");
  const list = mountEl.querySelector("#mech-list");

  search?.addEventListener("input", () => {
    searchTerm = (search.value || "").trim().toLowerCase();
    renderList();
  });

  btnFilter?.addEventListener("click", openFilter);

  list?.addEventListener("click", async (e) => {
    const row = e.target.closest("[data-url]");
    if (!row) return;
    await selectFromRow(row);
  });

  list?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const row = document.activeElement?.closest?.("[data-url]");
      if (row) {
        e.preventDefault();
        await selectFromRow(row);
      }
    }
  });

  // Drawer open/close (mobile)
  scrimEl?.addEventListener("click", closeDrawer);
}

function bindExternalButtons() {
  const t = q(cfg.selectors.toggleBtn);
  const l = q(cfg.selectors.loadManifestBtn);
  if (t) t.addEventListener("click", toggleDrawer);
  if (l) l.addEventListener("click", loadManifest);
}

function unbindExternalButtons() {
  const t = q(cfg.selectors.toggleBtn);
  const l = q(cfg.selectors.loadManifestBtn);
  if (t) t.removeEventListener("click", toggleDrawer);
  if (l) l.removeEventListener("click", loadManifest);
}

function toggleDrawer() {
  const isOpen = mountEl.classList.toggle("is-open");
  scrimEl.hidden = !isOpen;
  const btn = q(cfg.selectors.toggleBtn);
  if (btn) btn.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) {
    const s = mountEl.querySelector("#side-search");
    setTimeout(()=> s?.focus(), 0);
  }
}
function closeDrawer() {
  mountEl.classList.remove("is-open");
  scrimEl.hidden = true;
  const btn = q(cfg.selectors.toggleBtn);
  if (btn) btn.setAttribute("aria-expanded", "false");
}

async function loadManifest() {
  try {
    const res = await fetch(cfg.manifestUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Allow both array and object formats
    manifest = Array.isArray(data) ? data : (data?.items || data?.mechs || []);
    filtered = manifest.slice(0);

    cfg.onManifestLoaded?.(filtered.length);
    toast(`Manifest loaded — ${filtered.length} mechs`);
    renderList();
  } catch (err) {
    console.error("[sidebar] manifest load failed", err);
    toast("Failed to load manifest");
  }
}

async function selectFromRow(row) {
  const url = row.dataset.url || row.dataset.path || row.dataset.file;
  if (!url) return;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const mech = await res.json();

    // Pass raw mech; downstream modules are resilient to field aliases
    cfg.onSelect?.(mech);

    // Close drawer on small screens
    closeDrawer();
  } catch (err) {
    console.error("[sidebar] mech load failed", err);
    toast("Failed to load mech");
  }
}

function renderList() {
  const list = mountEl.querySelector("#mech-list");
  if (!list) return;

  const rows = applyFilters(manifest).filter(m => {
    if (!searchTerm) return true;
    const hay = ([
      m.displayName || "",
      m.name || "",
      m.model || "",
      m.role || "",
      m.techBase || "",
      m.source || "",
    ].join(" ")).toLowerCase();
    return hay.includes(searchTerm);
  });

  list.innerHTML = rows.map((m) => rowHtml(m, !!cfg.ownedResolver?.(m.name || m.displayName || ""))).join("");
}

function rowHtml(m, owned) {
  const name = esc(m.displayName || [m.name, m.model].filter(Boolean).join(" ") || "—");
  const tons = esc(m.mass || m.tonnage || "—");
  const role = esc(m.role || "");
  const src  = esc(m.source || "");
  const url  = esc(m.url || m.path || m.file || m.href || "");

  return `
    <div class="mech-row" tabindex="0" role="option" data-url="${url}">
      <div class="mech-row__title mono">
        ${owned ? "★ " : ""}${name}
      </div>
      <div class="mech-row__meta small dim">
        <span>${tons} t</span>
        ${role ? `<span>• ${role}</span>` : ""}
        ${src  ? `<span>• ${src}</span>` : ""}
      </div>
    </div>
  `;
}

/* -------------------- Filters -------------------- */

function createFilterModal() {
  const el = document.createElement("div");
  el.id = "filter-modal";
  el.className = "modal";
  el.role = "dialog";
  el.ariaModal = "true";
  el.hidden = true;
  el.dataset.owner = "sidebar";
  el.innerHTML = `
    <div class="modal-card" role="document">
      <header class="modal-h">
        <h2 id="filter-title">Filter Mechs</h2>
        <button id="filter-close" class="icon-btn" aria-label="Close">✕</button>
      </header>
      <div class="modal-c small">
        <div class="filter-grid">
          <fieldset>
            <legend class="dim">Tech Base</legend>
            <select id="f-tech" class="gtr-sel">
              <option value="">Any</option>
              <option>Inner Sphere</option>
              <option>Clan</option>
            </select>
          </fieldset>
          <fieldset>
            <legend class="dim">Rules Level</legend>
            <select id="f-rules" class="gtr-sel">
              <option value="">Any</option>
              <option value="1">Introductory (Level 1)</option>
              <option value="2">Standard (Level 2)</option>
              <option value="3">Advanced (Level 3)</option>
              <option value="4">Experimental (Level 4)</option>
            </select>
          </fieldset>
          <fieldset>
            <legend class="dim">Weight Class</legend>
            <div class="weight-choices">
              <label class="chk"><input type="checkbox" id="f-class-L"> Light</label>
              <label class="chk"><input type="checkbox" id="f-class-M"> Medium</label>
              <label class="chk"><input type="checkbox" id="f-class-H"> Heavy</label>
              <label class="chk"><input type="checkbox" id="f-class-A"> Assault</label>
            </div>
          </fieldset>
          <fieldset>
            <legend class="dim">Mobility</legend>
            <label class="chk" style="display:inline-block;margin-right:12px;">
              <input type="checkbox" id="f-jump"> Can Jump
            </label>
            <div style="margin-top:8px;">
              <label class="dim" for="f-minwalk" style="display:block;margin-bottom:4px;">Min Walk (MP)</label>
              <input id="f-minwalk" class="gtr-in tiny" type="number" min="0" step="1" placeholder="Any">
            </div>
          </fieldset>
          <fieldset>
            <legend class="dim">Battle Value (BV)</legend>
            <div class="bv-range">
              <div>
                <label class="dim small" for="f-bv-min">Min</label>
                <input id="f-bv-min" class="gtr-in tiny" type="number" min="0" step="1" placeholder="Any">
              </div>
              <div>
                <label class="dim small" for="f-bv-max">Max</label>
                <input id="f-bv-max" class="gtr-in tiny" type="number" min="0" step="1" placeholder="Any">
              </div>
            </div>
          </fieldset>
          <fieldset class="roles">
            <legend class="dim">Role</legend>
            <div class="role-grid">
              ${["missile boat","scout","juggernaut","sniper","brawler","skirmisher","striker","ambusher","none"]
                .map(r => `<label><input type="checkbox" class="f-role" data-role="${r}"> ${cap(r)}</label>`).join("")}
            </div>
          </fieldset>
          <fieldset class="source">
            <legend class="dim">Source</legend>
            <select id="f-source" class="gtr-sel">
              <option value="">Any</option>
            </select>
          </fieldset>
        </div>
        <div class="dim small" style="margin-top:10px;">
          Filters apply to the search list. Use the search box to narrow further.
        </div>
      </div>
      <footer class="modal-f" style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="filter-clear" class="btn ghost sm">Clear</button>
        <button id="filter-apply" class="btn sm">Apply</button>
      </footer>
    </div>
  `;

  // Wire modal events
  el.querySelector("#filter-close")?.addEventListener("click", () => closeModal(el));
  el.querySelector("#filter-clear")?.addEventListener("click", () => {
    filterState = { ...filterState, tech:"", rules:"", jump:false, minWalk:null, bvMin:null, bvMax:null,
      classes:new Set(), roles:new Set(), source:"" };
    persistControls(el);
  });
  el.querySelector("#filter-apply")?.addEventListener("click", () => {
    readControls(el);
    renderList();
    closeModal(el);
  });

  return el;
}

function openFilter() {
  if (!modalEl) return;
  populateSources(modalEl);
  persistControls(modalEl);
  modalEl.hidden = false;
  setTimeout(()=> modalEl.querySelector("#f-tech")?.focus(), 0);
}
function closeModal(el) {
  el.hidden = true;
}

function populateSources(el) {
  const sel = el.querySelector("#f-source");
  if (!sel) return;
  const values = new Set();
  manifest.forEach(m => {
    if (m.source) values.add(String(m.source));
  });
  const opts = [...values].sort(collate).map(v => `<option>${esc(v)}</option>`).join("");
  sel.innerHTML = `<option value="">Any</option>${opts}`;
}

function readControls(el) {
  filterState.tech = val(el, "#f-tech");
  filterState.rules = val(el, "#f-rules");
  filterState.jump = checked(el, "#f-jump");
  filterState.minWalk = num(el, "#f-minwalk");
  filterState.bvMin = num(el, "#f-bv-min");
  filterState.bvMax = num(el, "#f-bv-max");
  filterState.classes = new Set(["L","M","H","A"].filter(c => checked(el, `#f-class-${c}`)));
  filterState.roles = new Set([...el.querySelectorAll(".f-role:checked")].map(i => i.dataset.role));
  filterState.source = val(el, "#f-source");
}
function persistControls(el) {
  setVal(el, "#f-tech", filterState.tech);
  setVal(el, "#f-rules", filterState.rules);
  setChecked(el, "#f-jump", filterState.jump);
  setVal(el, "#f-minwalk", filterState.minWalk ?? "");
  setVal(el, "#f-bv-min", filterState.bvMin ?? "");
  setVal(el, "#f-bv-max", filterState.bvMax ?? "");
  ["L","M","H","A"].forEach(c => setChecked(el, `#f-class-${c}`, filterState.classes.has(c)));
  el.querySelectorAll(".f-role").forEach(i => i.checked = filterState.roles.has(i.dataset.role));
  setVal(el, "#f-source", filterState.source ?? "");
}

function applyFilters(items) {
  let arr = items.slice(0);
  const F = filterState;

  arr = arr.filter(m => {
    if (F.tech && (m.techBase !== F.tech)) return false;
    if (F.rules && String(m.rules || m.rulesLevel || "") !== String(F.rules)) return false;
    if (F.source && (m.source !== F.source)) return false;

    const mass = Number(m.mass || m.tonnage || 0);
    if (F.classes.size) {
      const cls = mass < 40 ? "L" : mass < 60 ? "M" : mass < 80 ? "H" : "A";
      if (!F.classes.has(cls)) return false;
    }

    if (F.minWalk != null) {
      const walk = Number(m.movement?.walk ?? m.walk ?? 0);
      if (!Number.isNaN(F.minWalk) && walk < F.minWalk) return false;
    }

    if (F.jump) {
      const j = Number(m.movement?.jump ?? m.jump ?? 0);
      if (!j) return false;
    }

    const bv = Number(m.bv || m.battleValue || 0);
    if (F.bvMin != null && !Number.isNaN(F.bvMin) && bv < F.bvMin) return false;
    if (F.bvMax != null && !Number.isNaN(F.bvMax) && bv > F.bvMax) return false;

    if (F.roles.size) {
      const role = (m.role || "").toLowerCase();
      if (![...F.roles].some(r => role.includes(r))) return false;
    }

    return true;
  });

  filtered = arr;
  return arr;
}

/* -------------------- Utils -------------------- */

function q(sel){ return sel ? document.querySelector(sel) : null; }
function getEl(x){ return (typeof x === "string") ? document.querySelector(x) : x; }
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(msg){
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._hide);
  t._hide = setTimeout(()=> t.hidden = true, 1800);
}
function deepMerge(base, patch){
  const out = { ...base };
  for (const k in patch) {
    if (patch[k] && typeof patch[k] === "object" && !Array.isArray(patch[k])) {
      out[k] = deepMerge(base[k] || {}, patch[k]);
    } else out[k] = patch[k];
  }
  return out;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
function collate(a,b){ return collator.compare(String(a), String(b)); }

function val(root, sel){ const el = root.querySelector(sel); return el ? el.value : ""; }
function setVal(root, sel, v){ const el = root.querySelector(sel); if (el) el.value = v ?? ""; }
function checked(root, sel){ const el = root.querySelector(sel); return !!el?.checked; }
function setChecked(root, sel, v){ const el = root.querySelector(sel); if (el) el.checked = !!v; }
function num(root, sel){ const v = val(root, sel); const n = Number(v); return Number.isFinite(n) ? n : null; }
function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
