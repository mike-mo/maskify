'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { unzipSync } = require('fflate');
const {
  API, EXTENSION, compareVersions, createPlan, writePlan, verifyPlan, productPath,
  operationPath, operationId, client, authCheck, checkHistory, historyPages, uploadIntent, upload,
} = require('./edge-publish');
const { buildAssets } = require('./release-assets');
const { buildChromium } = require('./extension-package');
const { sourceHashes, buildStoreFiles } = require('./store-assets');
const { isSha, isVersion, readRepositoryFile } = require('./store-publish');

const ROOT = path.resolve(__dirname, '..');
const COMMIT = 'a'.repeat(40);
const VERSION = '1.3.0';
const PRODUCT = 'fb1e0f91-22bd-4086-ac3e-b9f62057a789';
const OPERATION = '11111111-2222-3333-4444-555555555555';
const confirmation = (plan, current = '1.2.0') =>
  `maskify:edge:upload:${plan.version}:${plan.commit}:${plan.product_id}:${current}`;

function temp(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maskify-edge-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function fixture(t) {
  const root = temp(t);
  for (const file of [...Object.keys(sourceHashes(ROOT)), 'edge/product.json']) {
    const target = path.join(root, ...file.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, ...file.split('/')), target);
  }
  return root;
}

test('Edge plan uses canonical shared Chromium bytes, copy, artwork and owner-confirmed product identity', () => {
  const { plan, files } = createPlan(ROOT, COMMIT, VERSION);
  assert.equal(plan.product_id, PRODUCT);
  assert.equal(plan.extension_id, EXTENSION);
  assert.equal(plan.ready_for_authenticated_operations, true);
  assert.deepEqual(plan.supported_operations, ['plan', 'status', 'upload']);
  assert(files.get('maskify.zip').equals(buildChromium(ROOT)));
  const runtime = unzipSync(files.get('maskify.zip'));
  assert.equal(JSON.parse(Buffer.from(runtime['manifest.json'])).version, VERSION);
  assert.equal(runtime['edge/product.json'], undefined);
  const listing = unzipSync(files.get('maskify-edge-assets.zip'));
  for (const [file, bytes] of buildStoreFiles(ROOT, 'edge')) {
    assert(Buffer.from(listing[file]).equals(bytes), file);
  }
  assert(files.get('reviewer-notes.txt').equals(Buffer.from(listing['reviewer-notes.txt'])));
  for (const file of plan.files) {
    assert.equal(file.bytes, files.get(file.name).length);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
  }
});

test('invalid versions, whitespace, mutable refs and public IDs in place of product GUIDs fail closed', t => {
  for (const version of ['1.3.0\n', '1.03.0', '1.3', '1.3.0-beta', '65536.0.0']) {
    assert.throws(() => compareVersions(version, VERSION), /stable/);
  }
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.3.0', '1.3.0'), 0);
  assert.equal(compareVersions('1.2.9', '1.3.0'), -1);
  assert.equal(isSha(COMMIT + '\n'), false);
  assert.equal(isVersion(VERSION + '\n'), false);
  assert.throws(() => createPlan(ROOT, 'main', VERSION), /immutable/);
  assert.throws(() => createPlan(ROOT, COMMIT, '1.3.1'), /manifest/);
  const root = fixture(t);
  const config = path.join(root, 'edge', 'product.json');
  fs.writeFileSync(config, JSON.stringify({ schema_version: 1, extension_id: EXTENSION, product_id: EXTENSION }));
  assert.throws(() => createPlan(root, COMMIT, VERSION), /Partner Center GUID/);
  fs.writeFileSync(config, JSON.stringify({ schema_version: 1, extension_id: EXTENSION, product_id: null }));
  const { plan } = createPlan(root, COMMIT, VERSION);
  assert.equal(plan.ready_for_authenticated_operations, false);
  assert.throws(() => productPath(plan), /Owner setup required/);
});

