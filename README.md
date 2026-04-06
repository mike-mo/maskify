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

## Testing

Open `testpage.html` in Chrome (via `file://` or a local server) and click the Maskify button to see email addresses get replaced.

## License

This project does not currently specify a license.
