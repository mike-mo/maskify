document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('popupTitle').textContent        = chrome.i18n.getMessage('popupTitle');
  document.getElementById('popupDescription').textContent  = chrome.i18n.getMessage('popupDescription');
  document.getElementById('labelDomain').textContent       = chrome.i18n.getMessage('labelDomain');
  document.getElementById('labelAddNumber').innerHTML      = chrome.i18n.getMessage('labelAddNumber');
  document.getElementById('labelAddLastInitial').innerHTML = chrome.i18n.getMessage('labelAddLastInitial');
  document.getElementById('labelShowAsterisk').textContent = chrome.i18n.getMessage('labelShowAsterisk');
  document.getElementById('labelPreview').textContent      = chrome.i18n.getMessage('labelPreview');
  document.getElementById('sendmessageid').textContent     = chrome.i18n.getMessage('buttonMask');
  document.getElementById('donateLink').textContent        = chrome.i18n.getMessage('donateLink');

  const domainInput = document.getElementById('domainInput');
  const addNumberInput = document.getElementById('addNumber');
  const addLastInitialInput = document.getElementById('addLastInitial');
  const showAsteriskInput = document.getElementById('showAsterisk');
  const previewAddress = document.getElementById('previewAddress');

  function updatePreview() {
    const raw = domainInput.value.trim();
    const invalid = !!raw && !isValidDomain(raw);
    domainInput.classList.toggle('invalid', invalid);
    const domain = raw && !invalid ? raw.toLowerCase() : 'example.com';
    const marker = showAsteriskInput.checked ? '***' : '';
    let localPart = 'alice';
    if (addLastInitialInput.checked) localPart += '_r';
    if (addNumberInput.checked) localPart += '7';
    previewAddress.textContent = `${localPart}${marker}@${domain}`;
  }

  domainInput.addEventListener('input', updatePreview);
  addNumberInput.addEventListener('change', updatePreview);
  addLastInitialInput.addEventListener('change', updatePreview);
  showAsteriskInput.addEventListener('change', updatePreview);

  chrome.storage.sync.get({ domain: '', addNumber: true, addLastInitial: false, showAsterisk: true }, function (data) {
    domainInput.value = data.domain;
    addNumberInput.checked = data.addNumber;
    addLastInitialInput.checked = data.addLastInitial;
    showAsteriskInput.checked = data.showAsterisk;
    updatePreview();
  });

  const sendMessageId = document.getElementById('sendmessageid');
  if (sendMessageId) {
    sendMessageId.onclick = function () {
      const raw = domainInput.value.trim();
      const storedDomain = raw && isValidDomain(raw) ? raw.toLowerCase() : '';
      const domain = storedDomain || 'example.com';
      const addNumber = addNumberInput.checked;
      const addLastInitial = addLastInitialInput.checked;
      const showAsterisk = showAsteriskInput.checked;

      chrome.storage.sync.set({ domain: storedDomain, addNumber, addLastInitial, showAsterisk });

      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { domain, addNumber, addLastInitial, showAsterisk }, function () {
          window.close();
        });
      });
    };
  }
});
