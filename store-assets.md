# Store Assets

## Listing (English)

Hide email addresses before you share.

Maskify replaces email addresses on the current page with made-up ones for screen sharing and recordings.

Open Maskify and click **Mask Emails**, or press **Alt+Shift+M**. It replaces addresses in page text, the current tab's title, email links, and form fields. Repeated addresses get the same replacement during that action.

Features:
- 🌐 Choose a domain for the maskified addresses, or keep the `example.com` default.
- ⚙️ Add a random number, a random initial, or the `***` marker. A preview shows the format as you change the options.
- 💾 Click **Mask Emails** to apply your chosen format and save your preferences for next time.
- 🗣️ The interface uses English or Spanish based on your browser language.
- 🔒 **Privacy:** Maskify processes page content in your browser and does not send it to its developer or to analytics services.

Review the page before sharing. Maskify does not redact names or other personal details, and it cannot mask email addresses inside images. It also changes email-link destinations and form values, so check forms before submitting them.

## Listing (Spanish)

Oculta las direcciones de correo antes de compartir.

Maskify cambia las direcciones de correo de la página por otras inventadas para compartir o grabar la pantalla.

Abre Maskify y pulsa **Enmascarar correos**, o usa **Alt+Shift+M**. Sustituye direcciones en el texto, el título de la pestaña actual, los enlaces de correo y los campos de formulario. La misma dirección recibe el mismo reemplazo durante esa acción.

Funciones:
- 🌐 Elige un dominio para las direcciones sustituidas o conserva el predeterminado `example.com`.
- ⚙️ Agrega un número aleatorio, una inicial aleatoria o el marcador `***`. La vista previa muestra el formato mientras cambias las opciones.
- 💾 Pulsa **Enmascarar correos** para aplicar el formato elegido y guardar tus preferencias para la próxima vez.
- 🗣️ La interfaz usa inglés o español según el idioma del navegador.
- 🔒 **Privacidad:** Maskify procesa el contenido de la página en tu navegador y no lo envía a su desarrollador ni a servicios de analítica.

Revisa la página antes de compartirla. Maskify no oculta nombres ni otros datos personales, y no puede sustituir direcciones de correo dentro de imágenes. También cambia los destinos de los enlaces de correo y los valores de los formularios, así que revisa los campos antes de enviar un formulario.

## Search Terms (English)

email masking, hide email addresses, screen sharing privacy, screen recording, browser tab titles, demo screenshots, email replacement

## Search Terms (Spanish)

enmascarar correos, ocultar direcciones de correo, compartir pantalla, grabar la pantalla, títulos de pestañas, capturas para demos, privacidad al compartir

## Certification Notes

Maskify replaces email addresses on the current page with made-up addresses when the user activates it. Page processing happens in the browser; page content is not sent to the developer or analytics services. Preferences and a masking-action count are saved in browser sync storage, with syncing handled by the browser. See [the privacy policy](privacy.html) for details.

How to test:
1. Install the extension and open a web page containing email addresses. The repository's `testpage.html` provides examples; enable file URL access if opening it as a local file.
2. Click the Maskify icon in the toolbar to open the popup.
3. Click **Mask Emails**. A notification in the top-right corner shows how many different addresses were masked.
4. Check page text, the tab title, email-link destinations, and form values or placeholders. Repeated occurrences of an address should receive the same replacement during that action.
5. Activate masking again. Already-maskified addresses should stay unchanged. Newly added addresses can be masked in a later action; the mapping is not a persistent identity map across actions or page loads.
6. Check **Alt+Shift+M**, which uses the same masking action with the saved preferences.

Permissions:
- `tabs`: the extension uses the Tabs API to identify the active tab and send it the masking command.
- `storage`: saves the chosen domain, formatting options, and masking-action count in browser sync storage.

Localization: The interface automatically uses English or Spanish based on the browser's language setting. No additional configuration is needed.

Format options in the popup:
- Domain for the maskified addresses (defaults to `example.com`, reserved for documentation under RFC 2606)
- Optional random number, random initial, and `***` marker
- Preview of the format as options change

Clicking **Mask Emails** masks addresses on the current page and saves the preferences. Closing the popup without clicking the button does not save changes. The keyboard shortcut uses the previously saved preferences.

No Maskify account is required. Masking does not depend on an external service.

## Screenshot Creative Brief

### Objective and audience

