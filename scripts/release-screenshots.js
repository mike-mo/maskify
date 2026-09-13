'use strict';

const fs = require('node:fs');
const path = require('node:path');

const COMPOSED = [
  { key: 'result', file: '01-result.png', title: 'Mask emails before you share' },
  { key: 'coverage', file: '02-coverage.png', title: 'Not just the text on the page' },
  { key: 'controls', file: '03-controls.png', title: 'Choose how replacements look' },
];
const LEGACY = [
  { file: 'popup.png', title: 'Popup' },
  { file: 'testpage.png', title: 'Test page' },
];

function selectAssets(root) {
  const locales = fs.readdirSync(path.join(root, '_locales'))
    .filter(locale => fs.statSync(path.join(root, '_locales', locale)).isDirectory())
    .sort();
  if (!locales.includes('en')) throw new Error('English screenshots are required for release notes');
  const exists = (locale, file) => fs.existsSync(path.join(root, 'screenshots', locale, file));
  const composed = locales.some(locale => COMPOSED.some(({ file }) => exists(locale, file)));
  const frames = composed ? COMPOSED : LEGACY;
  const missing = locales.flatMap(locale => frames
    .filter(({ file }) => !exists(locale, file))
    .map(({ file }) => `${locale}/${file}`));
  if (missing.length) throw new Error(`Incomplete ${composed ? 'composed' : 'legacy'} screenshots: ${missing.join(', ')}`);
  return {
    generation: composed ? 'composed' : 'legacy',
    files: locales.flatMap(locale => frames.map(({ file }) => `screenshots/${locale}/${file}`)),
    english: frames.map(({ file, title }) => ({
      path: `screenshots/en/${file}`,
      asset: `en-${file}`,
      title,
    })),
  };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(selectAssets(path.resolve(process.argv[2] || path.join(__dirname, '..')))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { COMPOSED, selectAssets };
