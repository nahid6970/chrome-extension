document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'circularApplyStatuses';
  const statusCount = document.getElementById('status-manager-count');
  const statusSearch = document.getElementById('status-search');
  const statusMessage = document.getElementById('status-manager-message');
  const statusList = document.getElementById('saved-status-list');
  const clearAllButton = document.getElementById('clear-all-statuses');
  let savedStatuses = {};

  function statusValue(value) {
    if (typeof value === 'string') return value;
    return typeof value?.status === 'string' ? value.status : 'unknown';
  }

  function statusLabel(identity, value) {
    if (typeof value?.label === 'string' && value.label.trim()) return value.label.trim();
    const headingPart = identity.split('::')[0];
    return headingPart.replace(/-/g, ' ').trim() || 'Untitled circular';
  }

  function setMessage(message, state = '') {
    statusMessage.textContent = message;
    if (state) statusMessage.dataset.state = state;
    else delete statusMessage.dataset.state;
  }

  function renderStatusList() {
    const query = statusSearch.value.trim().toLocaleLowerCase();
    const entries = Object.entries(savedStatuses).map(([identity, value]) => ({
      identity,
      value,
      label: statusLabel(identity, value),
      status: statusValue(value)
    }));
    const visibleEntries = entries.filter(entry =>
      `${entry.label} ${entry.identity} ${entry.status}`.toLocaleLowerCase().includes(query)
    );

    statusCount.textContent = query
      ? `${entries.length} saved · ${visibleEntries.length} shown`
      : `${entries.length} saved`;
    clearAllButton.disabled = entries.length === 0;
    statusList.replaceChildren();

    if (!visibleEntries.length) {
      const emptyState = document.createElement('div');
      emptyState.id = 'status-empty-state';
      emptyState.dataset.testid = 'status-empty-state';
      emptyState.textContent = query
        ? 'No saved statuses match your search.'
        : 'No saved circular statuses yet. Right-click a circular in the page list to set one.';
      statusList.appendChild(emptyState);
      return;
    }

    visibleEntries.forEach((entry, index) => {
      const card = document.createElement('article');
      card.id = `saved-status-row-${index + 1}`;
      card.className = 'saved-status-card';
      card.dataset.testid = 'saved-status-row';
      card.dataset.identity = entry.identity;
      card.dataset.status = entry.status;

      const details = document.createElement('div');
      details.className = 'saved-status-details';
      const name = document.createElement('h2');
      name.className = 'saved-status-name';
      name.textContent = entry.label;
      const identity = document.createElement('p');
      identity.className = 'saved-status-identity';
      identity.textContent = entry.identity;
      details.append(name, identity);

      const badge = document.createElement('span');
      badge.className = 'saved-status-badge';
      badge.dataset.testid = 'saved-status-value';
      badge.textContent = entry.status === 'cannot-apply'
        ? '✕ Cannot apply'
        : entry.status === 'can-apply' ? '✓ Can apply' : entry.status;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'manager-button remove-saved-status';
      removeButton.dataset.testid = 'remove-saved-status';
      removeButton.dataset.identity = entry.identity;
      removeButton.textContent = 'Remove';
      removeButton.setAttribute('aria-label', `Remove saved status for ${entry.label}`);
      removeButton.addEventListener('click', () => removeStatus(entry.identity));

      card.append(details, badge, removeButton);
      statusList.appendChild(card);
    });
  }

  function loadStatuses() {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        setMessage(`Could not read saved statuses: ${error.message}`, 'error');
        return;
      }
      const value = result[STORAGE_KEY];
      savedStatuses = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      renderStatusList();
    });
  }

  function removeStatus(identity) {
    const nextStatuses = { ...savedStatuses };
    delete nextStatuses[identity];
    const callback = () => {
      const error = chrome.runtime.lastError;
      if (error) {
        setMessage(`Could not remove status: ${error.message}`, 'error');
        return;
      }
      savedStatuses = nextStatuses;
      setMessage('Status removed.', 'success');
      renderStatusList();
    };

    if (Object.keys(nextStatuses).length) {
      chrome.storage.local.set({ [STORAGE_KEY]: nextStatuses }, callback);
    } else {
      chrome.storage.local.remove(STORAGE_KEY, callback);
    }
  }

  function clearAllStatuses() {
    if (!Object.keys(savedStatuses).length) return;
    if (!window.confirm('Remove all saved circular statuses from this extension?')) return;

    chrome.storage.local.remove(STORAGE_KEY, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        setMessage(`Could not clear statuses: ${error.message}`, 'error');
        return;
      }
      savedStatuses = {};
      setMessage('All saved statuses removed.', 'success');
      renderStatusList();
    });
  }

  function closeManager() {
    chrome.tabs.getCurrent((tab) => {
      if (tab?.id) chrome.tabs.remove(tab.id);
      else window.close();
    });
  }

  statusSearch.addEventListener('input', renderStatusList);
  clearAllButton.addEventListener('click', clearAllStatuses);
  document.getElementById('close-status-manager').addEventListener('click', closeManager);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEY]) loadStatuses();
  });

  loadStatuses();
});
