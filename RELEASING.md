# Releasing Maskify

## Scope and approval

The modern workflow supports stable releases starting with **v1.3.0**. It builds
GitHub release assets only. It does not create or move tags, create releases,
invoke PlasmoHQ/bpp, use `BPP_KEYS`, or submit anything to a browser store.
Publishing a GitHub release cannot trigger an automated Edge submission.

Store upload is a separate, human-authorized operation in Partner Center.
Uploading a draft package does not authorize certification, submission, or
publication. Firefox's listing pack is not a verified Firefox extension:
`background.service_worker` still requires a compatible replacement and browser
verification before a Firefox submission.

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
Node 24 / Playwright Chromium checks as PR and push CI before building artifacts.
Only the upload job has write access to release contents.

The workflow attaches:

- `maskify.zip`: the actual Chromium extension with `background.js`, manifest,
  locales, popup, content scripts, data, and only the 16/32/48/128 runtime icons.
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
