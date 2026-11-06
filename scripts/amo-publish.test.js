'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHmac, createHash } = require('node:crypto');
const { test } = require('node:test');
const { unzipSync } = require('fflate');
const {
  ADDON, createPlan, writePlan, verifyPlan, verifySources, jwt, client, imageAvailable,
  authCheck, preflight, applyPlan, resolveCommit, verifyCheckout,
} = require('./amo-publish');
const { buildFirefox } = require('./firefox-package');
const { makeArchive } = require('./extension-package');
const { sourceHashes } = require('./store-assets');

const ROOT = path.resolve(__dirname, '..');
const COMMIT = 'a'.repeat(40);
const addonPath = `addons/addon/${ADDON.id}/`;
const clone = value => JSON.parse(JSON.stringify(value));

function temp(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-amo-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function fixture(t, version = '1.3.0') {
  const root = temp(t);
  const archive = unzipSync(buildFirefox(ROOT).get('maskify-firefox-source.zip'));
  for (const [file, bytes] of Object.entries(archive)) {
    const target = path.join(root, ...file.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  fs.cpSync(path.join(ROOT, 'amo'), path.join(root, 'amo'), { recursive: true });
  for (const file of Object.keys(sourceHashes(ROOT))) {
    const destination = path.join(root, ...file.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(ROOT, ...file.split('/')), destination);
  }
  if (version !== '1.3.0') {
    const file = path.join(root, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file));
    manifest.version = version;
    fs.writeFileSync(file, JSON.stringify(manifest));
    const destination = path.join(root, 'amo', 'versions', version);
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, 'release-notes.txt'), `Changes in ${version}.`);
    fs.writeFileSync(path.join(destination, 'reviewer-notes.txt'), `Reviewer instructions for ${version}.`);
  }
  return root;
}

function editListing(root, change) {
  const file = path.join(root, 'amo', 'listing.json');
  const listing = JSON.parse(fs.readFileSync(file));
  change(listing);
  fs.writeFileSync(file, JSON.stringify(listing));
}

