# Maskify

A Chrome extension that protects user privacy by replacing real email addresses on web pages with randomly generated fake ones.

## What It Does

When you click the **Maskify** button in the extension popup, Maskify scans the current page for email addresses and replaces each one with a realistic-looking fake address using the `example.com` domain. The same real address is always replaced with the same fake address within a session, so the page stays consistent.

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the root folder of this repository.
5. The Maskify icon will appear in your browser toolbar.

## Usage

1. Navigate to any web page that displays email addresses.
2. Click the **Maskify** extension icon in the toolbar.
3. Click the **Maskify** button in the popup.
4. All visible email addresses on the page will be replaced with fake ones.

## Project Structure

```
maskify/
├── manifest.json            # Chrome extension manifest (Manifest V3)
├── content-scripts/
│   └── content.js           # Content script that finds and replaces emails
├── popup/
│   ├── popup.html           # Extension popup UI
│   └── popup.js             # Popup logic — sends message to content script
├── lib/
│   └── jquery.min.js        # jQuery (used for DOM manipulation)
├── icons/                   # Extension icons in various sizes
└── testpage.html            # Sample page for testing the extension
```

## How It Works

1. The user clicks the Maskify button in the popup, which sends a message to the active tab's content script.
2. The content script scans the page for text matching an email address pattern.
3. Each unique email address is mapped to a generated fake address (e.g., `tohasi*@example.com`) using pronounceable random strings.
4. The page's HTML is updated in-place with the fake addresses.

## Store Description

**Maskify — Instantly Hide Email Addresses on Any Web Page**

Presenting a live demo? Sharing your screen? Browsing a dashboard full of customer data? Maskify keeps real email addresses out of sight with a single click.

Maskify scans the current page for email addresses and replaces every one of them with a realistic-looking fake address (using the safe `example.com` domain). The same real address always maps to the same fake address within a session, so the page remains consistent and readable — without exposing anyone's personal information.

**Key Features**

- 🔒 **One-click privacy** — Click the Maskify button and every email address on the page is instantly replaced.
- 🎭 **Realistic replacements** — Fake addresses look natural, using pronounceable random strings so they blend in seamlessly.
- 🔁 **Consistent mapping** — The same real email always produces the same fake email during a session, keeping the page easy to follow.
- 🌐 **Works on any website** — Use Maskify on dashboards, admin panels, CRMs, inboxes, or any other page that displays email addresses.
- 🛡️ **Completely local** — Maskify runs entirely in your browser. No data is collected, stored, or sent anywhere.

**Perfect for:**

- Live demos and presentations
- Screen sharing and video recordings
- Screenshots for documentation or bug reports
- Any time you need to hide real email addresses quickly

Protect the privacy of your users, customers, and colleagues — install Maskify today.

## Testing

Open `testpage.html` in Chrome (via `file://` or a local server) and click the Maskify button to see email addresses get replaced.

## License

This project does not currently specify a license.
