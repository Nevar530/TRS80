// script.js  (ES module)
// Make sure index.html uses: <script type="module" src="./script.js"></script>

import * as Sidebar from "./modules/sidebar.js";
import * as Tech from "./modules/techreadout.js";
import * as Gator from "./modules/gator.js";
import * as Weapons from "./modules/weapons.js";
import * as Lance from "./modules/lance.js";
import * as Owned from "./modules/owned.js";
import * as Images from "./modules/images.js";

/* --------------------------- App State --------------------------- */
const state = {
  mech: null,
  bootDone: false,
};

/* ------------------------- Bootstrapping ------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  wireTabs();
  wireSettingsModal();
  wireImportExport();
  wireTopbarButtons();
  prepareMountPoints();      // ensure #tech-root / #gator-root / #weapons-root exist
  initModules();             // mount the islands
  bootOverlay();             // run and hide the loader

  // Optionally auto-load manifest via Sidebar (if it exposes a helper)
  if (typeof Sidebar.loadManifest === "function") {
    try {
      const count = await Sidebar.loadManifest();
      toast(`Manifest loaded — ${count} mechs`);
    } catch (e) {
      // Optional: silent; user can click "Load" button instead
    }
  }
});

/* -------------------------- Mount Islands ------------------------ */
function initModules() {
  // Sidebar: owns the list, search, filters, and will call onSelect(mech)
  Sidebar.mount({
    sidebar: "#mech-sidebar",
    scrim: "#sidebar-scrim",
    filterModal: "#filter-modal",
    searchInput: "#side-search",
    list: "#mech-list",
    onSelect: (mech) => selectMech(mech),
    onManifestLoaded: (count) => toast(`Manifest loaded — ${count} mechs`),
  });

  // Tech Readout island (with image via Images module)
  if (typeof Tech.mount === "function") {
    Tech.mount("#tech-root", { images: Images, imageMaxHeight: 320 });
  } else if (typeof Tech.init === "function") {
    // Back-compat (non-island version)
    console.warn("[techreadout] Using legacy init() API; consider switching to mount().");
    Tech.init({
      images: { getFor: Images.getFor },
      containers: {
        chassis: qs("#tr-pane-C"),
        armor: qs("#tr-pane-AI"),
        equipment: qs("#tr-pane-EQ"),
        lore: qs("#tr-pane-LORE"),
      },
      imageMaxHeight: 320,
    });
  }

  // GATOR island
  if (typeof Gator.mount === "function") {
    Gator.mount("#gator-root");
  }

  // Weapons island (or simple renderer)
  if (typeof Weapons.mount === "function") {
    Weapons.mount("#weapons-root");
  } else if (typeof Weapons.init === "function") {
    Weapons.init({ container: "#weapons-list" });
  }

  // Lance & Owned (keep your existing modules’ behavior)
  safeCall(Lance, "mount", "#lance-dock");
  safeCall(Owned, "mount", "#owned-dock");

  // Buttons for Lance/Owned panes (if modules expose open/close)
  on("#btn-lance", "click", () => {
    if (!safeCall(Lance, "open")) {
      // simple fallback: toggle the dock visibility
      toggleHidden("#lance-dock");
    }
  });
  on("#btn-owned", "click", () => {
    if (!safeCall(Owned, "open")) {
      toggleHidden("#owned-dock");
    }
  });
}

/* -------------------------- Mech Selection ----------------------- */
function selectMech(mech) {
  state.mech = mech || null;
  renderOverview(mech);
  // forward to islands
  if (typeof Tech.render === "function") Tech.render(mech);
  if (typeof Gator.render === "function") Gator.render(mech);
  if (typeof Weapons.render === "function") Weapons.render(mech);
  // Lance might want current mech for "Add Current"
  safeCall(Lance, "setCurrent", mech);
}

