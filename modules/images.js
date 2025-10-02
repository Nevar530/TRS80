/* ===== TRS:80 – Images Module (images.js) ===== */
(() => {
  'use strict';

  // ---------- Config ----------
  const DEFAULTS = {
    mountSel: '#image-panel',
    useAlias: true,
    thumbSize: 1200, // Sarna thumbnail target
    fallbackImageUrl: './images/background.png',
    fallbackFilePage: 'https://www.sarna.net/wiki/Category:Images',
  };

  // IS ⇄ Clan alias pairs (bidirectional where safe)
  const aliasPairs = {
    'Emerald Harrier':'Roadrunner','Roadrunner':'Emerald Harrier',
    'Howler':'Baboon','Baboon':'Howler',
    'Fire Moth':'Dasher','Dasher':'Fire Moth',
    'Mist Lynx':'Koshi','Koshi':'Mist Lynx',
    'Arctic Cheetah':'Hankyu','Hankyu':'Arctic Cheetah',
    'Kit Fox':'Uller','Uller':'Kit Fox',
    'Incubus':'Vixen','Vixen':'Incubus',
    'Horned Owl':'Peregrine','Peregrine':'Horned Owl',
    'Adder':'Puma','Puma':'Adder',
    'Viper':'Dragonfly','Dragonfly':'Viper', // note: Viper also used for Black Python; keep this primary
    'Ice Ferret':'Fenris','Fenris':'Ice Ferret',
    'Mongrel':'Grendel','Grendel':'Mongrel',
    'Nova':'Black Hawk','Black Hawk':'Nova',
    'Conjurer':'Hellhound','Hellhound':'Conjurer',
    'Huntsman':'Nobori-nin','Nobori-nin':'Huntsman',
    'Vapor Eagle':'Goshawk','Goshawk':'Vapor Eagle',
    'Stormcrow':'Ryoken','Ryoken':'Stormcrow',
    'Mad Dog':'Vulture','Vulture':'Mad Dog',
    'Mad Dog Mk III':'Vulture Mk III','Vulture Mk III':'Mad Dog Mk III',
    'Mad Dog Mk IV':'Vulture Mk IV','Vulture Mk IV':'Mad Dog Mk IV',
    'Ebon Jaguar':'Cauldron-Born','Cauldron-Born':'Ebon Jaguar',
    'Hellbringer':'Loki','Loki':'Hellbringer',
    'Hel':'Loki Mk II','Loki Mk II':'Hel',
    'Summoner':'Thor','Thor':'Summoner',
    'Grand Summoner':'Thor II','Thor II':'Grand Summoner',
    'Timber Wolf':'Mad Cat','Mad Cat':'Timber Wolf',
    'Savage Wolf':'Mad Cat Mk IV','Mad Cat Mk IV':'Savage Wolf',
    'Gargoyle':'Man O\' War','Man O\' War':'Gargoyle',
    'Warhawk':'Masakari','Masakari':'Warhawk',
    'Executioner':'Gladiator','Gladiator':'Executioner',
    'Stone Rhino':'Behemoth','Behemoth':'Stone Rhino',
    'Dire Wolf':'Daishi','Daishi':'Dire Wolf',
    'Bane':'Kraken','Kraken':'Bane',
    // one-way edge-case to avoid Viper confusion:
    'Black Python':'Viper'
  };

  // Explicit non-(BattleMech) qualifiers
  const needsQualifier = new Map([
    ['Arctic Fox','(OmniMech)']
  ]);

  // Optional “(BattleMech)” helpers (not strictly required with autodetect)
  const needsBMQualifier = new Set([
    'Apollo','Avatar','Banshee','Blackjack','Blade','Blitzkrieg','Brigand','Buccaneer',
    'Calliope','Centurion','Cerberus','Cobra','Crossbow','Daedalus','Dart','Defiance',
    'Eagle','Excalibur','Firestarter','Galahad','Hammer','Helios','Hercules','Phoenix','Scorpion'
  ]);

  // ---------- State ----------
  const cfg = {...DEFAULTS};
  const titleCache = new Map();     // chassis → resolved page title
  let currentReq = 0;
  let mounted = false;

  // ---------- DOM mount & styles ----------
  function ensureMount() {
    if (mounted) return getNodes();

    // Inject tab + pane if not present
    const top = document.getElementById('top-swapper');
    const tabs = top?.querySelector('.tabs');
    const cardC = top?.querySelector('.card-c');

    if (tabs && cardC && !document.getElementById('pane-images')) {
      const btn = document.createElement('button');
      btn.className = 'tab';
      btn.setAttribute('role','tab');
      btn.setAttribute('aria-selected','false');
      btn.dataset.swap = 'pane-images';
      btn.textContent = 'Images';
      tabs.appendChild(btn);

      const pane = document.createElement('section');
      pane.id = 'pane-images';
      pane.className = 'swap-pane';
      pane.setAttribute('role','tabpanel');
      pane.setAttribute('aria-labelledby','Images');

      pane.innerHTML = `
        <div id="image-panel" class="img-panel">
          <div class="img-wrap"><img id="mech-img" alt="Mech image" /></div>
          <div class="img-meta">
            <div class="img-links">
              <a id="btn-file" class="btn sm" href="#" target="_blank" rel="noopener">Open Image File</a>
              <a id="btn-sarna" class="btn sm ghost" href="#" target="_blank" rel="noopener">Open Sarna Page</a>
            </div>
            <div id="img-title" class="mono small dim"></div>
            <div id="img-credit" class="small dim"></div>
          </div>
        </div>
      `;
      cardC.appendChild(pane);

      // make the new tab behave like the others
      tabs.addEventListener('click', (e) => {
        const b = e.target.closest('[data-swap]'); if (!b) return;
        const id = b.getAttribute('data-swap');
        tabs.querySelectorAll('.tab').forEach(t => {
          const on = t === b; t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', String(on));
        });
        cardC.querySelectorAll('.swap-pane').forEach(p => {
          p.classList.toggle('is-active', p.id === id);
        });
      });
    }

    // styles (minimal; respects your theme)
    if (!document.getElementById('img-panel-css')) {
      const st = document.createElement('style');
      st.id = 'img-panel-css';
      st.textContent = `
      .img-panel{display:flex;flex-direction:column;gap:8px}
      .img-wrap{position:relative;width:100%;max-height:min(68vh,720px);display:flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:8px;background:#0e1522;overflow:hidden}
      #mech-img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block}
      .img-meta{display:flex;flex-direction:column;gap:6px}
      .img-links{display:flex;gap:8px;flex-wrap:wrap}
      `;
      document.head.appendChild(st);
      // keep wrap height reactive to viewport
      const updateMaxH = () => {
        const wrap = document.querySelector('.img-wrap');
        if (wrap) wrap.style.maxHeight = Math.round(window.innerHeight * 0.68) + 'px';
      };
      window.addEventListener('resize', updateMaxH);
      updateMaxH();
    }

    mounted = true;
    return getNodes();
  }

  function getNodes() {
    const host = document.querySelector(cfg.mountSel);
    const img  = document.getElementById('mech-img');
    const aFile= document.getElementById('btn-file');
    const aPage= document.getElementById('btn-sarna');
    const tEl  = document.getElementById('img-title');
    const cEl  = document.getElementById('img-credit');
    return { host, img, aFile, aPage, tEl, cEl };
  }

  // ---------- MediaWiki helpers ----------
  const API = 'https://www.sarna.net/wiki/api.php';

  async function tryTitleOnSarna(title){
    const url = `${API}?action=query&format=json&origin=*&redirects=1&prop=pageprops|info&titles=${encodeURIComponent(title)}`;
    const r = await fetch(url);
    if (!r.ok) return { ok:false };
    const data = await r.json();
    const pages = data?.query?.pages || {};
    const first = pages[Object.keys(pages)[0]];
    if (!first) return { ok:false };
    const missing = ('missing' in first) || ('invalid' in first);
    const disambig = !!first.pageprops?.disambiguation;
    return { ok: !missing && !disambig, missing, disambig, title: first.title || title };
  }

  async function pickBestSarnaTitle(rawName, aliasName){
    const key = `${rawName}||${aliasName||''}`;
    if (titleCache.has(key)) return titleCache.get(key);

    const trySeq = async (name) => {
      if (!name) return null;
      // exact
      let t = await tryTitleOnSarna(name);
      if (t.ok) return t.title;

      // explicit non-standard qualifier
      const nq = needsQualifier.get(name);
      if (nq) {
        t = await tryTitleOnSarna(`${name} ${nq}`);
        if (t.ok) return t.title;
      }

      // common BattleMech qualifier
      if (needsBMQualifier.has(name)) {
        t = await tryTitleOnSarna(`${name} (BattleMech)`);
        if (t.ok) return t.title;
      } else {
        // still try BattleMech as a generic fallback
        t = await tryTitleOnSarna(`${name} (BattleMech)`);
        if (t.ok) return t.title;
      }
      return null;
    };

    // 1) raw name
    let resolved = await trySeq(rawName);

    // 2) alias path
    if (!resolved && aliasName) resolved = await trySeq(aliasName);

    // 3) fallback to raw even if disambig; at least the button works
    resolved = resolved || rawName;
    titleCache.set(key, resolved);
    return resolved;
  }

  async function fetchLeadImage(title, size){
    // try PageImages first (fast)
    const pi = `${API}?action=query&format=json&origin=*&redirects=1&prop=pageimages&piprop=thumbnail|name|original&pithumbsize=${size}&titles=${encodeURIComponent(title)}`;
    let r = await fetch(pi);
    if (r.ok) {
      const data = await r.json();
      const pages = data?.query?.pages || {};
      const p = pages[Object.keys(pages)[0]];
      if (p?.thumbnail || p?.original) {
        const fileTitle = p.pageimage ? `File:${p.pageimage}` : null;
        const url = p.thumbnail?.source || p.original?.source || null;
        const res = await enrichFileMeta(fileTitle, url);
        if (res) return res;
      }
    }

    // fallback: parse page → images[], pick best PNG → resolve to url via imageinfo
    const parse = `${API}?action=parse&format=json&origin=*&prop=images&page=${encodeURIComponent(title)}`;
    r = await fetch(parse);
    if (r.ok) {
      const data = await r.json();
      const imgs = data?.parse?.images || [];
      const pick = pickBestFile(imgs, title);
      if (pick) {
        const info = await fileUrlFor(pick);
        if (info) return info;
      }
    }
    return null;
  }

  function pickBestFile(list, title){
    if (!Array.isArray(list) || !list.length) return null;
    // prefer large PNGs with name including the chassis
    const lc = title.toLowerCase();
    const scored = list
      .filter(n => /^File:/i.test(n))
      .map(n => n.startsWith('File:') ? n : `File:${n}`)
      .map(f => {
        const s = f.toLowerCase();
        let score = 0;
        if (s.endsWith('.png')) score += 4;
        if (s.includes('-lg')) score += 3;
        if (s.includes(lc)) score += 2;
        if (s.includes('mech')) score += 1;
        return [score, f];
      })
      .sort((a,b)=> b[0]-a[0]);
    return scored[0]?.[1] || list[0];
  }

  async function fileUrlFor(fileTitle){
    if (!fileTitle) return null;
    const url = `${API}?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|extmetadata&titles=${encodeURIComponent(fileTitle)}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const pages = data?.query?.pages || {};
    const p = pages[Object.keys(pages)[0]];
    const ii = Array.isArray(p?.imageinfo) ? p.imageinfo[0] : null;
    if (!ii?.url) return null;
    return {
      fileTitle: p.title || fileTitle,
      filePage: `https://www.sarna.net/wiki/${encodeURIComponent((p.title || fileTitle).replace(/ /g,'_'))}`,
      url: ii.url,
      credit: extMetaToCredit(ii.extmetadata || {})
    };
  }

  async function enrichFileMeta(fileTitle, directUrl){
    if (!fileTitle) {
      // try to guess file page from direct url (best-effort)
      return { fileTitle:null, filePage: DEFAULTS.fallbackFilePage, url: directUrl, credit: '' };
    }
    return fileUrlFor(fileTitle);
  }

  function extMetaToCredit(meta){
    const parts = [];
    const credit = meta.Credit?.value || meta.Artist?.value || '';
    const license = meta.LicenseShortName?.value || '';
    const usage = meta.UsageTerms?.value || '';
    if (credit) parts.push(credit.replace(/<\/?[^>]+>/g,'').trim());
    if (license) parts.push(`License: ${license}`);
    if (usage && usage !== license) parts.push(usage.replace(/<\/?[^>]+>/g,'').trim());
    return parts.join(' • ');
  }

  // ---------- Public render ----------
  async function showForChassis(chassisName) {
    const { host, img, aFile, aPage, tEl, cEl } = ensureMount();
    if (!host || !img) return;

    const reqId = ++currentReq;

    const base = String(chassisName || '').trim();
    const alias = cfg.useAlias ? (aliasPairs[base] || null) : null;
    const pageTitle = await pickBestSarnaTitle(base, alias);

    if (reqId !== currentReq) return; // stale

    const pageUrl = `https://www.sarna.net/wiki/${encodeURIComponent(pageTitle.replace(/ /g,'_'))}`;
    aPage.href = pageUrl;

    // Fetch lead image (or fallback)
    let info = null;
    try {
      info = await fetchLeadImage(pageTitle, cfg.thumbSize);
    } catch (e) { /* ignore; fallback below */ }

    if (reqId !== currentReq) return; // stale

    if (info?.url) {
      img.src = info.url;
      img.alt = `${base} — image from Sarna`;
      aFile.href = info.url;
      aFile.style.display = '';
      tEl.textContent = `${pageTitle}`;
      cEl.textContent = info.credit || 'Image credit not provided; see Sarna file page for details.';
    } else {
      // fallback
      img.src = cfg.fallbackImageUrl;
      img.alt = `${base} — image not found`;
      aFile.href = cfg.fallbackFilePage;
      aFile.style.display = 'none'; // no direct file
      tEl.textContent = `${pageTitle} (fallback)`;
      cEl.textContent = 'Image not found — showing fallback image.';
    }
  }

  // ---------- Init / auto-bind ----------
  function init(options = {}) {
    Object.assign(cfg, options || {});
    ensureMount();

    // Light auto-bind: watch Overview mech name text and react
    const ov = document.getElementById('ov-mech');
    if (ov && !ov._imgObsAttached) {
      ov._imgObsAttached = true;
      let last = '';
      const obs = new MutationObserver(() => {
        const now = (ov.textContent || '').trim();
        if (now && now !== last) { last = now; showForChassis(now); }
      });
      obs.observe(ov, { childList:true, characterData:true, subtree:true });
      // seed
      const seed = (ov.textContent || '').trim();
      if (seed) showForChassis(seed);
    }
  }

  // expose API
  window.Images = {
    init,
    onChassisChange: showForChassis
  };

  // auto-init later to avoid blocking boot
  window.addEventListener('load', () => init(), { once:true });
})();
