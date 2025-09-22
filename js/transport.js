import { Store } from './store.js';
import { normalizeMech } from './schema.js';

async function fetchJsonAbsolute(baseHref, pathOrUrl) {
  const base = new URL('.', baseHref || document.baseURI);
  const url  = /^https?:/i.test(pathOrUrl) ? pathOrUrl : new URL(pathOrUrl, base).href;
  const res = await fetch(url, { cache:'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function loadManifest() {
  const manifestUrl = new URL('data/manifest.json', document.baseURI).href;
  const raw = await fetchJsonAbsolute(manifestUrl, manifestUrl);

  let rows = [];
  if (Array.isArray(raw)) rows = raw;
  else if (raw?.mechs) rows = raw.mechs;
  else if (raw && typeof raw === 'object') for (const v of Object.values(raw)) if (Array.isArray(v)) rows.push(...v);

  const base = new URL('.', manifestUrl);
  const normalized = rows
    .filter(e => e && (e.path || e.url || e.file))
    .map(e => {
      const path = (e.path || e.url || e.file || '').replace(/\\/g,'/').trim();
      const abs  = /^https?:/i.test(path) ? path : new URL(path, base).href;
      return { id: e.id || null, name: e.displayName || e.displayname || e.name || null, variant: e.variant || null, path, url: abs };
    });

  Store.set({ manifest: normalized, manifestUrl });
  console.log(`Manifest OK (${normalized.length}) base=`, base.href);
}

export async function loadMechFromUrl(url) {
  const { manifestUrl } = Store.get();
  const raw = await fetchJsonAbsolute(manifestUrl, url);
  let mech = normalizeMech(raw) || raw;
  window.DEBUG_MECH = mech;

  const cap = Number.isFinite(mech?.heatCapacity) ? mech.heatCapacity : (mech?.sinks?.count ?? mech?.HeatSinks ?? 0) || 0;
  Store.set({ mech, heat: { current: 0, capacity: cap|0 } });
}

// File import/export
export function importJsonFromFile() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json';
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file) return;
    try {
      const text = await file.text(); const data = JSON.parse(text);
      if (data.mech || data.pilot || data.heat) {
        let mech = data.mech ? (normalizeMech(data.mech) || data.mech) : Store.get().mech;
        const heat = data.heat || Store.get().heat;
        const pilot = data.pilot || Store.get().pilot;
        Store.set({ mech, heat, pilot });
      } else {
        let mech = normalizeMech(data) || data;
        const cap = Number.isFinite(mech?.heatCapacity) ? mech.heatCapacity : (mech?.sinks?.count ?? mech?.HeatSinks ?? 0) || 0;
        Store.set({ mech, heat: { current: 0, capacity: cap|0 } });
      }
    } catch (e) { console.error(e); }
  };
  input.click();
}

export function exportSession() {
  const payload = { ...Store.get(), timestamp: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gator_session_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
