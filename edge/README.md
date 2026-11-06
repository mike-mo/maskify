# Edge draft publishing

**Edge store: Plan, status or draft upload** is a manual workflow on main.
Its default is an offline plan. The only store mutation it implements is
uploading a package into the existing product's draft. Certification and
publication remain separate, manual Partner Center actions. No push, tag,
GitHub release or Firefox operation triggers an Edge upload.

## Canonical identity and content

[product.json](product.json) records the owner-confirmed Partner Center
product GUID, `fb1e0f91-22bd-4086-ac3e-b9f62057a789`. It is not a credential.
The public extension ID, `ahlpkipagblmbjceamojfdomdmcmcpgc`, is a different
identifier and must not be used in API product paths.

The pipeline uses the existing shared Chromium package builder and generated
Edge listing builder, not a second Edge copy of the runtime or store content.
The `edge-plan` artifact contains:

| File | Purpose |
| --- | --- |
| `plan.json` | Exact source SHA/version, product identity, file sizes/hashes and explicit manual exceptions |
| `maskify.zip` | Actual extension package, byte-identical to the shared CI-validated release package |
| `maskify-edge-assets.zip` | Generated English/Spanish listing copy, approved artwork, policy, license and upload guide, not an extension |
| `reviewer-notes.txt` | Shared certification instructions generated from `store-assets.md`, for manual final submission |

Repository files remain the source of truth. Long descriptions, localized
images/captions, search terms, public links and certification instructions come
from the shared sources documented in [RELEASING.md](../RELEASING.md).
Properties, availability, markets, category, permission justifications, data
declarations and account settings require owner review in Partner Center.
Search-term and other submission references in `store-assets.md` still apply
even where the generated pack has no corresponding API field.

The documented Edge API cannot update listing metadata. Apply and verify
the approved content manually in both languages; the pipeline never claims
that a package upload synchronized or verified the listing.

## Owner-only setup, before enabling authenticated operations

No credentials, account changes or environment changes are created by this code.
Do not run an authenticated operation until the owner completes this setup.

1. In GitHub **Settings > Environments**, create or review `edge-production`.
   Set **mike-mo** as required reviewer, leave **Prevent self-review** disabled
   for the sole maintainer, and disable administrator bypass. Restrict deployment
   branches/tags to the **main branch only**, with no allowed tag rules.
   The job's main-ref check is additional protection, not an environment-policy
   substitute. If the repository plan cannot enforce required reviews, stop:
   do not store production credentials or enable upload as an unprotected fallback.
2. Verify the product GUID against Maskify's **Extension overview > Extension
   identity** in Partner Center and its public listing. Do not create a new product.
3. If suitable current credentials do not already exist, obtaining v1.1 Publish
   API access or creating credentials is a separate owner decision. Microsoft's
   **Publish API** page supplies a Client ID and API key with an expiry date.
   Store them as `EDGE_CLIENT_ID` and `EDGE_API_KEY` **environment secrets only**.
   Never paste them into workflow inputs, repository files, logs, receipts,
   issues or chat. Do not assume the API key is product-scoped or read-only:
   Microsoft's docs do not promise those scopes.
4. Leave the legacy `BPP_KEYS` secret unchanged. This workflow does not read it,
   use PlasmoHQ/bpp, reuse old OAuth secrets, or rotate/delete anything.
5. Keep existing required checks and all `amo-production` rules/secrets intact.
   The new workflow reuses `ci.yml`; it does not rename its required check jobs.
   No Chrome-specific packaging branch is required or incorporated.

GitHub token permissions are `contents: read`; only the protected operation job
additionally needs `actions: read` to inspect complete upload-run history.
There is no repository write, release write, OIDC grant, or inherited secret set.
Store secrets are exposed only to the status or upload command, after approval.
Publisher tooling comes from the workflow's immutable main SHA, while the
selected source is a separate clean checkout. Candidate tooling is not executed
with store credentials.

## Offline plan and review

After these changes and the desired version are merged into main, select
**Edge store: Plan, status or draft upload** in Actions, run it on **main**, and
provide the full merged `source_sha` and exact stable manifest `version`.
Keep `operation=plan`.

The workflow requires the selected SHA to be on main, reuses the full checks for
that SHA, verifies the complete CI release bundle and compares both relevant
ZIPs with bytes rebuilt using trusted publisher tooling. It generates an offline
plan with no store requests or production credentials. Review the artifact's
SHA/version, product, hashes, package contents, copy and artwork.

A production workflow cannot plan a pre-pipeline source commit that lacks the
canonical Edge configuration. Select a merged commit containing `edge/product.json`.
Local offline planning on a clean checkout is also supported:

```text
npm --prefix scripts ci --ignore-scripts
node scripts/edge-publish.js plan . C:\Temp\maskify-edge-plan FULL_SOURCE_SHA EXACT_VERSION
```

