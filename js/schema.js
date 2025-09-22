// Normalize various mech JSON shapes into a predictable shape 
export function normalizeMech(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const out = { ...raw, extras: { ...(raw.extras || {}) } };

  out.displayName = out.displayName || out.name || out.Name || '—';
  out.model       = out.model || out.variant || out.Model || '—';
  out.tonnage     = out.tonnage ?? out.Tonnage ?? out.mass ?? null;

  // Movement
  const mv = raw.move || raw.movement || raw.Movement || {};
  const walk = mv.walk ?? mv.Walk ?? mv.w ?? null;
  const run  = mv.run  ?? mv.Run  ?? mv.r ?? (walk != null ? String(Math.ceil(walk * 1.5)) : null);
  const jump = mv.jump ?? mv.Jump ?? mv.j ?? null;
  out._mv = { walk, run, jump };

  // Armor mapping (to armorByLocation + rears)
  if (!out.armorByLocation && raw.armor && typeof raw.armor === 'object') {
    out.armorByLocation = {
      HD:  raw.armor.head ?? null,
      CT:  raw.armor.centerTorso ?? null,
      LT:  raw.armor.leftTorso ?? null,
      RT:  raw.armor.rightTorso ?? null,
      LA:  raw.armor.leftArm ?? null,
      RA:  raw.armor.rightArm ?? null,
      LL:  raw.armor.leftLeg ?? null,
      RL:  raw.armor.rightLeg ?? null,
      RTC: raw.armor.rearCenterTorso ?? null,
      RTL: raw.armor.rearLeftTorso ?? null,
      RTR: raw.armor.rearRightTorso ?? null
    };
  }

  // Text blocks
  if (raw.text) {
    out.extras.overview     ??= raw.text.overview;
    out.extras.capabilities ??= raw.text.capabilities;
    out.extras.deployment   ??= raw.text.deployment;
    out.extras.history      ??= raw.text.history;
  }

  // Weapons normalized
  if (Array.isArray(raw.weapons)) {
    out.weapons = raw.weapons.map(w => ({
      name: w.name || w.type || 'Weapon',
      loc:  w.loc  || w.location || ''
    }));
  }

  // Era/sources
  out.era = out.era ?? raw.era ?? '—';
  if (!out.sources && raw.source) out.sources = [String(raw.source)];

  // Heat capacity guess from "heatSinks"
  if (out.heatCapacity == null && out.heatSinks != null) {
    const mhs = String(out.heatSinks).match(/\d+/);
    if (mhs) out.heatCapacity = Number(mhs[0]);
  }
  if (out.tonnage == null && out.mass != null) out.tonnage = out.mass;

  return out;
}
