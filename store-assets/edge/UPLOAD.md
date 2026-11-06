# Microsoft Edge Add-ons upload guide

This is a listing-asset pack, not an installable extension. No store submission
has been made.

Upload `icon-300.png` as the extension logo for English and Spanish.
The 440 x 280 and 1400 x 560 promotional images are optional. They contain only
the Maskify icon and wordmark, so the same images work in both languages.
Replace existing screenshots with the three files in each language folder.

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

- https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