function apiFixture(plan, { version = '1.3.0', status = 'public', existingSource = true } = {}) {
  const calls = [];
  const imageChecks = [];
  const mutations = [];
  const receipts = [];
  const addon = {
    ...ADDON, type: 'extension', is_disabled: false, status: 'public',
    ...clone(plan.listing), has_privacy_policy: true,
    previews: plan.previews.filter(item => item.id !== null).map(item => ({
      id: item.id, caption: clone(item.caption), position: item.position,
      image_size: [700, 525], image_url: `https://addons.mozilla.org/user-media/previews/full/443/${item.id}.png`,
    })),
  };
  const versions = [{
    id: 6671610, channel: 'listed', version, file: { id: 5215704, status },
    source: existingSource ? 'https://addons.mozilla.org/source.zip' : null,
    compatibility: { firefox: { min: '140.0', max: '*' } },
    license: { is_custom: true, ...clone(plan.version_payload.custom_license) },
    release_notes: clone(plan.version_payload.release_notes),
    approval_notes: plan.version_payload.approval_notes,
  }];
  const policy = clone(plan.policy);
  const checkImage = async (url, id) => { imageChecks.push({ url, id }); };
  const request = async (method, endpoint, payload) => {
    calls.push({ method, endpoint, payload });
    if (method !== 'GET') mutations.push({ method, endpoint, payload });
    if (method === 'GET' && endpoint === `${addonPath}?show_source=true`) {
      return { ...clone(addon),
        homepage: { url: clone(addon.homepage) }, support_url: { url: clone(addon.support_url) } };
    }
    if (method === 'GET' && endpoint.startsWith(`${addonPath}versions/?`)) return { results: clone(versions), next: null };
    if (method === 'GET' && endpoint.startsWith(`${addonPath}versions/`)) {
      return clone(versions.find(item => endpoint.includes(`/versions/${item.id}/`)));
    }
    if (method === 'POST' && endpoint === 'addons/upload/') {
      assert(payload instanceof FormData);
      assert.equal(payload.get('channel'), 'listed');
      assert.deepEqual(Buffer.from(await payload.get('upload').arrayBuffer()), packages.get('maskify-firefox.zip'));
      return { uuid: 'b'.repeat(8) + '-1111-2222-3333-' + 'c'.repeat(12), processed: false };
    }
    if (method === 'GET' && endpoint.startsWith('addons/upload/')) {
      return { uuid: endpoint.split('/')[2], processed: true, valid: true,
        submitted: false, version: plan.version, channel: 'listed' };
    }
    if (method === 'POST' && endpoint === `${addonPath}versions/`) {
      assert(payload instanceof FormData);
      assert.deepEqual(Buffer.from(await payload.get('source').arrayBuffer()), packages.get('maskify-firefox-source.zip'));
      const created = {
        ...clone(versions[0]), id: 7000000, version: plan.version,
        source: 'https://addons.mozilla.org/new-source.zip',
      };
      versions.push(created);
      return clone(created);
    }
    if (method === 'PATCH' && endpoint.startsWith(`${addonPath}versions/`)) {
      const item = versions.find(item => endpoint.includes(`/versions/${item.id}/`));
      item.approval_notes = payload.approval_notes;
      item.release_notes = clone(payload.release_notes);
      item.license = { is_custom: true, ...clone(payload.custom_license) };
      item.compatibility = clone(payload.compatibility);
      return clone(item);
    }
    if (method === 'PATCH' && endpoint === addonPath) {
      if (payload instanceof FormData) assert(payload.get('icon'));
      else Object.assign(addon, clone(payload));
      return clone(addon);
    }
    if (endpoint.startsWith(`${addonPath}previews/`)) {
      if (method === 'POST') {
        const id = 999999;
        addon.previews.push({
          id, image_size: [700, 525],
          image_url: `https://addons.mozilla.org/user-media/previews/full/999/${id}.png`,
        });
        return { id };
      }
      const item = addon.previews.find(item => endpoint.includes(`/previews/${item.id}/`));
      assert(item);
      Object.assign(item, clone(payload));
      return clone(item);
    }
    if (endpoint.startsWith(`${addonPath}eula_policy/`)) {
      if (method === 'PATCH') Object.assign(policy, clone(payload));
      return clone(policy);
    }
    throw new Error(`Unexpected AMO call: ${method} ${endpoint}`);
  };
  let packages;
  return {
    calls, mutations, receipts, addon, versions, imageChecks, request, checkImage,
    pause: async () => {},
    receipt: event => { receipts.push(event); },
    setPackages: files => { packages = files; },
  };
}

