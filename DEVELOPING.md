# Developing Maskify

For installation and user-facing behavior, see [README.md](README.md).
[RELEASING.md](RELEASING.md) is the reference for package builds, workflow
responsibilities, canonical source/output mapping and publishing approvals.
The [approved store copy](store-assets.md) contains the bilingual listings,
search terms, certification notes and screenshot creative brief.

## How masking works

The popup or keyboard shortcut sends a message to the content script in the
active tab. The script uses a `TreeWalker` to replace email addresses in page
text, then checks anchor `href` attributes, input and textarea values and
placeholders, and `document.title`. This includes email links whose visible
label is not an address.

Each different address found during an action gets a randomly generated
replacement. Names come from an English or Spanish list based on the browser
language. The script adds any enabled formatting options: a random number,
an underscore and random initial, and the `***` marker. It uses your chosen
domain or the `example.com` default.

Repeated addresses share a replacement within that action. The mapping is not
saved across pages or reloads. Already-maskified addresses are left unchanged
on later activations, including those in the tab title.

`example.com` is reserved for documentation and examples by
[RFC 2606](https://www.rfc-editor.org/rfc/rfc2606). Choosing a different domain
changes the replacement text; it does not create a mailbox or email alias.

## Setup and testing

Use a full repository checkout for contributor checks. The minimal AMO reviewer
source archive supports the build in RELEASING.md, not the full test suite.

Use Node.js 24 LTS and npm 11. From the repository root:

```text
npm --prefix scripts ci --ignore-scripts
cd scripts
npx playwright install chromium
npm test
```

The automated browser checks exercise the actual extension in English and
Spanish, including title-only addresses, shared replacements, format options,
repeated activations, and titles that should stay unchanged.

For manual checks, open [testpage.html](testpage.html) after loading the
extension. In Chrome/Edge, enable **Allow access to file URLs** in the extension
details if opening the page as a local file. It covers text, links, forms,
repeated addresses, email formats, non-email `@` symbols and the browser tab
title.

Follow the [Firefox package and verification guide](RELEASING.md#package-and-verify-locally)
for Mozilla linting and actual unsigned-package installation, localized popup,
masking, saved settings and registered shortcut-command checks. Those use an
isolated profile, not your personal profile. The guide covers `FIREFOX_BINARY`,
geckodriver, the matching Spanish language pack and known validation warnings.

## Store screenshots

The [screenshot gallery](screenshots/index.html) contains three 1280 x 800 PNGs
in each of English and Spanish: the before/after result, masking coverage and
format controls. Final images are tracked under `screenshots/en/` and
`screenshots/es/`. The [creative brief](store-assets.md#screenshot-creative-brief)
explains the copy and compositions.

After setup, run from the repository root:

```text
npm --prefix scripts run screenshot
npm --prefix scripts test
npm --prefix scripts run preview
```

The preview prints a loopback-only gallery URL. Select an image to open its
full-size PNG. The gallery also works as a local HTML file.

The generator launches the actual unpacked extension in an isolated Chromium
profile. It serves fictional demo content and the bundled Manrope font locally,
captures real masking and the real localized popup at high resolution, and
composes the final PNGs. It does not depend on the published test page or use
your normal browser profile. Set `MASKIFY_HEADED=1` to watch the capture browser.
Generated replacement names vary between runs.

Editable sources are `scripts/templates.js`, `scripts/demo.css`,
`scripts/composition.css` and `scripts/copy.json`.
[Manrope](https://github.com/google/fonts/tree/main/ofl/manrope) is distributed
under the [SIL Open Font License](scripts/assets/Manrope-OFL.txt). The font and
capture-only sources are not included in extension runtime packages.

The generator checks masking behavior, localization, preview wrapping, image
dimensions, clipping and separation between composition blocks. Tests also
cover release asset selection, including older tags that produce `popup.png`
and `testpage.png`. Modern releases package the approved localized set without
recapturing images. English images are also attached for optional release-note
use; see [the release procedure](RELEASING.md#create-and-package-the-official-release).

## Brand assets

Maskify uses one icon: a blue envelope with a dark circular asterisk seal.
Its editable source is [icons/maskify.svg](icons/maskify.svg).
The 16-, 32-, 48- and 128-pixel PNGs at `icons/maskify<size>x<size>.png`
serve the toolbar, popup, toast, page favicons and store screenshots.
A 64-pixel export supports high-DPI previews. Use
[icons/maskify300x300.png](icons/maskify300x300.png) as the logo for both language
listings in the Edge store.

The [icon preview](icons/index.html) shows the artwork on light and dark
toolbars. With dependencies installed, run
`npm --prefix scripts run icons` to regenerate every PNG and the preview
from the canonical SVG. This updates production files directly.
Use `npm --prefix scripts run icons -- --check` to verify saved exports, or
`npm --prefix scripts run icons:preview` to serve the preview locally.

Verification checks the SVG and all PNG bytes against
`icons/asset-inventory.json`, along with dimensions, transparent margins,
coverage and gallery behavior. Explicit regeneration updates the inventory
with artwork for review; release checks never rerender or rebaseline approved
exports. The renderer is `scripts/icons.js`; preview styles are
`icons/gallery.css`. After changing artwork, refresh both localized screenshot
sets with `npm --prefix scripts run screenshot`.

Merging artwork updates changes the repository and its GitHub Pages site, not
an already published extension or its store listing. Publish a new version to
distribute updated runtime icons. Separately update each store language's logo,
screenshots and description. Replace or remove optional promotional tiles
containing older branding. Historical commits and releases retain their assets.

## Store listing previews

Edge and Chrome reuse the approved localized screenshots. Their promotional
tiles use only the icon and wordmark, so one design works in both languages.
Chrome's icon has the store's transparent clear space. Firefox has a separate
shared gallery with localized captions and no added editorial headlines.

From the repository root:

```text
npm --prefix scripts run stores
npm --prefix scripts run stores:check
npm --prefix scripts run stores:preview
```

The preview builds and serves the generated gallery locally; it also opens
directly at `dist/store-assets/index.html`. Downloadable packs and the gallery
are available as the **store-listings** CI artifact. Each pack contains its icon,
screenshots, English/Spanish copy, captions, policy, license and upload guide.
These are listing artifacts, not extension packages.

Normal builds never start a browser or recapture artwork. Only the explicit
`stores:capture` command renders new store artwork for review. For intentional
runtime/branding changes, refresh the relevant production icons/screenshots and
review the artwork/source diff before rebuilding. Version-only changes need no
committed inventory refresh or regenerated images.

See [canonical sources and generated listings](RELEASING.md#canonical-sources-and-generated-listings)
for the source of each file and the approval record. See
[which workflow to use](RELEASING.md#which-workflow-to-use) for build/release/store
responsibilities. Building or previewing files never publishes a listing.
