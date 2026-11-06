# Maskify

[![Edge Add-ons](https://img.shields.io/badge/Edge_Add--ons-available-0078D4?logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/ahlpkipagblmbjceamojfdomdmcmcpgc) [![Firefox: AMO pending](https://img.shields.io/badge/Firefox-AMO_pending-FF7139?logo=firefoxbrowser&logoColor=white)](https://github.com/mike-mo/maskify/issues/38) [![GitHub release](https://img.shields.io/github/v/release/mike-mo/maskify?logo=github)](https://github.com/mike-mo/maskify/releases) ![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue?logo=googlechrome) [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/mikemo)

A Chrome, Edge, and Firefox extension that replaces email addresses on the current page with made-up ones for screen sharing and recordings.

If Maskify has been useful to you, consider [buying me a coffee ☕](https://buymeacoffee.com/mikemo) or [donating via Stripe](https://donate.stripe.com/3cIeVd8iSbCo2VGeKxenS01) to help keep the project going.

## What it does

Click **Mask Emails** in the popup to replace email addresses on the current page with made-up ones, such as `alice7***@example.com`. Repeated addresses get the same replacement during that action. A notification in the top-right corner shows how many different addresses were replaced.

Replacements use `example.com` by default. You can choose a different domain in the popup.

Maskify replaces email addresses in page text, the current tab's title, email links, and form fields, including filled-in values and placeholders.

## Installation

Install the published version from [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/ahlpkipagblmbjceamojfdomdmcmcpgc).

### Chrome and Edge (unpacked)

1. Clone or download this repository.
2. Open Chrome or Edge and navigate to the extensions page (`chrome://extensions` or `edge://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the root folder of this repository.

### Firefox

The initial AMO submission was **awaiting review at last verification**; public
availability has not been confirmed. The Firefox badge links to the
[publication tracker](https://github.com/mike-mo/maskify/issues/38), not a public
install page.

For testing on desktop Firefox 140 or later, follow the
[Firefox package build instructions](RELEASING.md#package-and-verify-locally).
In `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on** and
select `dist/firefox/maskify-firefox.zip`. Allow site access and refresh existing
tabs. Temporary installs disappear when Firefox exits; permanent installation
requires Mozilla signing.

## Usage

Open a web page, click the Maskify icon in the toolbar, then click **Mask Emails**. You can also press **Alt+Shift+M** to mask the current page using your saved preferences.

The popup has a few options for controlling how replacements look:

- **Domain**: choose a domain for the addresses, or leave it blank to use `example.com`
- **Add number**: appends a random number to the name (e.g. `alice7`)
- **Add random initial**: appends an underscore and a random letter (e.g. `alice_r`)
- **Mark replacements with \*\*\***: adds `***` so you can recognize the maskified addresses

The preview shows the address format as you change the options. Clicking **Mask Emails** masks addresses on the current page using that format and saves your preferences for next time.

The interface follows your browser language, using English or Spanish.

If you loaded or reloaded the extension while a tab was open, refresh that tab before using Maskify.

Masking runs when you activate it. If the page loads more content afterward, run Maskify again and review the result.

Maskify changes email-link destinations and form values on the page. Check forms before submitting them. It does not redact names or other personal details, and it cannot mask email addresses inside images.

Replacement addresses are placeholders, not real mailboxes or email aliases.
`example.com` is reserved for documentation by [RFC 2606](https://www.rfc-editor.org/rfc/rfc2606).

## Documentation

| Guide | Contents |
| --- | --- |
| [Development](DEVELOPING.md) | How masking works, tests, screenshot capture, icons and listing previews |
| [Releasing](RELEASING.md) | Workflow responsibilities, package builds, generated store artifacts and publishing approvals |
| [Store copy](store-assets.md) | Approved English/Spanish descriptions, search terms, certification notes and creative brief |

See the [screenshot gallery](screenshots/index.html) for examples.

## Privacy

Maskify processes page content in your browser. It saves preferences and a masking-action count in browser sync storage. Your browser handles any syncing across devices. See the [privacy policy](privacy.html) for details.

## License

Free for personal, non-commercial use with attribution. Commercial use requires a written agreement. See [LICENSE](LICENSE) for details.