The output directory must not exist or must be empty. Local planning checks
clean HEAD and package/version agreement but does not run CI, prove main
ancestry or supply the workflow's validated-artifact comparison.

## Read-only status and credential test

Set `operation=status`, `operation_kind=upload` or `submission`, and provide
an **existing real operation GUID** from an API response/receipt. The protected
job performs only GET of that product's matching operation-status endpoint.
It also verifies the plan and source first.

There is no documented standalone credential validation/product-read endpoint.
If no real operation ID exists, this test is unavailable until one is obtained
from a previous authorized API operation. Do not guess IDs, treat 404 as success,
or upload a package just to test credentials. A manual Partner Center submission
ID is not automatically an API operation ID.

A valid HTTP 200 response with the matching operation identity and a recognized
state demonstrates authenticated access to that operation. `Failed` means the
query authenticated but the operation failed; the command then fails explicitly.
`InProgress` means pending, not successful upload/publication. A successful
upload state means package processing succeeded. A successful submission state
means a submission was created, not that certification passed or the version
is public. Check Partner Center for certification and **In the Store** status.

## Explicitly authorized draft upload

Before dispatch and again before approving the protected job:

1. Review the exact plan for this run. Verify the current public version in
   Partner Center, ensure the requested version is newer, inspect any draft
   changes, and ensure there is no competing submission or writer. Upload
   replaces the draft package, so review must authorize that replacement.
2. Set `operation=upload` and `current_version` to the verified live version.
   The exact confirmation is
   `maskify:edge:upload:VERSION:FULL_SOURCE_SHA:PRODUCT_GUID:CURRENT_VERSION`.
   This attests to the preceding Partner Center checks and authorizes **only
   draft package replacement**, not certification or eventual publication.
3. Review this run's regenerated `edge-plan` before approving `edge-production`.
   Keep other Partner Center/API writers stopped until the operation is reconciled.
   Actions concurrency cannot lock those external writers.

The pipeline checks the complete history of this workflow before mutation.
Any other upload run for an equal or newer version blocks the request,
regardless of that run's outcome. Rerunning an upload attempt is prohibited.
Invalid dispatch versions that could never pass package-version validation
are ignored; they cannot reserve a version or block later valid uploads.
This intentionally also blocks an attempt cancelled or failed before POST:
an unknown outcome must not become an automatic duplicate/overwrite.
History API failures fail closed. Keep upload-run history; deleting runs or
changing workflow run-name conventions would invalidate this safeguard.
The guard cannot discover manual uploads or uploads by other clients.
The live-version value is an owner attestation, not an API-verified inventory.

Before using store credentials, the workflow saves `edge-upload-intent` as
an artifact. It then regenerates and compares the reviewed plan, journals
`attempting` before POST, sends the reviewed ZIP once, records the acknowledged
operation ID, and polls GET for up to about five minutes. It never follows a
server-supplied URL with credentials. Errors withhold server bodies and network
details; receipts contain only fixed identity/hash fields and recognized states.
The `edge-receipt` JSONL artifact is uploaded even after ordinary failures.

No POST is retried, including 429, 5xx, timeouts, missing/invalid Location headers,
or failed/pending processing. If the receipt has an operation ID, use **status**
to resume observation without reuploading. If POST's outcome is unknown or no ID
was captured, inspect Partner Center and retain the intent/receipt. Runner loss
can prevent the final receipt from uploading; the saved intent/run history still
reserves that version. Do not delete history or rerun to bypass the guard.
Reconcile manually; a fresh automated upload requires a new reviewed version.
This conservative rule trades convenience for avoiding duplicate mutation.

## Manual certification and publication

After successful upload, inspect the current package version and all draft
fields in Partner Center. Check/apply the generated bilingual listing assets,
shared search terms, privacy/distribution declarations and reviewer notes.
Check for unrelated draft edits; an earlier upload receipt is not a remote
hash check of the draft that exists now.

Only a separate owner decision in Partner Center authorizes **Publish**.
Microsoft's documentation says this starts certification and publishes the
extension after it passes, without a separate API release-approval stage.
The workflow implements no submission, certification, publication, cancellation
or unpublication endpoint. It never tries alternative certification-note body
formats against production.

## Official API boundaries

- [API overview and v1.1 authentication](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api)
- [Four-endpoint API reference and operation states](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference)
- [Certification followed by publication](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension#step-8-enter-certification-testing-notes-and-submit-the-extension)
- [Updating an existing extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/update-extension)

The API has no documented way to read a current draft/package hash, enumerate
versions, synchronize metadata, conditionally submit a specific draft revision,
or lock other writers. Microsoft's reference and overview also disagree on
certification-notes serialization. None of those limitations is hidden by a
successful upload/status receipt.