Create three screenshots for the browser extension listing. Help people who give
live demos, share their screen, or record walkthroughs understand what Maskify
changes, where it works on a page, and how to use it.

Positioning: **Replace email addresses on the page with made-up ones. The rest
stays readable.** This is an on-demand email-masking tool, not a general-purpose
redaction tool or an email alias service.

### Shared visual direction

- Use the existing Maskify icon, white and pale-blue surfaces, dark text, and the
  popup's blue accent (`#0078d4`). Keep the feel clear, friendly, and practical.
- Give each image one large headline, short supporting copy, and a
  dominant product demonstration. Use spacing, scale, and selective blue
  highlights for emphasis, not warning symbols, dramatic shields, or security
  badges.
- Show real extension output on a purpose-built, fictional team/contact page.
  Use reserved example domains and invented data even in the "before" captures.
  Keep names and other non-email content unchanged so the scope is apparent.
- Export at 1280 x 800, a size supported by the current Edge Add-ons listing
  requirements. Recheck requirements when targeting another store.
- Keep the real UI intact. Cropping and enlarging captures is fine; redrawing
  controls or adding features inside the product UI is not. Place editorial
  captions and callouts outside the captured UI.

### Screenshot 1: The result

**Headline:** Hide email addresses before you share.

**Supporting copy:** Replace email addresses on the page with made-up ones. The
rest stays readable.

**Composition:** A large before/after comparison of the same compact team
directory, with the after view slightly more prominent. Use clear "Before" and
"After Maskify" labels. Highlight only the email cells; leave names, departments,
and layout unchanged.

Show a few rows, including one address that appears twice. Both occurrences
should receive the same replacement in the captured masking action. An
illustrative transformation is `carol@team.example` to
`alice7***@example.com`; use the actual generated output in the final capture.

**Small action caption:** Open Maskify and click **Mask Emails**.

**Small note:** Repeated addresses get the same replacement.

**What the viewer learns:** The extension changes email addresses rather than
blurring the whole page, so the surrounding information remains readable. The
comparison should explain the product even without reading the supporting copy.

### Screenshot 2: The coverage

**Headline:** Email links and form fields, too.

**Supporting copy:** Choose Mask Emails to replace addresses in all three places.

**Composition:** Show a fictional contact-detail page after masking, with three
large, closely cropped areas: a contact summary, an email link, and a form
containing an email input and a notes textarea. Arrange them as parts of the same
page, not as a collection of unrelated application logos.

Label the areas **Page text**, **Email links**, and **Form fields**. Use consistent
blue highlighting around the replacement addresses. If illustrating a link whose
label is "Contact billing," include a captured hover destination to demonstrate
that its target changed too; the label alone does not show that functionality.

The captions under the three areas are:

- **Page text:** Other text stays as it is.
- **Email links:** Both the visible address and link destination change.
- **Form fields:** Includes email fields and notes.

**What the viewer learns:** Maskify also handles email addresses in editable
fields and link destinations, not only ordinary paragraphs. Do not imply the form
is safe to submit or that the source application's stored records were changed.

### Screenshot 3: The controls

**Headline:** Choose the replacement format.

**Supporting copy:** Set a domain and choose whether to add a number or a random
initial.

**Composition:** Pair the headline with a large, readable capture of the real
popup. Use `demo.test` as the custom domain and enable the number, last-initial,
and marker options. The English live preview will read
`alice_r7***@demo.test`. This reserved example domain also lets the full Spanish
preview, `alicia_r7***@demo.test`, fit on one line without changing the popup UI.

Keep **Mask Emails** visible.

**Marker note:** Mark replacements with `***`.

**Popup caption:** The preview updates as you change the settings.

**What the viewer learns:** The format is configurable and can be inspected
before applying it. The last-initial option adds a random initial, not the real
person's initial. A custom domain does not create a working inbox or email alias.

### Production and claim guardrails

- Capture the real extension acting on synthetic content. The Playwright flow
  uses a focused local demonstration instead of the test page and its "Expected"
  instructions.
- Capture the popup separately from the masked result: it closes when
  **Mask Emails** is clicked. If including the confirmation toast, retain the
  actual count; it counts distinct addresses replaced in that action, not rows.
- Describe consistent replacements within one masking action. Do not promise
  permanent identity mapping across reloads, pages, or later actions.
