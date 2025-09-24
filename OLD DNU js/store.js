// Tiny reactive store
export const Store = (() => {
  const state = {
    mech: null,
    pilot: { name: '—', gunnery: 4, piloting: 5 },
    heat:  { current: 0, capacity: 0 },
    gator: { G:4, A:0, T:0, T_adv:{jump:false,padj:false,prone:false,imm:false}, O:0, R:0, Rmin:'eq' },
    manifest: [],
    manifestUrl: ''
  };
  const subs = new Set();
  const get = () => state;
  const set = (patch) => { Object.assign(state, patch); subs.forEach(fn => fn(state)); };
  const update = (key, patch) => { Object.assign(state[key], patch); subs.forEach(fn => fn(state)); };
  const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  return { get, set, update, subscribe };
})(); 
