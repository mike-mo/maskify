chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  'use strict';
  const fakeEmails = {};

  function generateRandomWord(length) {
    const vowels = 'aeiou';
    // declare a string of consonants where each is repeated proportionally to its frequency in English
    const consonants = 'bbcccdddfffgghhhjjkklllmmmnnnppqrrrrsssssttttttvvwwxyyz';
    let word = '';

    for (let i = 0; i < length; i++) {
      if (i % 2 === 0) {
        word += consonants.charAt(Math.floor(Math.random() * consonants.length));
      } else {
        word += vowels.charAt(Math.floor(Math.random() * vowels.length));
      }
    }
    return word;
  }

  function getFakeEmail(baseEmail) {
    if (!fakeEmails[baseEmail]) {
      const randomPart = generateRandomWord(Math.floor(3 + Math.random() * 8));
      fakeEmails[baseEmail] = `${randomPart}*@example.com`;
    }
    return fakeEmails[baseEmail];
  }

  function replaceEmailAddresses() {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const replace = str => str.replace(emailRegex, match => getFakeEmail(match));

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
    title.textContent = 'Maskify';
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
    label.textContent = count === 0
      ? 'No emails found'
      : `${count} email${count === 1 ? '' : 's'} masked`;

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
