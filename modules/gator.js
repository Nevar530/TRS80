// modules/gator.js
// Self-contained "island" for the G.A.T.O.R. tab.
// Usage in script.js:
//   import * as Gator from "./modules/gator.js";
//   Gator.mount("#gator-root");
//   Gator.render(currentMech); // optional, only if you want mech context
//   // Gator.clear(), Gator.destroy() as needed

let rootEl = null;
let styleEl = null;
let state = {
  mech: null,
  rangeBonus: 0, // 0 = Short, 2 = Med, 4 = Long
};

export function mount(root, options = {}) {
  if (rootEl) destroy();
  rootEl = typeof root === "string" ? document.querySelector(root) : root;
  if (!rootEl) throw new Error("[gator] mount target not found");

  // --- markup (namespaced, no global IDs) ---
  rootEl.innerHTML = `
    <div class="mod-gator" data-module="gator" aria-label="G.A.T.O.R. Calculator">
      <div class="mg-subtabs" role="tablist" aria-label="GATOR sections">
        <button class="mg-subtab is-active" role="tab" aria-selected="true"  data-tab="G">G</button>
        <button class="mg-subtab"           role="tab" aria-selected="false" data-tab="A">A</button>
        <button class="mg-subtab"           role="tab" aria-selected="false" data-tab="T">T</button>
        <button class="mg-subtab"           role="tab" aria-selected="false" data-tab="O">O</button>
        <button class="mg-subtab"           role="tab" aria-selected="false" data-tab="R">R</button>
        <button class="mg-subtab"           role="tab" aria-selected="false" data-tab="D">Dice/TN</button>
      </div>

      <div class="mg-panes">
        <!-- G -->
        <section class="mg-pane is-active" data-pane="G" role="tabpanel" aria-labelledby="G">
          <div class="mg-col">
            <div class="mg-title"><span class="dot dot-att"></span> Gunnery</div>
            <label class="mg-lab">Gunnery</label>
            <select class="mg-sel" data-gtr="gunnery" aria-label="Gunnery [1–6]">
              <option value="1">1-Ultra Elite</option>
              <option value="2">2-Elite</option>
              <option value="3">3-Veteran</option>
              <option value="4" selected>4-Recruit</option>
              <option value="5">5-Green</option>
              <option value="6">6-Ultra Green</option>
            </select>
          </div>
        </section>

        <!-- A -->
        <section class="mg-pane" data-pane="A" role="tabpanel" aria-labelledby="A">
          <div class="mg-col">
            <div class="mg-title"><span class="dot dot-att"></span> Attacker Movement</div>
            <label class="mg-lab">Movement</label>
            <select class="mg-sel" data-gtr="attMove" aria-label="Attacker movement">
              <option value="0">Stationary (+0)</option>
              <option value="1">Walk (+1)</option>
              <option value="2">Run (+2)</option>
              <option value="3">Jump (+3)</option>
              <option value="2">Prone (+2)</option>
            </select>
          </div>
        </section>

        <!-- T -->
        <section class="mg-pane" data-pane="T" role="tabpanel" aria-labelledby="T">
          <div class="mg-col">
            <div class="mg-title"><span class="dot dot-tgt"></span> Target Movement</div>

            <label class="mg-lab">Move Mods (MP spent)</label>
            <select class="mg-sel" data-gtr="tgtBand" aria-label="Target movement band">
              <option value="0">0–2 (0)</option>
              <option value="1">3–4 (+1)</option>
              <option value="2">5–6 (+2)</option>
              <option value="3">7–9 (+3)</option>
              <option value="4">10–17 (+4)</option>
              <option value="5">18–24 (+5)</option>
              <option value="6">25+ (+6)</option>
            </select>

            <div class="mg-toggles">
              <label class="chk"><input type="checkbox" data-gtr="tgtJump"> +Jump</label>
              <div class="mg-posture">
                <label class="chk"><input type="radio" name="tgt-posture" data-gtr="tgtPosture" value="none" checked> normal</label>
                <label class="chk"><input type="radio" name="tgt-posture" data-gtr="tgtPosture" value="padj"> prone (adj) = -2</label>
                <label class="chk"><input type="radio" name="tgt-posture" data-gtr="tgtPosture" value="prone"> prone = +1</label>
                <label class="chk"><input type="radio" name="tgt-posture" data-gtr="tgtPosture" value="immobile"> immobile = -4</label>
              </div>
            </div>
          </div>
        </section>

        <!-- O -->
        <section class="mg-pane" data-pane="O" role="tabpanel" aria-labelledby="O">
          <div class="mg-col">
            <div class="mg-title">Other Modifiers</div>
            <div class="mg-groups">
              <select class="mg-sel xs" data-gtr="wb" aria-label="Woods Between">
                <option value="0">Woods Between: —</option>
                <option value="1">Lv1 (+1)</option>
                <option value="2">Lv2 (+2)</option>
                <option value="2">Lv1×2 (+2)</option>
              </select>
              <select class="mg-sel xs" data-gtr="wa" aria-label="Woods Among">
                <option value="0">Woods Among: —</option>
                <option value="1">Lv1 (+1)</option>
                <option value="2">Lv2 (+2)</option>
              </select>
              <select class="mg-sel xs" data-gtr="ot" aria-label="Other Terrain">
                <option value="0">Other Terrain: —</option>
                <option value="1">Partial Cover (+1)</option>
                <option value="1">Water Lv1 (+1)</option>
              </select>
              <select class="mg-sel xs" data-gtr="st" aria-label="Second Target">
                <option value="0">2nd Target: —</option>
                <option value="1">Front Arc (+1)</option>
                <option value="2">Side/Rear (+2)</option>
              </select>
              <select class="mg-sel xs" data-gtr="ht" aria-label="Heat">
                <option value="0">Heat: —</option>
                <option value="1">≤ 8 (+1)</option>
                <option value="2">≤ 13 (+2)</option>
              </select>
            </div>
          </div>
        </section>

        <!-- R -->
        <section class="mg-pane" data-pane="R" role="tabpanel" aria-labelledby="R">
          <div class="mg-col">
            <div class="mg-title">Range</div>
            <div class="mg-groups" data-gtr="rangeWrap">
              <div class="mg-seg" data-gtr="rangeSeg" role="group" aria-label="Range">
                <button data-r="0" class="is-active" title="Short (+0)">Short</button>
                <button data-r="2" title="Medium (+2)">Med</button>
                <button data-r="4" title="Long (+4)">Long</button>
              </div>
              <select class="mg-sel xs" data-gtr="min" aria-label="Minimum">
                <option value="eq">Minimum: Equal (0)</option>
                <option value="-1">-1 (+2)</option>
                <option value="-2">-2 (+3)</option>
                <option value="-3">-3 (+4)</option>
                <option value="-4">-4 (+5)</option>
                <option value="-5">-5 (+6)</option>
              </select>
            </div>
          </div>
        </section>

        <!-- Dice/TN -->
        <section class="mg-pane" data-pane="D" role="tabpanel" aria-labelledby="Dice/TN">
          <div class="mg-col">
            <div class="mg-title">Dice & Target Number</div>

            <div class="mg-roller">
              <select class="mg-sel tiny" data-gtr="dice" aria-label="Dice">
                <option value="2d6">2d6</option>
                <option value="1d6">1d6</option>
              </select>
              <input class="mg-in tiny" data-gtr="rollMod" type="number" value="0" aria-label="Roll modifier">
              <span>=</span>
              <div class="result-badge" data-out="rollRes" aria-live="polite">—</div>
              <div class="small dim" data-out="rollDetail"></div>
            </div>

            <div class="mg-footer">
              <div class="mg-tn">
                <div>Target Number</div>
                <div class="tn tn-auto" data-out="total">Auto</div>
              </div>
              <div class="small dim" data-out="breakdown"></div>
              <button class="ghost-btn" data-action="roll" title="Roll (R)">Roll</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  // --- tiny, namespaced styles (keeps visuals consistent without touching global CSS) ---
  styleEl = document.createElement("style");
  styleEl.setAttribute("data-mod", "gator");
  styleEl.textContent = `
    .mod-gator { display:flex; flex-direction:column; gap:.5rem; }
    .mod-gator .mg-subtabs { display:flex; gap:.25rem; flex-wrap:wrap; }
    .mod-gator .mg-subtab { padding:.3rem .5rem; border-radius:6px; background:transparent; border:1px solid var(--line, rgba(255,255,255,0.1)); }
    .mod-gator .mg-subtab.is-active { background:rgba(255,255,255,0.06); }
    .mod-gator .mg-panes { border-top:1px solid var(--line, rgba(255,255,255,0.08)); padding-top:.5rem; }
    .mod-gator .mg-pane { display:none; }
    .mod-gator .mg-pane.is-active { display:block; }
    .mod-gator .mg-col { display:flex; flex-direction:column; gap:.5rem; }
    .mod-gator .mg-title { font-weight:600; display:flex; align-items:center; gap:.35rem; }
    .mod-gator .dot { width:.6rem; height:.6rem; border-radius:50%; display:inline-block; background:var(--accent, #ffd06e); opacity:.8; }
    .mod-gator .dot-tgt { background:#6ecbff; }
    .mod-gator .mg-lab { font-size:.9em; opacity:.8; }
    .mod-gator .mg-sel { min-height:2rem; }
    .mod-gator .mg-sel.xs { min-height:1.8rem; }
    .mod-gator .mg-sel.tiny, .mod-gator .mg-in.tiny { width:5rem; }
    .mod-gator .mg-groups { display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; }
    .mod-gator .mg-seg { display:flex; border:1px solid var(--line, rgba(255,255,255,0.1)); border-radius:8px; overflow:hidden; }
    .mod-gator .mg-seg > button { padding:.35rem .6rem; background:transparent; border:0; border-right:1px solid var(--line, rgba(255,255,255,0.08)); }
    .mod-gator .mg-seg > button:last-child { border-right:0; }
    .mod-gator .mg-seg > button.is-active { background:rgba(255,255,255,0.06); }
    .mod-gator .mg-toggles { display:flex; gap:1rem; align-items:center; flex-wrap:wrap; }
    .mod-gator .mg-posture { display:flex; gap:.75rem; flex-wrap:wrap; }
    .mod-gator .mg-roller { display:flex; align-items:center; gap:.5rem; margin-bottom:.25rem; }
    .mod-gator .result-badge { padding:.15rem .45rem; border:1px solid var(--line, rgba(255,255,255,0.1)); border-radius:6px; min-width:2.5rem; text-align:center; }
    .mod-gator .mg-footer { display:flex; align-items:center; gap:1rem; justify-content:space-between; flex-wrap:wrap; }
    .mod-gator .mg-tn { display:flex; align-items:center; gap:.5rem; }
  `;
  document.head.appendChild(styleEl);

  bindEvents();
  recalc(); // initial
}

export function render(mech) {
  state.mech = mech || null; // reserved for future mech-derived modifiers
  recalc();
}

export function clear() {
  if (!rootEl) return;
  q('[data-out="total"]').textContent = "Auto";
  q('[data-out="breakdown"]').textContent = "";
  q('[data-out="rollRes"]').textContent = "—";
  q('[data-out="rollDetail"]').textContent = "";
}

export function destroy() {
  if (!rootEl) return;
  rootEl.replaceChildren();
  if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
  rootEl = null;
  styleEl = null;
  state = { mech: null, rangeBonus: 0 };
}

/* -------------------- internals -------------------- */

function bindEvents() {
  // Subtabs
  rootEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".mg-subtab");
    if (!btn) return;
    const tab = btn.getAttribute("data-tab");
    if (!tab) return;
    rootEl.querySelectorAll(".mg-subtab").forEach(b => b.classList.toggle("is-active", b === btn));
    rootEl.querySelectorAll(".mg-pane").forEach(p => {
      p.classList.toggle("is-active", p.getAttribute("data-pane") === tab);
    });
  });

  // Range segment buttons
  rootEl.addEventListener("click", (e) => {
    const b = e.target.closest('[data-gtr="rangeSeg"] > button');
    if (!b) return;
    const val = Number(b.getAttribute("data-r")) || 0;
    state.rangeBonus = val;
    b.parentElement.querySelectorAll("button").forEach(x => x.classList.toggle("is-active", x === b));
    recalc();
  });

  // Inputs that affect TN
  const inputsSel = [
    '[data-gtr="gunnery"]','[data-gtr="attMove"]','[data-gtr="tgtBand"]',
    '[data-gtr="tgtJump"]','[data-gtr="tgtPosture"]',
    '[data-gtr="wb"]','[data-gtr="wa"]','[data-gtr="ot"]','[data-gtr="st"]','[data-gtr="ht"]',
    '[data-gtr="min"]'
  ];
  rootEl.querySelectorAll(inputsSel.join(",")).forEach(el => {
    const ev = el.type === "checkbox" || el.type === "radio" ? "change" : "input";
    el.addEventListener(ev, recalc);
  });

  // Roller
  q('[data-action="roll"]').addEventListener("click", roll);
  rootEl.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r") { e.preventDefault(); roll(); }
  });
}

function recalc() {
  const gunnery = num(q('[data-gtr="gunnery"]'), 4);
  const att     = num(q('[data-gtr="attMove"]'), 0);

  const tgtBand = num(q('[data-gtr="tgtBand"]'), 0);
  const tgtJump = q('[data-gtr="tgtJump"]').checked ? 1 : 0;
  const posture = val(qAll('[data-gtr="tgtPosture"]'), "none");
  const postureAdj = posture === "padj" ? -2 : posture === "prone" ? 1 : posture === "immobile" ? -4 : 0;

  const woodsBetween = num(q('[data-gtr="wb"]'), 0);
  const woodsAmong   = num(q('[data-gtr="wa"]'), 0);
  const otherTerr    = num(q('[data-gtr="ot"]'), 0);
  const secondTarget = num(q('[data-gtr="st"]'), 0);
  const heat         = num(q('[data-gtr="ht"]'), 0);

  const minSel  = q('[data-gtr="min"]');
  const minRaw  = minSel.value;   // "eq" or "-1" .. "-5"
  const minPen  = (minRaw === "eq") ? 0 : (-Number(minRaw) + 1); // -1=>+2, -2=>+3, ... -5=>+6

  const range   = state.rangeBonus; // 0/2/4

  const tgt = tgtBand + tgtJump + postureAdj;
  const oth = woodsBetween + woodsAmong + otherTerr + secondTarget + heat + minPen;
  const rng = range;

  const tnRaw = gunnery + att + tgt + oth + rng;
  const tn    = Math.max(2, tnRaw);

  q('[data-out="total"]').textContent = String(tn);
  q('[data-out="breakdown"]').textContent =
    `Gunnery ${pm(gunnery)} + Attacker ${pm(att)} + Target ${pm(tgt)} + Other ${pm(oth)} + Range ${pm(rng)} = ${tnRaw} → TN ${tn}`;
}

function roll() {
  const dice = q('[data-gtr="dice"]').value || "2d6";
  const mod  = parseInt(q('[data-gtr="rollMod"]').value || "0", 10) || 0;
  const tn   = parseInt(q('[data-out="total"]').textContent || "0", 10) || 0;

  const r = dice === "1d6" ? d6() : d6() + d6();
  const total = r + mod;
  const ok = tn ? (total >= tn) : false;

  q('[data-out="rollRes"]').textContent = String(total);
  q('[data-out="rollDetail"]').textContent = `${dice} roll ${r}${mod ? ` ${pm(mod)}` : ""}${tn ? ` vs TN ${tn} → ${ok ? "HIT" : "MISS"}` : ""}`;
}

/* -------------------- utils -------------------- */
function q(sel) { return rootEl.querySelector(sel); }
function qAll(sel) { return Array.from(rootEl.querySelectorAll(sel)); }
function num(el, fallback=0) {
  if (!el) return fallback;
  const v = (el.value ?? "").toString().trim();
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function val(els, fallback=null) {
  const sel = els.find(e => e.checked);
  return sel ? sel.value : fallback;
}
function pm(n){ return (n >= 0 ? `+${n}` : `${n}`); }
function d6(){ return 1 + Math.floor(Math.random() * 6); }
