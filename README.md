# Maskify

A Chrome and Edge extension that protects user privacy by replacing real email addresses on web pages with randomly generated replacements.

If Maskify has been useful to you, [buy me a coffee ☕](https://donate.stripe.com/3cIeVd8iSbCo2VGeKxenS01) — it helps keep the project going.

## What It Does

When you click the Maskify button, the extension scans the current page and replaces every email address it finds with a realistic-looking replacement like `alice7***@example.com`. The same real address always maps to the same masked address within a session, so the page stays consistent and readable. A brief confirmation toast appears in the top-right corner showing how many addresses were masked.

The domain used for masked addresses defaults to `example.com` but can be changed to any domain you choose directly from the popup.

Maskify catches emails in visible text, `mailto:` links, and input field values (including prefilled forms and placeholder text).

## Installation

1. Clone or download this repository.
2. Open Chrome or Edge and navigate to the extensions page (`chrome://extensions` or `edge://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the root folder of this repository.

## Usage

Navigate to any page with email addresses, click the Maskify icon in the toolbar, then click **Mask Emails**. A confirmation toast will appear in the top-right corner showing how many addresses were replaced.

The popup has a few options for controlling how replacements look:

- **Domain**: type any domain to use instead of `example.com`, or leave it blank for the default
- **Add number**: appends a random number to the name (e.g. `alice7`)
- **Add last initial**: appends an underscore and a random letter (e.g. `alice_r`)
- **Mark replacements with \*\*\***: adds a visible marker to signal that the address is protected and should not be contacted

A live preview updates as you change the settings so you can see the format before masking. All settings are saved and restored the next time you open the popup.

Note: if the extension was loaded or reloaded while a tab was already open, refresh that tab first.

## How It Works

Clicking the button sends a message from the popup to the content script running in the active tab. The content script runs three passes: a TreeWalker over all text nodes, a pass over anchor `href` attributes (to catch `mailto:` links whose display text isn't an email address), and a pass over input field values and placeholders. Each unique email processed in a masking run is mapped to a generated replacement like `alice7***@example.com`, using a name drawn from a locale-aware list (English or Spanish, chosen automatically based on the browser's language setting) plus any enabled formatting options, such as an optional random number, an underscore and last initial, and the optional `***` marker. The replacement domain defaults to `example.com` unless you choose another domain in the popup. Already-masked replacements are not re-masked on later clicks, so repeated activations preserve existing masked addresses instead of generating a completely new set each time.

`example.com` is an internet domain permanently reserved for use in documentation and examples by [RFC 2606](https://www.rfc-editor.org/rfc/rfc2606), so masked addresses using it can never belong to a real person or organization.

## Testing

Open `testpage.html` in the browser after loading the extension. It covers plain text, mailto links with and without visible email text, consistency across repeated occurrences, email format variations, table data, non-email `@` symbols, and input fields.

## Store Description

**Maskify: Instantly Hide Email Addresses on Any Web Page**

Presenting a live demo? Sharing your screen on a call? Browsing a dashboard full of customer data? Maskify keeps real email addresses out of sight with a single click.

Maskify scans the current page for email addresses and replaces every one with a realistic-looking masked address. The same real address always maps to the same masked address within a session, so the page stays consistent and readable without exposing anyone's personal information.

**Key Features**

- 🎭 Realistic replacements: real-looking names that map consistently, so the page stays readable and functional
- 🌐 Works on any website: dashboards, admin panels, CRMs, inboxes, forms, and more
- 🌍 Custom domain: use any domain you like for replacements, or stick with the `example.com` default
- ⚙️ Configurable format: control whether replacements include a number, a last initial, and a `***` marker
- 🛡️ Completely local: runs entirely in your browser with no data collected, stored, or transmitted
- 🗣️ Multilingual: interface available in English and Spanish, automatically matched to your browser language

**Perfect for** live demos, screen sharing, video recordings, screenshots for documentation, and any time you need to quickly obscure real email addresses.

## Privacy

See [privacy.html](privacy.html) for the full privacy policy. Everything runs locally in your browser and nothing leaves your machine.

## License

Free for personal, non-commercial use with attribution. Commercial use requires a written agreement. See [LICENSE](LICENSE) for details.
