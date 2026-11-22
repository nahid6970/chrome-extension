// Add fixed controls for moving between circular photos on BD Govt Job posts.
(function () {
  'use strict';

  const HOST_ID = '__circular-photo-navigator__';
  const IMAGE_SELECTOR = 'img[id^="job-circular-image-"], img.bdg-zoomable';
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
  let count;
  let previousButton;
  let nextButton;
  let groupCount;

  function sourceGroupKey(image) {
    const fileName = new URL(image.currentSrc || image.src, location.href).pathname.split('/').pop() || '';
    return fileName.replace(/\.(?:jpe?g|png|webp|gif)$/i, '').replace(/[-_]\d+$/i, '').toLowerCase();
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

      const key = circularHeading || sourceGroupKey(image);
      let group = nextGroups.find(entry => entry.key === key);
      if (!group) {
        group = { key, images: [] };
        nextGroups.push(group);
      }
      group.images.push(image);
    });

    groups = nextGroups;
    return groups;
  }

  function updateControls() {
    if (!count || !groupCount || !previousButton || !nextButton) return;
    const group = groups[currentGroupIndex];
    const total = groups.reduce((sum, entry) => sum + entry.images.length, 0);
    const photoTotal = group?.images.length || 0;
    count.textContent = photoTotal ? `${currentIndex + 1} / ${photoTotal}` : '0 / 0';
    groupCount.textContent = groups.length ? `Circular ${currentGroupIndex + 1} / ${groups.length}` : 'No photos';
    count.title = group ? `Photo ${currentIndex + 1} of ${photoTotal} in circular ${currentGroupIndex + 1} of ${groups.length}` : 'No circular photos found';
    previousButton.disabled = total < 2;
    nextButton.disabled = total < 2;
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

  function goToImage(direction) {
    refreshImages();
    if (groups.length < 1) return;

    const currentGroup = groups[currentGroupIndex];
    const nextPhotoIndex = currentIndex + direction;
    if (nextPhotoIndex < 0) {
      currentGroupIndex = (currentGroupIndex - 1 + groups.length) % groups.length;
      currentIndex = groups[currentGroupIndex].images.length - 1;
    } else if (nextPhotoIndex >= currentGroup.images.length) {
      currentGroupIndex = (currentGroupIndex + 1) % groups.length;
      currentIndex = 0;
    } else {
      currentIndex = nextPhotoIndex;
    }
    updateControls();
    groups[currentGroupIndex].images[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function injectControls() {
    if (document.getElementById(HOST_ID)) {
      host = document.getElementById(HOST_ID);
      shadow = host.shadowRoot;
      if (shadow) {
        count = shadow.getElementById('photo-count');
        groupCount = shadow.getElementById('circular-count');
        previousButton = shadow.getElementById('previous-photo');
        nextButton = shadow.getElementById('next-photo');
      }
      return;
    }

    host = document.createElement('div');
    host.id = HOST_ID;
    host.dataset.testid = 'circular-photo-navigator';
    host.setAttribute('style',
      'all:initial!important;position:fixed!important;right:14px!important;top:50%!important;' +
      'transform:translateY(-50%)!important;z-index:2147483647!important;' +
      'width:92px!important;display:none!important;pointer-events:none!important;'
    );

    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 7px;
          padding: 7px 5px;
          border: 1px solid rgba(255,255,255,.2);
          border-radius: 24px;
          background: rgba(24, 28, 34, .92);
          box-shadow: 0 3px 14px rgba(0,0,0,.35);
          color: #fff;
          font: 600 11px/1 system-ui, sans-serif;
          pointer-events: auto;
          backdrop-filter: blur(8px);
        }
        button {
          all: unset;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          box-sizing: border-box;
          border-radius: 50%;
          background: #1677c8;
          color: white;
          cursor: pointer;
          font: 24px/1 system-ui, sans-serif;
          text-align: center;
          user-select: none;
          transition: background .15s ease, transform .15s ease;
        }
        button:hover { background: #0d5fa5; transform: scale(1.07); }
        button:focus-visible { outline: 2px solid white; outline-offset: 2px; }
        button:disabled { cursor: default; opacity: .5; }
        button:disabled:hover { transform: none; }
        #photo-count { min-width: 34px; text-align: center; white-space: nowrap; }
        #circular-count { font-size: 9px; white-space: nowrap; color: #b8dfff; }
      </style>
      <nav class="controls" id="circular-photo-controls" aria-label="Circular photo navigation">
        <button id="previous-photo" type="button" aria-label="Previous circular photo" title="Previous photo">‹</button>
        <span id="photo-count" aria-live="polite">0 / 0</span>
        <span id="circular-count" aria-label="Circular position">Circular 0 / 0</span>
        <button id="next-photo" type="button" aria-label="Next circular photo" title="Next photo">›</button>
      </nav>
    `;

    count = shadow.getElementById('photo-count');
    groupCount = shadow.getElementById('circular-count');
    previousButton = shadow.getElementById('previous-photo');
    nextButton = shadow.getElementById('next-photo');
    previousButton.addEventListener('click', () => goToImage(-1));
    nextButton.addEventListener('click', () => goToImage(1));
    document.documentElement.appendChild(host);
  }

  function init() {
    if (!document.documentElement) return;
    injectControls();
    refreshImages();
    scheduleScrollSync();
    window.addEventListener('scroll', scheduleScrollSync, { passive: true });
    window.addEventListener('resize', scheduleScrollSync, { passive: true });

    const observer = new MutationObserver(() => {
      clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshImages();
        scheduleScrollSync();
      }, 150);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