/* ------------------------ Overview Rendering --------------------- */
function renderOverview(mech) {
  const empty = () => {
    text("#ov-mech", "—");
    text("#ov-variant", "—");
    text("#ov-tons", "—");
    text("#ov-pilot", "—");
    text("#ov-gun", "—");
    text("#ov-pil", "—");
    text("#ov-move", "—");
    text("#ov-weps", "—");
    text("#heat-now", "0");
    text("#heat-cap", "—");
    css("#vheat-fill", { height: "0%" });
  };

  if (!mech) return empty();

  const name = mech.displayName || [mech.name, mech.model].filter(Boolean).join(" ");
  const tons = mech.mass ?? mech.tonnage ?? "—";
  const move = mech.movement ? fmtMove(mech.movement) : "—";
  const pilot = mech.pilot || "—";
  const gun = mech.pilotGunnery ?? "—";
  const pil = mech.pilotPiloting ?? "—";
  const keys = summarizeWeapons(mech);

  text("#ov-mech", name || "—");
  text("#ov-variant", mech.model || "—");
  text("#ov-tons", tons !== undefined ? `${tons}` : "—");
  text("#ov-pilot", String(pilot));
  text("#ov-gun", String(gun));
  text("#ov-pil", String(pil));
  text("#ov-move", move);
  text("#ov-weps", keys || "—");

  // Heat gauge — keep it simple (cap if available)
  const cap = mech.heatCapacity ?? mech.heatSinks ?? null;
  text("#heat-cap", cap != null ? String(cap) : "—");
  text("#heat-now", "0");
  css("#vheat-fill", { height: "0%" });
}

function fmtMove(m) {
  const w = (m.walk ?? m.run ?? "—");
  const j = (m.jump ?? 0);
  return j ? `${w} / J${j}` : `${w}`;
}

function summarizeWeapons(mech) {
  const w = mech.weapons || mech.armaments || [];
  if (!w.length) return "";
  // Try to produce a compact, readable line
  const names = w.map((x) => (typeof x === "string" ? x : x.name || "")).filter(Boolean);
  // Reduce near-duplicates like "ER Medium Laser (x2)" if counts exist
  const counts = {};
  for (const n of names) counts[n] = (counts[n] || 0) + 1;
  return Object.entries(counts)
    .map(([n, c]) => (c > 1 ? `${n} (x${c})` : n))
    .slice(0, 6)
    .join(" · ");
}

/* --------------------------- Top Tabs ---------------------------- */
function wireTabs() {
  const tabsWrap = qs("#top-swapper .tabs");
  if (!tabsWrap) return;

  tabsWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    const target = btn.getAttribute("data-swap");
    if (!target) return;

    // aria + visual state
    tabsWrap.querySelectorAll(".tab").forEach((b) => {
      b.classList.toggle("is-active", b === btn);
      b.setAttribute("aria-selected", b === btn ? "true" : "false");
    });

    // swap panes
    const paneSel = ["#pane-overview", "#pane-techreadout", "#pane-gator", "#tab-weapons"];
    paneSel.forEach((sel) => {
      const el = qs(sel);
      if (el) el.classList.toggle("is-active", el.id === target);
    });
  });
}

/* ------------------------- Import / Export ----------------------- */
function wireImportExport() {
  const btnImport = qs("#btn-import");
  const btnExport = qs("#btn-export");

  if (btnImport) {
    btnImport.addEventListener("click", () => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "application/json";
      inp.addEventListener("change", async () => {
        const file = inp.files && inp.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const json = JSON.parse(text);
          applySession(json);
          toast("Session imported.");
        } catch (e) {
          console.error(e);
          toast("Import failed.");
        }
      });
      inp.click();
    });
  }

  if (btnExport) {
    btnExport.addEventListener("click", async () => {
      const data = await buildSession();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "trs80-session.json";
      a.click();
      URL.revokeObjectURL(url);
      toast("Session exported.");
    });
  }
}

async function buildSession() {
  const sess = {
    version: 1,
    selected: state.mech?.id || state.mech?.displayName || null,
    timestamp: new Date().toISOString(),
    sidebar: safeCall(Sidebar, "toJSON") || null,
    lance: safeCall(Lance, "toJSON") || null,
    owned: safeCall(Owned, "toJSON") || null,
  };
  return sess;
}

function applySession(json) {
  // Feed to modules that understand it
  if (json.lance) safeCall(Lance, "fromJSON", json.lance);
  if (json.owned) safeCall(Owned, "fromJSON", json.owned);
  if (json.sidebar) safeCall(Sidebar, "fromJSON", json.sidebar);

  // Attempt to select the previously selected mech by id/name
  if (json.selected && typeof Sidebar.selectByIdOrName === "function") {
    Sidebar.selectByIdOrName(json.selected).catch(() => {});
  }
}

