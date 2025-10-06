// script.js  (ES module)

// ---- Module islands ----
import * as Sidebar from "./modules/sidebar.js";       // list + filter modal (emits onSelect)
import * as Tech from "./modules/techreadout.js";      // Tech Readout + image in Lore
import * as Gator from "./modules/gator.js";           // G.A.T.O.R. calculator
import * as Weapons from "./modules/weapons.js";       // Weapons tab
import * as Lance from "./modules/lance.js";           // existing module (self-contained)
import * as Owned from "./modules/owned.js";           // existing module (self-contained)
import * as Images from "./modules/images.js";         // image provider for Tech

/* ========================================================================== */
/*                                  STATE                                     */
/* ========================================================================== */
const state = {
  mech: null,
  bootDone: false,
};

/* ========================================================================== */
/*                               ENTRY POINT                                  */
/* ========================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
  // Core wiring that existed before (tabs, settings, import/export)
  wireTabs();
  wireSettingsModal();
  wireImportExport();
  wireTopbarButtons();

  // Ensure mount points exist (keeps HTML stable; modules own their DOM)
  prepareMountPoints();

  // Mount the feature islands
  initModules();

  // Boot overlay (kept from original UX)
  bootOverlay();

  // Optionally load manifest at start if Sidebar exposes it
  if (typeof Sidebar.loadManifest === "function") {
    try {
      const count = await Sidebar.loadManifest();
      toast(`Manifest loaded — ${count} mechs`);
    } catch {
      // Fine to be silent; user can manually load via button.
    }
  }
});

/* ========================================================================== */
/*                              MODULE MOUNTING                                */
/* ========================================================================== */
function initModules() {
  // Sidebar: owns the list, search, filters; notifies selection
  Sidebar.mount({
    sidebar: "#mech-sidebar",
    scrim: "#sidebar-scrim",
    filterModal: "#filter-modal",
    searchInput: "#side-search",
    list: "#mech-list",
    onSelect: (mech) => selectMech(mech),
    onManifestLoaded: (count) => toast(`Manifest loaded — ${count} mechs`),
  });

  // Tech Readout (with embedded image via Images module)
  if (typeof Tech.mount === "function") {
    Tech.mount("#tech-root", { images: Images, imageMaxHeight: 320 });
  } else if (typeof Tech.init === "function") {
    // Back-compat if you still have the non-island version around
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

  // GATOR calculator
  if (typeof Gator.mount === "function") {
    Gator.mount("#gator-root");
  }

  // Weapons tab
  if (typeof Weapons.mount === "function") {
    Weapons.mount("#weapons-root");
  } else if (typeof Weapons.init === "function") {
    Weapons.init({ container: "#weapons-list" });
  }

  // Lance & Owned (unchanged, self-contained)
  safeCall(Lance, "mount", "#lance-dock");
  safeCall(Owned, "mount", "#owned-dock");

  // Topbar toggles for Lance / Owned docks (if modules expose open())
  on("#btn-lance", "click", () => {
    if (!safeCall(Lance, "open")) toggleHidden("#lance-dock");
  });
  on("#btn-owned", "click", () => {
    if (!safeCall(Owned, "open")) toggleHidden("#owned-dock");
  });

  // Expose a tiny `App` surface for any legacy callers
  exposeAppSurface();
}

/* ========================================================================== */
/*                             MECH SELECTION                                  */
/* ========================================================================== */
function selectMech(mech) {
  state.mech = mech || null;

  // Keep original Overview panel behavior
  renderOverview(mech);

  // Notify islands
  if (typeof Tech.render === "function")   Tech.render(mech);
  if (typeof Gator.render === "function")  Gator.render(mech);
  if (typeof Weapons.render === "function") Weapons.render(mech);

  // Let Lance know (for "Add Current")
  safeCall(Lance, "setCurrent", mech);

  // Fire a custom event for any external hooks
  document.dispatchEvent(new CustomEvent("trs:mech:selected", { detail: mech }));
}

/* ========================================================================== */
/*                           OVERVIEW RENDER (kept)                            */
/* ========================================================================== */
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
  text("#ov-tons", tons !== undefined ? String(tons) : "—");
  text("#ov-pilot", String(pilot));
  text("#ov-gun", String(gun));
  text("#ov-pil", String(pil));
  text("#ov-move", move);
  text("#ov-weps", keys || "—");

  // Heat gauge (simple reset—cap if available)
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
  const names = w.map((x) => (typeof x === "string" ? x : x.name || "")).filter(Boolean);
  const counts = {};
  for (const n of names) counts[n] = (counts[n] || 0) + 1;
  return Object.entries(counts)
    .map(([n, c]) => (c > 1 ? `${n} (x${c})` : n))
    .slice(0, 6)
    .join(" · ");
}

