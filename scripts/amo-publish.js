'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash, createHmac, randomUUID } = require('node:crypto');
const { readCanonical } = require('./extension-package');

const ROOT = path.resolve(__dirname, '..');
const API = 'https://addons.mozilla.org/api/v5/';
const ADDON = { id: 3119745, guid: '@maskify.mike-mo', slug: 'maskify' };
const LOCALES = ['en-US', 'es-ES'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const digest = value => sha256(JSON.stringify(value));
const isSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const isVersion = value => typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);

function packageFirefox(root) {
  // Resolve only publisher-owned modules. Candidate scripts are source bytes, never executable tooling here.
  const { buildFirefox } = require('./firefox-package');
  return buildFirefox(root);
}

function keys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: expected an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label}: unsupported or missing fields`);
}

function read(root, file) {
  assert(typeof file === 'string' && /^[\w./-]+$/.test(file) && !file.split('/').includes('..') &&
    !path.isAbsolute(file), `Unsafe repository path: ${file}`);
  const resolvedRoot = fs.realpathSync(root);
  const target = fs.realpathSync(path.join(root, ...file.split('/')));
  assert(target.startsWith(resolvedRoot + path.sep), `Path leaves repository: ${file}`);
  return readCanonical(target);
}

function text(root, file) {
  const value = read(root, file).toString('utf8').trimEnd();
  assert(value.trim(), `Required content is empty: ${file}`);
  return value;
}

function verifySources(files) {
  const { unzipSync } = require('fflate');
  const runtime = unzipSync(files.get('maskify-firefox.zip'));
  const source = unzipSync(files.get('maskify-firefox-source.zip'));
  const original = JSON.parse(Buffer.from(source['manifest.json']));
  const overlay = JSON.parse(Buffer.from(source['manifest.firefox.json']));
  assert.deepEqual(JSON.parse(Buffer.from(runtime['manifest.json'])), { ...original, ...overlay },
    'Reviewer sources do not generate the submitted Firefox manifest');
  for (const [file, bytes] of Object.entries(runtime)) {
    if (file !== 'manifest.json') assert(Buffer.from(bytes).equals(Buffer.from(source[file] || [])),
      `Reviewer source differs from runtime: ${file}`);
  }
}

function createPlan(root, commit, version) {
  const { unzipSync } = require('fflate');
  const { buildStoreFiles } = require('./store-assets');
  assert(isSha(commit), 'Use the full immutable 40-character source commit SHA');
  assert(isVersion(version), 'Use the exact stable MAJOR.MINOR.PATCH version');
  const config = JSON.parse(read(root, 'amo/listing.json'));
  keys(config, ['schema_version', 'addon', 'default_locale', 'locales', 'categories', 'tags',
    'is_experimental', 'requires_payment', 'support_email', 'privacy_policy_file', 'privacy_policy_suffix',
    'custom_license', 'icon_file', 'screenshots', 'initial_submission'], 'AMO listing');
  assert.equal(config.schema_version, 1);
  assert.deepEqual(config.addon, ADDON, 'Refusing to target another AMO listing');
  assert.equal(config.default_locale, 'en-US');
  assert.deepEqual(Object.keys(config.locales), LOCALES, 'Both submitted locales must be present in order');
  assert.deepEqual(config.locales, { 'en-US': 'en', 'es-ES': 'es' });
  assert.equal(config.privacy_policy_file, 'privacy.html', 'Policy must use the shared canonical HTML source');
  assert.deepEqual(Object.keys(config.categories), ['firefox'], 'Only desktop Firefox is supported');
  assert(config.categories.firefox.length && config.categories.firefox.every(value => typeof value === 'string'));
  assert(config.tags.length && config.tags.every(value => typeof value === 'string'));
  assert.equal(typeof config.is_experimental, 'boolean');
  assert.equal(typeof config.requires_payment, 'boolean');
  assert.equal(config.support_email, null, 'Support email is intentionally blank; review tooling before adding contact data');
  keys(config.custom_license, ['name', 'text_file'], 'Custom license');
  assert(config.custom_license.name.trim(), 'Missing custom license name');
  keys(config.initial_submission, ['version', 'version_id', 'file_id', 'source_commit',
    'package_sha256', 'source_sha256'], 'Initial submission');
  assert(isVersion(config.initial_submission.version) && isSha(config.initial_submission.source_commit));
  assert.equal(config.initial_submission.version, '1.3.0');
  assert.equal(config.initial_submission.version_id, 6671610);
  assert.equal(config.initial_submission.file_id, 5215704);
  for (const field of ['package_sha256', 'source_sha256']) {
    assert(/^[a-f0-9]{64}$/.test(config.initial_submission[field]), `Invalid initial ${field}`);
  }

  const manifest = JSON.parse(read(root, 'manifest.json'));
  assert.equal(manifest.version, version, 'Requested version differs from manifest.json');
  const files = packageFirefox(root);
  const listingFiles = buildStoreFiles(root, 'firefox');
  verifySources(files);
  const firefoxManifest = JSON.parse(Buffer.from(unzipSync(files.get('maskify-firefox.zip'))['manifest.json']));
  assert.equal(firefoxManifest.browser_specific_settings.gecko.id, ADDON.guid);
  assert(!firefoxManifest.browser_specific_settings.gecko_android, 'Android is not supported');
  const listing = {
    default_locale: config.default_locale, categories: config.categories, tags: config.tags,
    is_experimental: config.is_experimental, requires_payment: config.requires_payment,
    name: {}, summary: {}, description: {}, homepage: {}, support_url: {}, support_email: {},
  };
  const captions = {};
  const copies = {};
  for (const locale of LOCALES) {
    const directory = config.locales[locale];
    const copy = JSON.parse(listingFiles.get(`${directory}/listing-copy.json`));
    keys(copy, ['name', 'summary', 'homepage_url', 'support_url', 'privacy_policy_url'], `${locale} listing copy`);
    const messages = JSON.parse(read(root, `_locales/${locale === 'en-US' ? 'en' : 'es'}/messages.json`));
    assert.equal(copy.name, messages.appName.message, `${locale}: store name differs from package`);
    assert.equal(copy.summary, messages.appDescription.message, `${locale}: store summary differs from package`);
    assert(copy.name.trim() && copy.summary.trim() && copy.summary.length <= 250, `${locale}: invalid listing text`);
    for (const key of ['homepage_url', 'support_url', 'privacy_policy_url']) {
      assert.equal(new URL(copy[key]).protocol, 'https:', `${locale}: ${key} must be HTTPS`);
    }
    Object.assign(copies, { [locale]: copy });
    listing.name[locale] = copy.name;
    listing.summary[locale] = copy.summary;
    listing.description[locale] = listingFiles.get(`${directory}/description.md`).toString('utf8').trimEnd();
    listing.homepage[locale] = copy.homepage_url;
    listing.support_url[locale] = copy.support_url;
    listing.support_email[locale] = null;
    captions[locale] = JSON.parse(listingFiles.get(`${directory}/captions.json`));
  }
  assert.equal(config.privacy_policy_suffix, `\n\nPublished policy: ${copies['en-US'].privacy_policy_url}`,
    'Privacy policy suffix must reference the canonical published policy');
  const policy = { privacy_policy: {
    'en-US': listingFiles.get('privacy-policy.txt').toString('utf8').trimEnd() + config.privacy_policy_suffix,
  } };
  const versionPayload = {
    compatibility: ['firefox'],
    custom_license: {
      name: { 'en-US': config.custom_license.name },
      text: { 'en-US': text(root, config.custom_license.text_file) },
    },
    release_notes: { 'en-US': text(root, `amo/versions/${version}/release-notes.txt`) },
    approval_notes: text(root, `amo/versions/${version}/reviewer-notes.txt`),
  };
  const icon = read(root, config.icon_file);
  assert.equal(icon.toString('hex', 0, 8), '89504e470d0a1a0a', 'AMO icon must be PNG');
  assert.equal(icon.readUInt32BE(16), 128);
  assert.equal(icon.readUInt32BE(20), 128);
  files.set('icon.png', icon);
  assert(Array.isArray(config.screenshots) && config.screenshots.length > 0, 'Missing screenshot mapping');
  const previews = config.screenshots.map((item, index) => {
    keys(item, ['file', 'id', 'initial_position', 'uploaded_sha256', 'initial_caption_sha256'], `Screenshot ${index + 1}`);
    assert(item.id === null || (Number.isSafeInteger(item.id) && item.id > 0), 'Invalid preview ID');
    const image = read(root, item.file);
    assert.equal(image.toString('hex', 0, 8), '89504e470d0a1a0a', 'Screenshots must be PNG');
    const captionKey = `screenshots/${path.posix.basename(item.file).replace(/^firefox-/, '')}`;
    const caption = Object.fromEntries(LOCALES.map(locale => {
      const value = captions[locale][captionKey];
      assert(typeof value === 'string' && value.trim(), `Missing ${locale} caption for ${item.file}`);
      return [locale, value];
    }));
    if (item.id !== null) {
      assert(Number.isSafeInteger(item.initial_position) && item.initial_position >= 0);
      assert.equal(sha256(image), item.uploaded_sha256,
        `${item.file}: AMO cannot replace an existing preview image. Upload/adopt a new ID explicitly.`);
      assert(/^[a-f0-9]{64}$/.test(item.initial_caption_sha256), 'Missing initial caption fingerprint');
    } else {
      assert.equal(item.uploaded_sha256, null);
      assert.equal(item.initial_caption_sha256, null);
      assert.equal(item.initial_position, null);
    }
    const file = `preview-${index + 1}.png`;
    files.set(file, image);
    return {
      id: item.id, file, repository_file: item.file, sha256: sha256(image),
      initial_caption_sha256: item.initial_caption_sha256,
      initial_position: item.initial_position,
      position: index, caption, width: image.readUInt32BE(16), height: image.readUInt32BE(20),
    };
  });
  const ids = previews.filter(item => item.id !== null).map(item => item.id);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate preview IDs');
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(captions[locale]).sort(),
      config.screenshots.map(item => `screenshots/${path.posix.basename(item.file).replace(/^firefox-/, '')}`).sort(),
      `${locale}: captions and screenshot inventory differ`);
  }
  return { files, plan: {
    schema_version: 1, commit, version, addon: ADDON, channel: 'listed',
    initial_submission: config.initial_submission,
    listing, policy, version_payload: versionPayload, previews,
    files: [...files].map(([name, bytes]) => ({ name, bytes: bytes.length, sha256: sha256(bytes) })),
    manual_exceptions: [
      'Mozilla account profile identity, developer agreements, account security and API credentials are account settings.',
      'AMO review, signing and public availability are controlled by Mozilla, not this workflow.',
      'Existing screenshot images cannot be replaced in place by the API; changed images require explicit new IDs.',
      'Spanish release notes and privacy policy are not supplied; only the submitted English versions are synchronized.',
    ],
  } };
}

function writePlan(root, output, commit, version, verifiedDirectory) {
  assert(!fs.existsSync(output) || fs.readdirSync(output).length === 0, 'AMO plan output must be empty');
  const { plan, files } = createPlan(root, commit, version);
  if (verifiedDirectory) {
    const provenance = JSON.parse(fs.readFileSync(path.join(verifiedDirectory, 'release-provenance.json')));
    assert.equal(provenance.commit, commit, 'CI artifact commit differs from requested source');
    assert.equal(provenance.version, version);
    for (const name of ['maskify-firefox.zip', 'maskify-firefox-source.zip']) {
      assert(fs.readFileSync(path.join(verifiedDirectory, name)).equals(files.get(name)),
        `${name}: trusted plan differs from CI-tested package`);
    }
  }
  fs.mkdirSync(output, { recursive: true });
  for (const [name, bytes] of files) fs.writeFileSync(path.join(output, name), bytes);
  fs.writeFileSync(path.join(output, 'plan.json'), json(plan));
  return plan;
}

function verifyPlan(root, output, commit, version) {
  const expected = createPlan(root, commit, version);
  const saved = fs.readFileSync(path.join(output, 'plan.json'));
  assert(saved.equals(json(expected.plan)), 'Plan does not match the reviewed immutable source');
  assert.deepEqual(fs.readdirSync(output).sort(), ['plan.json', ...expected.files.keys()].sort(),
    'Unexpected or missing plan files');
  for (const [name, bytes] of expected.files) {
    assert(fs.readFileSync(path.join(output, name)).equals(bytes), `${name}: reviewed artifact differs`);
  }
  return expected;
}

function jwt(issuer, secret, now = Math.floor(Date.now() / 1000)) {
  assert(issuer && secret, 'Set AMO_JWT_ISSUER and AMO_JWT_SECRET in the protected GitHub environment');
  const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({
    iss: issuer, jti: randomUUID(), iat: now - 10, exp: now + 60,
  })}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

function client({ issuer, secret, fetchImpl = fetch } = {}) {
  jwt(issuer, secret);
  return async (method, endpoint, payload) => {
    assert(/^(GET|POST|PATCH)$/.test(method), 'Unsupported AMO operation');
    assert(typeof endpoint === 'string' && /^addons\/(?:addon\/3119745\/|upload\/)/.test(endpoint) &&
      !endpoint.includes('..') && !endpoint.includes('\\'), 'Refusing unexpected API endpoint');
    const headers = { Authorization: `JWT ${jwt(issuer, secret)}`, Accept: 'application/json' };
    let body;
    if (payload instanceof FormData) body = payload;
    else if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(payload);
    }
    const response = await fetchImpl(API + endpoint, {
      method, headers, body, redirect: 'error', signal: AbortSignal.timeout(60_000),
    });
    const result = await response.text();
    if (!response.ok) {
      const safe = result.slice(0, 2000).replaceAll(issuer, '[redacted]').replaceAll(secret, '[redacted]');
      throw new Error(`AMO ${method} ${endpoint}: HTTP ${response.status}: ${safe}`);
    }
    assert(result, `AMO ${method} ${endpoint}: empty response`);
    return JSON.parse(result);
  };
}

async function imageAvailable(url, id, fetchImpl = fetch) {
  const parsed = new URL(url);
  assert(parsed.protocol === 'https:' && ['addons.mozilla.org', 'addons.mozilla.net'].includes(parsed.hostname) &&
    parsed.pathname.startsWith('/user-media/') &&
    new RegExp(`/${id}\\.(png|jpe?g)$`).test(parsed.pathname), `Unexpected preview URL for ${id}`);
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
  assert(response.ok, `Preview ${id} is not downloadable: HTTP ${response.status}`);
  assert(/^image\/(png|jpeg)(;|$)/i.test(response.headers.get('content-type') || ''), `Preview ${id} is not an image`);
  const image = Buffer.from(await response.arrayBuffer());
  assert(image.length > 16 && image.length < 10 * 1024 * 1024, `Preview ${id}: invalid image size`);
  assert(image.toString('hex', 0, 8) === '89504e470d0a1a0a' || image.toString('hex', 0, 3) === 'ffd8ff',
    `Preview ${id}: invalid image bytes`);
}

const addonPath = `addons/addon/${ADDON.id}/`;

async function preflight(plan, mode, request, checkImage = imageAvailable) {
  assert(['sync', 'publish'].includes(mode), 'Choose sync or publish');
  const addon = await request('GET', `${addonPath}?show_source=true`);
  assert.equal(addon.id, ADDON.id);
  assert.equal(addon.guid, ADDON.guid, 'Live AMO identity differs');
  assert.equal(addon.slug, ADDON.slug, 'Live AMO slug differs');
  assert.equal(addon.type, 'extension');
  assert(!addon.is_disabled && !['disabled', 'deleted', 'rejected'].includes(addon.status),
    'AMO listing is disabled, deleted or rejected');
  const known = plan.previews.filter(item => item.id !== null);
  const liveIds = addon.previews.map(item => item.id);
  const desiredIds = known.map(item => item.id);
  const initialIds = [...known].sort((a, b) => a.initial_position - b.initial_position).map(item => item.id);
  assert(JSON.stringify(liveIds) === JSON.stringify(desiredIds) || JSON.stringify(liveIds) === JSON.stringify(initialIds),
    'Live screenshot inventory/order differs. Reconcile AMO IDs before any mutation.');
  for (const preview of known) {
    const live = addon.previews.find(item => item.id === preview.id);
    const caption = Object.fromEntries(LOCALES.map(locale => [locale, live.caption?.[locale]]));
    assert(digest(caption) === preview.initial_caption_sha256 || digest(caption) === digest(preview.caption),
      `Preview ${preview.id}: unexpected live captions; reconcile portal drift`);
    assert(Array.isArray(live.image_size) && live.image_size.length === 2 &&
      live.image_size.every(value => Number.isInteger(value) && value > 0) &&
      Math.abs(live.image_size[0] / live.image_size[1] - preview.width / preview.height) < 0.01,
    `Preview ${preview.id}: unexpected image dimensions`);
    await checkImage(live.image_url, preview.id);
  }
  const versions = [];
  for (let page = 1; page <= 100; page++) {
    const result = await request('GET',
      `${addonPath}versions/?filter=all_with_unlisted&page_size=50&page=${page}`);
    assert(Array.isArray(result.results), 'Invalid version-list response');
    versions.push(...result.results);
    if (!result.next) break;
    assert(page < 100, 'Version pagination limit exceeded');
  }
  const existing = versions.find(item => item.version === plan.version);
  if (mode === 'sync') {
    assert(existing && existing.channel === 'listed', 'Listing sync requires an existing listed version');
    const detail = await request('GET', `${addonPath}versions/${existing.id}/?show_source=true`);
    assert.equal(detail.version, plan.version);
    assert.equal(detail.channel, 'listed');
    assert(detail.source, 'Existing version has no reviewer source archive; repair it manually');
    assert.deepEqual(Object.keys(detail.compatibility), ['firefox'], 'Existing version is not desktop-only');
    if (plan.version === plan.initial_submission.version) {
      assert.equal(detail.id, plan.initial_submission.version_id);
      assert.equal(detail.file.id, plan.initial_submission.file_id);
    }
    return { addon, existing: detail };
  }
  assert(!existing, `Version ${plan.version} already exists. Never resubmit or overwrite it.`);
  assert(plan.version !== plan.initial_submission.version, 'Initial 1.3.0 has already been submitted');
  assert(versions.length, 'Existing AMO version history is required');
  for (const previous of versions) {
    assert(isVersion(previous.version), `Cannot safely compare AMO version ${previous.version}`);
    const parts = plan.version.split('.').map(Number);
    const before = previous.version.split('.').map(Number);
    const changed = parts.findIndex((value, index) => value !== before[index]);
    assert(changed >= 0 && parts[changed] > before[changed],
      `Version ${plan.version} must exceed every existing AMO version (${previous.version})`);
    assert(!(previous.channel === 'listed' && previous.file?.status === 'unreviewed'),
      'A listed version is awaiting review. Wait for Mozilla before submitting another version.');
  }
  return { addon };
}

function formFile(field, name, bytes, extra = {}) {
  const form = new FormData();
  form.set(field, new Blob([bytes]), name);
  for (const [key, value] of Object.entries(extra)) form.set(key, String(value));
  return form;
}

async function applyPlan({ plan, files }, mode, confirmation, request, {
  checkImage = imageAvailable,
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
  receipt = () => {},
} = {}) {
  assert.equal(confirmation, `${ADDON.slug}:${mode}:${plan.version}:${plan.commit}`,
    'Confirmation must name the exact action, version and immutable source commit');
  const live = await preflight(plan, mode, request, checkImage);
  let versionId = live.existing?.id;
  const savedPreviewIds = [];
  const record = value => receipt({ ...value, commit: plan.commit, version: plan.version });
  if (mode === 'publish') {
    let upload = await request('POST', 'addons/upload/',
      formFile('upload', 'maskify-firefox.zip', files.get('maskify-firefox.zip'), { channel: 'listed' }));
    assert(typeof upload.uuid === 'string' && /^[a-f0-9-]{36}$/.test(upload.uuid), 'Invalid upload UUID');
    record({ stage: 'uploaded', upload: upload.uuid });
    for (let attempt = 0; !upload.processed && attempt < 150; attempt++) {
      await pause(2000);
      const previousUuid = upload.uuid;
      upload = await request('GET', `addons/upload/${previousUuid}/`);
      assert.equal(upload.uuid, previousUuid, 'AMO returned a different upload');
    }
    assert(upload.processed && upload.valid && !upload.submitted,
      'AMO upload validation failed, timed out, or was already submitted. Inspect the upload before retrying.');
    assert.equal(upload.version, plan.version, 'AMO parsed a different version');
    assert.equal(upload.channel, 'listed');
    // Recheck identity, versions and media immediately before the irreversible version creation.
    await preflight(plan, mode, request, checkImage);
    const created = await request('POST', `${addonPath}versions/`,
      formFile('source', 'maskify-firefox-source.zip', files.get('maskify-firefox-source.zip'),
        { upload: upload.uuid }));
    assert.equal(created.version, plan.version);
    assert.equal(created.channel, 'listed');
    assert(Number.isSafeInteger(created.id) && created.id > 0 && created.source,
      'AMO did not confirm the new version and matching reviewer source');
    versionId = created.id;
    record({ stage: 'version-created-with-sources', version_id: versionId });
  }
  await request('PATCH', `${addonPath}versions/${versionId}/`, plan.version_payload);
  record({ stage: 'version-metadata', version_id: versionId });
  await request('PATCH', addonPath, plan.listing);
  record({ stage: 'listing-metadata' });
  await request('PATCH', `${addonPath}eula_policy/`, plan.policy);
  record({ stage: 'privacy-policy' });
  await request('PATCH', addonPath, formFile('icon', 'icon.png', files.get('icon.png')));
  record({ stage: 'icon' });
  for (const preview of plan.previews) {
    let id = preview.id;
    if (id === null) {
      const created = await request('POST', `${addonPath}previews/`,
        formFile('image', preview.file, files.get(preview.file), { position: preview.position }));
      assert(Number.isSafeInteger(created.id) && created.id > 0, 'AMO did not confirm the preview ID');
      id = created.id;
      record({ stage: 'preview-created', id, repository_file: preview.repository_file, initial_position: preview.position,
        uploaded_sha256: preview.sha256,
        initial_caption_sha256: digest(Object.fromEntries(LOCALES.map(locale => [locale, created.caption?.[locale]]))) });
    }
    await request('PATCH', `${addonPath}previews/${id}/`, {
      caption: preview.caption, position: preview.position,
    });
    record({ stage: 'preview-caption', id });
    savedPreviewIds.push(id);
  }
  const finalAddon = await request('GET', `${addonPath}?show_source=true`);
  assert.equal(finalAddon.guid, ADDON.guid);
  for (const [field, expected] of Object.entries(plan.listing)) {
    let actual = finalAddon[field];
    if (['homepage', 'support_url'].includes(field)) actual = actual?.url;
    if (field === 'support_email') {
      assert(!actual || LOCALES.every(locale => !actual[locale]), 'AMO support email was not cleared');
    } else assert.deepEqual(actual, expected, `AMO did not persist listing ${field}`);
  }
  assert.equal(finalAddon.has_privacy_policy, true);
  const finalPolicy = await request('GET', `${addonPath}eula_policy/?show_source=true`);
  assert.deepEqual(finalPolicy.privacy_policy, plan.policy.privacy_policy, 'AMO did not persist privacy policy');
  assert.deepEqual(finalAddon.previews.map(item => item.id), savedPreviewIds, 'AMO did not persist screenshot order');
  for (const [index, preview] of finalAddon.previews.entries()) {
    assert.deepEqual(preview.caption, plan.previews[index].caption, 'AMO did not persist bilingual captions');
    await checkImage(preview.image_url, preview.id);
  }
  const finalVersion = await request('GET', `${addonPath}versions/${versionId}/?show_source=true`);
  assert.equal(finalVersion.version, plan.version);
  assert(finalVersion.source, 'Submitted version is missing reviewer sources');
  for (const [field, expected] of Object.entries(plan.version_payload)) {
    if (field === 'compatibility') {
      assert.deepEqual(Object.keys(finalVersion.compatibility), ['firefox']);
    } else if (field === 'custom_license') {
      assert.equal(finalVersion.license.is_custom, true);
      assert.deepEqual(finalVersion.license.name, expected.name);
      assert.deepEqual(finalVersion.license.text, expected.text);
    } else assert.deepEqual(finalVersion[field], expected, `AMO did not persist ${field}`);
  }
  record({ stage: 'complete', version_id: versionId, file_status: finalVersion.file?.status });
  return versionId;
}

function resolveCommit(root, commit, version, run = args =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()) {
  assert(isSha(commit), 'Use a full immutable commit SHA, not a branch or tag');
  assert(isVersion(version), 'Use the exact stable version');
  assert.equal(run(['rev-parse', `${commit}^{commit}`]), commit);
  run(['merge-base', '--is-ancestor', commit, 'origin/main']);
  const manifest = JSON.parse(run(['show', `${commit}:manifest.json`]));
  assert.equal(manifest.version, version, 'Requested version differs from the selected commit');
  return { commit, version };
}

function verifyCheckout(root, commit) {
  assert(isSha(commit), 'Use a full immutable commit SHA');
  const run = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(run(['rev-parse', 'HEAD']), commit, 'Checkout HEAD differs from requested source');
  assert.equal(run(['status', '--porcelain', '--untracked-files=normal']), '',
    'Source checkout must be clean, including canonical listing inputs');
}

async function main() {
  const [command, rootArg, output, commit, version, mode, confirmation, ...extra] = process.argv.slice(2);
  assert(!extra.length, 'Unexpected arguments');
  const root = path.resolve(rootArg || ROOT);
  if (command === 'resolve') {
    const result = resolveCommit(root, process.env.SOURCE_SHA, process.env.EXPECTED_VERSION);
    assert(process.env.GITHUB_OUTPUT, 'resolve is for the GitHub workflow');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `commit=${result.commit}\nversion=${result.version}\n`);
  } else if (command === 'plan') {
    verifyCheckout(root, commit);
    const plan = writePlan(root, path.resolve(output), commit, version, process.env.VERIFIED_RELEASE_DIRECTORY);
    console.log(JSON.stringify(plan, null, 2));
  } else if (command === 'apply') {
    verifyCheckout(root, commit);
    resolveCommit(root, commit, version);
    const verified = verifyPlan(root, path.resolve(output), commit, version);
    const receiptPath = process.env.AMO_RECEIPT;
    assert(receiptPath, 'Set AMO_RECEIPT to a durable mutation journal before applying');
    fs.writeFileSync(receiptPath, '', { flag: 'wx' });
    const request = client({ issuer: process.env.AMO_JWT_ISSUER, secret: process.env.AMO_JWT_SECRET });
    await applyPlan(verified, mode, confirmation, request, {
      receipt: event => {
        const line = JSON.stringify(event) + '\n';
        fs.appendFileSync(receiptPath, line);
        console.log(line.trim());
      },
    });
    console.log('AMO API operations completed. Review/signing/public availability remain controlled by Mozilla.');
  } else {
    throw new Error('Use resolve <root>, plan <root> <empty-output> <sha> <version>, or apply <root> <plan-directory> <sha> <version> <sync|publish> <confirmation>');
  }
}

if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = {
  ADDON, API, createPlan, writePlan, verifyPlan, verifySources, jwt, client, imageAvailable,
  preflight, applyPlan, resolveCommit,
  verifyCheckout,
};
