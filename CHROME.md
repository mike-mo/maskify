# Chrome Web Store package and submission

## Build and verify

Use an approved source checkout and Node.js 24. From the repository root:

```text
npm --prefix scripts ci --ignore-scripts
npm --prefix scripts exec -- playwright install chromium
npm --prefix scripts test
npm --prefix scripts run chrome:build -- maskify-chrome.zip
npm --prefix scripts run chrome:check -- maskify-chrome.zip
```

Relative output paths resolve from the repository root, including when npm
runs the command from `scripts`, matching the Firefox builder. These commands
create `maskify-chrome.zip` at the repository root. Absolute paths are used
unchanged; the parent output directory must already exist. The builder refuses to
overwrite an existing file. Retain the SHA-256 printed by build/check with the
source commit and version. Rebuilding the same inputs produces identical bytes,
including on Windows (runtime text is normalized to LF).

The ZIP contains `manifest.json` at its root, the MV3 background service worker,
popup, content scripts, bundled data, English/Spanish locales, and four runtime
icons. It excludes development tools, test pages, screenshots, store listing
packs, Git files, and dependencies. The version is taken from `manifest.json`;
no version is invented or incremented by packaging.

The only difference from the Edge runtime is the approved
`store-artwork/chrome-icon-128.png` copied to `icons/maskify128x128.png` **inside
the ZIP**. It provides Chrome's 96 x 96 artwork safe area with transparent
padding. The shared in-memory store builder verifies the canonical artwork
approval and runtime freshness checks before providing this icon. No generated
store folder, committed inventory copy, or stale listing ZIP is read. The
existing manifest, Edge icon, release workflow, and Firefox work
are not modified. Firefox-specific manifest settings cause a build failure
rather than being silently shipped to Chrome.

`chrome:check` first requires an exact match to the reproducible build, then
extracts that ZIP into a temporary directory and runs the existing bilingual
runtime suite against the extracted extension, not the repository extension.
It covers the real popup, saved format options, repeated masking, tab titles,
page text, links, input values, and placeholders. Temporary profiles and
extracted files are removed afterward.

The default test browser is Playwright Chromium. To verify in an installed
**Chrome for Testing** browser, set `MASKIFY_CHROME_EXECUTABLE` to that browser's
absolute executable path before running `chrome:check`. This does not use a
personal Chrome profile. Chrome for Testing supports the extension-loading
switches required by automation; ordinary branded Chrome may not. Browser tests
are compatibility evidence, not a store policy review or approval.

Before submission, also load the extracted ZIP using `chrome://extensions` >
Developer mode > Load unpacked in a clean Chrome profile. Check the toolbar
popup and **Alt+Shift+M** on a normal web page, preference persistence after a
browser restart, and Chrome's extension error panel. The shortcut can conflict
with another extension and can be changed at `chrome://extensions/shortcuts`.
Chrome internal pages and other protected pages cannot be masked. Local file
tests require enabling **Allow access to file URLs**.

## Human submission checklist

No account registration, fee payment, upload, submission, signing, or publication
is performed by these commands.

1. Register/sign in to the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole/),
   complete the current registration fee and account/contact verification,
   and enable the required Google account security settings. Check the current
   dashboard requirements rather than assuming an existing Edge account applies.
2. Create an item, or select the intended existing Chrome item. Upload
   **`maskify-chrome.zip`**, not `maskify-chrome-assets.zip`. For updates, the
   manifest version must exceed the version already uploaded to that item.
   The current source version may be used for a first Chrome listing.
3. Run `npm --prefix scripts run stores` to generate the listing pack under
   `dist/store-assets`, or download the **store-listings** CI artifact.
   Use `dist/store-assets/chrome/en` and `dist/store-assets/chrome/es` for the English and
   Spanish descriptions and screenshots. Each locale has three approved
   1280 x 800 PNGs. Use `icon-128.png` for the listing icon. Supply the included
   440 x 280 promotional tile and, optionally, the 1400 x 560 marquee.
   Google's current image guide calls promotional images optional, despite the
   generated listing guide's statement that the small tile is required. Supplying
   the existing tile satisfies either case; no artwork regeneration is needed.
4. Choose an appropriate current dashboard category (for example Productivity)
   and language, support/homepage URLs, visibility, distribution, and pricing
   consistent with the repository's custom [license](LICENSE). Do not label
   the license MIT or imply commercial use is unrestricted.
5. Complete Privacy practices using the actual package and the guidance below.
   Provide the public policy URL:
   <https://mike-mo.github.io/maskify/privacy.html>.
6. Supply the existing reviewer instructions from
   `dist/store-assets/chrome/reviewer-notes.txt`. No Maskify account is needed.
   Explain that masking is user-triggered, repeat activations may be needed for
   newly loaded content, and users must review the page before sharing.
7. Review all dashboard warnings and certifications before explicitly submitting
   for review. Approval and review timing are controlled by Google. Add a
   Chrome install link to the README only after the actual listing URL exists.

## Privacy practices reference

**Single purpose:** Replace email addresses on the current page with made-up
ones for screen sharing and recordings. This is not an alias/mailbox service
and does not redact other personal information or addresses inside images.

**Current permissions and site access:** `storage` saves the chosen domain,
format options, and masking-action count using browser sync storage. The
extension uses the Tabs API to find the active tab and send a masking message;
the current shared manifest also declares `tabs`. Static content scripts match
`<all_urls>` so they can receive a user-triggered masking request on supported
sites without a per-site install. This is broad site access even though masking
only runs on activation. Disclose it in the dashboard's host/site-access
justification fields. Do not claim `activeTab`-only access or no page access.
Chrome reviews permissions for minimum necessary access; using the Tabs API
alone does not establish that the broad `tabs` permission is required.

**Remote code:** No. Scripts and name data are bundled in the extension.
The popup's donation link opens Buy Me a Coffee, a third-party website with
its own privacy policy, only when the user follows it. Maskify does not send
page content, detected addresses, or saved settings through this link. It is
not remote code loaded into the extension.

**Data use:** Page content and detected email addresses are processed in the
browser, not saved to extension storage or sent to the developer. Preferences
and a masking-action count are saved to `chrome.storage.sync`; Chrome controls
any sync across devices. Do not claim nothing is stored or transmitted.
Complete the dashboard's data-category and limited-use certifications yourself
using this behavior and the published policy. Do not equate local processing
with collecting page data on a developer server.

## Official references

- [Prepare the ZIP and manifest](https://developer.chrome.com/docs/webstore/prepare)
- [Images, padding, screenshots, promotional tiles](https://developer.chrome.com/docs/webstore/images)
- [Privacy practices and permission justification](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Publish and submit for review](https://developer.chrome.com/docs/webstore/publish)
- [Chrome for Testing downloads](https://googlechromelabs.github.io/chrome-for-testing/)
