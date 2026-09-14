'use strict';

const copy = require('./copy');

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function sceneHtml(content, className, width, height) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Maskify store artwork</title><link rel="icon" href="/brand.svg">
<link rel="stylesheet" href="/compositions.css"></head><body>
<main class="asset ${className}" style="width:${width}px;height:${height}px">${content}</main>
</body></html>`;
}

function promoHtml(kind) {
  const small = kind === 'small';
  return sceneHtml(`<div class="lockup"><img src="/brand.svg" alt="" class="brand-mark">
<span class="wordmark" data-fit>Maskify</span></div>`, `promo promo-${kind}`, small ? 440 : 1400, small ? 280 : 560);
}

function iconHtml(size, placement = { left: 0, top: 0, size }) {
  return sceneHtml(`<img src="/brand.svg" alt="" style="position:absolute;left:${placement.left}px;top:${placement.top}px;width:${placement.size}px;height:${placement.size}px">`,
    'icon-stage', size, size);
}

function amoHtml(frame, images) {
  const image = name => `<img src="data:image/png;base64,${images[name].toString('base64')}" alt="" class="native-ui">`;
  const contents = {
    result: `<div class="source">${image('before')}</div>
<svg class="flow-arrow" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8v46m-18-18 18 18 18-18"/></svg>
<div class="source masked">${image('after')}</div>`,
    coverage: ['summary', 'link', 'fields'].map(name => `<div class="source">${image(name)}</div>`).join(''),
    controls: `<div class="source">${image('popup')}</div>`,
  };
  if (!contents[frame]) throw new Error(`Unknown AMO frame: ${frame}`);
  return sceneHtml(`<header class="amo-brand"><img src="/brand.svg" alt="" width="112" height="112">
<span data-fit>Maskify</span></header><div class="amo-content">${contents[frame]}</div>`,
    `amo amo-${frame}`, 2400, 1800);
}

function uploadGuide(store) {
  const isFirefox = store.id === 'firefox';
  const specifics = {
    edge: `Upload \`icon-300.png\` as the extension logo for English and Spanish.
The 440 x 280 and 1400 x 560 promotional images are optional. They contain only
the Maskify icon and wordmark, so the same images work in both languages.
Replace existing screenshots with the three files in each language folder.
`,
    chrome: `Upload \`icon-128.png\` as the store icon. Its painted artwork is centered
inside a 96 x 96 safe area with at least 16 pixels of transparent padding.
Use this image for \`icons/maskify128x128.png\` in a Chrome-specific extension
package as well; this asset pack does not modify the existing Edge package.

The 440 x 280 small promotional tile is required. The 1400 x 560 marquee is
optional, but needed for marquee placement. These tiles cannot be localized,
so they contain only the Maskify icon and wordmark.
Upload the three English and three Spanish screenshots in their respective
localized screenshot sections, not as six global screenshots.
`,
    firefox: `Upload \`icon-128.png\` as the custom icon. AMO creates the smaller display
sizes from it. Upload the three files in \`screenshots/\` as the single shared
gallery, in filename order. AMO does not provide separate galleries by language;
use \`en/captions.json\` and \`es/captions.json\` for localized captions.

These 2400 x 1800 images follow AMO's newer media-form guidance, including
stricter 4:3 validation when enabled. They omit editorial headlines; the English
text remaining inside them belongs to the captured UI and fictional demonstration page.

The captures come from the working Chromium extension, not a verified Firefox
build. The current manifest uses \`background.service_worker\`, which Firefox
does not support. Prepare and verify a Firefox-compatible extension package,
then confirm these screenshots still represent its behavior before submission.
Do not select unsupported platforms or invent data-collection declarations.
`,
  };
  return `# ${store.name} upload guide

This is a listing-asset pack, not an installable extension. No store submission
has been made.

${specifics[store.id]}
## Copy

For each language, \`description.txt\` contains plain text and \`description.md\`
preserves the approved Markdown. ${isFirefox ? 'AMO supports limited Markdown.' : 'Use the plain-text version for this store.'}
\`listing-copy.json\` includes the name, short description, and existing public
links. It is a copy reference, not an API request body.
${isFirefox ? 'Paste each caption in the corresponding AMO language field.' : 'Captions are supplied as references; their text is already represented in the screenshots.'}

\`privacy-policy.txt\` preserves the approved English policy, including browser
sync storage. \`reviewer-notes.txt\` contains the existing testing instructions.
\`LICENSE.txt\` contains the custom license; do not select MIT or another
unrelated license. Complete each store's privacy and distribution forms based
on the package actually submitted.

Replace or remove older logos, screenshots, and promotional images when updating
an existing listing. Do not upload this ZIP in the extension-package field.

## Sources

${store.sources.map(url => `- ${url}`).join('\n')}
`;
}

function galleryHtml(stores, specs) {
  const figure = spec => `<figure class="${spec.kind}">
<a href="${spec.store}/${spec.file}"><img src="${spec.store}/${spec.file}" width="${spec.width}" height="${spec.height}" alt="${escapeHtml(spec.label)}" loading="lazy"></a>
<figcaption>${escapeHtml(spec.label)}<span>${spec.width} x ${spec.height}${spec.kind === 'promo' ? (spec.required ? ', required' : ', optional') : ''}</span></figcaption>
</figure>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Maskify store assets</title><link rel="icon" href="firefox/icon-128.png">
<link rel="stylesheet" href="../scripts/store-gallery.css"></head><body><main>
<header><img src="edge/icon-300.png" alt="" width="72" height="72"><div><h1>Maskify store assets</h1>
<p>The current icon, approved copy, and screenshots for each store.</p></div></header>
<p class="notice">Listing files only. Nothing has been published. The Firefox extension package still needs a compatible background script and browser verification.</p>
<nav aria-label="Stores">${stores.map(store => `<a href="#${store.id}">${store.name}</a>`).join('')}</nav>
${stores.map(store => `<section class="store" id="${store.id}">
<div class="store-heading"><h2>${store.name}</h2><a class="download" href="maskify-${store.id}-assets.zip" download>Download asset pack</a></div>
<p><a href="${store.id}/UPLOAD.md">Upload guide</a></p>
<div class="artwork">${specs.filter(spec => spec.store === store.id && spec.kind !== 'screenshot').map(figure).join('')}</div>
${(store.id === 'firefox' ? ['shared'] : ['en', 'es']).map(lang => `<h3>${lang === 'shared' ? 'Shared screenshot gallery' : copy[lang].language}</h3>
<div class="screenshots">${specs.filter(spec => spec.store === store.id && spec.locale === lang).map(figure).join('')}</div>`).join('')}
<div class="copy-links">${['en', 'es'].map(lang => `<div><strong>${copy[lang].language}</strong>
<a href="${store.id}/${lang}/description.txt">Description</a>
<a href="${store.id}/${lang}/listing-copy.json">Short copy and links</a>
<a href="${store.id}/${lang}/captions.json">Captions</a></div>`).join('')}</div>
</section>`).join('')}
<footer>Every logo is derived from the same approved envelope-and-asterisk icon.</footer>
</main></body></html>`;
}

module.exports = { sceneHtml, promoHtml, iconHtml, amoHtml, uploadGuide, galleryHtml };
