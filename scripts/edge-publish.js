'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { buildChromium, makeArchive } = require('./extension-package');
const { isSha, isVersion, readRepositoryFile, resolveCommit, verifyCheckout } = require('./store-publish');

const ROOT = path.resolve(__dirname, '..');
const API = 'https://api.addons.microsoftedge.microsoft.com/v1/';
const EXTENSION = 'ahlpkipagblmbjceamojfdomdmcmcpgc';
const isGuid = value => typeof value === 'string' && value.length === 36 &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const isEdgeVersion = value => isVersion(value) && value.split('.').every(part => Number(part) <= 65535);
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const MANUAL = [
  'Partner Center product GUID must be verified against the existing public Maskify listing before enabling credentials.',
  'No API reads the current product version, draft package bytes, listing metadata or competing submissions.',
  'Before upload, the owner must verify the live version, an empty/safe draft, and no competing submissions or writers.',
  'Listing copy, images, privacy/distribution declarations and other metadata must be applied manually from the generated Edge pack.',
  'Draft upload does not submit for certification or authorize publication. Review and submit separately in Partner Center.',
  'A successful operation status is not a package-hash verification or proof of public availability.',
];

function compareVersions(left, right) {
  for (const version of [left, right]) {
    assert(isEdgeVersion(version),
      'Use stable MAJOR.MINOR.PATCH versions with components at most 65535');
  }
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  return a.map((value, index) => Math.sign(value - b[index])).find(value => value !== 0) || 0;
}

function createPlan(root, commit, version) {
  const { buildStoreFiles } = require('./store-assets');
  assert(isSha(commit), 'Use a full immutable source commit SHA');
  compareVersions(version, version);
  const config = JSON.parse(readRepositoryFile(root, 'edge/product.json'));
  assert.deepEqual(Object.keys(config).sort(), ['extension_id', 'product_id', 'schema_version']);
  assert.equal(config.schema_version, 1);
  assert.equal(config.extension_id, EXTENSION, 'Refusing another public extension identity');
  assert(config.product_id === null || isGuid(config.product_id), 'Product ID must be the Partner Center GUID, not the public extension ID');
  assert.equal(JSON.parse(readRepositoryFile(root, 'manifest.json')).version, version,
    'Requested version differs from manifest.json');
  const listing = buildStoreFiles(root, 'edge');
  const files = new Map([
    ['maskify.zip', buildChromium(root)],
    ['maskify-edge-assets.zip', makeArchive(listing)],
    ['reviewer-notes.txt', listing.get('reviewer-notes.txt')],
  ]);
  return { files, plan: {
    schema_version: 1, commit, version, extension_id: EXTENSION, product_id: config.product_id,
    api: API, supported_operations: ['plan', 'status', 'upload'],
    ready_for_authenticated_operations: config.product_id !== null,
    files: [...files].map(([name, bytes]) => ({ name, bytes: bytes.length, sha256: sha256(bytes) })),
    manual_exceptions: MANUAL,
  } };
}

function writePlan(root, output, commit, version, verifiedDirectory) {
  assert(!fs.existsSync(output) || fs.readdirSync(output).length === 0, 'Edge plan output must be empty');
  const result = createPlan(root, commit, version);
  if (verifiedDirectory) {
    const { verifyBundle } = require('./release-assets');
    const verified = verifyBundle(verifiedDirectory, `v${version}`, commit);
    for (const name of ['maskify.zip', 'maskify-edge-assets.zip']) {
      assert(verified.get(name).equals(result.files.get(name)), `${name}: trusted plan differs from CI-tested package`);
    }
  }
  fs.mkdirSync(output, { recursive: true });
  for (const [name, bytes] of result.files) fs.writeFileSync(path.join(output, name), bytes);
  fs.writeFileSync(path.join(output, 'plan.json'), json(result.plan));
  return result.plan;
}

function verifyPlan(root, output, commit, version) {
  const expected = createPlan(root, commit, version);
  assert(fs.readFileSync(path.join(output, 'plan.json')).equals(json(expected.plan)),
    'Plan differs from the reviewed immutable source');
  assert.deepEqual(fs.readdirSync(output).sort(), ['plan.json', ...expected.files.keys()].sort(),
    'Unexpected or missing plan files');
  for (const [name, bytes] of expected.files) {
    assert(fs.readFileSync(path.join(output, name)).equals(bytes), `${name}: reviewed artifact differs`);
  }
  return expected;
}

function productPath(plan) {
  assert(isGuid(plan.product_id), 'Owner setup required: commit the verified Partner Center product GUID in edge/product.json');
  return `products/${plan.product_id}/submissions`;
}

function operationPath(plan, kind, id) {
  assert(['upload', 'submission'].includes(kind), 'Operation kind must be upload or submission');
  assert(isGuid(id), 'Use an existing real operation GUID from Partner Center/API receipts');
  return `${productPath(plan)}${kind === 'upload' ? '/draft/package' : ''}/operations/${id}`;
}