/* ========================================================================== */
/*                                 TABS (kept)                                 */
/* ========================================================================== */
function wireTabs() {
  const tabsWrap = qs("#top-swapper .tabs");
  if (!tabsWrap) return;

  tabsWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    const target = btn.getAttribute("data-swap");
    if (!target) return;

    // aria + visual
    tabsWrap.querySelectorAll(".tab").forEach((b) => {
      const active = b === btn;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });

    // panes
    const paneSel = ["#pane-overview", "#pane-techreadout", "#pane-gator", "#tab-weapons"];
    paneSel.forEach((sel) => {
      const el = qs(sel);
      if (el) el.classList.toggle("is-active", el.id === target);
    });
  });
}

/* ========================================================================== */
/*                            IMPORT / EXPORT (kept)                           */
/* ========================================================================== */
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
  return {
    version: 1,
    timestamp: new Date().toISOString(),
    selected: state.mech?.id || state.mech?.displayName || null,
    sidebar: safeCall(Sidebar, "toJSON") || null,
    lance: safeCall(Lance, "toJSON") || null,
    owned: safeCall(Owned, "toJSON") || null,
  };
}

function applySession(json) {
  if (json.lance)  safeCall(Lance, "fromJSON", json.lance);
  if (json.owned)  safeCall(Owned, "fromJSON", json.owned);
  if (json.sidebar) safeCall(Sidebar, "fromJSON", json.sidebar);

  // Reselect last mech if possible
  if (json.selected && typeof Sidebar.selectByIdOrName === "function") {
    Sidebar.selectByIdOrName(json.selected).catch(() => {});
  }
}

/* ========================================================================== */
/*                           TOPBAR BUTTONS (kept)                             */
/* ========================================================================== */
function wireTopbarButtons() {
  on("#btn-load-manifest", "click", async () => {
    try {
      const count = await Sidebar.loadManifest();
      toast(`Manifest loaded — ${count} mechs`);
    } catch {
      toast("Failed to load manifest.");
    }
  });

  on("#btn-side-toggle", "click", () => Sidebar.toggle?.());
  on("#footer-about", "click", () => openSettings());
}

/* ========================================================================== */
/*                          SETTINGS / ABOUT (kept)                            */
/* ========================================================================== */
function wireSettingsModal() {
  on("#btn-settings", "click", () => openSettings());
  on("#modal-close", "click", () => closeSettings());
  on("#modal-ok", "click", () => closeSettings());
  on("#settings-modal", "click", (e) => {
    if (e.target.id === "settings-modal") closeSettings();
  });

  // Build line timestamp
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

/* ========================================================================== */
/*                           BOOT OVERLAY (kept)                               */
/* ========================================================================== */
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
    const onKey = (e) => { if (e.key === "Enter") { e.preventDefault(); close(); } };
    document.addEventListener("keydown", onKey);
    setTimeout(close, 800); // auto-close too
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

/* ========================================================================== */
/*                               APP SURFACE                                   */
/* ========================================================================== */
function exposeAppSurface() {
  // Minimal surface for legacy interop or debugging
  window.App = {
    getCurrentMech: () => state.mech,
    selectMech,                // external modules can trigger selection
    toast,                     // reuse global toast
    onMechSelected: (fn) => {
      if (typeof fn !== "function") return () => {};
      const h = (e) => fn(e.detail);
      document.addEventListener("trs:mech:selected", h);
      return () => document.removeEventListener("trs:mech:selected", h);
    },
    // Pass-throughs in case other modules expect them:
    Lance,
    Owned,
    Sidebar,
    Tech,
    Weapons,
    Gator,
    Images,
  };
}

/* ========================================================================== */
/*                               UTILITIES                                     */
/* ========================================================================== */
function qs(sel, root = document) { return root.querySelector(sel); }
function on(sel, ev, fn) { const el = qs(sel); if (el) el.addEventListener(ev, fn); }
function text(sel, val) { const el = qs(sel); if (el) el.textContent = val; }
function css(sel, obj) { const el = qs(sel); if (!el) return; Object.assign(el.style, obj); }
function toggleHidden(sel) { const el = qs(sel); if (!el) return; el.hidden = !el.hidden; }
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

// Create mount points inside panes if they aren't present yet
function prepareMountPoints() {
  ensureMount("#pane-techreadout", "tech-root");
  ensureMount("#pane-gator", "gator-root");
  ensureMount("#tab-weapons", "weapons-root");
}
function ensureMount(paneSel, mountId) {
  const pane = qs(paneSel);
  if (!pane) return;
  if (!qs(`#${mountId}`, pane)) {
    pane.innerHTML = `<div id="${mountId}"></div>`;
  }
}
