# Releasing Maskify

## Scope and approval

The **Release artifacts** workflow supports stable releases starting with **v1.3.0**. It builds
GitHub release assets only. It does not create or move tags, create releases,
invoke PlasmoHQ/bpp, use `BPP_KEYS`, or submit anything to a browser store.
Publishing a GitHub release cannot trigger an automated Edge submission.

Store upload is a separate, human-authorized operation in Partner Center.
Uploading a draft package does not authorize certification, submission, or
publication. Firefox has a separate, manually dispatched **Firefox Add-ons**
workflow with an offline plan and protected approval gate. It can synchronize
AMO metadata or submit a new version, but is never triggered by a push or GitHub
release. Its listing pack is not an extension; use the separate Firefox package.

## Prepare a version

1. Start from the approved commit. Change only `manifest.json`'s `version`.
2. If the approved store-pack inputs are unchanged apart from that version, run
   `npm --prefix scripts run stores:version -- --from <full-approved-commit-sha>`.
   This compares the complete runtime allowlist (including added/removed files)
   with that Git commit, rejects other manifest/source changes and stale ZIPs,
   checks staged packs, then updates only the three inventory hashes and three
   ZIPs. No PNG is captured or regenerated, and listing/UI copy stays unchanged.
3. Run `npm --prefix scripts test`, open a PR, and wait for GitHub CI. CI also
   builds a downloadable `release-assets` artifact. A PR artifact records its
   tested PR merge SHA, not the eventual squash-merge SHA.
4. Merge only after approval. Record the exact merged commit and confirm its
   manifest version, then create the stable tag at **that commit**.

For v1.3.0, the approved asset baseline was
`f2b92fb4dfe626bd79cd290611741eb902684aef`. The version-only refresh preserves
all its approved PNGs and marketing/UI copy. Do not run `stores`, `screenshot`,
or `icons` generators merely to prepare a release.

For actual artwork or runtime changes, review the relevant assets and their
source-hash changes instead of using the version-only helper to bypass review.

## Create and package the official release

These commands are for the release owner, after merging the release PR. Replace
`MERGED_COMMIT_SHA` with the exact merged commit, not the PR head. Use a clean
checkout containing that commit:

```text
git tag -a v1.3.0 MERGED_COMMIT_SHA -m "Maskify v1.3.0"
git push origin refs/tags/v1.3.0
gh release create v1.3.0 --repo mike-mo/maskify --verify-tag --title "Maskify v1.3.0" --generate-notes --latest
```