test('offline plan uses canonical bilingual copy, policy, license, ordered media and exact initial notes', () => {
  const { plan, files } = createPlan(ROOT, COMMIT, '1.3.0');
  assert.deepEqual(plan.addon, ADDON);
  assert.equal(plan.channel, 'listed');
  assert.deepEqual(plan.version_payload.compatibility, { firefox: { min: '140.0', max: '*' } });
  assert.deepEqual(Object.keys(plan.listing.name), ['en-US', 'es-ES']);
  assert.deepEqual(plan.listing.categories, { firefox: ['privacy-security'] });
  assert.deepEqual(plan.listing.tags, ['privacy']);
  assert.deepEqual(plan.listing.support_email, { 'en-US': null, 'es-ES': null });
  assert.equal(plan.listing.is_experimental, false);
  assert.equal(plan.listing.requires_payment, false);
  assert.deepEqual(plan.previews.map(item => item.id), [443842, 443843, 443844]);
  assert.equal(plan.version_payload.custom_license.text['en-US'],
    fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n').trimEnd());
  assert(plan.policy.privacy_policy['en-US'].endsWith(
    '\n\nPublished policy: https://mike-mo.github.io/maskify/privacy.html'));
  assert.deepEqual(Object.keys(plan.policy.privacy_policy), ['en-US'], 'Do not invent a Spanish policy');
  assert.deepEqual(Object.keys(plan.version_payload.release_notes), ['en-US']);
  assert.equal(plan.version_payload.release_notes['en-US'].split('\n')[0], 'Initial Firefox release of Maskify.');
  assert(plan.version_payload.approval_notes.includes('Initial Firefox release of Maskify 1.3.0.'));
  assert.deepEqual(plan.previews.map(item => item.position), [0, 1, 2]);
  for (const [index, preview] of plan.previews.entries()) {
    assert(files.get(preview.file));
    assert.equal(preview.position, index);
    assert.deepEqual(Object.keys(preview.caption), ['en-US', 'es-ES']);
  }
  verifySources(files);
});

test('plans, package hashes and sources are deterministic; tampering and extra files fail closed', t => {
  const output = temp(t);
  writePlan(ROOT, output, COMMIT, '1.3.0');
  assert(verifyPlan(ROOT, output, COMMIT, '1.3.0'));
  assert.throws(() => writePlan(ROOT, output, COMMIT, '1.3.0'), /output must be empty/);
  assert.throws(() => verifyPlan(ROOT, output, 'b'.repeat(40), '1.3.0'), /immutable source/);
  const extra = path.join(output, 'unreviewed.json');
  fs.writeFileSync(extra, '{}');
  assert.throws(() => verifyPlan(ROOT, output, COMMIT, '1.3.0'), /Unexpected or missing/);
  fs.unlinkSync(extra);
  fs.appendFileSync(path.join(output, 'maskify-firefox-source.zip'), 'tampered');
  assert.throws(() => verifyPlan(ROOT, output, COMMIT, '1.3.0'), /reviewed artifact differs/);
});

test('source mismatch cannot be hidden behind a valid ZIP or plan', () => {
  const files = buildFirefox(ROOT);
  const source = unzipSync(files.get('maskify-firefox-source.zip'));
  source['background.js'] = Buffer.from('different source');
  files.set('maskify-firefox-source.zip', makeArchive(new Map(Object.entries(source))));
  assert.throws(() => verifySources(files), /Reviewer source differs/);
});

test('planning refuses CI artifacts from another commit or with mismatched source packages', t => {
  const { plan, files } = createPlan(ROOT, COMMIT, '1.3.0');
  const verified = temp(t);
  for (const [file, bytes] of files) fs.writeFileSync(path.join(verified, file), bytes);
  const provenance = path.join(verified, 'release-provenance.json');
  fs.writeFileSync(provenance, JSON.stringify({ commit: 'b'.repeat(40), version: plan.version }));
  assert.throws(() => writePlan(ROOT, temp(t), COMMIT, '1.3.0', verified), /CI artifact commit differs/);
  fs.writeFileSync(provenance, JSON.stringify({ commit: COMMIT, version: plan.version }));
  fs.appendFileSync(path.join(verified, 'maskify-firefox-source.zip'), 'tampered');
  assert.throws(() => writePlan(ROOT, temp(t), COMMIT, '1.3.0', verified), /differs from CI-tested package/);
});

test('new versions require their own notes and exact manifest version', t => {
  const root = fixture(t, '1.3.1');
  assert.equal(createPlan(root, COMMIT, '1.3.1').plan.version_payload.release_notes['en-US'], 'Changes in 1.3.1.');
  assert.throws(() => createPlan(root, COMMIT, '1.3.0'), /differs from manifest/);
  fs.unlinkSync(path.join(root, 'amo', 'versions', '1.3.1', 'reviewer-notes.txt'));
  assert.throws(() => createPlan(root, COMMIT, '1.3.1'), /ENOENT/);
});

test('unsupported fields, missing translations and changed existing images cannot be silently skipped', t => {
  const root = fixture(t);
  editListing(root, listing => { listing.unsupported_setting = true; });
  assert.throws(() => createPlan(root, COMMIT, '1.3.0'), /unsupported or missing fields/);
  editListing(root, listing => { delete listing.unsupported_setting; delete listing.locales['es-ES']; });
  assert.throws(() => createPlan(root, COMMIT, '1.3.0'), /Both submitted locales/);
  editListing(root, listing => { listing.locales['es-ES'] = 'es'; });
  fs.appendFileSync(path.join(root, 'store-artwork', 'firefox-01-result.png'), 'changed');
  assert.throws(() => createPlan(root, COMMIT, '1.3.0'), /approved artwork bytes differ/);
});

test('JWT is short-lived, signed with HS256, unique per request and never sent outside AMO', async () => {
  const token = jwt('test-issuer', 'test-secret', 1000);
  const [header, payload, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'HS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(claims.iss, 'test-issuer');
  assert.equal(claims.iat, 990);
  assert.equal(claims.exp, 1060);
  assert.equal(signature, createHmac('sha256', 'test-secret').update(`${header}.${payload}`).digest('base64url'));
  assert.notEqual(jwt('test-issuer', 'test-secret', 1000), token);
  assert.throws(() => jwt('', ''), /protected GitHub environment/);
  const calls = [];
  const request = client({ issuer: 'test-issuer', secret: 'test-secret', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response('{"ok":true}', { status: 200 });
  } });
  await request('GET', addonPath);
  assert.equal(calls[0].url, 'https://addons.mozilla.org/api/v5/' + addonPath);
  assert.equal(calls[0].options.redirect, 'error');
  assert(calls[0].options.headers.Authorization.startsWith('JWT '));
  await assert.rejects(request('GET', 'https://example.com/'), /unexpected API endpoint/);
  await assert.rejects(request('GET', 'addons/addon/3119745/../../accounts/'), /unexpected API endpoint/);
  await assert.rejects(request('DELETE', addonPath), /Unsupported AMO operation/);
  assert.equal(calls.length, 1);
});

test('transport errors fail explicitly without retries or leaking API secrets', async () => {
  let calls = 0;
  const request = client({ issuer: 'test-issuer', secret: 'test-secret', fetchImpl: async () => {
    calls++;
    return new Response('test-issuer test-secret validation failed', { status: 400 });
  } });
  await assert.rejects(request('POST', 'addons/upload/', new FormData()), error => {
    assert.match(error.message, /HTTP 400/);
    assert(!error.message.includes('test-secret') && !error.message.includes('test-issuer'));
    return true;
  });
  assert.equal(calls, 1);
});

test('auth check uses only GET and returns no privileged response fields', async () => {
  const { plan } = createPlan(ROOT, COMMIT, '1.3.0');
  const api = apiFixture(plan);
  assert.deepEqual(await authCheck(plan, api.request), {
    authenticated_source_read: true, addon_id: ADDON.id, slug: ADDON.slug,
  });
  assert.deepEqual(api.calls.map(call => [call.method, call.endpoint]), [
    ['GET', `${addonPath}?show_source=true`],
    ['GET', `${addonPath}versions/6671610/?show_source=true`],
  ]);
  assert.equal(api.mutations.length, 0);
  assert.equal(api.imageChecks.length, 0);
  assert.equal(api.receipts.length, 0);
});

test('auth check rejects wrong identity and missing authenticated source access', async () => {
  const { plan } = createPlan(ROOT, COMMIT, '1.3.0');
  for (const change of [
    api => { api.addon.guid = 'wrong'; },
    api => { api.versions[0].file.id = 1; },
    api => { api.versions[0].source = null; },
  ]) {
    const api = apiFixture(plan);
    change(api);
    await assert.rejects(authCheck(plan, api.request), /identity check failed|read access was not confirmed/);
    assert.equal(api.mutations.length, 0);
  }
});

test('read-only transport blocks writes before network and never logs response bodies or network details', async () => {
  let calls = 0;
  const request = client({
    issuer: 'test-issuer', secret: 'test-secret', readOnly: true,
    fetchImpl: async () => {
      calls++;
      return new Response('private response test-secret', { status: 401 });
    },
  });
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    await assert.rejects(request(method, addonPath, {}), /permits GET/);
  }
  await assert.rejects(request('GET', addonPath, {}), /permits GET/);
  assert.equal(calls, 0);
  await assert.rejects(request('GET', addonPath), { message: 'AMO read-only check: HTTP 401' });
  assert.equal(calls, 1);
  for (const status of [403, 404, 429, 500]) {
    const failure = client({
      issuer: 'test-issuer', secret: 'test-secret', readOnly: true,
      fetchImpl: async () => new Response('private response test-secret', { status }),
    });
    await assert.rejects(failure('GET', addonPath), { message: `AMO read-only check: HTTP ${status}` });
  }
  const network = client({
    issuer: 'test-issuer', secret: 'test-secret', readOnly: true,
    fetchImpl: async () => { throw new Error('test-secret private network detail'); },
  });
  await assert.rejects(network('GET', addonPath),
    { message: 'AMO read-only request failed (network, redirect or timeout)' });
  const invalid = client({
    issuer: 'test-issuer', secret: 'test-secret', readOnly: true,
    fetchImpl: async () => new Response('private response test-secret'),
  });
  await assert.rejects(invalid('GET', addonPath), { message: 'AMO read-only check returned invalid JSON' });
});

