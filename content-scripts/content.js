'use strict';

const MASKIFY_NAMES_BY_LOCALE = {
  en: MASKIFY_NAMES_EN,
  es: MASKIFY_NAMES_ES,
};
const _uiLanguage = (
  (typeof chrome !== 'undefined' &&
    chrome.i18n &&
    typeof chrome.i18n.getUILanguage === 'function' &&
    chrome.i18n.getUILanguage()) ||
  navigator.language ||
  'en'
);
const _lang = _uiLanguage.split('-')[0].toLowerCase();
const MASKIFY_NAMES = MASKIFY_NAMES_BY_LOCALE[_lang] || MASKIFY_NAMES_EN;

const replacements = new Set();

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function getSafeDomain(value) {
  return isValidDomain(value) ? value.trim().toLowerCase() : 'example.com';
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  const fakeEmails = {};
  const domain = getSafeDomain(request.domain);
  const { addNumber = true, addLastInitial = false, showAsterisk = true } = request;

  function getFakeEmail(baseEmail) {
    if (!fakeEmails[baseEmail]) {
      const name = MASKIFY_NAMES[Math.floor(Math.random() * MASKIFY_NAMES.length)];
      const marker = showAsterisk ? '***' : '';

      let localPart = name;
      if (addLastInitial) {
        localPart += '_' + String.fromCharCode(97 + Math.floor(Math.random() * 26));
      }
      if (addNumber) {
        localPart += Math.floor(Math.random() * 99) + 1;
      }

      const emitted = `${localPart}${marker}@${domain}`;
      if (!marker) replacements.add(emitted);
      fakeEmails[baseEmail] = emitted;
    }
    return fakeEmails[baseEmail];
  }

  function replaceEmailAddresses() {
    const replace = str => str.replace(EMAIL_RE, match => {
      if (replacements.has(match)) return match;
      return getFakeEmail(match);
    });

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      node.nodeValue = replace(node.nodeValue);
    }

    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (href) a.setAttribute('href', replace(href));
    });

    document.querySelectorAll('input').forEach(input => {
      if (input.value) input.value = replace(input.value);
      if (input.placeholder) input.placeholder = replace(input.placeholder);
    });
  }

  function showToast(count) {
    const existing = document.getElementById('maskify-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'maskify-toast';

    const icon = document.createElement('img');
    icon.src = chrome.runtime.getURL('icons/maskify32x32.png');
    Object.assign(icon.style, { width: '22px', height: '22px', flexShrink: '0' });

    const textBlock = document.createElement('div');

    const title = document.createElement('div');
    title.textContent = chrome.i18n.getMessage('toastTitle');
    Object.assign(title.style, {
      fontSize: '10px',
      fontWeight: '600',
      letterSpacing: '0.6px',
      textTransform: 'uppercase',
      opacity: '0.75',
      marginBottom: '3px',
      lineHeight: '1',
    });

    const label = document.createElement('div');
    if (count === 0) {
      label.textContent = chrome.i18n.getMessage('toastNoEmails');
    } else {
      label.textContent = chrome.i18n.getMessage(
        count === 1 ? 'toastSingular' : 'toastPlural',
        [String(count)]
      );
    }

    textBlock.appendChild(title);
    textBlock.appendChild(label);
    toast.appendChild(icon);
    toast.appendChild(textBlock);

    Object.assign(toast.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '12px 20px',
      background: count === 0 ? '#555' : '#0078d4',
      color: '#fff',
      borderRadius: '8px',
      fontSize: '15px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      fontWeight: '500',
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      zIndex: '2147483647',
    });

    document.body.appendChild(toast);

    toast.animate([
      { opacity: 0, transform: 'translateY(-16px) scale(0.85)' },
      { opacity: 1, transform: 'translateY(5px) scale(1.03)', offset: 0.65 },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ], { duration: 450, easing: 'ease-out' });

    setTimeout(() => {
      toast.animate([
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: 'translateY(-10px) scale(0.95)' },
      ], { duration: 200, easing: 'ease-in', fill: 'forwards' })
        .finished.then(() => toast.remove());
    }, 2500);
  }

  replaceEmailAddresses();
  showToast(Object.keys(fakeEmails).length);

  sendResponse({});
});
