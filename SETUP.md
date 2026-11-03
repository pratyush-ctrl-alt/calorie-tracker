# Setup (your manual steps)

The app's live address will be **https://pratyush-ctrl-alt.github.io/calorie-tracker/** once the workflow has run on `main`.
Until you do steps 1 to 4 and 6, the app runs in Demo mode with a sample week.

## 1. Create a Google Sheet
Go to <https://sheets.new> and name it anything (for example "Plate Log data"). Leave it empty: the script creates the `Log`, `Items` and `Settings` tabs and the headers itself.

## 2. Paste the script
In the Sheet: **Extensions → Apps Script**. Delete the default `myFunction` code, paste the whole of [`apps-script/Code.gs`](apps-script/Code.gs), and save.
Optional but recommended: choose the function `setup` in the toolbar and press **Run** once. Google asks you to authorise the script (Review permissions → your account → Advanced → Go to project → Allow). This also creates the tabs.

## 3. Add the token
In Apps Script: **Project Settings** (gear icon) → **Script Properties** → **Add script property**.
- Property: `TOKEN`
- Value: a long random string (at least 32 characters, for example from a password manager).

Keep a copy: you type the same value into the app in step 6. The script refuses every request while `TOKEN` is missing.

## 4. Deploy as a web app
**Deploy → New deployment** → gear icon → **Web app**.
- Execute as: **Me**
- Who has access: **Anyone**

Press **Deploy** and copy the **Web app URL** (it ends in `/exec`). "Anyone" is needed so the phone can reach it without a Google login; the token is what protects it.

## 5. Turn on GitHub Pages
In the GitHub repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Then merge your work into `main` (or run the "Deploy to GitHub Pages" workflow from the Actions tab). The workflow runs the tests and publishes the site. The first run can only succeed after this step.

## 6. Connect the app
Open the live URL on your phone, go to **Settings**, paste the Apps Script URL and the token, tap **Save connection**, then **Test connection**. You should see "Connected. Sheet: <your sheet name>". The header chip should show "Saved" and the Demo banner disappears. (Demo data stays on the phone and is never sent to the Sheet.)

## 7. Add to the home screen
- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** ⋮ menu → **Add to Home screen** or **Install app**.

It then opens full-screen. The URL and token are stored only in that browser/app's storage, so enter them again if you add the app from a different browser.

## 8. When `Code.gs` changes later
Paste the new code into Apps Script, then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. Do **not** use "New deployment": that creates a new URL. Editing the existing deployment keeps the URL (and the app's saved setting) the same.

## Troubleshooting
- **"The Apps Script URL did not answer with JSON"**: the deployment is not shared with "Anyone", or the URL is not the `/exec` one.
- **"Wrong or missing token"**: the token in Settings differs from the `TOKEN` script property.
- **Chip says "Can't reach Sheet, will retry"**: you are offline or the script is down. Nothing is lost; entries wait in a queue on the phone and are sent automatically. Tap the chip to retry now.