test('image preflight validates immutable IDs, URLs and downloaded image bytes without authorization', async () => {
  const image = fs.readFileSync(path.join(ROOT, 'store-artwork', 'firefox-01-result.png'));
  let calls = 0;
  const fetchImage = async (_url, options) => {
    calls++;
    assert.equal(options.headers, undefined);
    return new Response(image, { headers: { 'Content-Type': 'image/png' } });
  };
  await imageAvailable('https://addons.mozilla.org/user-media/previews/full/443/443842.png', 443842, fetchImage);
  await assert.rejects(imageAvailable('https://example.com/user-media/443842.png', 443842, fetchImage), /Unexpected preview URL/);
  await assert.rejects(imageAvailable('https://addons.mozilla.org/user-media/999.png', 443842, fetchImage), /Unexpected preview URL/);
  assert.equal(calls, 1);
});

test('sync modifies bilingual metadata and existing captions, not package bytes or sources', async () => {
  const bundle = createPlan(ROOT, COMMIT, '1.3.0');
  const api = apiFixture(bundle.plan, { status: 'unreviewed' });
  api.setPackages(bundle.files);
  await applyPlan(bundle, 'sync', `maskify:sync:1.3.0:${COMMIT}`, api.request, api);
  assert.equal(api.calls.filter(call => call.method === 'POST').length, 0);
  assert.equal(api.mutations.filter(call => call.endpoint.includes('previews/')).length, 3);
  assert(!api.mutations.some(call => call.payload?.has?.('source') || call.payload?.has?.('upload')));
  assert.equal(api.receipts.at(-1).stage, 'complete');
  assert.equal(api.imageChecks.length, 6);
  assert.deepEqual(api.versions[0].compatibility, { firefox: { min: '140.0', max: '*' } });
});

