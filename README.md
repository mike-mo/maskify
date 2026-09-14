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
and `testpage.png`. The release workflow packages the complete localized set and
embeds the English images in release notes.

## Icon concepts

**Round seal (I)** is the selected production icon. Its editable source is
[`design/icon-options/round-seal.svg`](design/icon-options/round-seal.svg).
The 16-, 32-, 48-, and 128-pixel exports are installed at the existing
`icons/maskify<size>x<size>.png` paths, used by the toolbar, popup, toast,
page favicons, and store screenshot branding.

The [icon gallery](design/icon-options/index.html) leads with three envelope and
asterisk-seal proposals (I-K): a round stamp, a wax-edged stamp, and an outline
envelope. The mask hybrids (E-H) and original options (A-D) remain available
in the earlier-proposals sections.
Each has an editable SVG and transparent PNGs at 16, 32, 48, and 128 pixels.
The seal and hybrid rounds also include 64-pixel PNGs for sharp 32-pixel previews
on high-DPI displays. The gallery shows actual-size light and dark toolbar
samples, selecting higher-resolution PNGs as needed.

With the screenshot dependencies installed, run `npm --prefix scripts run icons`
to regenerate the seal exports and comparison image, or
`npm --prefix scripts run icons:preview` to serve the gallery locally.
Use `npm --prefix scripts run icons -- --all` to regenerate every round.
Use `npm --prefix scripts run icons -- --install-selected` to render the seal
round and copy the selected artwork to the production icon paths. Ordinary
gallery generation does not overwrite production icons. After changing
production artwork, run `npm --prefix scripts run screenshot` to refresh both
localized store screenshot sets.
Edit the SVGs and `gallery.css` in `design/icon-options/`; gallery copy and the
renderer are in `scripts/icon-options.js`.

## Privacy

Maskify processes page content in your browser. It saves preferences and a masking-action count in browser sync storage. Your browser handles any syncing across devices. See the [privacy policy](privacy.html) for details.

## License

Free for personal, non-commercial use with attribution. Commercial use requires a written agreement. See [LICENSE](LICENSE) for details.