test('offline plan validates the complete CI bundle and refuses tampered or extra artifacts', t => {
  const bundle = path.join(temp(t), 'release');
  buildAssets(ROOT, bundle, `v${VERSION}`, COMMIT);
  const output = path.join(temp(t), 'plan');
  writePlan(ROOT, output, COMMIT, VERSION, bundle);
  verifyPlan(ROOT, output, COMMIT, VERSION);
  assert.throws(() => writePlan(ROOT, output, COMMIT, VERSION), /must be empty/);
  assert.throws(() => verifyPlan(ROOT, output, 'b'.repeat(40), VERSION), /immutable source/);
  fs.writeFileSync(path.join(output, 'extra.txt'), 'extra');
  assert.throws(() => verifyPlan(ROOT, output, COMMIT, VERSION), /Unexpected or missing/);
  fs.unlinkSync(path.join(output, 'extra.txt'));
  fs.appendFileSync(path.join(output, 'maskify.zip'), 'tampered');
  assert.throws(() => verifyPlan(ROOT, output, COMMIT, VERSION), /reviewed artifact differs/);
  fs.appendFileSync(path.join(bundle, 'maskify.zip'), 'tampered');
  assert.throws(() => writePlan(ROOT, temp(t), COMMIT, VERSION, bundle), /size mismatch/);
});

test('validly checksummed CI packages from another builder are still rejected', t => {
  const bundle = path.join(temp(t), 'release');
  buildAssets(ROOT, bundle, `v${VERSION}`, COMMIT);
  const { createHash } = require('node:crypto');
  const hash = data => createHash('sha256').update(data).digest('hex');
  const provenancePath = path.join(bundle, 'release-provenance.json');
  const provenance = JSON.parse(fs.readFileSync(provenancePath));
  const file = provenance.files.find(item => item.name === 'maskify.zip');
  const bytes = Buffer.from('different builder output');
  fs.writeFileSync(path.join(bundle, file.name), bytes);
  file.bytes = bytes.length;
  file.sha256 = hash(bytes);
  fs.writeFileSync(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
  fs.writeFileSync(path.join(bundle, 'SHA256SUMS'), [...provenance.files.map(item => item.name), 'release-provenance.json']
    .map(name => `${hash(fs.readFileSync(path.join(bundle, name)))}  ${name}\n`).join(''));
  assert.throws(() => writePlan(ROOT, temp(t), COMMIT, VERSION, bundle), /differs from CI-tested/);
});

test('read-only credential test GETs an existing real operation and strips arbitrary server fields', async () => {
  const { plan } = createPlan(ROOT, COMMIT, VERSION);
  const calls = [];
  const request = client({ apiKey: 'secret-key', clientId: 'client', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ id: OPERATION, status: 'Failed', message: 'secret-key', errors: ['secret-key'] }));
  } });
  const result = await authCheck(plan, 'upload', OPERATION, request);
  assert.deepEqual(result, { operation_id: OPERATION, status: 'Failed' });
  assert.equal(calls[0].url, API + operationPath(plan, 'upload', OPERATION));
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, 'ApiKey secret-key');
  assert.equal(calls[0].options.headers['X-ClientID'], 'client');
  await assert.rejects(() => request('POST', `${productPath(plan)}/draft/package`, Buffer.from('zip')), /read-only/);
  await assert.rejects(() => authCheck(plan, 'upload', 'dummy', request), /real operation GUID/);
  assert.equal(calls.length, 1);
  assert.equal(operationPath(plan, 'submission', OPERATION), `${productPath(plan)}/operations/${OPERATION}`);
});

test('HTTP failures, missing status, redirected requests and malformed JSON never become auth success or leak bodies', async () => {
  const { plan } = createPlan(ROOT, COMMIT, VERSION);
  for (const status of [301, 401, 403, 404, 429, 500]) {
    const request = client({ apiKey: 'sensitive-key', clientId: 'client', fetchImpl: async () =>
      new Response('sensitive-key', { status }) });
    await assert.rejects(() => authCheck(plan, 'upload', OPERATION, request), error =>
      error.message.includes(`HTTP ${status}`) && !error.message.includes('sensitive-key'));
  }
  for (const body of ['invalid sensitive-key JSON', '{}', JSON.stringify({ id: 'sensitive-key', status: 'Succeeded' }),
    JSON.stringify({ id: OPERATION, status: 'sensitive-key' })]) {
    const request = client({ apiKey: 'sensitive-key', clientId: 'client', fetchImpl: async () => new Response(body) });
    await assert.rejects(() => authCheck(plan, 'upload', OPERATION, request),
      error => !error.message.includes('sensitive-key'));
  }
  const request = client({ apiKey: 'sensitive-key', clientId: 'client', fetchImpl: async () => {
    throw new Error('redirect or timeout sensitive-key');
  } });
  await assert.rejects(() => authCheck(plan, 'upload', OPERATION, request),
    error => /transport failure/.test(error.message) && !error.message.includes('sensitive-key'));
});