test('readback rejects changed Firefox minimum, maximum or platform instead of reporting success', async () => {
  const bundle = createPlan(ROOT, COMMIT, '1.3.0');
  for (const compatibility of [
    { firefox: { min: '109.0', max: '*' } },
    { firefox: { min: '140.0', max: '150.0' } },
    { firefox: { min: '140.0', max: '*' }, android: { min: '140.0', max: '*' } },
  ]) {
    const api = apiFixture(bundle.plan);
    const request = async (...args) => {
      const result = await api.request(...args);
      if (args[0] === 'PATCH' && args[1].startsWith(`${addonPath}versions/`)) {
        api.versions[0].compatibility = clone(compatibility);
      }
      return result;
    };
    await assert.rejects(applyPlan(bundle, 'sync', `maskify:sync:1.3.0:${COMMIT}`, request, api),
      /did not persist Firefox compatibility bounds/);
    assert(!api.receipts.some(event => event.stage === 'complete'));
  }
});

test('all duplicate, identity, media drift, and missing-source failures happen before mutations', async () => {
  const bundle = createPlan(ROOT, COMMIT, '1.3.0');
  const scenarios = [
    { mode: 'publish', alter: () => {}, error: /already exists/ },
    { mode: 'sync', alter: api => { api.addon.guid = '@another-addon'; }, error: /identity differs/ },
    { mode: 'sync', alter: api => { api.addon.previews.reverse(); }, error: /inventory\/order differs/ },
    { mode: 'sync', alter: api => { api.addon.previews[0].caption['en-US'] = 'Portal drift'; }, error: /live captions/ },
    { mode: 'sync', alter: api => { api.versions[0].source = null; }, error: /no reviewer source/ },
  ];
  for (const scenario of scenarios) {
    const api = apiFixture(bundle.plan);
    scenario.alter(api);
    await assert.rejects(applyPlan(bundle, scenario.mode,
      `maskify:${scenario.mode}:1.3.0:${COMMIT}`, api.request, api), scenario.error);
    assert.equal(api.mutations.length, 0);
  }
  const api = apiFixture(bundle.plan);
  await assert.rejects(applyPlan(bundle, 'sync', 'yes', api.request, api), /Confirmation/);
  assert.equal(api.calls.length, 0);
});