/* --------------------------- Topbar misc ------------------------- */
function wireTopbarButtons() {
  // Load manifest on demand (optional button)
  on("#btn-load-manifest", "click", async () => {
    try {
      const count = await Sidebar.loadManifest();
      toast(`Manifest loaded — ${count} mechs`);
    } catch (e) {
      toast("Failed to load manifest.");
    }
  });

  // Sidebar drawer (mobile)
  on("#btn-side-toggle", "click", () => Sidebar.toggle?.());

  // Footer "About"
  on("#footer-about", "click", () => openSettings());
}

/* ---------------------------- Settings --------------------------- */
function wireSettingsModal() {
  on("#btn-settings", "click", () => openSettings());
  on("#modal-close", "click", () => closeSettings());
  on("#modal-ok", "click", () => closeSettings());
  on("#settings-modal", "click", (e) => {
    if (e.target.id === "settings-modal") closeSettings();
  });

  // Build line timestamp (optional)
  const tsEl = qs('[data-build-ts]');
  if (tsEl) tsEl.textContent = new Date().toLocaleString();
}

function openSettings() {
  const m = qs("#settings-modal");
  if (!m) return;
  m.hidden = false;
  m.querySelector("#modal-ok")?.focus();
}
function closeSettings() {
  const m = qs("#settings-modal");
  if (!m) return;
  m.hidden = true;
}

/* ---------------------------- Boot UX ---------------------------- */
function bootOverlay() {
  const wrap = qs("#troBoot");
  if (!wrap) return (state.bootDone = true);

  const bar = qs("#troBar");
  const log = qs("#troLog");
  const hint = qs("#troHint");

  const lines = [
    "Initializing TRO engine …",
    "Loading mech manifest …",
    "Priming G.A.T.O.R. console …",
    "Mounting UI modules …",
    "Ready.",
  ];

  let i = 0;
  const tick = () => {
    if (i < lines.length) {
      appendLog(lines[i++]);
      setBar((i / lines.length) * 100);
      setTimeout(tick, 220);
    } else {
      finish();
    }
  };

  const finish = () => {
    state.bootDone = true;
    hint.textContent = "PRESS ENTER TO OPEN TRO ▌";
    const close = () => {
      wrap.setAttribute("aria-hidden", "true");
      wrap.style.opacity = "0";
      setTimeout(() => (wrap.style.display = "none"), 200);
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    // Auto close as well
    setTimeout(close, 800);
  };

  function appendLog(t) {
    if (!log) return;
    log.textContent += (log.textContent ? "\n" : "") + t;
    log.scrollTop = log.scrollHeight;
  }
  function setBar(pct) {
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  tick();
}

/* --------------------------- Utilities --------------------------- */
function qs(sel, root = document) { return root.querySelector(sel); }
function on(sel, ev, fn) { const el = qs(sel); if (el) el.addEventListener(ev, fn); }
function text(sel, val) { const el = qs(sel); if (el) el.textContent = val; }
function css(sel, obj) { const el = qs(sel); if (!el) return; Object.assign(el.style, obj); }
function toggleHidden(sel) {
  const el = qs(sel);
  if (!el) return;
  el.hidden = !el.hidden;
}
function toast(msg, ms = 1800) {
  const el = qs("#toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  el.style.opacity = "1";
  setTimeout(() => { el.style.opacity = "0"; }, ms);
  setTimeout(() => { el.hidden = true; el.textContent = ""; }, ms + 200);
}
function safeCall(mod, fnName, ...args) {
  if (!mod || typeof mod[fnName] !== "function") return null;
  try { return mod[fnName](...args); } catch { return null; }
}

/* Create mount point divs inside panes if they don't exist yet */
function prepareMountPoints() {
  ensureMount("#pane-techreadout", "tech-root");
  ensureMount("#pane-gator", "gator-root");
  ensureMount("#tab-weapons", "weapons-root");
}

function ensureMount(paneSel, mountId) {
  const pane = qs(paneSel);
  if (!pane) return;
  let mount = qs(`#${mountId}`, pane);
  if (!mount) {
    // Clear inner content if you want the module to fully own it
    pane.innerHTML = `<div id="${mountId}"></div>`;
  }
}