test('only documented operation locations are accepted, never followed as arbitrary URLs', () => {
  const endpoint = `products/${PRODUCT}/submissions/draft/package`;
  assert.equal(operationId(OPERATION, endpoint), OPERATION);
  assert.equal(operationId(`${API}${endpoint}/operations/${OPERATION}`, endpoint), OPERATION);
  for (const invalid of [null, OPERATION + '\n', 'https://other.invalid/' + OPERATION,
    `${API}products/another/submissions/operations/${OPERATION}`]) {
    assert.throws(() => operationId(invalid, endpoint), /operation|location/i);
  }
});

test('upload requires exact product/version/source intent and an owner-verified older live version', () => {
  const { plan } = createPlan(ROOT, COMMIT, VERSION);
  assert.equal(uploadIntent(plan, '1.2.0', confirmation(plan), '42').package_sha256,
    plan.files.find(file => file.name === 'maskify.zip').sha256);
  for (const version of ['1.3.0', '1.3.1', '2.0.0']) {
    assert.throws(() => uploadIntent(plan, version, confirmation(plan, version), '42'), /newer/);
  }
  for (const value of ['', confirmation(plan).replace(PRODUCT, OPERATION), confirmation(plan, '1.1.0')]) {
    assert.throws(() => uploadIntent(plan, '1.2.0', value, '42'), /confirmation/);
  }
});

test('complete run-history guard blocks repeated, rerun, older or conflicting versions regardless of prior outcome', () => {
  const { plan } = createPlan(ROOT, COMMIT, VERSION);
  const current = { id: 42, event: 'workflow_dispatch', head_branch: 'main', display_title: `Edge upload ${VERSION} ${COMMIT}` };
  checkHistory(plan, '42', '1', [current]);
  checkHistory(plan, '42', '1', [current, { id: 20, display_title: `Edge upload 1.2.0 ${COMMIT}` }]);
  assert.throws(() => checkHistory(plan, '42', '2', [current]), /reruns/);
  assert.throws(() => checkHistory(plan, '42', '1', []), /missing/);
  assert.throws(() => checkHistory(plan, '42', '1', [{ ...current, head_branch: 'feature' }]));
  for (const version of ['1.3.0', '1.4.0']) {
    for (const conclusion of ['success', 'failure', 'cancelled', null]) {
      assert.throws(() => checkHistory(plan, '42', '1', [current, {
        id: 21, display_title: `Edge upload ${version} ${'b'.repeat(40)}`, conclusion,
      }]), /already exists/);
    }
  }
});

test('pagination must include every unique workflow run with consistent counts', () => {
  const pages = [{ total_count: 2, workflow_runs: [{ id: 1 }] }, { total_count: 2, workflow_runs: [{ id: 2 }] }];
  assert.deepEqual(historyPages(pages), [{ id: 1 }, { id: 2 }]);
  for (const invalid of [[], [{}], [{ total_count: 2, workflow_runs: [{ id: 1 }] }],
    [pages[0], { total_count: 2, workflow_runs: [{ id: 1 }] }],
    [pages[0], { total_count: 3, workflow_runs: [{ id: 2 }] }]]) {
    assert.throws(() => historyPages(invalid), /history/);
  }
});