function operationId(location, endpoint) {
  assert(typeof location === 'string', 'Accepted request has no operation ID; inspect Partner Center, do not retry');
  if (isGuid(location)) return location;
  const prefix = `${API}${endpoint}/operations/`;
  assert(location.startsWith(prefix) && isGuid(location.slice(prefix.length)),
    'Unexpected operation location; inspect Partner Center, do not retry');
  return location.slice(prefix.length);
}

function client({ apiKey, clientId, readOnly = true, fetchImpl = fetch }) {
  assert(apiKey && clientId && !/[\r\n]/.test(apiKey + clientId),
    'Set EDGE_API_KEY and EDGE_CLIENT_ID only in protected edge-production');
  return async (method, endpoint, body) => {
    assert(method === 'GET' || (!readOnly && method === 'POST' && endpoint.endsWith('/submissions/draft/package')),
      'Unsupported Edge request or mutation in read-only mode');
    assert(/^products\/[a-f0-9-]+\/submissions(?:\/draft\/package)?(?:\/operations\/[a-f0-9-]+)?$/.test(endpoint),
      'Unsupported Edge endpoint');
    let response;
    try {
      response = await fetchImpl(API + endpoint, {
        method, redirect: 'error', signal: AbortSignal.timeout(60000),
        headers: {
          Authorization: `ApiKey ${apiKey}`, 'X-ClientID': clientId,
          ...(body ? { 'Content-Type': 'application/zip' } : {}),
        },
        ...(body ? { body } : {}),
      });
    } catch {
      throw new Error('Edge transport failure. Outcome may be unknown for POST; inspect Partner Center and receipt, do not repeat upload.');
    }
    assert.equal(response.status, method === 'GET' ? 200 : 202,
      `Edge ${method} failed (HTTP ${response.status}); inspect Partner Center. Response bodies are withheld.`);
    if (method === 'POST') return { operation_id: operationId(response.headers.get('location'), endpoint) };
    let value;
    try {
      value = await response.json();
    } catch {
      throw new Error('Edge returned invalid operation JSON; no status verified');
    }
    const id = endpoint.split('/').at(-1);
    assert(value && typeof value === 'object' && value.id === id, 'Edge returned another operation identity');
    assert(['InProgress', 'Succeeded', 'Failed'].includes(value.status), 'Edge returned an unrecognized operation status');
    // Whitelist fields, never echo server messages, headers or errors that might contain credentials.
    return { operation_id: id, status: value.status };
  };
}

async function authCheck(plan, kind, id, request) {
  const result = await request('GET', operationPath(plan, kind, id));
  assert.equal(result.operation_id, id);
  assert(['InProgress', 'Succeeded', 'Failed'].includes(result.status));
  return result;
}

function checkHistory(plan, currentRun, attempt, runs) {
  assert(/^[1-9]\d*$/.test(currentRun), 'A GitHub Actions run ID is required');
  assert.equal(String(attempt), '1', 'Upload reruns are prohibited. Use read-only operation status and reconcile in Partner Center');
  let found = false;
  for (const run of runs) {
    if (String(run.id) === currentRun) {
      assert.equal(run.event, 'workflow_dispatch');
      assert.equal(run.head_branch, 'main');
      assert.equal(run.display_title, `Edge upload ${plan.version} ${plan.commit}`);
      found = true;
      continue;
    }
    const match = /^Edge upload (\d+\.\d+\.\d+) ([a-f0-9]{40})$/.exec(run.display_title);
    if (!match || !isEdgeVersion(match[1])) continue;
    assert(compareVersions(plan.version, match[1]) > 0,
      'An equal or newer Edge upload run already exists. Do not retry or overwrite a draft; reconcile in Partner Center');
  }
  assert(found, 'Current upload run is missing from complete workflow history');
}

function historyPages(pages) {
  assert(Array.isArray(pages) && pages.length > 0, 'Upload history is missing');
  assert(pages.every(page => Number.isSafeInteger(page.total_count) && Array.isArray(page.workflow_runs)),
    'Upload history response is invalid');
  const runs = pages.flatMap(page => page.workflow_runs);
  assert(pages.every(page => page.total_count === pages[0].total_count) &&
    new Set(runs.map(run => run.id)).size === runs.length && runs.length === pages[0].total_count,
    'Upload history is incomplete or changed during pagination; no upload authorized');
  return runs;
}

function uploadIntent(plan, currentVersion, confirmation, runId) {
  productPath(plan);
  assert(compareVersions(plan.version, currentVersion) > 0, 'Requested version must be newer than the owner-verified live version');
  assert.equal(confirmation,
    `maskify:edge:upload:${plan.version}:${plan.commit}:${plan.product_id}:${currentVersion}`,
    'Explicit draft-upload confirmation and Partner Center state review are required');
  assert(/^[1-9]\d*$/.test(runId), 'A GitHub Actions run ID is required');
  return {
    schema_version: 1, run_id: runId, operation: 'upload',
    commit: plan.commit, version: plan.version, product_id: plan.product_id,
    owner_verified_live_version: currentVersion,
    package_sha256: plan.files.find(file => file.name === 'maskify.zip').sha256,
  };
}

