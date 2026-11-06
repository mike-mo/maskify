# Releasing Maskify

## Scope and approval

The modern workflow supports stable releases starting with **v1.3.0**. It builds
GitHub release assets only. It does not create or move tags, create releases,
invoke PlasmoHQ/bpp, use `BPP_KEYS`, or submit anything to a browser store.
Publishing a GitHub release cannot trigger an automated Edge submission.

Store upload is a separate, human-authorized operation in Partner Center.
Uploading a draft package does not authorize certification, submission, or
publication. Firefox submission is also manual. Its listing pack is not an
extension; use the separate unsigned Firefox package described below.

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

- `@maskify.mike-mo`, a **developer-chosen ID**, not a Mozilla-assigned or
  AMO-verified ID. AMO checks uniqueness on first submission. Keep it unchanged
  after first signing or users cannot receive updates to the same extension.
  If this is an update to an existing AMO listing, use that listing's ID before
  building and update the identity assertions in the package checks.
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

### Human submission and signing

1. Sign in to the [AMO Developer Hub](https://addons.mozilla.org/developers/)
   using the owner's Mozilla account, accept its developer agreement, and
   complete any account-security requirements. No AMO API keys are needed for
   this manual process.
2. Choose **Submit a New Add-on**, then **On this site** for a publicly listed
   add-on. If a listing already exists, upload a new version on that listing
   instead, with its exact existing ID and a higher version. Do not upload
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
   issues, and homepage. Select the license matching the repository's custom
   personal/non-commercial terms, not an incompatible open-source license.
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
release Firefox. Temporary installation is not signing, store approval, proof
that the ID is available, or publication. This repository does not hold AMO
credentials and its workflows do not submit to Mozilla.

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