- Avoid "works on every website," "hides all personal information," "always
  protected," and "nothing is stored or transmitted." Masking is user-triggered;
  newly loaded content may need another activation. Preferences and a usage
  counter use browser sync storage. A narrower processing claim is
  **Email masking happens in your browser.**
- Do not suggest that names, screenshots/images, or every possible email
  presentation are redacted. Include a modest reminder where space permits:
  **Review the page before sharing.**
- Review the compositions at thumbnail size. The headline and transformation
  must remain understandable without zooming. Produce separate localized images
  rather than putting English and Spanish copy on the same canvas.

If only two screenshots are needed, use **1 and 3**: the transformation establishes
the value, and the popup explains how to use it.

### Implementation references

- `content-scripts\content.js`: replacement passes, per-action mapping, and toast.
- `popup\popup.html`, `popup\popup.js`: actual controls, live preview, and saving.
- `background.js`, `manifest.json`: on-demand activation and keyboard command.
- `scripts\screenshot.js`: existing localized popup and before/after captures.

### Finished bilingual set

Each locale contains `01-result.png`, `02-coverage.png`, and `03-controls.png`.
Open `screenshots\index.html` for the complete gallery, or use `npm run preview`
from `scripts` to serve it locally.

1. **Result:** "Hide email addresses before you share." / "Oculta las direcciones de correo antes de compartir."
2. **Coverage:** "Email links and form fields, too." / "También en enlaces y formularios."
3. **Controls:** "Choose the replacement format." / "Elige el formato de los reemplazos."

The shared footer reads "For screen sharing and recordings." / "Para compartir
o grabar la pantalla." The reminder remains "Review the page before sharing." /
"Revisa la página antes de compartirla."

The complete localized captions and supporting copy live in `scripts\copy.js`.
The popup's original strings come from `_locales`, not from a redrawn interface.
The Maskify icon is used in the extension and marketing headers: a solid blue
envelope with a dark circular asterisk seal. Its transparent artwork is shown
without a circular crop, preserving the envelope corners.
The only editable icon source is `icons\maskify.svg`. Generate every export with
`npm --prefix scripts run icons`. Use `icons\maskify300x300.png` for the English
and Spanish store logos. This matches Edge's recommended 300 x 300 size.

When updating the store, replace the existing screenshots with the three files
for that language, update the description with the listing copy above, and
replace or remove any promotional tiles that still show older branding.
Publishing an extension package alone does not update these listing assets.

The artwork uses the bundled Manrope typeface, licensed under the SIL Open Font
License. Capture sources are editable HTML templates in `scripts\templates.js`
and shared styles in `scripts\demo.css` and `scripts\composition.css`.

Edge screenshot requirements:
https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension

## Browser store upload packs

Run `npm --prefix scripts run stores` and open `store-assets/index.html`.
The generated folders and ZIPs contain all listing images for Edge, Chrome,
and Firefox, along with this approved copy and store-specific upload guides.
Do not edit the generated files directly.

Edge uses a 300 x 300 logo, the approved 1280 x 800 screenshots for each
language, and optional 440 x 280 and 1400 x 560 promotional graphics.
Chrome uses a 128 x 128 icon with transparent clear space, the same localized
screenshots, a required 440 x 280 tile, and an optional 1400 x 560 marquee.
Chrome's promotional tiles cannot be localized. Both stores therefore use a
language-neutral icon-and-wordmark composition on the seal's navy background.

Firefox's pack uses 2400 x 1800 screenshots in a 4:3 ratio, matching AMO's
newer media-form guidance and its stricter validation when enabled, rather than
the older 1280 x 800 recommendation in the Extension Workshop guide.
AMO has one shared screenshot gallery, so its
three images omit editorial headlines and have separate English and Spanish
captions. Text inside the real captured interface and fictional page remains
English. The 128 x 128 PNG logo is suitable for AMO's current icon uploader.

Firefox images use real captures of the current Chromium extension. They are
not evidence of Firefox compatibility: the current `background.service_worker`
manifest entry is unsupported there. Prepare and verify the Firefox extension
package before submitting its listing. No browser package, store submission,
video, or privacy-form declaration is created by the asset generator.

Each pack contains its own `UPLOAD.md` and source references. PNG dimensions,
color format, Chrome icon padding, source-copy equality, localized text, and
ZIP contents are checked. Images are kept below a project budget of 2 MiB each;
this is a production budget, not a claim about every store's upload limit.
