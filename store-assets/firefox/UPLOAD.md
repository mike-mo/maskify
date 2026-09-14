# Firefox Add-ons upload guide

This is a listing-asset pack, not an installable extension. No store submission
has been made.

Upload `icon-128.png` as the custom icon. AMO creates the smaller display
sizes from it. Upload the three files in `screenshots/` as the single shared
gallery, in filename order. AMO does not provide separate galleries by language;
use `en/captions.json` and `es/captions.json` for localized captions.

These 2400 x 1800 images follow AMO's newer media-form guidance, including
stricter 4:3 validation when enabled. They omit editorial headlines; the English
text remaining inside them belongs to the captured UI and fictional demonstration page.

The captures come from the working Chromium extension, not a verified Firefox
build. The current manifest uses `background.service_worker`, which Firefox
does not support. Prepare and verify a Firefox-compatible extension package,
then confirm these screenshots still represent its behavior before submission.
Do not select unsupported platforms or invent data-collection declarations.

## Copy

For each language, `description.txt` contains plain text and `description.md`
preserves the approved Markdown. AMO supports limited Markdown.
`listing-copy.json` includes the name, short description, and existing public
links. It is a copy reference, not an API request body.
Paste each caption in the corresponding AMO language field.

`privacy-policy.txt` preserves the approved English policy, including browser
sync storage. `reviewer-notes.txt` contains the existing testing instructions.
`LICENSE.txt` contains the custom license; do not select MIT or another
unrelated license. Complete each store's privacy and distribution forms based
on the package actually submitted.

Replace or remove older logos, screenshots, and promotional images when updating
an existing listing. Do not upload this ZIP in the extension-package field.

## Sources

- https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/
- https://github.com/mozilla/addons-server/blob/c2404fb30b6f4f0d3935c47fe0e77fe01de0b0e8/src/olympia/devhub/templates/devhub/addons/forms_shared/media.html
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
