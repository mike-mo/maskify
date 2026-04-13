# Maskify

A Chrome and Edge extension that protects user privacy by replacing real email addresses on web pages with randomly generated fake ones.

## What It Does

When you click the Maskify button, the extension scans the current page and replaces every email address it finds with a realistic-looking fake address using the `example.com` domain. The same real address always maps to the same fake within a session, so the page stays consistent and readable. A brief confirmation toast appears in the top-right corner showing how many addresses were masked.

Maskify catches emails in visible text, `mailto:` links, and input field values — including prefilled forms and placeholder text.

## Installation

1. Clone or download this repository.
2. Open Chrome or Edge and navigate to the extensions page (`chrome://extensions` or `edge://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the root folder of this repository.

## Usage

Navigate to any page with email addresses, click the Maskify icon in the toolbar, then click **Mask Emails**. A confirmation toast will appear in the top-right corner of the page showing how many addresses were replaced.

## How It Works

Clicking the button sends a message from the popup to the content script running in the active tab. The content script runs three passes: a TreeWalker over all text nodes, a pass over anchor `href` attributes (to catch `mailto:` links whose display text isn't an email address), and a pass over input field values and placeholders. Each unique email is mapped to a generated fake address like `tohasi*@example.com` using a pronounceable random string — the `*` makes fakes visually distinct from real addresses. The mapping resets each time you click the button.

## Testing

Open `testpage.html` in the browser after loading the extension. It covers plain text, mailto links with and without visible email text, consistency across repeated occurrences, email format variations, table data, non-email `@` symbols, and input fields.

## Store Description

**Maskify — Instantly Hide Email Addresses on Any Web Page**

Presenting a live demo? Sharing your screen? Browsing a dashboard full of customer data? Maskify keeps real email addresses out of sight with a single click.

Maskify scans the current page for email addresses and replaces every one of them with a realistic-looking fake address (using the safe `example.com` domain). The same real address always maps to the same fake address within a session, so the page remains consistent and readable — without exposing anyone's personal information.

**Key Features**

- One-click privacy — click the Maskify button and every email address on the page is instantly replaced
- Realistic replacements — fake addresses use pronounceable random strings so they blend in naturally
- Consistent mapping — the same real email always produces the same fake during a session
- Works on any website — dashboards, admin panels, CRMs, inboxes, forms, and more
- Completely local — runs entirely in your browser with no data collected, stored, or transmitted

**Perfect for** live demos, screen sharing, video recordings, screenshots for documentation, and any time you need to quickly obscure real email addresses.

## Privacy

See [privacy.html](privacy.html) for the full privacy policy. The short version: everything runs locally in your browser, nothing leaves your machine.

## License

Free for personal, non-commercial use with attribution. Commercial use requires a written agreement — see [LICENSE](LICENSE) for details.
