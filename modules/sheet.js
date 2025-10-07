// modules/sheet.js — minimal, self-contained, one-call API
(() => {
  const API = {};
  const q = (s, r = document) => r.querySelector(s);
  const esc = (x) => (x == null ? '—' : String(x));
  const ensure = () => {
    let root = q('#sheet-root');
    if (!root) {
      // fallback so devs can still see it even if pane id changes
      root = document.createElement('div');
      root.id = 'sheet-root';
      q('#pane-sheet')?.appendChild(root) || document.body.appendChild(root);
    }
    if (!q('#trs-sheet-style')) {
      const st = document.createElement('style');
      st.id = 'trs-sheet-style';
      st.textContent = `
        .rs {background:#0b0f18;border:1px solid #202636;border-radius:12px;padding:12px;color:#dfe4f1}
        .rs h2 {margin:0 0 8px 0;font-size:14px}
        .rs-grid {display:grid;grid-template-columns:300px 1fr 240px;gap:12px}
        .rs-card {background:#0d1320;border:1px solid #222b3a;border-radius:10px;padding:10px}
        .rs-meta {display:grid;grid-template-columns:120px 1fr;gap:4px 8px;font-size:12px}
        .rs-meta .lab {opacity:.75}
        .rs-table {width:100%;border-collapse:collapse;font-size:12px}
        .rs-table th,.rs-table td {border:1px solid #233045;padding:4px}
        .rs-table th {background:#101828;text-align:left}
        .mono {font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace}
        .muted {opacity:.75}
        .rs-armor {display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
        .loc {border:1px solid #233045;border-radius:8px;padding:6px}
        .loc h3 {margin:0 0 6px 0;font-size:12px;display:flex;justify-content:space-between;gap:8px}
        .pips {display:flex;flex-wrap:wrap;gap:3px}
        .pip {width:10px;height:10px;border:1px solid #94a3b8;border-radius:50%}
        .pip.sq {border-radius:2px;transform:rotate(45deg)}
        .pip.rear {border-radius:2px}
        @media (max-width: 980px){ .rs-grid{grid-template-columns:1fr} }
      `;
      document.head.appendChild(st);
    }
    if (!q('#sheet-host')) {
      const host = document.createElement('div');
      host.id = 'sheet-host';
      host.innerHTML = `
        <div class="rs">
          <div class="rs-grid">
            <section class="rs-card">
              <h2>Mech & Pilot</h2>
              <div class="rs-meta">
                <div class="lab">Chassis</div><div><span id="rs-chassis">—</span> <sup class="muted" id="rs-variant">—</sup></div>
                <div class="lab">Tech</div><div id="rs-tech">—</div>
                <div class="lab">Tonnage</div><div id="rs-tons">—</div>
                <div class="lab">BV</div><div id="rs-bv">—</div>
                <div class="lab">Move (W/R/J)</div><div id="rs-move" class="mono">—</div>
                <div class="lab">Heat Sinks</div><div><span id="rs-hs-count">—</span> <span class="muted">(<span id="rs-hs-type">—</span>, cap <span id="rs-hs-cap">—</span>)</span></div>
              </div>
            </section>

            <section class="rs-card">
              <h2>Weapons</h2>
              <table class="rs-table">
                <thead><tr><th>Name</th><th>Loc</th></tr></thead>
                <tbody id="rs-weapons"><tr><td class="muted" colspan="2">—</td></tr></tbody>
              </table>
            </section>

            <section class="rs-card">
              <h2>Heat Track</h2>
              <table class="rs-table" id="rs-heat"></table>
            </section>

            <section class="rs-card" style="grid-column: 1 / -1;">
              <h2>Armor / Internals</h2>
              <div class="rs-armor" id="rs-armor"></div>
            </section>

            <section class="rs-card" style="grid-column: 1 / -1;">
              <h2>Equipment by Location</h2>
              <table class="rs-table">
                <thead><tr><th style="width:120px;">Location</th><th>Items</th></tr></thead>
                <tbody id="rs-equip"><tr><td class="muted" colspan="2">—</td></tr></tbody>
              </table>
            </section>
          </div>
        </div>
      `;
      root.appendChild(host);
      // build static heat table once
      const heatBody = q('#rs-heat');
      const HEAT = {
        30:"Shutdown", 28:"Ammo exp chk (8+)", 26:"Shutdown (10+)",
        25:"-5 MP", 24:"+4 To-Hit", 23:"Ammo exp chk (6+)",
        22:"Shutdown (8+)", 20:"-4 MP", 19:"Ammo exp chk (4+)",
        17:"Shutdown (6+)", 15:"+3 To-Hit", 14:"-3 MP", 12:"+2 To-Hit",
        10:"-2 MP", 8:"+1 To-Hit"
      };
      let ht = '<thead><tr><th>Heat</th><th>Effect</th></tr></thead><tbody>';
      for (let h=30; h>=1; h--) ht += `<tr><td class="mono">[${String(h).padStart(2,'0')}]</td><td>${HEAT[h]||'—'}</td></tr>`;
      heatBody.innerHTML = ht + '</tbody>';
    }
    return q('#sheet-host');
  };

  function hsInfo(mech) {
    // supports: "12 Double" or sinks: {count,type}
    if (mech?.sinks?.count != null) {
      const cnt = Number(mech.sinks.count) || 0;
      const dbl = /double/i.test(String(mech.sinks.type||''));
      return { count: cnt, type: dbl ? 'Double' : 'Single', cap: cnt * (dbl?2:1) };
    }
    const s = String(mech?.heatSinks ?? '');
    const m = s.match(/(\d+)/);
    const cnt = m ? parseInt(m[1],10) : null;
    const dbl = /double/i.test(s);
    return { count: cnt ?? '—', type: cnt==null ? '—' : (dbl?'Double':'Single'), cap: cnt==null ? '—' : cnt*(dbl?2:1) };
  }

  function armorRows(mech) {
    // prefer normalized armorByLocation with rear keys
    const abl = mech?.armorByLocation || {};
    const front = {
      HD: abl.HD ?? mech?.armor?.head ?? 0,
      CT: abl.CT ?? mech?.armor?.centerTorso ?? 0,
      RT: abl.RT ?? mech?.armor?.rightTorso ?? 0,
      LT: abl.LT ?? mech?.armor?.leftTorso ?? 0,
      RA: abl.RA ?? mech?.armor?.rightArm ?? 0,
      LA: abl.LA ?? mech?.armor?.leftArm ?? 0,
      RL: abl.RL ?? mech?.armor?.rightLeg ?? 0,
      LL: abl.LL ?? mech?.armor?.leftLeg ?? 0,
    };
    const rear = {
      CT: abl.RTC ?? mech?.armor?.rearCenterTorso ?? 0,
      RT: abl.RTR ?? mech?.armor?.rearRightTorso ?? 0,
      LT: abl.RTL ?? mech?.armor?.rearLeftTorso ?? 0,
    };
    const order = ['LA','HD','CT','RA','LL','LT','RT','RL'];
    const roll  = { LA:'[04-05]', HD:'[12]', RA:'[09-10]', LL:'[03]', LT:'[06]', CT:'[02/07]', RT:'[08]', RL:'[11]' };
    return order.map(code => {
      const armor = Number(front[code]||0);
      const rearA = Number(rear[code]||0);
      const internals = {HD:3,CT:11,LT:8,RT:8,LA:5,RA:5,LL:7,RL:7}[code] || 0;
      const p = (n, cls) => Array.from({length:Math.max(0,n)},()=>`<span class="pip ${cls}"></span>`).join('');
      return `
        <div class="loc">
          <h3><span>${code}</span><span class="muted mono">${roll[code]||'[—]'}</span></h3>
          <div class="muted mono" style="margin-bottom:4px;">ARMOR</div>
          <div class="pips">${p(armor,'')}</div>
          <div class="muted mono" style="margin:6px 0 4px;">INTERNAL</div>
          <div class="pips">${p(internals,'sq')}</div>
          ${ (code==='CT'||code==='LT'||code==='RT') ? `
            <div class="muted mono" style="margin:6px 0 4px;">REAR</div>
            <div class="pips">${p(rearA,'rear')}</div>` : '' }
        </div>
      `;
    }).join('');
  }

  function equipRows(mech) {
    const locs = mech?.locations || {};
    const map = [
      ['Head','head'],['Center Torso','centerTorso'],['Right Torso','rightTorso'],['Left Torso','leftTorso'],
      ['Right Arm','rightArm'],['Left Arm','leftArm'],['Right Leg','rightLeg'],['Left Leg','leftLeg']
    ];
    const rows = map.map(([lab,key]) => {
      const items = Array.isArray(locs[key]) ? locs[key] : [];
      const line = items.join(' • ');
      if (!line) return '';
      return `<tr><td class="mono">${lab}</td><td class="mono">${line}</td></tr>`;
    }).filter(Boolean).join('');
    return rows || `<tr><td class="muted" colspan="2">—</td></tr>`;
  }

  function weaponRows(mech) {
    const list = Array.isArray(mech?.weapons) ? mech.weapons : [];
    if (!list.length) return `<tr><td class="muted" colspan="2">—</td></tr>`;
    return list.map(w => {
      const n = w.name || w.type || '—';
      const loc = w.loc || w.location || '';
      return `<tr><td class="mono">${esc(n)}</td><td class="mono">${esc(loc)}</td></tr>`;
    }).join('');
  }

  function movementString(mech) {
    const mv = mech?._mv || mech?.movement || mech?.move || {};
    const walk = mv.walk ?? mv.Walk ?? mv.w ?? null;
    const run  = mv.run  ?? mv.Run  ?? mv.r ?? (walk != null ? Math.ceil(Number(walk)*1.5) : null);
    const jump = mv.jump ?? mv.Jump ?? mv.j ?? null;
    const fmt = (x) => (x==null ? '—' : String(x));
    return `${fmt(walk)} / ${fmt(run)} / ${fmt(jump)}`;
  }

  function render(mech) {
    const host = ensure();
    if (!mech) {
      q('#rs-chassis', host).textContent = '—';
      q('#rs-variant', host).textContent = '—';
      q('#rs-tech', host).textContent = '—';
      q('#rs-tons', host).textContent = '—';
      q('#rs-bv', host).textContent = '—';
      q('#rs-move', host).textContent = '—';
      q('#rs-weapons', host).innerHTML = `<tr><td class="muted" colspan="2">—</td></tr>`;
      q('#rs-armor', host).innerHTML = '';
      q('#rs-equip', host).innerHTML = `<tr><td class="muted" colspan="2">—</td></tr>`;
      return;
    }

    const chassis = mech.displayName || mech.name || '—';
    const variant = mech.model || mech.variant || '—';
    const tech    = mech.techBase || mech.tech || '—';
    const tons    = mech.tonnage ?? mech.Tonnage ?? mech.mass ?? '—';
    const bv      = mech.bv ?? mech.BV ?? '—';
    const hs      = hsInfo(mech);

    q('#rs-chassis', host).textContent = esc(chassis);
    q('#rs-variant', host).textContent = esc(variant);
    q('#rs-tech', host).textContent = esc(tech);
    q('#rs-tons', host).textContent = esc(tons);
    q('#rs-bv', host).textContent = esc(bv);
    q('#rs-move', host).textContent = movementString(mech);
    q('#rs-hs-count', host).textContent = esc(hs.count);
    q('#rs-hs-type', host).textContent = esc(hs.type);
    q('#rs-hs-cap', host).textContent = esc(hs.cap);

    q('#rs-weapons', host).innerHTML = weaponRows(mech);
    q('#rs-armor', host).innerHTML = armorRows(mech);
    q('#rs-equip', host).innerHTML = equipRows(mech);
  }

  API.update = (mech) => render(mech);
  window.TRS_SHEET = API;
})();