test('publish uploads matched packages/sources, polls validation, rechecks duplicates and sets version metadata', async t => {
  const bundle = createPlan(fixture(t, '1.3.1'), COMMIT, '1.3.1');
  const api = apiFixture(bundle.plan);
  api.setPackages(bundle.files);
  await applyPlan(bundle, 'publish', `maskify:publish:1.3.1:${COMMIT}`, api.request, api);
  assert.equal(api.calls.filter(call => call.method === 'POST' && call.endpoint === 'addons/upload/').length, 1);
  assert.equal(api.calls.filter(call => call.method === 'POST' && call.endpoint === `${addonPath}versions/`).length, 1);
  assert.equal(api.calls.filter(call => call.endpoint.startsWith(`${addonPath}versions/?`)).length, 2);
  assert.equal(api.receipts[0].stage, 'uploaded');
  assert.equal(api.receipts[1].stage, 'version-created-with-sources');
  assert.equal(api.receipts.at(-1).version_id, 7000000);
  assert.deepEqual(api.versions.at(-1).compatibility, { firefox: { min: '140.0', max: '*' } });
});

test('awaiting review, downgrade and failed validation block new submissions', async t => {
  const bundle = createPlan(fixture(t, '1.3.1'), COMMIT, '1.3.1');
  for (const options of [{ status: 'unreviewed' }, { version: '1.4.0' }]) {
    const api = apiFixture(bundle.plan, options);
    await assert.rejects(preflight(bundle.plan, 'publish', api.request, api.checkImage), /awaiting review|must exceed/);
    assert.equal(api.mutations.length, 0);
  }
  const api = apiFixture(bundle.plan);
  api.setPackages(bundle.files);
  const request = async (...args) => {
    const result = await api.request(...args);
    if (args[0] === 'GET' && args[1].startsWith('addons/upload/')) result.valid = false;
    return result;
  };
  await assert.rejects(applyPlan(bundle, 'publish', `maskify:publish:1.3.1:${COMMIT}`, request, api), /validation failed/);
  assert.equal(api.mutations.length, 1, 'Only the validation upload, never a version submission');
});