async function upload(verified, intent, request, record, { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), polls = 20 } = {}) {
  const { plan, files } = verified;
  const endpoint = `${productPath(plan)}/draft/package`;
  assert.equal(intent.package_sha256, sha256(files.get('maskify.zip')), 'Upload bytes differ from reserved intent');
  record({ ...intent, stage: 'attempting' });
  const accepted = await request('POST', endpoint, files.get('maskify.zip'));
  assert(isGuid(accepted.operation_id), 'Upload accepted without valid operation identity; do not retry');
  record({ ...intent, stage: 'accepted', operation_id: accepted.operation_id });
  for (let index = 0; index < polls; index++) {
    const result = await authCheck(plan, 'upload', accepted.operation_id, request);
    record({ ...intent, stage: 'status', ...result });
    assert.notEqual(result.status, 'Failed', 'Edge package upload failed; inspect Partner Center, do not retry automatically');
    if (result.status === 'Succeeded') return result;
    if (index + 1 < polls) await sleep(15000);
  }
  throw new Error('Edge upload is still pending. Use read-only status with the receipt operation ID; do not reupload');
}

async function main() {
  const [command, rootArg, outputArg, commit, version, ...extra] = process.argv.slice(2);
  assert.equal(extra.length, 0, 'Unexpected arguments');
  const root = path.resolve(rootArg || ROOT);
  if (command === 'resolve') {
    const result = resolveCommit(root, process.env.SOURCE_SHA, process.env.EXPECTED_VERSION);
    assert(process.env.GITHUB_OUTPUT, 'resolve is for the GitHub workflow');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `commit=${result.commit}\nversion=${result.version}\n`);
    return;
  }
  verifyCheckout(root, commit);
  if (command === 'plan') {
    writePlan(root, path.resolve(outputArg), commit, version, process.env.VERIFIED_RELEASE_DIRECTORY);
    console.log('Offline Edge plan generated. No store requests performed. Review plan.json and manual exceptions.');
    return;
  }
  assert(['guard', 'status', 'upload'].includes(command), 'Use resolve, plan, guard, status or upload');
  resolveCommit(root, commit, version);
  const verified = verifyPlan(root, path.resolve(outputArg), commit, version);
  productPath(verified.plan);
  if (command === 'status') {
    const result = await authCheck(verified.plan, process.env.OPERATION_KIND, process.env.OPERATION_ID,
      client({ apiKey: process.env.EDGE_API_KEY, clientId: process.env.EDGE_CLIENT_ID }));
    console.log(`Authenticated GET verified; operation ${result.operation_id}: ${result.status}. No mutations performed.`);
    assert.notEqual(result.status, 'Failed', 'Credentials authenticated, but the Edge operation failed. Inspect Partner Center');
    return;
  }
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Uploads are supported only in the protected GitHub workflow');
  assert.equal(process.env.GITHUB_REPOSITORY, 'mike-mo/maskify');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  const intent = uploadIntent(verified.plan, process.env.CURRENT_VERSION, process.env.CONFIRMATION, process.env.GITHUB_RUN_ID);
  assert(process.env.EDGE_INTENT, 'Set EDGE_INTENT to the run reservation');
  if (command === 'guard') {
    let pages;
    try {
      pages = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp',
        'repos/mike-mo/maskify/actions/workflows/edge-publish.yml/runs?per_page=100'], {
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      }));
    } catch {
      throw new Error('Cannot read complete Edge workflow history. Check Actions read access; no upload authorized');
    }
    checkHistory(verified.plan, process.env.GITHUB_RUN_ID, process.env.GITHUB_RUN_ATTEMPT,
      historyPages(pages));
    fs.writeFileSync(process.env.EDGE_INTENT, json(intent), { flag: 'wx' });
    console.log('Upload history and explicit intent verified. Reservation must be saved before credentials are used.');
    return;
  }
  assert.equal(process.env.GITHUB_RUN_ATTEMPT, '1', 'Upload reruns are prohibited');
  assert(fs.readFileSync(process.env.EDGE_INTENT).equals(json(intent)), 'Upload intent does not match this run');
  assert(process.env.EDGE_RECEIPT, 'Set EDGE_RECEIPT to a durable mutation journal');
  fs.writeFileSync(process.env.EDGE_RECEIPT, '', { flag: 'wx' });
  await upload(verified, intent,
    client({ apiKey: process.env.EDGE_API_KEY, clientId: process.env.EDGE_CLIENT_ID, readOnly: false }),
    event => fs.appendFileSync(process.env.EDGE_RECEIPT, JSON.stringify(event) + '\n'));
  console.log('Draft package upload succeeded. No certification/submission/publication request was sent.');
}

if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = {
  API, EXTENSION, MANUAL, compareVersions, createPlan, writePlan, verifyPlan, productPath,
  operationPath, operationId, client, authCheck, checkHistory, historyPages, uploadIntent, upload,
};
