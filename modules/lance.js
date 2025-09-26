/* lance.js — TRS:80 Lance Builder (standalone)
   Public API (attach to window.Lance):
     Lance.init({
       dock: HTMLElement | selectorString,          // where the dock UI renders
       getCurrentMech: () => mech|null,             // return the currently loaded mech from the main app
       onLoadMechById: (id) => void,                // load a mech in the main app (by manifest/mech id)
       onDeselectMenu: () => void,                  // clear active selection in the main app's menu/list
       storageKey: "trs80.lance.active",            // optional override
       lanceNameKey: "trs80.lance.name"             // optional override
     })
     Lance.setCurrent(mech)  // optional helper if you don't have getCurrentMech
     Lance.getState()        // {name, mechs: [{uid,id,name,bv,tonnage}], totals:{bv,tonnage,count}}
     Lance.clear()
*/

(function () {
  const SCHEMA = "trs80-lance@1";
  const DEFAULT_NAME = "New Lance";

  const fmt = {
    num(n) { return Number.isFinite(n) ? String(n) : "—"; },
    sum(arr, key) { return arr.reduce((s, x) => s + (Number(x[key]) || 0), 0); },
    tons(n) { return Number.isFinite(n) ? `${n}` : "—"; },
    bv(n) { return Number.isFinite(n) ? `${n}` : "—"; }
  };

  const dom = {
    el(tag, attrs = {}, ...children) {
      const e = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") e.className = v;
        else if (k === "dataset") Object.assign(e.dataset, v);
        else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
        else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
      }
      for (const c of children) {
        if (c == null) continue;
        if (Array.isArray(c)) e.append(...c);
        else if (c instanceof Node) e.appendChild(c);
        else e.appendChild(document.createTextNode(String(c)));
      }
      return e;
    },
    sel(root, s) { return typeof root === "string" ? document.querySelector(root) : root; },
  };

  // UID for roster rows (so duplicates of same mech id are allowed)
  const uid = () => Math.random().toString(36).slice(2, 9);

  const Lance = {
    _cfg: null,
    _root: null,
    _state: { schema: SCHEMA, name: DEFAULT_NAME, mechs: [] },
    _current: null, // current mech from app
    _els: {},

    init(cfg) {
      this._cfg = Object.assign({
        storageKey: "trs80.lance.active",
        lanceNameKey: "trs80.lance.name",
      }, cfg || {});

      this._root = dom.sel(document, this._cfg.dock);
      if (!this._root) throw new Error("Lance.init: dock container not found");

      // Load persisted
      this._loadFromStorage();

      // Build UI
      this._render();

      // Try to prime current mech
      if (typeof this._cfg.getCurrentMech === "function") {
        try { this._current = this._cfg.getCurrentMech() || null; } catch {}
      }

      // Expose on window for debugging (optional)
      return this;
    },

    // Allow main app to push current mech explicitly
    setCurrent(mech) {
      this._current = mech || null;
      this._updateAddButton();
    },

    getState() {
      const totals = {
        bv: fmt.sum(this._state.mechs, "bv"),
        tonnage: fmt.sum(this._state.mechs, "tonnage"),
        count: this._state.mechs.length
      };
      const mechs = this._state.mechs.map(({ uid, ...rest }) => rest); // omit uid for external view
      return { name: this._state.name, mechs, totals };
    },

    clear() {
      this._state.mechs = [];
      this._persist();
      this._renderRoster();
      this._renderTotals();
    },

    // Internal: add from current mech or explicit object
    _add(mech) {
      if (!mech || !mech.id || !mech.name) return;
      this._state.mechs.push({
        uid: uid(),
        id: mech.id,
        name: mech.name,
        bv: Number(mech.bv) || 0,
        tonnage: Number(mech.tonnage) || 0
      });
      this._persist();
      this._renderRoster();
      this._renderTotals();
    },

    _removeByUid(rowUid) {
      const i = this._state.mechs.findIndex(m => m.uid === rowUid);
      if (i >= 0) {
        this._state.mechs.splice(i, 1);
        this._persist();
        this._renderRoster();
        this._renderTotals();
      }
    },

    _move(rowUid, dir) {
      const i = this._state.mechs.findIndex(m => m.uid === rowUid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= this._state.mechs.length) return;
      const [item] = this._state.mechs.splice(i, 1);
      this._state.mechs.splice(j, 0, item);
      this._persist();
      this._renderRoster();
    },

    _select(rowUid) {
      const row = this._state.mechs.find(m => m.uid === rowUid);
      if (!row) return;
      try {
        if (typeof this._cfg.onDeselectMenu === "function") this._cfg.onDeselectMenu();
        if (typeof this._cfg.onLoadMechById === "function") this._cfg.onLoadMechById(row.id);
      } catch (e) {
        console.warn("Lance select callback error:", e);
      }
    },

    _render() {
      this._root.innerHTML = "";
      this._root.classList.add("lance-dock");

      // Header
      const nameInput = dom.el("input", {
        class: "lance-name",
        type: "text",
        value: this._state.name || DEFAULT_NAME,
        oninput: (e) => {
          this._state.name = (e.target.value || "").trim() || DEFAULT_NAME;
          this._persist();
          this._renderTotals(); // name reflected in download filename tooltip
        },
        placeholder: "Lance name…"
      });

      const totals = dom.el("div", { class: "lance-totals" });
      this._els.totals = totals;

      // Controls
      const addBtn = dom.el("button", {
        class: "btn add",
        title: "Add currently selected mech",
        onclick: () => {
          let mech = this._current;
          if (!mech && typeof this._cfg.getCurrentMech === "function") {
            try { mech = this._cfg.getCurrentMech(); } catch {}
          }
          if (!mech) return;
          this._add(mech);
        }
      }, "Add Selected");

      this._els.addBtn = addBtn;

      const removeAllBtn = dom.el("button", {
        class: "btn clear",
        onclick: () => {
          if (confirm("Clear the lance?")) this.clear();
        }
      }, "Clear");

      const dlBtn = dom.el("button", {
        class: "btn download",
        title: "Download lance JSON",
        onclick: () => this._downloadJSON()
      }, "Download");

      const ulLabel = dom.el("label", { class: "btn upload" }, "Upload");
      const ulInput = dom.el("input", {
        type: "file",
        accept: "application/json",
        style: "display:none",
        onchange: (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const fr = new FileReader();
          fr.onload = () => {
            try {
              const data = JSON.parse(fr.result);
              const ok = this._importJSON(data);
              if (!ok) alert("Invalid lance file.");
              e.target.value = "";
            } catch {
              alert("Could not parse JSON.");
            }
          };
          fr.readAsText(file);
        }
      });
      ulLabel.appendChild(ulInput);

      // Roster
      const roster = dom.el("div", { class: "lance-roster" });
      this._els.roster = roster;

      // Layout
      const header = dom.el("div", { class: "lance-header" },
        dom.el("div", { class: "name-wrap" }, nameInput),
        totals
      );

      const controls = dom.el("div", { class: "lance-controls" },
        addBtn, removeAllBtn, dlBtn, ulLabel
      );

      this._root.append(header, controls, roster);

      // First paint
      this._renderTotals();
      this._renderRoster();
      this._updateAddButton();
    },

    _renderTotals() {
      const bv = fmt.sum(this._state.mechs, "bv");
      const tons = fmt.sum(this._state.mechs, "tonnage");
      const cnt = this._state.mechs.length;
      this._els.totals.innerHTML = `
        <span><strong>BV:</strong> ${fmt.bv(bv)}</span>
        <span><strong>Tons:</strong> ${fmt.tons(tons)}</span>
        <span><strong>Mechs:</strong> ${fmt.num(cnt)}</span>
      `;
    },

    _renderRoster() {
      const list = dom.el("ul", { class: "lance-list" });
      for (const m of this._state.mechs) {
        const row = dom.el("li", { class: "lance-row", "data-uid": m.uid });

        const main = dom.el("button", {
          class: "row-main",
          title: "Open in viewer",
          onclick: () => this._select(m.uid)
        }, m.name);

        const meta = dom.el("span", { class: "row-meta" }, `BV ${fmt.bv(m.bv)} · ${fmt.tons(m.tonnage)}t`);

        const up = dom.el("button", {
          class: "row-ctrl up",
          title: "Move up",
          onclick: (e) => { e.stopPropagation(); this._move(m.uid, -1); }
        }, "▲");

        const down = dom.el("button", {
          class: "row-ctrl down",
          title: "Move down",
          onclick: (e) => { e.stopPropagation(); this._move(m.uid, +1); }
        }, "▼");

        const del = dom.el("button", {
          class: "row-ctrl del",
          title: "Remove",
          onclick: (e) => { e.stopPropagation(); this._removeByUid(m.uid); }
        }, "✕");

        row.append(main, meta, up, down, del);
        list.appendChild(row);
      }
      this._els.roster.innerHTML = "";
      this._els.roster.appendChild(list);
    },

    _updateAddButton() {
      const has = !!(this._current && this._current.id && this._current.name);
      this._els.addBtn.disabled = !has;
      this._els.addBtn.title = has ? "Add currently selected mech" : "Load a mech to add it";
    },

    _persist() {
      try {
        const payload = JSON.stringify({
          schema: SCHEMA,
          name: this._state.name || DEFAULT_NAME,
          mechs: this._state.mechs.map(m => ({ id: m.id, name: m.name, bv: Number(m.bv) || 0, tonnage: Number(m.tonnage) || 0 }))
        });
        localStorage.setItem(this._cfg.storageKey, payload);
        localStorage.setItem(this._cfg.lanceNameKey, this._state.name || DEFAULT_NAME);
      } catch (e) {
        console.warn("Lance: persist failed", e);
      }
    },

    _loadFromStorage() {
      const raw = localStorage.getItem(this._cfg.storageKey);
      const nameOnly = localStorage.getItem(this._cfg.lanceNameKey);
      if (!raw) {
        this._state = { schema: SCHEMA, name: nameOnly || DEFAULT_NAME, mechs: [] };
        return;
      }
      try {
        const data = JSON.parse(raw);
        if (data && data.schema === SCHEMA && Array.isArray(data.mechs)) {
          this._state = {
            schema: SCHEMA,
            name: (data.name || nameOnly || DEFAULT_NAME),
            mechs: data.mechs.map(m => ({
              uid: uid(),
              id: m.id, name: m.name,
              bv: Number(m.bv) || 0,
              tonnage: Number(m.tonnage) || 0
            }))
          };
        } else {
          this._state = { schema: SCHEMA, name: nameOnly || DEFAULT_NAME, mechs: [] };
        }
      } catch {
        this._state = { schema: SCHEMA, name: nameOnly || DEFAULT_NAME, mechs: [] };
      }
    },

    _downloadJSON() {
      const data = {
        schema: SCHEMA,
        name: this._state.name || DEFAULT_NAME,
        mechs: this._state.mechs.map(({ id, name, bv, tonnage }) => ({ id, name, bv, tonnage }))
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const fname = `lance-${(this._state.name || DEFAULT_NAME).toLowerCase().replace(/\s+/g, "-")}.json`;

      const a = dom.el("a", { href: url, download: fname });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    },

    _importJSON(data) {
      if (!data || data.schema !== SCHEMA || !Array.isArray(data.mechs)) return false;
      const name = (data.name || DEFAULT_NAME);
      const mechs = data.mechs.map(m => ({
        uid: uid(),
        id: m.id, name: m.name,
        bv: Number(m.bv) || 0,
        tonnage: Number(m.tonnage) || 0
      }));
      this._state = { schema: SCHEMA, name, mechs };
      this._persist();
      this._renderTotals();
      this._renderRoster();
      // also update name input if present
      const input = this._root.querySelector(".lance-name");
      if (input) input.value = name;
      return true;
    }
  };

  // Minimal styles (optional; reuse your app CSS if you prefer)
  const injectStyles = () => {
    if (document.getElementById("lance-dock-styles")) return;
    const css = `
      .lance-dock { display:flex; flex-direction:column; gap:.5rem; }
      .lance-header { display:flex; justify-content:space-between; align-items:center; gap:.75rem; }
      .lance-name { flex:1; padding:.35rem .5rem; border:1px solid #ccc; border-radius:.5rem; }
      .lance-totals { display:flex; gap:1rem; font-size:.95rem; opacity:.9; }
      .lance-controls { display:flex; gap:.5rem; flex-wrap:wrap; }
      .lance-controls .btn { padding:.35rem .6rem; border:1px solid #ccc; border-radius:.5rem; background:#f7f7f7; cursor:pointer; }
      .lance-controls .btn:disabled { opacity:.5; cursor:not-allowed; }
      .lance-roster { border:1px solid #ddd; border-radius:.5rem; background:#fff; }
      .lance-list { list-style:none; margin:0; padding:0; }
      .lance-row { display:grid; grid-template-columns: 1fr auto auto auto auto; align-items:center; gap:.25rem; padding:.35rem .5rem; border-bottom:1px solid #eee; }
      .lance-row:last-child { border-bottom:none; }
      .row-main { text-align:left; background:none; border:none; padding:.25rem; cursor:pointer; font-weight:600; }
      .row-meta { font-size:.85rem; opacity:.8; }
      .row-ctrl { background:none; border:1px solid #ddd; border-radius:.35rem; padding:.1rem .4rem; cursor:pointer; }
    `;
    const style = document.createElement("style");
    style.id = "lance-dock-styles";
    style.textContent = css;
    document.head.appendChild(style);
  };
  injectStyles();

  window.Lance = Lance;
})();
