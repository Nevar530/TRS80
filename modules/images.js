/* ===== TRS:80 Images Module — modules/images.js ===== */
(() => {
  'use strict';

  const API = 'https://www.sarna.net/wiki/api.php';
  const THUMB_SIZE_DEFAULT = 900;

  // Default fallback (you can keep these, or override in init)
  const DEFAULT_FALLBACK_FILEPAGE = 'https://www.sarna.net/wiki/File:Deep_Periphery_-_lg.png';
  const DEFAULT_FALLBACK_IMAGEURL = 'https://cf.sarna.net/w/images/7/7b/Deep_Periphery_-_lg.png';

  // Titles that need (BattleMech) suffix to avoid disambiguation
  const needsBMQualifier = new Set(['Scorpion','Phoenix','Crab','Hawk','Falcon','Raven','Manticore','Cobra']);

  // IS ⇄ Clan alias pairs
  const aliasPairs = {
    'Mad Cat':'Timber Wolf', 'Timber Wolf':'Mad Cat',
    'Summoner':'Thor',       'Thor':'Summoner',
    'Warhawk':'Masakari',    'Masakari':'Warhawk',
    'Hellbringer':'Loki',    'Loki':'Hellbringer',
    'Stormcrow':'Ryoken',    'Ryoken':'Stormcrow'
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
    // keep parentheses if present (e.g., "Hellbringer (Loki)")
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

  async function resolveForChassis(rawName, { width, useAlias, fallbackImg, fallbackFilePage }){
    const primary = normalizeChassisTitle(rawName);
    let res = await resolveImageForTitle(primary, width);
    if (res) return { result: res, pageTitle: primary, usedAlias: false, globalFallback:false };

    if (useAlias){
      const base = titleCase(rawName);
      const alias = aliasPairs[base];
      if (alias){
        const aliasTitle = normalizeChassisTitle(alias);
        res = await resolveImageForTitle(aliasTitle, width);
        if (res) return { result: res, pageTitle: aliasTitle, usedAlias: true, aliasOf: base, globalFallback:false };
      }
    }

    return {
      result: { thumbUrl: fallbackImg, fileTitle: 'File:Deep_Periphery_-_lg.png', credits: null },
      pageTitle: 'Deep Periphery',
      usedAlias: false,
      globalFallback: true
    };
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

  // ------- Minimal UI scaffold (uses your existing CSS tokens) -------
  function mountUI(host){
    host.innerHTML = `
      <div class="imgwrap" style="width:100%;aspect-ratio:4/3;background:#0a0d14;border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative">
        <img id="img-art" alt="Mech image" style="max-width:100%;max-height:100%;display:block"/>
        <div id="img-ph" class="small dim" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">Select a ’Mech…</div>
      </div>

      <div class="btnrow" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <a id="btn-sarna" class="btn sm" href="#" target="_blank" rel="noopener">Open Sarna Page</a>
        <a id="btn-image" class="btn sm ghost" href="#" target="_blank" rel="noopener">Open Image</a>
      </div>

      <div id="img-credits" class="small dim" style="margin-top:6px;"></div>
      <div id="img-note" class="small dim" style="margin-top:4px;"></div>
    `;
    return {
      img: host.querySelector('#img-art'),
      ph: host.querySelector('#img-ph'),
      btnSarna: host.querySelector('#btn-sarna'),
      btnImage: host.querySelector('#btn-image'),
      credits: host.querySelector('#img-credits'),
      note: host.querySelector('#img-note')
    };
  }

  // ------- Public module -------
  const Images = {
    _cfg: {
      mountSel: '#image-panel',
      thumbSize: THUMB_SIZE_DEFAULT,
      useAlias: true,
      fallbackImageUrl: DEFAULT_FALLBACK_IMAGEURL,
      fallbackFilePage: DEFAULT_FALLBACK_FILEPAGE
    },
    _els: null,

    init(opts = {}){
      this._cfg = { ...this._cfg, ...opts };
      const host = document.querySelector(this._cfg.mountSel);
      if (!host) { console.warn('[Images] mount not found:', this._cfg.mountSel); return; }
      this._els = mountUI(host);
    },

    async setChassis(name){
      if (!this._els) this.init();
      const { img, ph, btnSarna, btnImage, credits, note } = this._els;
      if (!img) return;

      // reset UI
      img.src = '';
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
          fallbackImg: cfg.fallbackImageUrl,
          fallbackFilePage: cfg.fallbackFilePage
        });

        const { result, pageTitle, usedAlias, aliasOf, globalFallback } = resolved;
        img.src = result.thumbUrl;
        img.alt = `${pageTitle} image`;
        ph.style.opacity = 0;

        // Buttons
        btnSarna.href = globalFallback ? cfg.fallbackFilePage : pageUrlFromTitle(pageTitle);
        btnImage.href = result.thumbUrl;

        // Credits
        renderCredits(credits, result.credits, result.fileTitle);

        // Note
        if (usedAlias) {
          note.textContent = `No image found for “${aliasOf}”; using alias page “${pageTitle}”.`;
        } else if (globalFallback) {
          note.textContent = `Image not found — showing fallback.`;
        } else {
          note.textContent = '';
        }
      } catch (e) {
        console.warn('[Images] lookup failed', e);
        ph.textContent = 'Lookup failed — showing fallback';
        img.src = this._cfg.fallbackImageUrl;
        btnSarna.href = this._cfg.fallbackFilePage;
        btnImage.href = this._cfg.fallbackImageUrl;
        credits.textContent = '';
        note.textContent = 'Network/API error.';
      }
    }
  };

  // Expose & auto-init on DOM ready
  window.Images = Images;
  if (document.readyState !== 'loading') Images.init();
  else document.addEventListener('DOMContentLoaded', () => Images.init());

})();
