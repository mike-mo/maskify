'use strict';

const copy = require('./copy');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function document(lang, stylesheet, body) {
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Maskify</title>
  <link rel="icon" href="/icon.png">
  <link rel="stylesheet" href="/${stylesheet}.css">
</head>
<body>${body}</body>
</html>`;
}

function demoHtml(lang) {
  const t = copy[lang].demo;
  const rows = [
    ['Carla Ruiz', t.roles[0], 'carla@team.example'],
    ['Mateo Vega', t.roles[1], 'mateo@team.example'],
    ['Carla Ruiz', t.roles[2], 'carla@team.example'],
  ];
  return document(lang, 'demo', `
    <main>
      <section id="directory" class="directory surface">
        <header><h1 data-stable>${escapeHtml(t.directory)}</h1><span>${escapeHtml(t.count)}</span></header>
        <table>
          <thead><tr>${[t.name, t.role, t.email].map(value => `<th>${escapeHtml(value)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(row => `<tr>
            <td data-stable>${escapeHtml(row[0])}</td>
            <td data-stable>${escapeHtml(row[1])}</td>
            <td class="directory-email" data-fit>${escapeHtml(row[2])}</td>
          </tr>`).join('')}</tbody>
        </table>
      </section>
      <div class="coverage">
        <section id="summary" class="surface contact">
          <div class="workspace" data-stable>${escapeHtml(t.summary)}</div>
          <h2 data-stable>${escapeHtml(t.project)}</h2>
          <span class="field-label" data-stable>${escapeHtml(t.owner)}</span>
          <strong data-stable>Carla Ruiz</strong>
          <p data-stable>${escapeHtml(t.questions)}</p>
          <p>${escapeHtml(t.reach)}<br><span id="summary-email" class="address" data-fit>carla@team.example</span></p>
        </section>
        <section id="link" class="surface contact">
          <div class="workspace" data-stable>${escapeHtml(t.linkNote)}</div>
          <h2 data-stable>${escapeHtml(t.contact)}</h2>
          <p>${escapeHtml(t.linkIntro)}</p>
          <a id="contact-link" class="address" href="mailto:carla@team.example" data-fit>carla@team.example</a>
          <div class="contact-person"><span class="avatar">CR</span><strong data-stable>Carla Ruiz</strong></div>
        </section>
        <section id="fields" class="surface contact">
          <div class="workspace" data-stable>${escapeHtml(t.details)}</div>
          <label for="email">${escapeHtml(t.email)}</label>
          <input id="email" readonly value="carla@team.example" placeholder="name@team.example">
          <label for="notes">${escapeHtml(t.notes)}</label>
          <textarea id="notes" readonly>${escapeHtml(t.noteText)}</textarea>
        </section>
      </div>
    </main>`);
}

function image(buffer, alt, className = '') {
  return `<img class="${className}" src="data:image/png;base64,${buffer.toString('base64')}" alt="${escapeHtml(alt)}">`;
}

function compositionHtml(lang, frame, images) {
  const t = copy[lang];
  const content = t[frame];
  const index = ['result', 'coverage', 'controls'].indexOf(frame) + 1;
  let demonstration;
  if (frame === 'result') {
    demonstration = `
      <div class="comparison">
        <figure class="before"><figcaption>${escapeHtml(content.before)}</figcaption>${image(images.before, content.before)}</figure>
        <div class="change-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></div>
        <figure class="after"><figcaption><span>${escapeHtml(content.after)}</span><span class="consistency">${escapeHtml(content.consistency)}</span></figcaption>${image(images.after, content.after)}</figure>
      </div>
      <p class="action" data-fit>${escapeHtml(content.action)} <span class="action-name">${escapeHtml(content.button)}</span></p>`;
  } else if (frame === 'coverage') {
    demonstration = `<div class="coverage-grid">
      ${['summary', 'link', 'fields'].map((key, i) => `
        <figure>
          <figcaption>${escapeHtml(content.labels[i])}</figcaption>
          <div class="capture">${image(images[key], content.labels[i])}</div>
          <p class="capture-caption" data-fit>${escapeHtml(content.captions[i])}</p>
        </figure>`).join('')}
      </div>`;
  } else {
    demonstration = `
      <div class="marker-note">
        <span class="marker" aria-hidden="true">***</span>
        <p data-fit>${escapeHtml(content.marker)}</p>
      </div>
      <figure class="popup">
        <div class="popup-capture">${image(images.popup, content.caption)}</div>
        <figcaption data-fit>${escapeHtml(content.caption)}</figcaption>
      </figure>`;
  }
  return document(lang, 'composition', `
    <main class="slide ${frame}">
      <header class="brand">
        <div><img src="/icon.png" alt=""><span>Maskify</span></div>
        <span class="extension-label">${escapeHtml(t.extension)}</span>
      </header>
      <section class="intro">
        <h1 data-fit>${content.headline.map(escapeHtml).join('<br>')}</h1>
        <p data-fit>${escapeHtml(content.description)}</p>
      </section>
      ${demonstration}
      <footer>
        <span>${escapeHtml(t.useCases)}</span>
        <span>${escapeHtml(t.reminder)}</span>
        <span class="page-number">${index} / 3</span>
      </footer>
    </main>`);
}

module.exports = { demoHtml, compositionHtml };
