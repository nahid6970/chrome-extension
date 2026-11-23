// Add fixed controls for moving between circular photos on BD Govt Job posts.
(function () {
  'use strict';

  const HOST_ID = '__circular-photo-navigator__';
  const IMAGE_SELECTOR = 'img[id^="job-circular-image-"], img.bdg-zoomable';
  const STATUS_STORAGE_KEY = 'circularApplyStatuses';
  const CIRCULAR_HEADING_PATTERN = /(?:নিয়োগ|নিয়োগ).*(?:বিজ্ঞপ্তি|সার্কুলার)|(?:job|recruitment).*(?:circular|notice)|circular/i;
  const hostname = location.hostname.toLowerCase();

  if (window.__circularPhotoNavigatorLoaded) return;
  window.__circularPhotoNavigatorLoaded = true;

  if (hostname !== 'bdgovtjob.net' && !hostname.endsWith('.bdgovtjob.net')) return;

  let groups = [];
  let currentIndex = 0;
  let currentGroupIndex = 0;
  let scrollFrame = 0;
  let refreshTimer = 0;
  let host;
  let shadow;
  let circularList;
  let statusMenu;
  let applyStatuses = {};
  let pendingStatusKey = null;
  let renderedGroupKeys = [];

  function normalizeLabel(value) {
    return (value || '').normalize('NFKC').trim().toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  }

  function sourceGroupKey(image) {
    const fileName = new URL(image.currentSrc || image.src, location.href).pathname.split('/').pop() || '';
    return fileName.replace(/\.(?:jpe?g|png|webp|gif)$/i, '').replace(/[-_]\d+$/i, '').toLowerCase();
  }

  function getStatus(groupKey) {
    if (applyStatuses[groupKey] === 'cannot-apply') return 'cannot-apply';
    if (applyStatuses[groupKey] === 'can-apply') return 'can-apply';
    return 'unmarked';
  }

  function collectGroups() {
    const images = Array.from(document.querySelectorAll(IMAGE_SELECTOR))
      .filter((image, index, all) => all.indexOf(image) === index && image.isConnected);
    const article = images[0]?.closest('.entry-content, article') || document;
    const headings = Array.from(article.querySelectorAll('h2, h3, h4'))
      .filter(heading => CIRCULAR_HEADING_PATTERN.test(heading.innerText || heading.textContent || ''));
    const nextGroups = [];

    images.forEach((image) => {
      let circularHeading = null;
      for (const heading of headings) {
        if (heading.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING) {
          circularHeading = heading;
        } else {
          break;
        }
      }

      const key = circularHeading || `fallback:${sourceGroupKey(image)}`;
      let group = nextGroups.find(entry => entry.key === key);
      if (!group) {
        const headingLabel = circularHeading?.innerText?.trim() || circularHeading?.textContent?.trim();
        group = { key, label: headingLabel || image.alt?.trim() || 'Job circular', images: [] };
        nextGroups.push(group);
      }
      group.images.push(image);
    });

    nextGroups.forEach((group) => {
      group.key = `${normalizeLabel(group.label) || 'circular'}::${sourceGroupKey(group.images[0]) || 'unknown-image'}`;
    });

    groups = nextGroups;
    return groups;
  }

  function renderCircularList() {
    const keysChanged = groups.length !== renderedGroupKeys.length
      || groups.some((group, index) => group.key !== renderedGroupKeys[index]);
    if (!keysChanged) return;

    circularList.replaceChildren();
    renderedGroupKeys = groups.map(group => group.key);
    groups.forEach((group, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `circular-jump-${index + 1}`;
      button.className = 'circular-item';
      button.dataset.testid = 'circular-jump';
      button.dataset.groupIndex = String(index);
      const label = document.createElement('span');
      label.className = 'circular-label';
      label.textContent = group.label;
      button.appendChild(label);
      const status = getStatus(group.key);
      button.dataset.status = status;
      const statusLabel = status === 'unmarked' ? 'No status set' : status === 'cannot-apply' ? 'Cannot apply' : 'Can apply';
      button.title = `${group.label} · ${statusLabel} · Right-click to change status`;
      button.setAttribute('aria-label', `Go to ${group.label}. ${statusLabel}. Right-click to change status.`);
      button.addEventListener('click', () => jumpToCircular(index));
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openStatusMenu(group.key, event.clientX, event.clientY);
      });
      circularList.appendChild(button);
    });
  }

  function updateControls() {
    if (!circularList) return;
    const total = groups.reduce((sum, entry) => sum + entry.images.length, 0);
    renderCircularList();
    circularList.querySelectorAll('.circular-item').forEach((button, index) => {
      const group = groups[index];
      const status = getStatus(group.key);
      button.dataset.status = status;
      const statusLabel = status === 'unmarked' ? 'No status set' : status === 'cannot-apply' ? 'Cannot apply' : 'Can apply';
      button.title = `${group.label} · ${statusLabel} · Right-click to change status`;
      button.setAttribute('aria-label', `Go to ${group.label}. ${statusLabel}. Right-click to change status.`);
      if (index === currentGroupIndex) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    });
    host.style.setProperty('display', total ? 'block' : 'none', 'important');
  }

  function refreshImages() {
    const previousImage = groups[currentGroupIndex]?.images[currentIndex];
    collectGroups();
    if (!groups.length) {
      currentIndex = 0;
      currentGroupIndex = 0;
      updateControls();
      return;
    }
    const retainedGroupIndex = previousImage
      ? groups.findIndex(group => group.images.includes(previousImage))
      : -1;
    if (retainedGroupIndex >= 0) {
      currentGroupIndex = retainedGroupIndex;
      currentIndex = groups[currentGroupIndex].images.indexOf(previousImage);
    } else {
      currentGroupIndex = Math.min(currentGroupIndex, groups.length - 1);
      currentIndex = Math.min(currentIndex, groups[currentGroupIndex].images.length - 1);
    }
    updateControls();
  }

  function syncCurrentFromScroll() {
    scrollFrame = 0;
    if (!groups.length) refreshImages();
    if (!groups.length) return;

    const centerY = window.innerHeight / 2;
    let nearestGroupIndex = 0;
    let nearestPhotoIndex = 0;
    let nearestDistance = Infinity;
    groups.forEach((group, groupIndex) => {
      group.images.forEach((image, photoIndex) => {
        const rect = image.getBoundingClientRect();
        const imageCenter = rect.top + Math.min(rect.height, window.innerHeight) / 2;
        const distance = Math.abs(imageCenter - centerY);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestGroupIndex = groupIndex;
          nearestPhotoIndex = photoIndex;
        }
      });
    });

    if (currentGroupIndex !== nearestGroupIndex || currentIndex !== nearestPhotoIndex) {
      currentGroupIndex = nearestGroupIndex;
      currentIndex = nearestPhotoIndex;
      updateControls();
    }
  }

  function scheduleScrollSync() {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(syncCurrentFromScroll);
  }

  function jumpToCircular(index) {
    refreshImages();
    if (!groups.length || !groups[index]) return;
    currentGroupIndex = index;
    currentIndex = 0;
    updateControls();
    groups[currentGroupIndex].images[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function closeStatusMenu() {
    if (!statusMenu) return;
    statusMenu.hidden = true;
    pendingStatusKey = null;
  }

  function openStatusMenu(statusKey, clientX, clientY) {
    if (!statusMenu) return;
    pendingStatusKey = statusKey;
    const maxLeft = Math.max(8, window.innerWidth - 196);
    const maxTop = Math.max(8, window.innerHeight - 112);
    statusMenu.style.left = `${Math.min(Math.max(8, clientX), maxLeft)}px`;
    statusMenu.style.top = `${Math.min(Math.max(8, clientY), maxTop)}px`;
    statusMenu.hidden = false;
    statusMenu.querySelectorAll('.status-choice').forEach((button) => {
      button.setAttribute('aria-checked', String(getStatus(statusKey) === button.dataset.status));
    });
  }

  function setCircularStatus(status) {
    if (!pendingStatusKey) return;
    const statusKey = pendingStatusKey;
    const nextStatuses = { ...applyStatuses, [statusKey]: status };
    applyStatuses = nextStatuses;
    closeStatusMenu();
    updateControls();
    chrome.storage.local.set({ [STATUS_STORAGE_KEY]: nextStatuses }, () => {
      const error = chrome.runtime.lastError;
      if (error) console.error('[Circular Photo Navigator] Could not save status:', error.message);
    });
  }

  function onStatusMenuPointerDown(event) {
    if (event.composedPath().includes(statusMenu)) return;
    closeStatusMenu();
  }

  function onStatusMenuKeyDown(event) {
    if (event.key !== 'Escape' || statusMenu?.hidden) return;
    event.preventDefault();
    closeStatusMenu();
  }

  function onStorageChanged(changes, areaName) {
    if (areaName !== 'local' || !changes[STATUS_STORAGE_KEY]) return;
    const value = changes[STATUS_STORAGE_KEY].newValue;
    applyStatuses = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    updateControls();
  }

  function injectControls() {
    if (document.getElementById(HOST_ID)) {
      host = document.getElementById(HOST_ID);
      shadow = host.shadowRoot;
      if (shadow) circularList = shadow.getElementById('circular-name-list');
      return;
    }

    host = document.createElement('div');
    host.id = HOST_ID;
    host.dataset.testid = 'circular-photo-navigator';
    host.setAttribute('style',
      'all:initial!important;position:fixed!important;right:14px!important;top:0!important;' +
      'z-index:2147483647!important;width:236px!important;height:100vh!important;' +
      'max-width:calc(100vw - 24px)!important;' +
      'display:none!important;pointer-events:none!important;'
    );

    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .controls {
          display: block;
          position: absolute;
          top: 50%;
          right: 0;
          transform: translateY(-50%);
          max-height: min(72vh, 620px);
          overflow-y: auto;
          padding: 8px;
          border: 1px solid rgba(255,255,255,.2);
          border-radius: 10px;
          background: rgba(24, 28, 34, .92);
          box-shadow: 0 3px 14px rgba(0,0,0,.35);
          pointer-events: auto;
          backdrop-filter: blur(8px);
        }
        .circular-list { display: flex; flex-direction: column; gap: 5px; }
        .circular-item {
          all: unset;
          display: flex;
          align-items: flex-start;
          width: 100%;
          min-height: 38px;
          box-sizing: border-box;
          padding: 9px 10px;
          border-radius: 6px;
          background: rgba(255,255,255,.08);
          color: #f3f6fa;
          cursor: pointer;
          font: 500 12px/1.4 system-ui, sans-serif;
          text-align: left;
          overflow-wrap: anywhere;
          transition: background .15s ease, color .15s ease;
        }
        .circular-label { flex: 1; }
        .circular-item[data-status="unmarked"]:hover { background: rgba(22,119,200,.42); }
        .circular-item[data-status="unmarked"][aria-current="location"] { background: #1677c8; color: white; }
        .circular-item[data-status="can-apply"] { background: #16452f; color: #e0ffec; }
        .circular-item[data-status="can-apply"]::before { content: "●"; flex: 0 0 12px; margin-right: 7px; color: #48d181; }
        .circular-item[data-status="cannot-apply"] { background: #3d3f42; color: #c2c4c7; }
        .circular-item[data-status="cannot-apply"]::before { content: "●"; flex: 0 0 12px; margin-right: 7px; color: #92969b; }
        .circular-item[data-status="cannot-apply"] .circular-label { text-decoration: line-through; text-decoration-thickness: 1px; }
        .circular-item[data-status="can-apply"]:hover,
        .circular-item[data-status="cannot-apply"]:hover { filter: brightness(1.2); }
        .circular-item[data-status="can-apply"][aria-current="location"],
        .circular-item[data-status="cannot-apply"][aria-current="location"] { box-shadow: inset 0 0 0 1px #75baff; }
        .circular-item:focus-visible { outline: 2px solid white; outline-offset: 1px; }
        .controls::-webkit-scrollbar { width: 6px; }
        .controls::-webkit-scrollbar-thumb { background: rgba(255,255,255,.35); border-radius: 6px; }
        #circular-status-menu {
          position: fixed;
          z-index: 10;
          width: 180px;
          padding: 6px;
          border: 1px solid rgba(255,255,255,.22);
          border-radius: 8px;
          background: #202329;
          box-shadow: 0 8px 24px rgba(0,0,0,.55);
          color: #f3f6fa;
          font: 12px/1.4 system-ui, sans-serif;
          pointer-events: auto;
        }
        #circular-status-menu[hidden] { display: none; }
        .status-choice {
          all: unset;
          display: block;
          box-sizing: border-box;
          width: 100%;
          padding: 8px 9px;
          border-radius: 5px;
          cursor: pointer;
        }
        .status-choice:hover, .status-choice[aria-checked="true"] { background: rgba(255,255,255,.12); }
        .status-choice:focus-visible { outline: 2px solid #75baff; }
        .status-choice[data-status="can-apply"] { color: #67df98; }
        .status-choice[data-status="cannot-apply"] { color: #c3c5c8; }
      </style>
      <nav class="controls" id="circular-photo-controls" aria-label="Job circulars">
        <div class="circular-list" id="circular-name-list"></div>
      </nav>
      <div id="circular-status-menu" role="menu" aria-label="Set application status" hidden>
        <button class="status-choice" id="status-can-apply" type="button" role="menuitemradio" aria-checked="false" data-status="can-apply">🟢 Can apply</button>
        <button class="status-choice" id="status-cannot-apply" type="button" role="menuitemradio" aria-checked="false" data-status="cannot-apply">⚪ Cannot apply</button>
      </div>
    `;

    circularList = shadow.getElementById('circular-name-list');
    statusMenu = shadow.getElementById('circular-status-menu');
    shadow.getElementById('status-can-apply').addEventListener('click', () => setCircularStatus('can-apply'));
    shadow.getElementById('status-cannot-apply').addEventListener('click', () => setCircularStatus('cannot-apply'));
    document.addEventListener('pointerdown', onStatusMenuPointerDown, true);
    document.addEventListener('keydown', onStatusMenuKeyDown, true);
    document.documentElement.appendChild(host);
  }

  function init() {
    if (!document.documentElement) return;
    chrome.storage.local.get([STATUS_STORAGE_KEY], (result) => {
      const storedStatuses = result[STATUS_STORAGE_KEY];
      applyStatuses = storedStatuses && typeof storedStatuses === 'object' && !Array.isArray(storedStatuses)
        ? storedStatuses
        : {};
      injectControls();
      refreshImages();
      scheduleScrollSync();
      window.addEventListener('scroll', scheduleScrollSync, { passive: true });
      window.addEventListener('resize', scheduleScrollSync, { passive: true });
      chrome.storage.onChanged.addListener(onStorageChanged);

      const observer = new MutationObserver(() => {
        clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => {
          refreshImages();
          scheduleScrollSync();
        }, 150);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