test('invalid historical dispatch versions cannot reserve versions or block later valid uploads', () => {
  const { plan } = createPlan(ROOT, COMMIT, VERSION);
  const current = { id: 42, event: 'workflow_dispatch', head_branch: 'main', display_title: `Edge upload ${VERSION} ${COMMIT}` };
  const invalid = ['1.03.0', '01.3.0', '1.3.00', '65536.0.0', '1.65536.0', '1.3.65536',
    '999999999999999999999999.0.0', '1.3.0-beta', '1.3.0\n'];
  const history = invalid.map((version, index) => ({
    id: 100 + index, display_title: `Edge upload ${version} ${COMMIT}`, conclusion: 'failure',
  }));
  checkHistory(plan, '42', '1', [current, ...history]);
  assert.throws(() => checkHistory(plan, '42', '1', [current, ...history, {
    id: 21, display_title: `Edge upload 1.3.0 ${COMMIT}`, conclusion: 'failure',
  }]), /already exists/);
});

test('shared source reader rejects path traversal instead of reading outside the selected checkout', () => {
  for (const file of ['../manifest.json', 'edge/../../manifest.json', 'C:\\private.json']) {
    assert.throws(() => readRepositoryFile(ROOT, file), /Unsafe repository path/);
  }
  assert.equal(JSON.parse(readRepositoryFile(ROOT, 'edge/product.json')).product_id, PRODUCT);
});

test('draft upload sends the reviewed ZIP once, journals before POST, polls GET only and never submits', async () => {
  const verified = createPlan(ROOT, COMMIT, VERSION);
  const intent = uploadIntent(verified.plan, '1.2.0', confirmation(verified.plan), '42');
  const events = [];
  const calls = [];
  const request = client({ apiKey: 'key', clientId: 'client', readOnly: false, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'POST') {
      assert.equal(events.at(-1).stage, 'attempting');
      assert(options.body.equals(verified.files.get('maskify.zip')));
      return new Response(null, { status: 202, headers: { location: OPERATION } });
    }
    return new Response(JSON.stringify({ id: OPERATION, status: calls.length === 2 ? 'InProgress' : 'Succeeded' }));
  } });
  await upload(verified, intent, request, event => events.push(event), { sleep: async () => {} });
  assert.deepEqual(calls.map(call => call.options.method), ['POST', 'GET', 'GET']);
  assert(calls.every(call => call.url.includes('/submissions/draft/package')));
  assert.deepEqual(events.map(event => event.stage), ['attempting', 'accepted', 'status', 'status']);
  assert.equal(events.at(-1).package_sha256, intent.package_sha256);
  await assert.rejects(() => request('POST', productPath(verified.plan), Buffer.from('notes')), /Unsupported/);
});

test('failed, pending and unknown upload outcomes never trigger a second POST', async () => {
  const verified = createPlan(ROOT, COMMIT, VERSION);
  const intent = uploadIntent(verified.plan, '1.2.0', confirmation(verified.plan), '42');
  for (const state of ['Failed', 'InProgress', 'transport']) {
    const events = [];
    let posts = 0;
    const request = async method => {
      if (method === 'POST') {
        posts++;
        if (state === 'transport') throw new Error('unknown outcome');
        return { operation_id: OPERATION };
      }
      return { operation_id: OPERATION, status: state };
    };
    await assert.rejects(() => upload(verified, intent, request, event => events.push(event),
      { sleep: async () => {}, polls: 2 }), /failed|pending|unknown/);
    assert.equal(posts, 1);
    assert.equal(events[0].stage, 'attempting');
    if (state !== 'transport') assert.equal(events[1].operation_id, OPERATION);
  }
});

test('workflow is manual, main-only, approval-gated and persists intent before isolating credentials', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'edge-publish.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n  (push|release|pull_request|pull_request_target):/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /default: plan/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(workflow, /environment: edge-production/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /actions: read/);
  assert.doesNotMatch(workflow, /contents: write|id-token: write|secrets: inherit|BPP_KEYS|PlasmoHQ/);
  const [unprivileged, protectedJob] = workflow.split('\n  apply:');
  assert.doesNotMatch(unprivileged, /secrets\./);
  assert(protectedJob.indexOf('name: edge-upload-intent') < protectedJob.indexOf('secrets.EDGE_API_KEY'));
  assert.equal((workflow.match(/uses: actions\/checkout@/g) || []).length,
    (workflow.match(/persist-credentials: false/g) || []).length);
  assert.match(workflow, /VERIFIED_RELEASE_DIRECTORY:/);
  assert.match(workflow, /if: always\(\) && inputs.operation == 'upload'/);
});