Creation of a published release triggers **Release artifacts** (`publish.yml`).
It resolves the existing tag to its exact commit (including annotated tags),
checks out that commit, requires manifest/tag agreement, and runs the same
Node 24 / Playwright Chromium and desktop Firefox checks as PR and push CI before
building artifacts.
The workflow defaults to `contents: read`. The `resolve` job needs
`contents: write` because [GitHub requires push access to discover draft releases](https://docs.github.com/en/rest/releases/releases#list-releases).
It only reads release metadata and tag refs. The verifier stays read-only;
the `upload` job retains `contents: write` and is the only job that mutates release
assets. All checkouts use `persist-credentials: false`.

The workflow attaches:

- `maskify.zip`: the actual Chromium extension with `background.js`, manifest,
  locales, popup, content scripts, data, and only the 16/32/48/128 runtime icons.
- `maskify-firefox.zip`: the unsigned desktop Firefox extension, with an MV3
  event-page background and Firefox identity/data declarations.
- `maskify-firefox-source.zip`: matching reviewer sources and reproducible build
  instructions in this document, including the manifest overlay and locked tools.
- `maskify300x300.png`: the approved store logo.
- `maskify-edge-assets.zip`, `maskify-chrome-assets.zip`, and
  `maskify-firefox-assets.zip`: exact committed store upload packs.
- `screenshots.zip`: all six approved English/Spanish screenshots, plus the
  three `en-*.png` attachments for optional release-note images.
- `release-provenance.json` and `SHA256SUMS`: exact tag/commit and file hashes.

Watch that workflow to completion before downloading or uploading the extension
package. The release itself can exist while asset checks are still running.
Inspect `release-provenance.json` and confirm its commit equals the tagged merged
commit. Use the downloaded `maskify.zip` for the Partner Center package upload,
not a store listing pack.

To retry a failed run or attach assets to an existing draft/stable release:

```text
gh workflow run publish.yml --repo mike-mo/maskify --ref main -f tag=v1.3.0
gh run list --repo mike-mo/maskify --workflow publish.yml --limit 5
gh run watch RUN_ID --repo mike-mo/maskify --exit-status
```

Use the explicit tag for release work. A blank tag calls GitHub's
`releases/latest` endpoint, which selects the stable latest, not the
newest-created prerelease. The historical `v1.2.0-screenshot-test` prerelease
will not be selected. The manual `screenshots.yml` entry point delegates to this
same artifact workflow; it does not race the published-release event.

Retries compare existing asset bytes, upload only missing files, and verify the
saved bytes. They never use `--clobber`, move a tag, or rewrite release notes.
Tag checks before and after upload detect a moved tag, but GitHub provides no
atomic tag-ref-and-asset-upload operation. A manual tag move during an upload
can leave some assets attached before the workflow fails. Treat such a run as
invalid, compare the recorded source commit, and do not use its package.
Do not move or delete release tags; use repository tag protection/immutability
where available and create a new version for changed code. The workflow does
not change repository rules or request administrative permissions.

A mismatched asset, incomplete upload, or incompatible/immutable release also
fails explicitly. Inspect a conflict manually instead of deleting or replacing
historical assets to make a retry pass.

## Firefox Add-ons (AMO)

### Package and verify locally

Use [Node.js 24 LTS](https://nodejs.org/) and npm 11 on Windows, Linux, or macOS.
The same commands work in each environment; the packaging code normalizes text
to LF and uses fixed ZIP timestamps. Start in the repository root:

```text
npm --prefix scripts ci --ignore-scripts
npm --prefix scripts run firefox:build -- dist/firefox
npm --prefix scripts run firefox:lint
npm --prefix scripts run test:firefox
```

Choose a new or empty output directory. `firefox:build` creates
`maskify-firefox.zip` and `maskify-firefox-source.zip`. It does not sign, upload,
contact AMO, change the Chromium manifest, or regenerate approved artwork.
`dist/` is local output, not source to commit.

The root `manifest.json` remains Chromium MV3 with `background.service_worker`.
`manifest.firefox.json` replaces that section with `background.scripts` for a
non-persistent Firefox MV3 event page. Runtime files are shared unchanged between
packages. The background chooses Firefox's promise-based `browser` namespace or
Chromium's `chrome` namespace. The popup/content scripts retain Firefox-supported
callback APIs. No polyfill, bundling, minification, or remote runtime code is used.

The Firefox overlay declares:

- `@maskify.mike-mo`, the **developer-chosen immutable ID** used by the existing
  AMO listing, add-on 3119745, slug `maskify`. Keep it unchanged for all updates.
  The owner submitted 1.3.0 manually; do not create another listing or resubmit
  that version. See the submission receipt in `amo/listing.json`.
- Desktop Firefox **140.0 or later**, including ESR 140, with no maximum version.
  Android is not enabled or verified.
- `data_collection_permissions.required: ["none"]`. Page content is processed
  locally and never stored or transmitted by Maskify. Preferences and the action
  count use browser-managed `storage.sync`; browser account settings control
  syncing. There is no developer telemetry or external data endpoint. Reassess
  this declaration if data handling changes.

`firefox:lint` validates the actual generated ZIP contents with locked Mozilla
`web-ext`/`addons-linter` versions. Validation must have **zero errors**. Three
existing warnings remain: two `UNSAFE_VAR_ASSIGNMENT` reports for popup labels
using `innerHTML` with static, bundled English/Spanish messages (only `<strong>`
markup), and an Android minimum-version warning because the desktop consent
system starts at 140 but Android's starts at 142. This package does not declare
`gecko_android` and makes no Android compatibility claim. Review new warnings
rather than assuming every warning is acceptable. AMO may request changes.

The Firefox smoke checks install the ZIP temporarily in clean headless Firefox,
grant the MV3 site access normally approved on installation, and check both
English and Spanish using the official matching Mozilla language pack. They
exercise the actual popup, page/title/link/form masking, saved format options,
and Firefox's registered Alt+Shift+M command dispatch into the event page.
Command dispatch does not verify physical keyboard delivery or OS shortcut
conflicts. Manually check the toolbar popup and physical shortcut before
submission. For local checks install desktop Firefox, optionally set
`FIREFOX_BINARY` to its executable, and allow Selenium Manager to obtain
geckodriver. These tooling/language-pack downloads are test-only, not runtime
extension dependencies or requests.
CI checks both Firefox 140.0 and the latest stable Firefox before producing
release artifacts. The local geckodriver path-install endpoint keeps the actual
ZIP available for Firefox 140's lazy script loading throughout the test.

### Reviewer source build

Attach `maskify-firefox-source.zip` as the matching **source code** during AMO
submission because the build generates the Firefox manifest from an overlay.
It contains readable runtime code, the original Chromium manifest, the overlay,
the minimal packaging scripts, npm manifest/lockfile, license, and these build
instructions, but no dependencies, credentials, development browser profiles,
or generated listing graphics.

Extract the source archive into a new directory. From its root, run:

```text
npm --prefix scripts ci --ignore-scripts
npm --prefix scripts run firefox:build -- dist/firefox
```

Compare the resulting `dist/firefox/maskify-firefox.zip` byte-for-byte with the
submitted extension ZIP. The build is cross-platform and does not require git,
a browser, or store credentials. The minimal source archive supports the build,
not the full repository test suite. Dependency downloads use the official npm
registry. Browser tests and linting are performed from the full repository.

### Repository-driven listing and version content

The initial 1.3.0 submission already reused the approved repository descriptions,
summaries, icon, screenshots, captions, privacy policy and license. The remaining
browser-authored choices and notes are now tracked without copying that artwork
or listing prose into another source:

| Submitted content | Canonical repository input |
| --- | --- |
| English/Spanish names and summaries, homepage/support/policy URLs | `store-assets/firefox/en/listing-copy.json` and `es/listing-copy.json`; checked against package locale messages |
| English/Spanish descriptions | `store-assets/firefox/en/description.md` and `es/description.md`, originally generated from `store-assets.md` |
| Privacy policy | `store-assets/firefox/privacy-policy.txt` plus `privacy_policy_suffix` in `amo/listing.json`; only English was submitted |
| Custom license | Root `LICENSE` plus its submitted name in `amo/listing.json` |
| Icon, ordered screenshots and bilingual captions | Existing `store-assets/firefox/` PNGs and `en/captions.json` / `es/captions.json`; AMO image IDs and approved-image/caption fingerprints in `amo/listing.json` |
| Category Privacy & Security, tag privacy, non-experimental, no required payment/service/hardware, blank support email, locale mapping | `amo/listing.json` |
| Public version notes and reviewer instructions | `amo/versions/1.3.0/release-notes.txt` and `reviewer-notes.txt`, captured from the submitted text |
| Desktop >=140, no Android, extension ID and data declarations | `manifest.firefox.json` |
| Initial submitted source commit, package/source hashes and AMO version/file IDs | `initial_submission` in `amo/listing.json` |

Listing text is read from the loose approved files, not from stale ZIP copies.
The publisher normalizes CRLF to LF and trims trailing text whitespace. It does
not regenerate store packs, change approved art, invent a support email, or
invent a Spanish privacy policy or Spanish release notes. The English policy
is composed with the exact submitted published-policy link suffix. The source
archive contains runtime/build sources, not listing media, and stays a separate
AMO version attachment.

The initial saved gallery IDs are 443842, 443843 and 443844. These came from the
owner's successful media-save response and subsequent rendered English/Spanish
image checks, not a later authenticated API read. Live authenticated preflight
must still confirm the identity, exact image inventory/order, known captions,
dimensions and downloadable image bytes before any write.

The owner accepted the developer agreement and chose the public account display
name in AMO. Account identity, agreement acceptance, account security and API
credentials are **not listing/package configuration** and are not changed by the
publisher. Do not add them to the extension manifest or automate profile edits.
At the initial submission handoff, version 1.3.0 was **Awaiting Review**, not yet
publicly available. The repository records submission identity, not live review
status.

### GitHub Actions setup

An owner must perform this setup outside chat:

1. Merge the reviewed workflow/tooling/content into `main`. Enable GitHub Actions
   for the repository if needed. No AMO mutation occurs just by merging.
2. In repository **Settings > Environments**, create `amo-production`. Restrict
   deployment branches to protected `main`, require owner/release-reviewer
   approval, and prevent self-review if available. Confirm that your GitHub plan
   supports these protections. Do not enable a production apply run without an
   effective approval gate.
3. Signed in as an owner of add-on 3119745, obtain an API issuer/key and secret
   from [AMO API Credentials](https://addons.mozilla.org/en-US/developers/addon/api/key/).
   Creating/rotating keys is an owner action, not part of this workflow. AMO
   credentials act as that account, not as narrowly scoped per-add-on tokens.
   Never paste them into chat, repo files, inputs, logs or command arguments.
4. Add environment secrets **`AMO_JWT_ISSUER`** (AMO API key/issuer) and
   **`AMO_JWT_SECRET`** (AMO API secret). Keep both in `amo-production`, not
   repository-wide secrets. No GitHub write token or AMO credentials are needed
   for plan mode. These settings are not automatically created by the repo.

### Plan, synchronize, or submit

Use the **Firefox Add-ons** workflow (`.github/workflows/firefox-publish.yml`)
on **main**. Every run requires the full immutable 40-character `source_sha`
already merged into main and the exact `version` in that commit's manifest.
Branch names, tags, non-main workflow refs, unmerged commits and mismatched
versions are rejected. The default operation is **plan**.

For example, after replacing `FULL_MERGED_SHA` with the actual approved commit:

```text
gh workflow run firefox-publish.yml --repo mike-mo/maskify --ref main -f source_sha=FULL_MERGED_SHA -f version=1.3.0 -f operation=plan
```

The workflow runs existing package/runtime/artwork checks, Firefox 140/latest
browser checks and Mozilla linting, then compares the trusted plan's package
and reviewer-source ZIPs byte-for-byte with the exact CI-tested artifacts.
Download **`amo-plan`** and review `plan.json`, both ZIPs, the icon, and all
screenshot file/ID/caption/hash mappings. The plan includes every API payload
and lists manual exceptions. Plan mode makes **no AMO requests**, including no
validation upload, and requires no production credentials.

For a local, offline plan from a clean checkout, Node 24 and locked dependencies:

```text
npm --prefix scripts ci --ignore-scripts
node scripts/amo-publish.js plan . dist/amo-plan FULL_CHECKED_OUT_SHA 1.3.0
```

The local source must be clean and its HEAD must match that SHA. Local planning
also works on an unmerged development commit; the production workflow alone
requires main ancestry. Use a new/empty output directory. Review plan fields
without committing generated packages or payloads.

**sync** updates the existing listing and the selected existing listed version's
notes/custom license/desktop compatibility. It does **not** upload or replace
the extension or its source archive, and can operate on 1.3.0 awaiting review.
Use it only when the owner authorizes that metadata change. Existing version
sources must already be present. Initial 1.3.0 additionally requires the exact
recorded version/file IDs.

```text
gh workflow run firefox-publish.yml --repo mike-mo/maskify --ref main -f source_sha=FULL_MERGED_SHA -f version=1.3.0 -f operation=sync -f confirmation=maskify:sync:1.3.0:FULL_MERGED_SHA
```

**publish** submits a **new listed version for review**, not an unlisted build.
For a real future release, increase `manifest.json` only when there are approved
changes to distribute, refresh version-only store provenance using the existing
release procedure where applicable, and add
`amo/versions/NEW_VERSION/release-notes.txt` and `reviewer-notes.txt`. Notes must
describe that specific release and current reviewer steps; do not reuse initial
release notes automatically. Merge, plan and review before authorizing publish.
Then run with `operation=publish` and
`confirmation=maskify:publish:NEW_VERSION:FULL_MERGED_SHA`.

The script checks authenticated all-channel version history and refuses an
existing or non-increasing version, including 1.3.0, and refuses to submit
another version while a listed version is awaiting review. It uploads the
exact unsigned package with channel `listed`, polls Mozilla validation, rechecks
identity/duplicates/media, then creates the version with its **matching source
archive in the same multipart request**. It applies the custom license, release
notes and reviewer notes through the separate JSON version endpoint. This
separation is required because the API cannot accept nested translated JSON
objects and a source file in one request. Creation initially inherits the
previous version's license. The source file is never left for a later upload.

Before any mutation, approve `amo-production` only after reviewing that run's
plan and immutable source. The credential-bearing job executes the **publisher
from the workflow's trusted main commit**, installs only its locked dependencies
with lifecycle scripts disabled, treats the selected source checkout as data,
recomputes/compares the complete plan and files, and rechecks main ancestry.
Candidate build/test scripts never execute with AMO credentials. Secrets are
available only to the apply step, not to candidate CI, planning or npm install.
The GitHub token has only `contents: read`; no workflow modifies tags/releases.

### API coverage, media changes and partial failures

Supported operations use the official [AMO v5 APIs](https://mozilla.github.io/addons-server/topics/api/addons.html):
listing PATCH for bilingual names/summaries/descriptions, categories, tags,
homepage/support URLs, blank support email and commercial/experimental flags;
EULA-policy PATCH for the English privacy-policy body; multipart icon PATCH;
version PATCH for notes/custom license/desktop compatibility; upload validation
and multipart version creation with reviewer sources; preview creation and
bilingual caption/position PATCH. The `support_url` write field is also confirmed
in Mozilla's [AddonSerializer writable fields](https://github.com/mozilla/addons-server/blob/master/src/olympia/addons/serializers.py).
The public edit documentation currently omits that field from its field list.

The tooling verifies persisted listing/policy/version/caption fields with
authenticated `show_source` reads and confirms images remain downloadable.
AMO transforms image files and resizes icons asynchronously; it exposes no
original-byte checksum for those uploads. A successful icon request is an
acknowledged upload, not a byte-identical rendered-icon proof. Inspect the
finished listing after AMO processes it. Existing preview IDs are immutable
image identities, and local approved image hashes are checked before syncing.

Existing screenshots are **never blindly reuploaded**, and no DELETE endpoint
is called. A changed image at an existing ID fails explicitly. For a deliberately
new image, add an approved PNG and both captions, set its `id`,
`initial_position`, `uploaded_sha256`, and `initial_caption_sha256` to `null` in
the mapping, and review the plan. A successful create records the returned ID,
position, image hash and caption fingerprint in **`amo-receipt`**. Commit those
values before another sync. If the run failed after creating an image, first
adopt its receipt ID rather than uploading a duplicate. Missing, extra, reordered
or unexpectedly recaptioned live images fail before writes; a deliberate
repo-order change is accepted only from the recorded initial or desired order.

**Image replacement/removal remains an explicit portal operation** because the
API does not support replacing image bytes and this tooling deliberately does
not delete previews. Upload/approve the replacement, remove only the intended
old preview in the Developer Hub, then commit the verified new ID/hash/position
mapping and captions. Do not guess IDs or silently drop a live screenshot.
Unexpected caption changes require reconciling the recorded fingerprint or
canonical caption with the owner before syncing.

AMO updates are **not transactional**. A new version with sources can be created
before a later metadata request fails, or a partial media update can persist.
Requests are not automatically retried after ambiguous transport failures.
Every acknowledged mutation is journaled to the always-uploaded `amo-receipt`
artifact (90 days); plan artifacts are retained for 30 days. Inspect the live
version and receipt after any failure. A repeated publish refuses duplicate
versions. Once the source attachment is confirmed, use an explicitly authorized
**sync** run to finish metadata instead of submitting another version. If a
failure occurred before its response/receipt was received, inspect AMO manually
first. Never bump a version merely to get a failed workflow to turn green.

Account agreements/security/profile display name, Mozilla review/signing,
reviewer decisions and eventual public availability cannot be synchronized from
these repo files. The workflow reports the API's final file status and does not
claim that a submitted or awaiting-review version is published.
Credentials have not been configured or exercised as part of implementation;
mutating API behavior is covered by offline request/response tests. The first
authorized production run must check AMO's actual responses and rendered result.

Authentication reference: [AMO external JWT authentication](https://mozilla.github.io/addons-server/topics/api/auth.html).
The publisher signs unique short-lived HS256 tokens in memory, sends them only
to the fixed AMO API origin, and refuses redirects. API errors are surfaced;
credentials are redacted and never stored in plan or receipt artifacts.

### Manual fallback and signing

1. Sign in to the [AMO Developer Hub](https://addons.mozilla.org/developers/)
   using the owner's Mozilla account, accept its developer agreement, and
   complete any account-security requirements. No AMO API keys are needed for
   this manual process.
2. Open the existing [Maskify developer listing](https://addons.mozilla.org/en-US/developers/addon/maskify/edit)
   and upload a new version only when authorized, with the exact existing ID
   and a higher version. Do not create another listing or reupload 1.3.0.
   Do not upload
   `maskify.zip` (Chromium) or `maskify-firefox-assets.zip` (listing artwork).
3. Upload `maskify-firefox.zip`, examine AMO's own validation results, then
   attach `maskify-firefox-source.zip` in the source-code step. Supply Node 24 /
   npm 11 and the reviewer build commands above. Explain the three known lint
   warnings, site-access grant, and temporary-install refresh step.
4. Populate the English and Spanish listings with the approved copy, 128-pixel
   icon, shared screenshots, and localized captions in
   `store-assets/maskify-firefox-assets.zip`. Those media were captured in
   Chromium and are not Firefox-verification evidence. Its historical upload
   warning is superseded by this document. Link the
   [privacy policy](https://mike-mo.github.io/maskify/privacy.html), support
   issues, and homepage. Use `amo/listing.json` for listing choices and the
   version-specific notes under `amo/versions/`. Select the license matching
   the repository's custom personal/non-commercial terms, not an incompatible
   open-source license.
5. In reviewer notes explain that no login is needed: open a normal HTTP(S)
   page with fictional email addresses, grant site access, click **Mask Emails**
   or press **Alt+Shift+M**, and verify text, title, email links, and fields.
   Reloading restores the original page. Firefox internal pages, AMO, and other
   restricted domains cannot be modified by extensions.
6. Review permissions and the no-data-collection declaration, select desktop
   compatibility only, and submit only when the owner authorizes publication.
   Mozilla performs signing/review and may request changes. Download the signed
   result from AMO when available and verify a normal permanent installation.

The local ZIP is **unsigned** and cannot be permanently installed in ordinary
release Firefox. Temporary installation is not signing, store approval or
publication. The repository never stores AMO credentials. Only the separately
authorized protected workflow or owner-operated Developer Hub can submit.

Authoritative references:
[MV3 background differences](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/),
[Firefox identity and desktop/Android settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings),
[required data declarations](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/),
[source submissions](https://extensionworkshop.com/documentation/publish/source-code-submission/),
and [add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/).

The legacy screenshot capture path is retired. Modern workflows refuse tags
older than v1.3.0 and do not modify historical release artwork. Capture scripts
and legacy asset-selection tests remain available for local development.

## Optional release-note screenshots

Only use committed, approved image attachments. For example:

```markdown
![Maskify result](https://github.com/mike-mo/maskify/releases/download/v1.3.0/en-01-result.png)
![Maskify coverage](https://github.com/mike-mo/maskify/releases/download/v1.3.0/en-02-coverage.png)
![Maskify controls](https://github.com/mike-mo/maskify/releases/download/v1.3.0/en-03-controls.png)
```

Release packaging never recaptures these images. Browser tests may render
temporary pages to exercise runtime behavior; they do not write approved
artwork. Icon verification pairs the canonical SVG hash with exact hashes for
all six approved PNGs in `icons/asset-inventory.json`, then checks dimensions,
transparent margins, coverage, and the gallery. The initial inventory records
the bytes from the approved asset commit, not new captures.

Hosted Chromium rasterizers differed from the original renderer even in alpha
and light/dark composited colors. Comparing a fresh rasterization would require
accepting visible pixel differences. Exact export/source hashes avoid that
tolerance increase and reject even a single changed PNG byte. Intentional icon
generation updates the inventory alongside its outputs for artwork review,
never as part of a release.
