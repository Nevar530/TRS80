/* ===== TRS:80 Images Module — modules/images.js (no-distort) ===== */
(() => {
  'use strict';

  const API = 'https://www.sarna.net/wiki/api.php';
  const THUMB_SIZE_DEFAULT = 900;

  // Fallback image (your repo)
  const DEFAULT_FALLBACK_IMAGEURL =
    'https://raw.githubusercontent.com/Nevar530/TRS80/main/images/background.png';

// Titles that need (BattleMech) to avoid disambiguation on Sarna
// (picked from your chassis list where Sarna’s page title includes “(BattleMech)”)
const needsBMQualifier = new Set([
  'Apollo','Avatar','Banshee','Blackjack','Blade','Blitzkrieg','Brigand','Buccaneer',
  'Calliope','Centurion','Cerberus','Cobra','Crossbow','Daedalus','Dart','Defiance',
  'Eagle','Excalibur','Firestarter','Galahad','Hammer','Helios','Hercules','Phoenix',
  'Scorpion'
]);



// IS ⇄ Clan alias pairs (both directions), per Sarna’s alias list
const aliasPairs = {
  // 20–45t
  'Emerald Harrier':'Roadrunner', 'Roadrunner':'Emerald Harrier',
  'Howler':'Baboon',              'Baboon':'Howler',
  'Fire Moth':'Dasher',           'Dasher':'Fire Moth',
  'Mist Lynx':'Koshi',            'Koshi':'Mist Lynx',
  'Arctic Cheetah':'Hankyu',      'Hankyu':'Arctic Cheetah',
  'Kit Fox':'Uller',              'Uller':'Kit Fox',
  'Incubus':'Vixen',              'Vixen':'Incubus',
  'Horned Owl':'Peregrine',       'Peregrine':'Horned Owl',
  'Adder':'Puma',                 'Puma':'Adder',
  'Viper':'Dragonfly',            'Dragonfly':'Viper',
  'Ice Ferret':'Fenris',          'Fenris':'Ice Ferret',
  'Mongrel':'Grendel',            'Grendel':'Mongrel',
  'Nova':'Black Hawk',            'Black Hawk':'Nova',
  'Conjurer':'Hellhound',         'Hellhound':'Conjurer',
  'Huntsman':'Nobori-nin',        'Nobori-nin':'Huntsman',
  'Vapor Eagle':'Goshawk',        'Goshawk':'Vapor Eagle',

  // 50–65t
  'Stormcrow':'Ryoken',           'Ryoken':'Stormcrow',
  'Mad Dog':'Vulture',            'Vulture':'Mad Dog',
  'Mad Dog Mk III':'Vulture Mk III','Vulture Mk III':'Mad Dog Mk III',
  'Mad Dog Mk IV':'Vulture Mk IV','Vulture Mk IV':'Mad Dog Mk IV',
  'Ebon Jaguar':'Cauldron-Born',  'Cauldron-Born':'Ebon Jaguar',
  'Hellbringer':'Loki',           'Loki':'Hellbringer',
  'Hel':'Loki Mk II',             'Loki Mk II':'Hel',
  'Summoner':'Thor',              'Thor':'Summoner',
  'Grand Summoner':'Thor II',     'Thor II':'Grand Summoner',

  // 75–100t
  'Timber Wolf':'Mad Cat',        'Mad Cat':'Timber Wolf',
  'Savage Wolf':'Mad Cat Mk IV',  'Mad Cat Mk IV':'Savage Wolf',
  'Gargoyle':'Man O\' War',       'Man O\' War':'Gargoyle',
  'Warhawk':'Masakari',           'Masakari':'Warhawk',
  'Executioner':'Gladiator',      'Gladiator':'Executioner',
  'Stone Rhino':'Behemoth',       'Behemoth':'Stone Rhino',
  'Dire Wolf':'Daishi',           'Daishi':'Dire Wolf',
  'Bane':'Kraken',                'Kraken':'Bane'
};



  const titleCase = s => String(s||'')
    .replace(/[_\-]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g,c=>c.toUpperCase());

  const encTitle = s => encodeURIComponent(String(s||'').replace(/ /g,'_'));
  const pageUrlFromTitle = t => `https://www.sarna.net/wiki/${encTitle(t)}`;

  function normalizeChassisTitle(name){
    if (!name) return '';
    let base = titleCase(name);
    if (needsBMQualifier.has(base)) base = `${base} (BattleMech)`;
    return base;
  }

  async function fetchLeadThumb(title, width){
    const url = `${API}?action=query&format=json&origin=*&redirects=1&prop=pageimages&piprop=thumbnail|name&pithumbsize=${width}&titles=${encodeURIComponent(title)}`;
    const r = await fetch(url, { mode:'cors' }); if(!r.ok) return null;
    const data = await r.json();
    const page = data?.query?.pages?.[Object.keys(data.query.pages)[0]];
    if (page?.thumbnail?.source){
      return { thumbUrl: page.thumbnail.source, fileTitle: page?.pageimage ? `File:${page.pageimage}` : null, credits: null };
    }
    return null;
  }

  async function fetchFirstFileThumbWithCredits(title, width){
    const listUrl = `${API}?action=query&format=json&origin=*&redirects=1&prop=images&imlimit=50&titles=${encodeURIComponent(title)}`;
    const r = await fetch(listUrl, { mode:'cors' }); if(!r.ok) return null;
    const data = await r.json();
    const page = data?.query?.pages?.[Object.keys(data.query.pages)[0]];
    const files = page?.images || [];
    const fileTitles = files.map(f=>f.title).filter(t=>/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(t));
    if (!fileTitles.length) return null;

    const filesParam = fileTitles.map(encodeURIComponent).join('|');
    const infoUrl = `${API}?action=query&format=json&origin=*&redirects=1&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=${width}&titles=${filesParam}`;
    const ir = await fetch(infoUrl, { mode:'cors' }); if(!ir.ok) return null;
    const id = await ir.json();
    const ip = id?.query?.pages || {};
    for (const k of Object.keys(ip)){
      const p = ip[k];
      const ii = p?.imageinfo?.[0];
      if (ii?.thumburl || ii?.url){
        return {
          thumbUrl: ii.thumburl || ii.url,
          fileTitle: p.title,
          credits: ii.extmetadata || null
        };
      }
    }
    return null;
  }

  async function resolveImageForTitle(title, width){
    const lead = await fetchLeadThumb(title, width);
    if (lead?.thumbUrl) return lead;
    const first = await fetchFirstFileThumbWithCredits(title, width);
    if (first?.thumbUrl) return first;
    return null;
  }

  // Try primary → alias → fallback; always return a Sarna page to open (primary or alias)
  async function resolveForChassis(rawName, { width, useAlias, fallbackImg }){
    const primary = normalizeChassisTitle(rawName);

    let res = await resolveImageForTitle(primary, width);
    if (res) return { result: res, openPageTitle: primary, note: '' };

    if (useAlias){
      const base = titleCase(rawName);
      const alias = aliasPairs[base];
      if (alias){
        const aliasTitle = normalizeChassisTitle(alias);
        res = await resolveImageForTitle(aliasTitle, width);
        if (res) return { result: res, openPageTitle: aliasTitle, note: `No image for “${base}”; using alias “${aliasTitle}”.` };
        return { result: { thumbUrl: fallbackImg, fileTitle: null, credits: null }, openPageTitle: aliasTitle, note: `Image not found — alias “${aliasTitle}”; showing fallback.` };
      }
    }

    return { result: { thumbUrl: fallbackImg, fileTitle: null, credits: null }, openPageTitle: primary, note: 'Image not found — showing fallback.' };
  }

  function renderCredits(el, credits, fileTitle){
    if (!el) return;
    let parts = [];
    const get = k => credits?.[k]?.value?.trim();
    const author = get('Artist') || get('Author') || get('Credit');
    const license = get('LicenseShortName');
    const licenseUrl = get('LicenseUrl') || get('LicenseUrlShort');

    if (fileTitle) parts.push(`File: ${String(fileTitle).replace(/^File:/,'')}`);
    if (author) parts.push(`Author: ${author}`);
    if (license && licenseUrl) parts.push(`License: <a href="${licenseUrl}" target="_blank" rel="noopener">${license}</a>`);
    else if (license) parts.push(`License: ${license}`);
    if (!parts.length) parts.push('(no credits available)');

    el.innerHTML = parts.join(' &nbsp;·&nbsp; ');
  }

  function mountUI(host){
    host.innerHTML = `
      <div class="imgwrap" style="width:100%;background:#0a0d14;border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative">
        <img id="img-art" alt="Mech image" style="display:block;"/>
        <div id="img-ph" class="small dim" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">Select a ’Mech…</div>
      </div>

      <div id="img-btnrow" class="btnrow" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <a id="btn-sarna" class="btn sm" href="#" target="_blank" rel="noopener">Open Sarna Page</a>
        <a id="btn-image" class="btn sm ghost" href="#" target="_blank" rel="noopener">Open Image</a>
      </div>

      <div id="img-credits" class="small dim" style="margin-top:6px;"></div>
      <div id="img-note" class="small dim" style="margin-top:4px;"></div>
    `;
    return {
      frame: host.querySelector('.imgwrap'),
      img: host.querySelector('#img-art'),
      ph: host.querySelector('#img-ph'),
      btnSarna: host.querySelector('#btn-sarna'),
      btnImage: host.querySelector('#btn-image'),
      credits: host.querySelector('#img-credits'),
      note: host.querySelector('#img-note')
    };
  }

  const Images = {
    _cfg: {
      mountSel: '#image-panel',
      thumbSize: THUMB_SIZE_DEFAULT,
      useAlias: true,
      fallbackImageUrl: DEFAULT_FALLBACK_IMAGEURL
    },
    _els: null,

    init(opts = {}){
      this._cfg = { ...this._cfg, ...opts };
      const host = document.querySelector(this._cfg.mountSel);
      if (!host) { console.warn('[Images] mount not found:', this._cfg.mountSel); return; }
      this._els = mountUI(host);

      // dynamic sizing on resize + when tab shown
      window.addEventListener('resize', () => this.reflow());
      const pane = document.getElementById('pane-image');
      if (pane) {
        const mo = new MutationObserver(() => {
          if (pane.classList.contains('is-active')) this.reflow();
        });
        mo.observe(pane, { attributes:true, attributeFilter:['class'] });
      }
      this.reflow();
    },

    // Compute scale to fit inside (maxW, maxH) without upscaling, preserving aspect ratio.
    _fitContain(nw, nh, maxW, maxH){
      if (!nw || !nh) return { w: 0, h: 0 };
      const s = Math.min(1, maxW / nw, maxH / nh); // never upscale (>1)
      return { w: Math.floor(nw * s), h: Math.floor(nh * s) };
    },

    reflow(){
      if (!this._els) return;
      const host = document.querySelector(this._cfg.mountSel);
      const { frame, img } = this._els;
      if (!host || !frame || !img) return;

      // If image not loaded yet, just let the placeholder show.
      if (!img.complete || !img.naturalWidth || !img.naturalHeight) {
        frame.style.height = '240px';
        return;
      }

      const btnrow = document.getElementById('img-btnrow');
      const credits = document.getElementById('img-credits');
      const note = document.getElementById('img-note');

      // Available area for the image (no scroll): viewport minus controls
      const hostRect = host.getBoundingClientRect();
      const controlsH =
        (btnrow?.offsetHeight || 0) +
        (credits?.offsetHeight || 0) +
        (note?.offsetHeight || 0) + 20; // padding
      const maxH = Math.max(160, Math.floor(window.innerHeight - hostRect.top - controlsH - 24));
      const maxW = Math.max(160, host.clientWidth - 2); // minus borders

      const { w, h } = this._fitContain(img.naturalWidth, img.naturalHeight, maxW, maxH);

      // Apply exact pixel size (prevents any CSS stretching)
      img.style.width = w + 'px';
      img.style.height = h + 'px';
      frame.style.height = h + 'px';
    },

    async setChassis(name){
      if (!this._els) this.init();
      const { img, ph, btnSarna, btnImage, credits, note } = this._els;
      if (!img) return;

      img.removeAttribute('width');
      img.removeAttribute('height');
      img.style.width = '';
      img.style.height = '';

      ph.textContent = 'Loading image…';
      ph.style.opacity = 1;
      credits.textContent = '';
      note.textContent = '';
      btnSarna.href = '#';
      btnImage.href = '#';

      if (!name) { ph.textContent = 'No chassis selected'; return; }

      try {
        const cfg = this._cfg;
        const resolved = await resolveForChassis(name, {
          width: cfg.thumbSize,
          useAlias: cfg.useAlias,
          fallbackImg: cfg.fallbackImageUrl
        });

        const { result, openPageTitle, note: noteText } = resolved;

        img.onload = () => {
          ph.style.opacity = 0;
          this.reflow();
        };
        img.src = result.thumbUrl;
        img.alt = `${openPageTitle} image`;

        // Buttons
        btnSarna.href = pageUrlFromTitle(openPageTitle);
        btnImage.href = result.thumbUrl;

        // Credits & note
        renderCredits(credits, result.credits, result.fileTitle);
        note.textContent = noteText || '';

        // one more after layout settles
        requestAnimationFrame(() => this.reflow());
      } catch (e) {
        console.warn('[Images] lookup failed', e);
        ph.textContent = 'Lookup failed — showing fallback';
        img.onload = () => { ph.style.opacity = 0; this.reflow(); };
        img.src = this._cfg.fallbackImageUrl;
        img.alt = 'Fallback image';
        btnSarna.href = '#';
        btnImage.href = this._cfg.fallbackImageUrl;
        credits.textContent = '';
        note.textContent = 'Network/API error.';
        requestAnimationFrame(() => this.reflow());
      }
    }
  };

  // Expose & auto-init with defaults
  window.Images = Images;
  if (document.readyState !== 'loading') Images.init();
  else document.addEventListener('DOMContentLoaded', () => Images.init());
})();