test('a concurrent version submission blocks irreversible version creation after upload validation', async t => {
  const bundle = createPlan(fixture(t, '1.3.1'), COMMIT, '1.3.1');
  const api = apiFixture(bundle.plan);
  api.setPackages(bundle.files);
  const request = async (...args) => {
    const result = await api.request(...args);
    if (args[0] === 'GET' && args[1].startsWith('addons/upload/')) {
      api.versions.push({ ...clone(api.versions[0]), id: 7000001, version: '1.3.1' });
    }
    return result;
  };
  await assert.rejects(applyPlan(bundle, 'publish', `maskify:publish:1.3.1:${COMMIT}`, request, api), /already exists/);
  assert.equal(api.mutations.length, 1);
  assert.equal(api.receipts.at(-1).stage, 'uploaded');
});

test('partial metadata failure leaves a version/source receipt and never retries creation', async t => {
  const bundle = createPlan(fixture(t, '1.3.1'), COMMIT, '1.3.1');
  const api = apiFixture(bundle.plan);
  api.setPackages(bundle.files);
  const request = async (...args) => {
    if (args[0] === 'PATCH' && args[1].includes('/versions/')) throw new Error('Simulated metadata failure');
    return api.request(...args);
  };
  await assert.rejects(applyPlan(bundle, 'publish', `maskify:publish:1.3.1:${COMMIT}`, request, api), /metadata failure/);
  assert.equal(api.receipts.at(-1).stage, 'version-created-with-sources');
  assert.equal(api.calls.filter(call => call.method === 'POST' && call.endpoint.includes('/versions/')).length, 1);
  assert.equal(api.versions.at(-1).version, '1.3.1');
  assert(api.versions.at(-1).source);
});

test('known preview images are never reuploaded; explicitly new ones return IDs in durable receipts', async t => {
  const root = fixture(t);
  editListing(root, listing => {
    listing.screenshots[2].id = null;
    listing.screenshots[2].initial_position = null;
    listing.screenshots[2].uploaded_sha256 = null;
    listing.screenshots[2].initial_caption_sha256 = null;
  });
  const bundle = createPlan(root, COMMIT, '1.3.0');
  const api = apiFixture(bundle.plan);
  api.setPackages(bundle.files);
  await applyPlan(bundle, 'sync', `maskify:sync:1.3.0:${COMMIT}`, api.request, api);
  assert.equal(api.calls.filter(call => call.method === 'POST' && call.endpoint.includes('previews/')).length, 1);
  assert.equal(api.receipts.find(event => event.stage === 'preview-created').id, 999999);
  assert.equal(api.receipts.find(event => event.stage === 'preview-created').initial_caption_sha256,
    createHash('sha256').update('{}').digest('hex'));
});

test('a newly created preview can be adopted after its separate caption update fails', async t => {
  const root = fixture(t);
  editListing(root, listing => {
    Object.assign(listing.screenshots[2], {
      id: null, initial_position: null, uploaded_sha256: null, initial_caption_sha256: null,
    });
  });
  const bundle = createPlan(root, COMMIT, '1.3.0');
  const api = apiFixture(bundle.plan);
  const request = async (...args) => {
    if (args[0] === 'PATCH' && args[1].endsWith('/previews/999999/')) throw new Error('Caption update failed');
    return api.request(...args);
  };
  await assert.rejects(applyPlan(bundle, 'sync', `maskify:sync:1.3.0:${COMMIT}`, request, api), /Caption update failed/);
  const created = api.receipts.find(event => event.stage === 'preview-created');
  editListing(root, listing => {
    Object.assign(listing.screenshots[2], {
      id: created.id, initial_position: created.initial_position,
      uploaded_sha256: created.uploaded_sha256, initial_caption_sha256: created.initial_caption_sha256,
    });
  });
  const resumed = createPlan(root, COMMIT, '1.3.0');
  await applyPlan(resumed, 'sync', `maskify:sync:1.3.0:${COMMIT}`, api.request, api);
  assert.equal(api.calls.filter(call => call.method === 'POST').length, 1, 'Adopted preview is never uploaded twice');
  assert.equal(api.receipts.at(-1).stage, 'complete');
});

