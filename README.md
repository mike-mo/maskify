# Maskify

[![Edge Add-ons](https://img.shields.io/badge/Edge_Add--ons-available-0078D4?logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/ahlpkipagblmbjceamojfdomdmcmcpgc) [![GitHub release](https://img.shields.io/github/v/release/mike-mo/maskify?logo=github)](https://github.com/mike-mo/maskify/releases) ![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue?logo=googlechrome) [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/mikemo)

A Chrome and Edge extension that replaces email addresses on the current page with made-up ones for screen sharing and recordings.

If Maskify has been useful to you, consider [buying me a coffee ☕](https://buymeacoffee.com/mikemo) or [donating via Stripe](https://donate.stripe.com/3cIeVd8iSbCo2VGeKxenS01) to help keep the project going.

## What it does

Click **Mask Emails** in the popup to replace email addresses on the current page with made-up ones, such as `alice7***@example.com`. Repeated addresses get the same replacement during that action. A notification in the top-right corner shows how many different addresses were replaced.

Replacements use `example.com` by default. You can choose a different domain in the popup.

Maskify replaces email addresses in page text, the current tab's title, email links, and form fields, including filled-in values and placeholders.

## Installation

1. Clone or download this repository.
2. Open Chrome or Edge and navigate to the extensions page (`chrome://extensions` or `edge://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the root folder of this repository.

## Usage

Open a web page, click the Maskify icon in the toolbar, then click **Mask Emails**. You can also press **Alt+Shift+M** to mask the current page using your saved preferences.

The popup has a few options for controlling how replacements look:

- **Domain**: choose a domain for the addresses, or leave it blank to use `example.com`
- **Add number**: appends a random number to the name (e.g. `alice7`)
- **Add random initial**: appends an underscore and a random letter (e.g. `alice_r`)
- **Mark replacements with \*\*\***: adds `***` so you can recognize the maskified addresses

The preview shows the address format as you change the options. Clicking **Mask Emails** masks addresses on the current page using that format and saves your preferences for next time.

If you loaded or reloaded the extension while a tab was open, refresh that tab before using Maskify.

Masking runs when you activate it. If the page loads more content afterward, run Maskify again and review the result.

Maskify changes email-link destinations and form values on the page. Check forms before submitting them. It does not redact names or other personal details, and it cannot mask email addresses inside images.

## How it works

The popup or keyboard shortcut sends a message to the content script in the active tab. The script uses a `TreeWalker` to replace email addresses in page text, then checks anchor `href` attributes, input and textarea values and placeholders, and `document.title`. This includes email links whose visible label is not an address.

Each different address found during an action gets a randomly generated replacement. Names come from an English or Spanish list based on the browser language. The script adds any enabled formatting options: a random number, an underscore and random initial, and the `***` marker. It uses your chosen domain or the `example.com` default.

Repeated addresses share a replacement within that action. The mapping is not saved across pages or reloads. Already-maskified addresses are left unchanged on later activations, including those in the tab title.

`example.com` is reserved for documentation and examples by [RFC 2606](https://www.rfc-editor.org/rfc/rfc2606). Choosing a different domain changes the replacement text; it does not create a mailbox or email alias.

## Testing

Open `testpage.html` after loading the extension. If you open it as a local file, enable **Allow access to file URLs** in the extension's details first. The page covers text, links, forms, repeated addresses, email formats, non-email `@` symbols, and the browser tab title.

With the screenshot dependencies installed as described below, run `npm --prefix scripts test` for automated checks. The browser tests exercise the actual extension in English and Spanish, including title-only addresses, shared replacements, format options, repeated activations, and titles that should stay unchanged.

## Store description

Full store assets (listings in English and Spanish, search terms, certification notes) are in [store-assets.md](store-assets.md).

**Maskify: Hide email addresses before you share.**

Maskify replaces email addresses on the current page with made-up ones for screen sharing and recordings.

Open Maskify and click **Mask Emails**, or press **Alt+Shift+M**. It replaces addresses in page text, the current tab's title, email links, and form fields. Repeated addresses get the same replacement during that action.

**Features**

- 🌐 Choose a domain for the maskified addresses, or keep the `example.com` default.
- ⚙️ Add a random number, a random initial, or the `***` marker. A preview shows the format as you change the options.
- 💾 Click **Mask Emails** to apply your chosen format and save your preferences for next time.
- 🗣️ The interface uses English or Spanish based on your browser language.
- 🔒 **Privacy:** Maskify processes page content in your browser and does not send it to its developer or to analytics services.

Review the page before sharing. Maskify does not redact names or other personal details, and it cannot mask email addresses inside images. It also changes email-link destinations and form values, so check forms before submitting them.

## Store screenshots

The [screenshot gallery](screenshots/index.html) contains three 1280 x 800 PNGs in
each of English and Spanish: the before/after result, masking coverage, and format
controls. Final images are tracked under `screenshots/en/` and `screenshots/es/`.
The [creative brief](store-assets.md#screenshot-creative-brief) explains the copy and
compositions.

To regenerate with Node.js 20 or later:

```text
cd scripts
npm ci
npx playwright install chromium
npm run screenshot
npm test
npm run preview
```

The preview command prints a loopback-only gallery URL. Select an image to open
the full-size PNG. The gallery also works as a local HTML file.

The generator launches the actual unpacked extension in an isolated Chromium
profile. It serves fictional demo content and the bundled Manrope font locally,
captures real masking and the real localized popup at high resolution, and
composes the final PNGs. It does not depend on the published test page or use your
normal browser profile. Set `MASKIFY_HEADED=1` to watch the capture browser.
Generated replacement names vary between runs.

Editable sources are in `scripts/templates.js`, `scripts/demo.css`,
`scripts/composition.css`, and `scripts/copy.js`.
[Manrope](https://github.com/google/fonts/tree/main/ofl/manrope) is distributed under the
[SIL Open Font License](scripts/assets/Manrope-OFL.txt). The font and capture-only
sources are not included in the extension's release package.

The generator checks masking behavior, localization, preview wrapping, image
dimensions, clipping, and separation between composition blocks. `npm test` also
covers release asset selection, including older tags that produce `popup.png`
and `testpage.png`. Modern releases package the committed, approved localized
set without recapturing images. English images are also attached for optional
release-note use. See [the release procedure](RELEASING.md) for version checks,
CI gates, retry behavior, and the separate manual store-upload step.

## Brand assets

Maskify uses one icon: a blue envelope with a dark circular asterisk seal.
Its editable source is [`icons/maskify.svg`](icons/maskify.svg).
The 16-, 32-, 48-, and 128-pixel PNGs at `icons/maskify<size>x<size>.png`
serve the toolbar, popup, toast, page favicons, and store screenshots.
A 64-pixel export supports high-DPI previews. Use
[`icons/maskify300x300.png`](icons/maskify300x300.png) as the logo for both
language listings in the Edge store.

The [icon preview](icons/index.html) shows the current artwork on light and
dark toolbars. With the screenshot dependencies installed, run
`npm --prefix scripts run icons` to regenerate every PNG and the preview
from the canonical SVG. This updates the production files directly.
Use `npm --prefix scripts run icons -- --check` to verify saved exports, or
`npm --prefix scripts run icons:preview` to serve the preview locally.
Verification checks the SVG and all PNG bytes against `icons/asset-inventory.json`,
along with dimensions, transparent margins, coverage, and gallery behavior.
Explicit regeneration updates this inventory with the artwork for review;
release checks never rerender or rebaseline approved exports.
The renderer is `scripts/icons.js`; preview styles are in `icons/gallery.css`.
After changing the artwork, run `npm --prefix scripts run screenshot` to
refresh both localized store screenshot sets.

Merging artwork updates changes the repository and its GitHub Pages site,
not an already published extension or its store listing. Publish a new version
to distribute updated runtime icons. Separately update each store language's
logo, screenshots, and description using the files and copy in this repository.
Replace or remove any optional promotional tiles that contain older branding.
Historical commits and versioned releases retain the assets they shipped with.

## Browser store packs

The [store asset gallery](store-assets/index.html) contains downloadable packs
for Edge Add-ons, the Chrome Web Store, and Firefox Add-ons. Each ZIP includes
the store's icon, screenshot files, approved English and Spanish listing copy,
captions, privacy policy, license, and upload instructions.

Edge and Chrome reuse the approved localized screenshots. Their promotional
tiles use only the icon and wordmark, so one design works in both languages.
Chrome's icon has the store's transparent clear space. Firefox has a separate
shared gallery with localized captions and no added editorial headlines.

Run `npm --prefix scripts run stores` to regenerate the packs,
`npm --prefix scripts run stores:check` to verify them, or
`npm --prefix scripts run stores:preview` to serve the gallery locally.
The generator captures real UI for Firefox's image layouts without overwriting
the approved screenshots in `screenshots/en` and `screenshots/es`.
After changing the extension or its branding, regenerate icons and screenshots
before rebuilding the store packs.

For a version-only manifest change, preserve the approved images and use the
guarded metadata refresh described in [RELEASING.md](RELEASING.md) instead.

These are listing assets, not signed extension packages. The current
Chromium-only background service worker needs a Firefox-compatible replacement
and browser verification before a Firefox submission. Generating these files
does not publish or update any listing.

## Privacy

Maskify processes page content in your browser. It saves preferences and a masking-action count in browser sync storage. Your browser handles any syncing across devices. See the [privacy policy](privacy.html) for details.

## License

Free for personal, non-commercial use with attribution. Commercial use requires a written agreement. See [LICENSE](LICENSE) for details.
