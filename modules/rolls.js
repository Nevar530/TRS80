/* modules/rolls.js
 * Extra rollers for GATOR: Hit Location, Critical Check, Missile Cluster
 * Canon: Classic BattleTech (front/rear tables, crit counts, cluster tables)
 * UI Mount: window.mountGatorRollsUnderTN() — injects a small control block under TN/Dice
 */
(() => {
  'use strict';

  // ================================
  // RNG helpers
  // ================================
  const RNG = {
    d6() { return (Math.random() * 6 | 0) + 1; },
    roll2d6() { return this.d6() + this.d6(); },
  };

  // ================================
  // Canon data tables
  // ================================
  // ’Mech hit location (FRONT) — 2d6
  // 2 CT • 3 RT • 4 RA • 5 RL • 6 RT • 7 CT • 8 LT • 9 LL • 10 LA • 11 LA • 12 Head
  const HIT_FRONT = Object.freeze({
    2: 'CT',
    3: 'RT',
    4: 'RA',
    5: 'RL',
    6: 'RT',
    7: 'CT',
    8: 'LT',
    9: 'LL',
    10: 'LA',
    11: 'LA',
    12: 'HEAD',
  });

  // ’Mech hit location (REAR) — same dice mapping, rear notation
  const HIT_REAR = Object.freeze({
    2: 'CT (Rear)',
    3: 'RT (Rear)',
    4: 'RA (Rear)',
    5: 'RL (Rear)',
    6: 'RT (Rear)',
    7: 'CT (Rear)',
    8: 'LT (Rear)',
    9: 'LL (Rear)',
    10: 'LA (Rear)',
    11: 'LA (Rear)',
    12: 'HEAD', // head has no rear
  });

  // Critical check: 2–7:0 • 8–9:1 • 10–11:2 • 12:3
  const CRIT_BY_ROLL = Object.freeze({
    2:0,3:0,4:0,5:0,6:0,7:0,
    8:1,9:1,
    10:2,11:2,
    12:3,
  });

  // Missile Cluster Hits Tables (2..12 → hits), per launcher size
  // Index 0 unused; array[i] corresponds to roll i.
  const CLUSTER = Object.freeze({
    2:  [ ,1,1,1,1,1,1,1,2,2,2,2,2 ],
    4:  [ ,1,2,2,2,2,2,3,3,3,3,4,4 ],
    5:  [ ,1,2,2,3,3,3,3,3,4,4,5,5 ],
    6:  [ ,2,2,3,3,4,4,4,4,5,5,6,6 ],
    10: [ ,3,3,4,6,6,6,6,6,8,8,10,10 ],
    15: [ ,5,5,6,9,9,9,9,9,12,12,15,15 ],
    20: [ ,6,6,9,12,12,12,12,12,16,16,20,20 ],
  });

  // ================================
  // Core API
  // ================================
  function roll2d6(){ return RNG.roll2d6(); }

  function rollLocation(facing = 'front'){
    const r = RNG.roll2d6();
    const table = (facing === 'rear') ? HIT_REAR : HIT_FRONT;
    return { roll: r, location: table[r] ?? '—' };
  }

  function rollCrit(){
    const r = RNG.roll2d6();
    return { roll: r, crits: CRIT_BY_ROLL[r] ?? 0 };
  }

  /**
   * rollCluster({ size, mods=0, streak=false })
   * size: 2,4,5,6,10,15,20
   * mods: cluster modifiers (e.g., +2 Artemis, +2 NARC, -1 Indirect)
   * streak: Streak SRMs — on hit, all missiles; on miss, zero (skip table)
   */
  function rollCluster(opts = {}){
    const { size = 10, mods = 0, streak = false } = opts;
    if (streak) {
      return { roll: null, adj: null, hits: size, size, note: 'STREAK: full hits on success (skip cluster table)' };
    }
    const base = RNG.roll2d6();
    const adj  = clamp(base + (mods|0), 2, 12);
    const row  = CLUSTER[size];
    const hits = row ? (row[adj] || 0) : 0;
    return { roll: base, adj, hits, size };
  }

  // ================================
  // Utils
  // ================================
  function clamp(n, lo, hi){ return n < lo ? lo : (n > hi ? hi : n); }
  function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

  // ================================
  // Expose API (no UI)
  // ================================
  window.GATOR_ROLLS = Object.freeze({
    version: '1.1.0',
    roll2d6,
    rollLocation,
    rollCrit,
    rollCluster,
    __tables: { HIT_FRONT, HIT_REAR, CRIT_BY_ROLL, CLUSTER },
  });

  // ================================
  // Lightweight CSS (fits TRS:80 theme)
  // ================================
  // ---- GATOR Rolls — style injection to match app theme (stacked under TN) ----
  (function injectGatorRollsCSS(){
    if (document.getElementById('gtrx-css')) return;
    const css = `
    /* Extra Rolls block */
    #gtr-extra-rolls{
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid var(--border);
      font-size: 13px;
    }

    /* Controls row */
    #gtr-extra-rolls .gtrx-row{
      display:flex; flex-wrap:wrap; gap:8px 10px; align-items:center;
    }
    #gtr-extra-rolls .gtrx-sep{ width:1px; height:16px; background:var(--border); margin:0 2px; }
    #gtr-extra-rolls .gtrx-label{ color:var(--muted); font-size:12px; }

    /* Readout sits BELOW controls, full width */
    #gtr-extra-rolls .gtrx-out{
      margin-top:8px;
      padding:6px 8px;
      border:1px solid var(--border);
      border-radius:6px;
      background:linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.02));
      font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
      display:flex; align-items:center; gap:10px; flex-wrap:wrap;
      min-height:32px;
    }
    #gtr-extra-rolls .gtrx-badge{
      border-radius:999px; padding:4px 8px;
      background:rgba(255,255,255,.04);
      font-weight:800; font-size:12.5px;
    }
    #gtr-extra-rolls .gtrx-note{ color:var(--muted); font-size:12px; }

    /* Theme-consistent controls */
    #gtr-extra-rolls .btn.sm{ line-height:1; }
    #gtr-extra-rolls .gtr-in.tiny{
      width:64px; text-align:center; padding:6px 8px;
      border-radius:6px; border:1px solid var(--border); background:#0e1522; color:var(--ink);
    }
    #gtr-extra-rolls select.gtr-sel{
      padding:6px 8px; border-radius:6px; border:1px solid var(--border); background:#0e1522; color:var(--ink);
    }
.gtrx-break{ flex-basis:100%; height:0; }          /* forces new line in the flex row */
.gtrx-title{ font-size:12px; color:var(--muted); } /* section heading style */
.gtrx-line{ display:flex; align-items:center; gap:8px; } /* keep number + type on one line */
}
    
    `;
    const st = document.createElement('style');
    st.id = 'gtrx-css';
    st.textContent = css;
    document.head.appendChild(st);
  })();


  // ================================
  // Mount helper — attach UI under current TN/Dice section
  // ================================
  // ---- Mount helper to place the UI directly BELOW the Target Number ----
  window.mountGatorRollsUnderTN = function mountGatorRollsUnderTN(){
    if (!window.GATOR_ROLLS) { console.warn('[gator] rolls API not ready'); return; }

    // Find the Target Number block and mount AFTER its footer container
    const tnEl   = document.getElementById('gtr-total');
    const footer = tnEl ? tnEl.closest('.gtr-footer') : null;

    // Fallbacks just in case the footer isn't present for some reason
    const anchor =
      footer ||
      document.getElementById('roll-att-detail') ||
      document.getElementById('btn-roll-both') ||
      document.getElementById('btn-roll-att');

    if (!anchor) { console.warn('[gator] TN anchor not found'); return; }
    if (document.getElementById('gtr-extra-rolls')) return; // already mounted

    const wrap = document.createElement('div');
    wrap.id = 'gtr-extra-rolls';
    wrap.innerHTML = `
      <div class="gtrx-row">
        <button id="gtr-loc-front"  type="button" class="btn sm">Location (Front)</button>
        <button id="gtr-loc-rear"   type="button" class="btn sm">Location (Rear)</button>
        <button id="gtr-crit"       type="button" class="btn sm">Critical Check</button>

        <span class="gtrx-sep" aria-hidden="true"></span>

<span class="gtrx-break"></span>
<strong class="gtrx-title">Missile Cluster</strong>

<div class="gtrx-line">
  <span class="gtrx-label">Missiles:</span>
  <input id="gtr-miss-size" class="gtr-in tiny" type="number" min="2" max="20" value="10" />
  <select id="gtr-miss-type" class="gtr-sel">
    <option value="LRM" selected>LRM (1 dmg/shot)</option>
    <option value="SRM">SRM (2 dmg/shot)</option>
  </select>
</div>

        <span class="gtrx-sep" aria-hidden="true"></span>

        <label class="gtrx-label"><input id="gtr-mod-artemis" type="checkbox" /> Artemis +2</label>
        <label class="gtrx-label"><input id="gtr-mod-narc"    type="checkbox" /> NARC +2</label>
        <label class="gtrx-label"><input id="gtr-mod-indir"   type="checkbox" /> Indirect −1</label>
        <span class="gtrx-label">Other</span>
        <input id="gtr-miss-mods" class="gtr-in tiny" type="number" min="-4" max="4" value="0" />
        <label class="gtrx-label"><input id="gtr-miss-streak" type="checkbox" /> Streak</label>

        <button id="gtr-miss" type="button" class="btn sm">Roll Cluster</button>
      </div>
      <hr>
RESULTS
      <div id="gtr-extra-out" class="gtrx-out">
        <span class="gtrx-note">Results will appear here.</span>
        </div>
    `;

    // Insert directly AFTER the TN footer so the whole block sits below the TN
    anchor.insertAdjacentElement('afterend', wrap);

    // ------- Wiring -------
    const outEl = document.getElementById('gtr-extra-out');
    const out = (...parts) => { outEl.innerHTML = parts.join(' '); };
    const esc = (s)=>String(s??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

    // Hit Location
    document.getElementById('gtr-loc-front')?.addEventListener('click', () => {
      const r = GATOR_ROLLS.rollLocation('front');
      out(`<span class="gtrx-badge">Hit Loc</span>`, `Front → <b>${esc(r.location)}</b>`, `<span class="gtrx-note">(2d6=${r.roll})</span>`);
    });
    document.getElementById('gtr-loc-rear')?.addEventListener('click', () => {
      const r = GATOR_ROLLS.rollLocation('rear');
      out(`<span class="gtrx-badge">Hit Loc</span>`, `Rear → <b>${esc(r.location)}</b>`, `<span class="gtrx-note">(2d6=${r.roll})</span>`);
    });

    // Critical check
    document.getElementById('gtr-crit')?.addEventListener('click', () => {
      const r = GATOR_ROLLS.rollCrit();
      const label = r.crits ? `<b>${r.crits} critical${r.crits>1?'s':''}</b>` : 'No criticals';
      out(`<span class="gtrx-badge">Critical</span>`, `${label}`, `<span class="gtrx-note">(2d6=${r.roll})</span>`);
    });

    // Missile roll (clarity-first)
    document.getElementById('gtr-miss')?.addEventListener('click', () => {
      const size   = Math.max(2, Math.min(20, +document.getElementById('gtr-miss-size').value || 10));
      const type   = (document.getElementById('gtr-miss-type').value || 'LRM').toUpperCase();
      const isSRM  = type === 'SRM';
      const dpm    = isSRM ? 2 : 1;   // damage per missile
      const streak = !!document.getElementById('gtr-miss-streak').checked;

      // Auto modifiers
      const modsList = [];
      let autoMods = 0;
      if (document.getElementById('gtr-mod-artemis').checked) { autoMods += 2; modsList.push('+2 Artemis'); }
      if (document.getElementById('gtr-mod-narc').checked)    { autoMods += 2; modsList.push('+2 NARC'); }
      if (document.getElementById('gtr-mod-indir').checked)   { autoMods -= 1; modsList.push('−1 Indirect'); }

      const manual = (+document.getElementById('gtr-miss-mods').value) || 0;
      if (manual) modsList.push((manual>0?'+':'') + manual + ' manual');

      if (streak) {
        const hits = size, dmg = hits * dpm;
        out(
          `<span class="gtrx-badge">Missiles</span>`,
          `<b>STREAK:</b> on a successful to-hit, <b>${hits}/${size}</b> hit (${type} • ${dpm} dmg/shot → <b>${dmg} dmg</b>).`,
          `<span class="gtrx-note">Cluster table skipped.</span>`
        );
        return;
      }

      const res  = GATOR_ROLLS.rollCluster({ size, mods: autoMods + manual, streak:false });
      const hits = res.hits;
      const dmg  = hits * dpm;

      const modsPart = modsList.length
        ? `<span class="gtrx-note">mods: ${modsList.join(', ')}</span>`
        : `<span class="gtrx-note">mods: none</span>`;

      out(
        `<span class="gtrx-badge">Missiles</span>`,
        `${type} size <b>${size}</b> → <b>${hits}/${size}</b> hit`,
        `<span class="gtrx-note">(roll ${res.roll}${(autoMods||manual)?`, adj ${res.adj}`:''})</span>`,
        `<span class="gtrx-badge">${dmg} dmg</span>`,
        modsPart
      );
    });
  };

})();