test('ref resolver rejects mutable refs, versions and commits outside main before any build', () => {
  const calls = [];
  const run = args => {
    calls.push(args);
    if (args[0] === 'rev-parse') return COMMIT;
    if (args[0] === 'show') return '{"version":"1.3.0"}';
    return '';
  };
  assert.deepEqual(resolveCommit(ROOT, COMMIT, '1.3.0', run), { commit: COMMIT, version: '1.3.0' });
  assert.deepEqual(calls[1], ['merge-base', '--is-ancestor', COMMIT, 'origin/main']);
  for (const ref of ['main', 'v1.3.0', `--upload-pack=bad`, COMMIT + '\n']) {
    assert.throws(() => resolveCommit(ROOT, ref, '1.3.0', run), /immutable commit SHA/);
  }
  assert.throws(() => resolveCommit(ROOT, COMMIT, '1.3.1', run), /differs from the selected commit/);
  assert.throws(() => resolveCommit(ROOT, COMMIT, '1.3.0', args => {
    if (args[0] === 'merge-base') throw new Error('not on main');
    return run(args);
  }), /not on main/);
});

test('checkout verification rejects wrong HEAD, tracked edits and untracked source inputs', t => {
  const root = temp(t);
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git(['init', '--quiet']);
  fs.writeFileSync(path.join(root, 'manifest.json'), '{"version":"1.3.0"}\n');
  git(['add', 'manifest.json']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Fixture']);
  const commit = git(['rev-parse', 'HEAD']);
  verifyCheckout(root, commit);
  assert.throws(() => verifyCheckout(root, COMMIT), /HEAD differs/);
  fs.writeFileSync(path.join(root, 'manifest.json'), '{"version":"1.3.1"}\n');
  assert.throws(() => verifyCheckout(root, commit), /must be clean/);
  fs.writeFileSync(path.join(root, 'manifest.json'), '{"version":"1.3.0"}\n');
  fs.writeFileSync(path.join(root, 'untracked.txt'), 'Unreviewed source');
  assert.throws(() => verifyCheckout(root, commit), /must be clean/);
});

test('workflow is manual, main-only, credential-isolated, approval-gated and validates exact candidate artifacts', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'firefox-publish.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n  (push|release|pull_request|pull_request_target):/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /default: plan/);
  assert.match(workflow, /environment: amo-production/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(workflow, /VERIFIED_RELEASE_DIRECTORY:/);
  assert.doesNotMatch(workflow, /contents: write|id-token: write|secrets: inherit/);
  const [beforeApply, apply] = workflow.split('\n  apply:');
  assert(!beforeApply.includes('secrets.'));
  assert.equal((apply.match(/secrets\./g) || []).length, 4);
  assert.match(workflow, /options: \[plan, auth-check, sync, publish\]/);
  assert.match(apply, /if: inputs\.operation == 'auth-check'/);
  assert.match(apply, /node tooling\/scripts\/amo-publish\.js auth-check source/);
  assert.match(apply, /if: inputs\.operation == 'sync' \|\| inputs\.operation == 'publish'/);
  assert.match(apply, /node tooling\/scripts\/amo-publish\.js apply source/);
  assert.doesNotMatch(apply, /node source\/|npm --prefix source/);
  assert.match(apply, /uses: \.\/tooling\/\.github\/actions\/setup-publisher/);
  assert.match(apply, /if: always\(\) && \(inputs\.operation == 'sync' \|\| inputs\.operation == 'publish'\)/);
  assert.equal((workflow.match(/uses: actions\/checkout@/g) || []).length,
    (workflow.match(/persist-credentials: false/g) || []).length);
});
