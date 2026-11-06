# Chrome Web Store upload guide

This is a listing-asset pack, not an installable extension. No store submission
has been made.

Upload `icon-128.png` as the store icon. Its painted artwork is centered
inside a 96 x 96 safe area with at least 16 pixels of transparent padding.
Use this image for `icons/maskify128x128.png` in a Chrome-specific extension
package as well; this asset pack does not modify the existing Edge package.

The 440 x 280 small promotional tile is required. The 1400 x 560 marquee is
optional, but needed for marquee placement. These tiles cannot be localized,
so they contain only the Maskify icon and wordmark.
Upload the three English and three Spanish screenshots in their respective
localized screenshot sections, not as six global screenshots.

## Copy

For each language, `description.txt` contains plain text and `description.md`
preserves the approved Markdown. Use the plain-text version for this store.
`listing-copy.json` includes the name, short description, and existing public
links. It is a copy reference, not an API request body.
Captions are supplied as references; their text is already represented in the screenshots.

`privacy-policy.txt` preserves the approved English policy, including browser
sync storage. `reviewer-notes.txt` contains the existing testing instructions.
`LICENSE.txt` contains the custom license; do not select MIT or another
unrelated license. Complete each store's privacy and distribution forms based
on the package actually submitted.

Replace or remove older logos, screenshots, and promotional images when updating
an existing listing. Do not upload this ZIP in the extension-package field.

## Sources

- https://developer.chrome.com/docs/webstore/images/
- https://developer.chrome.com/docs/webstore/cws-dashboard-listing
