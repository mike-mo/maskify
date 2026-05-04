'use strict';

let _lastFire = 0;

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'mask-page') return;

  const now = Date.now();
  if (now - _lastFire < 75) return;
  _lastFire = now;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const settings = await chrome.storage.sync.get({
    domain: '',
    addNumber: true,
    addLastInitial: false,
    showAsterisk: true,
    maskCount: 0,
  });

  const domain = settings.domain || 'example.com';

  try {
    await chrome.tabs.sendMessage(tab.id, {
      domain,
      addNumber: settings.addNumber,
      addLastInitial: settings.addLastInitial,
      showAsterisk: settings.showAsterisk,
    });
    chrome.storage.sync.set({ maskCount: settings.maskCount + 1 });
  } catch {
    // Content script not injected — user needs to refresh the page
  }
});
