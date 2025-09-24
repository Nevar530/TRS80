export function renderOverview(state) { 
  const m = state.mech, p = state.pilot, mv = m? m._mv : null;
  const $ = (id) => document.getElementById(id);

  $('#ov-mech')   && ($('#ov-mech').textContent   = m?.displayName ?? '—');
  $('#ov-variant')&& ($('#ov-variant').textContent= m?.model ?? '—');
  $('#ov-tons')   && ($('#ov-tons').textContent   = m?.tonnage ?? '—');
  $('#ov-pilot')  && ($('#ov-pilot').textContent  = p?.name ?? '—');
  $('#ov-gun')    && ($('#ov-gun').textContent    = p?.gunnery ?? '—');
  $('#ov-pil')    && ($('#ov-pil').textContent    = p?.piloting ?? '—');

  const mvStr = mv && (mv.walk || mv.run || mv.jump)
    ? `W ${mv.walk ?? '—'} / R ${mv.run ?? '—'}${mv.jump ? ' / J ' + mv.jump : ''}`
    : '—';
  $('#ov-move') && ($('#ov-move').textContent = mvStr);

  const w = Array.isArray(m?.weapons) ? m.weapons : [];
  $('#ov-weps') && ($('#ov-weps').textContent = w.length
    ? w.slice(0,6).map(wi => `${wi.name}${wi.loc?` [${wi.loc}]`:''}`).join(' • ')
    : '—');
}

export function renderHeat(state) {
  const cap  = state.heat.capacity || 0;
  const curr = state.heat.current || 0;
  const pct  = cap ? Math.max(0, Math.min(100, (curr/cap)*100)) : 0;

  const bar  = document.getElementById('vheat');
  const fill = document.getElementById('vheat-fill');
  if (fill) fill.style.height = pct.toFixed(1) + '%';
  bar?.setAttribute('aria-valuenow', String(curr));
  bar?.setAttribute('aria-valuemax', String(cap || 50));
  const $ = (id) => document.getElementById(id);
  $('#heat-now') && ($('#heat-now').textContent = String(curr));
  $('#heat-cap') && ($('#heat-cap').textContent = cap ? String(cap) : '—');
}
