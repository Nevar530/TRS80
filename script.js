/* =========================================
   GATOR – Manifest + Mech Loader (standalone)
   Requires the following elements in index.html:
   - #btn-load-manifest, #manifest-file, #manifest-drop
   - #mech-select, #btn-load-mech
   Auto-attempts to load ./data/manifest.json on boot.
   Calls window.onMechLoaded(mechJson, entry) if defined.
   ========================================= */

(() => {
  const manifestBtn = document.getElementById('btn-load-manifest');
  const mechBtn     = document.getElementById('btn-load-mech');
  const dropZone    = document.getElementById('manifest-drop');
  const fileInput   = document.getElementById('manifest-file');
  const mechSelect  = document.getElementById('mech-select');

  if (!manifestBtn || !mechBtn || !dropZone || !fileInput || !mechSelect) {
    console.warn('[GATOR] Manifest UI controls not found; skipping loader.');
    return;
  }

  let manifestData = null;
  const STORAGE_KEY = 'gator.manifest.meta.v1';

  // ---- helpers ----
  const toast = (m) => console.log('[GATOR]', m);

  // Convert GitHub "blob" URLs to "raw" for fetch()
  function toRawGitHub(url) {
    if (!url) return url;
    try {
      const u = new URL(url);
      if (u.hostname === 'github.com' && u.pathname.includes('/blob/')) {
        const parts = u.pathname.split('/').filter(Boolean);
        const user = parts[0], repo = parts[1], branch = parts[3];
        const path = parts.slice(4).join('/');
        return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}`;
      }
      return url;
    } catch {
      return url;
    }
  }

  // Encode only path segments that need it; keep domains/schemes intact.
  function safeFetchUrl(pathOrUrl) {
    if (!pathOrUrl) return pathOrUrl;
    if (!/^https?:\/\//i.test(pathOrUrl)) {
      return pathOrUrl.replace(/ /g, '%20'); // simple for relative
    }
    try {
      const u = new URL(pathOrUrl);
      u.pathname = u.pathname
        .split('/')
        .map(seg => encodeURIComponent(decodeURIComponent(seg)))
        .join('/');
      return u.toString();
    } catch {
      return pathOrUrl.replace(/ /g, '%20');
    }
  }

  function setMechList(items) {
    mechSelect.innerHTML = '';
    if (!items?.length) {
      mechSelect.innerHTML = '<option>— manifest empty —</option>';
    } else {
      for (const m of items) {
        const opt = document.createElement('option');
        opt.value = m.path || m.url || m.file || m.id || m.name;
        opt.textContent = m.name || m.id || m.path || 'Unknown';
        opt.dataset.id = m.id || '';
        mechSelect.appendChild(opt);
      }
    }
    mechBtn.disabled = !items?.length;
  }

  // Accept plain arrays, {mechs:[...]}, or letter-group objects (e.g., "a-f": [...])
  function normalizeManifest(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (raw.mechs && Array.isArray(raw.mechs)) return raw.mechs;

    const out = [];
    for (const [k, v] of Object.entries(raw)) {
      if (Array.isArray(v)) out.push(...v);
    }
    return out;
  }

  async function readFileAsText(file) {
    const fr = new FileReader();
    return new Promise((res, rej) => {
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsText(file);
    });
  }

  async function loadManifestFromFile(file) {
    const txt = await readFileAsText(file);
    return JSON.parse(txt);
  }

  async function loadManifestFromUrl(url) {
    const fixed = toRawGitHub(url);
    const r = await fetch(fixed, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function saveManifestMeta(meta) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(meta)); } catch {}
  }
  function restoreManifestMeta() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }

  async function handleManifest(obj, sourceHint) {
    const list = normalizeManifest(obj).map(m => ({
      id: m.id ?? m.ID ?? null,
      name: m.name ?? m.title ?? m.display ?? m.id ?? null,
      path: m.path ?? m.url ?? m.file ?? null,
      faction: m.faction ?? m.house ?? null,
      tonnage: m.tonnage ?? m.tons ?? null,
      raw: m
    })).filter(m => m.path || m.name);

    manifestData = list;
    setMechList(list);
    saveManifestMeta({ source: sourceHint || 'inline', count: list.length, ts: Date.now() });
    toast(`Manifest loaded (${list.length} entries).`);
  }

  async function tryLoadDefaultRemote() {
    const cached = restoreManifestMeta();
    if (cached && cached.count > 0) return;
    try {
      const url = './data/manifest.json'; // default repo path
      const obj = await loadManifestFromUrl(url);
      await handleManifest(obj, url);
    } catch (e) {
      console.debug('[GATOR] No default manifest loaded:', e?.message);
    }
  }

  async function loadSelectedMech() {
    const sel = mechSelect.options[mechSelect.selectedIndex];
    if (!sel || !sel.value) return;

    const entry = (manifestData || []).find(m =>
      (m.path === sel.value) || (m.name === sel.textContent) || (m.id && m.id === sel.dataset.id)
    ) || { path: sel.value, name: sel.textContent };

    try {
      const url = safeFetchUrl(toRawGitHub(entry.path));
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`Failed to fetch mech JSON: ${url} (HTTP ${r.status})`);
      const mechJson = await r.json();

      if (typeof window.onMechLoaded === 'function') {
        window.onMechLoaded(mechJson, entry);
      }
      toast(`Loaded mech: ${entry.name || entry.path}`);
    } catch (err) {
      console.error(err);
      toast(`Error loading mech file: ${entry.path}`);
    }
  }

  // ---- events ----
  manifestBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const obj = await loadManifestFromFile(f);
      await handleManifest(obj, `file:${f.name}`);
    } catch (err) {
      console.error(err);
      toast('Failed to parse manifest.json');
    } finally {
      fileInput.value = '';
    }
  });

  ['dragenter','dragover'].forEach(ev =>
    dropZone.addEventListener(ev, e => {
      e.preventDefault();
      dropZone.classList.add('drag');
    })
  );
  ['dragleave','drop'].forEach(ev =>
    dropZone.addEventListener(ev, e => {
      e.preventDefault();
      dropZone.classList.remove('drag');
    })
  );
  dropZone.addEventListener('drop', async (e) => {
    const file = e.dataTransfer?.files?.[0];
    const url  = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
    try {
      if (file && file.name.toLowerCase().endsWith('.json')) {
        const obj = await loadManifestFromFile(file);
        await handleManifest(obj, `file:${file.name}`);
      } else if (url && /\.json(\?|#|$)/i.test(url)) {
        const obj = await loadManifestFromUrl(url);
        await handleManifest(obj, url);
      } else {
        toast('Drop a manifest.json file or a .json URL');
      }
    } catch (err) {
      console.error(err);
      toast('Failed to load manifest from drop');
    }
  });

  mechBtn.addEventListener('click', loadSelectedMech);

  // boot
  tryLoadDefaultRemote();

  // optional: expose programmatic manifest loader
  window.onManifestLoaded = handleManifest;
})();