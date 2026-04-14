document.addEventListener('DOMContentLoaded', function () {
  const domainInput = document.getElementById('domainInput');
  const addNumberInput = document.getElementById('addNumber');
  const addLastInitialInput = document.getElementById('addLastInitial');
  const showAsteriskInput = document.getElementById('showAsterisk');
  const previewAddress = document.getElementById('previewAddress');

  function updatePreview() {
    const domain = domainInput.value.trim() || 'example.com';
    const marker = showAsteriskInput.checked ? '***' : '';
    let localPart = 'alice';
    if (addLastInitialInput.checked) localPart += '_r';
    if (addNumberInput.checked) localPart += '7';
    previewAddress.textContent = `${localPart}${marker}@${domain}`;
  }

  [domainInput, addNumberInput, addLastInitialInput, showAsteriskInput].forEach(el => {
    el.addEventListener('input', updatePreview);
    el.addEventListener('change', updatePreview);
  });

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
      const domain = domainInput.value.trim() || 'example.com';
      const addNumber = addNumberInput.checked;
      const addLastInitial = addLastInitialInput.checked;
      const showAsterisk = showAsteriskInput.checked;

      chrome.storage.sync.set({ domain: domainInput.value.trim(), addNumber, addLastInitial, showAsterisk });

      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { domain, addNumber, addLastInitial, showAsterisk }, function () {
          window.close();
        });
      });
    };
  }
});
