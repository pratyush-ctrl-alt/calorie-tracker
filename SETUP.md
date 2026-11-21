# Setup (your manual steps)

You need three free accounts' worth of clicking, about 30 minutes in total: **Supabase** (the database), **Cloudflare** (the website) and your phone. You already have GitHub.
Nothing here needs a command line. The app already works in Demo mode with a sample week, so you can look at it first.

**Golden rule for secrets:** you will have a *project URL*, a *public key* and a *token*. They go into the app's Settings screen on your phone, and nowhere else. Don't paste them into GitHub, into the code, or into a chat. You never need to give any of them to anyone for deployment. The one key you must **never** copy anywhere is Supabase's **service_role / secret** key.

---

## Part A. Supabase (the database)

### A1. Make an account and a project
1. Go to <https://supabase.com> and sign up (easiest: "Continue with GitHub").
2. Click **New project**. Give it any name (for example `plate-log`).
3. **Database password:** click the generate button and save the password in a password manager. The app never uses it, but you'd need it if you ever connect other tools.
4. **Region:** choose the closest one, **South Asia (Mumbai)**.
5. Plan: **Free**. Click **Create new project** and wait a minute or two.

### A2. Pick your token
Make up a long random token of 30 or more letters and digits (a password manager's generator is perfect, with symbols turned off). Save it in your password manager. You will use it twice: in the SQL below, and in the app.

### A3. Create the tables
1. In Supabase's left menu open **SQL Editor** → **New query**.
2. Open [`supabase/schema.sql`](supabase/schema.sql) in this repo, press the **Raw** or copy button, and paste the **whole file** into the editor.
3. About 25 lines down, find the line that ends with `-- <<< YOUR TOKEN`. On that line only, replace the words between the quote marks (`CHANGE-ME-TO-A-LONG-RANDOM-VALUE`) with your token. **Don't use "replace all"**, and keep the quote marks.
4. Click **Run**. You should see "Success. No rows returned".
   - If Supabase warns about "RLS" or asks to confirm a query that changes things, that's expected: this file turns the safety lock **on**. Confirm it.

To change the token later, run this in the SQL Editor: `update plate_secret set token = 'your new token';`

### A4. Copy the project URL and public key
1. Left menu: **Project Settings** (the gear) → **API** (newer screens call this **API Keys**).
2. Copy the **Project URL** (looks like `https://abcdefghijkl.supabase.co`).
3. Copy the public key: the **anon** key (a very long text starting `eyJ…`) or the **publishable** key (starts `sb_publishable_…`). Either works.
4. Do **not** copy the `service_role` or `secret` key.

---

## Part B. Cloudflare (the website)

### Why Cloudflare
Free, redeploys automatically when `main` changes, and runs the small server function that AI estimates need. The app is a Cloudflare **Worker with static assets**: the website files are served as they are, and `worker.js` only handles photo logging. (The app used to be on Netlify and before that GitHub Pages.)

### B1. Deploy
1. Go to <https://dash.cloudflare.com> and sign up or log in.
2. **Workers & Pages** → **Create** → **Import a repository** (Connect to Git). Allow Cloudflare to access your GitHub (you can limit it to just the `calorie-tracker` repository).
3. Choose the repository **pratyush-ctrl-alt/calorie-tracker**.
4. Settings:
   - **Project name:** `calorie-tracker` (it must match `"name"` in `wrangler.jsonc`)
   - **Build command:** `mkdir -p dist && cp -r index.html manifest.json _headers css js icons dist/`
   - **Deploy command:** `npx wrangler deploy` (the default)
   - Leave **Path / Root directory** as `/`.
   - Production branch: `main` (under the advanced or build settings).
5. Click **Deploy**. After about a minute you get an address like `https://calorie-tracker.<your-name>.workers.dev`.

From now on, every change on `main` is published by Cloudflare automatically.

---

## Part C. Connect your phone

1. Open your Cloudflare address (`…workers.dev`) on your phone's browser (Safari on iPhone, Chrome on Android).
2. Tap **Settings** at the bottom. Fill in:
   - **Project URL**: from A4
   - **Public key**: from A4
   - **Token**: from A2
3. Tap **Test connection**. You should see "Connected. Your database is ready."
4. Tap **Save connection**. The Demo banner disappears and the chip at the top says "Saved". The Database section then folds into a single row; tap it any time to open it again.
5. **Add to the home screen:**
   - iPhone (Safari): Share button → **Add to Home Screen**.
   - Android (Chrome): ⋮ menu → **Add to Home screen** / **Install app**.
6. Open the app **from the home-screen icon** and check Settings once: the home-screen app keeps its own storage, so if the fields are empty, enter the three values again there.

### If Test connection fails
| It says | What to do |
|---|---|
| "The project URL should look like https://…supabase.co" | Re-copy the Project URL from Supabase. |
| "Supabase rejected the public key" | Re-copy the anon / publishable key (not the secret one). |
| "Wrong or missing token" | The token in the app differs from the one in the SQL. Fix the app, or run the `update plate_secret…` line from A3. |
| "The database tables are not set up yet" | Run `schema.sql` (A3). |
| "The database did not answer properly" | Your free Supabase project may be paused: open the Supabase dashboard and click **Restore project**. |

---

## Part D. Updating the database after an app update

Some app updates need a small database change (for example favourites in My Items). When that happens the app says so: Settings shows **"Update needed"** next to Database, and My Items shows a notice. The fix takes a minute and keeps all your data:
1. Open [`supabase/schema.sql`](supabase/schema.sql), copy the whole file.
2. Supabase → **SQL Editor** → **New query**, paste it and press **Run**. You do **not** need to edit the token line again: it keeps the token you already set.
3. Back in the app, tap **Sync now** in Settings. "Update needed" disappears.

---

## Part E. AI estimates with Gemini: photo or description (optional)

This lets you photograph a meal, or type or speak what you ate, and get an estimate. It needs a Gemini API key from Google, kept **only in Cloudflare**.

### E1. Get a key
1. Open <https://aistudio.google.com> → **Get API key**. You can reuse the key from your other app, but a **separate key (ideally in a separate Google project)** is better: then this app's usage and limits never touch your other app, and you can revoke one without breaking the other.
2. Don't paste the key into chat, GitHub or the app.

### E2. Add the variables in Cloudflare
Cloudflare → **Workers & Pages** → **calorie-tracker** → **Settings** → **Variables and Secrets** → **Add**. Choosing type **Secret** for all of them is simplest (secrets are never shown again and are never touched by a deploy):

| Variable | Value | Notes |
|---|---|---|
| `GEMINI_API_KEY` | your Gemini key | mark it as a **secret** |
| `SUPABASE_URL` | the same Project URL you type into the app | e.g. `https://abcdefgh.supabase.co` (no `/rest/v1/`) |
| `SUPABASE_ANON_KEY` | the same public key you type into the app | the anon / publishable one, never the secret key |
| `GEMINI_MODEL` (optional) | a model ID, or several separated by commas | default `gemini-3.1-flash-lite`. Example: `gemini-3.1-flash-lite,gemini-3-flash` tries the second if the first is out of quota |

### E3. Save
Click **Deploy** / **Save** after adding the variables. For a Worker this takes effect straight away, with no rebuild needed. Because the variables are secrets (or because `wrangler.jsonc` has `"keep_vars": true`), later deploys from `main` keep them.

### E4. Check it
In the app: **Settings → AI estimates → Check AI estimates**. It should say "AI estimates (photo and text) are ready". If it says Google does not list your model, it also shows the model IDs your key can use: copy one into `GEMINI_MODEL` and redeploy.

### E5. Use it
- **+ (Add food) → Describe**: type or tap **Speak**, say what you ate (amounts help: "exactly 10 g peanuts"), tap **Estimate**.
- **+ (Add food) → Photo**: take or choose a photo.

Either way, check the numbers in the preview cards and tap Save.

### If something goes wrong
| It says | What to do |
|---|---|
| "…not set up on the server yet. Add these in Cloudflare: …" | Add the named variables (E2) and redeploy (E3). |
| "Wrong or missing token" | The token in the app does not match your database. See Part C. |
| "Google rejected the Gemini API key" | Re-copy the key into `GEMINI_API_KEY`, redeploy. |
| "…limit … has been reached" | You used that model's daily or per-minute allowance. Wait, or add a second model to `GEMINI_MODEL`. |
| "Gemini does not know the model …" | Use Check AI estimates to see valid IDs, then fix `GEMINI_MODEL`. |
| "AI estimates are not available on this site yet" | The site is not running on the Cloudflare Worker (for example you opened a local copy, or the latest deploy failed: check **Deployments**). |

**Privacy:** the photo goes to Google to be analysed and is not stored by this app. As I understand Google's terms, the free tier may use submitted content to improve Google's products. Check their current terms.

---

## Part F. Good to know

- **Free projects pause** after about a week with no use. Nothing is lost: entries you add meanwhile wait on the phone and sync after you restore the project in the dashboard. Opening the app every few days avoids it.
- **Backups:** don't rely on the free plan for them. Every month or so, use **Settings → Download CSV** and keep the file.
- **Changing the app later:** I edit `main` on GitHub; Cloudflare redeploys; reopen the app (pull down to refresh, or close and reopen it) to get the new version.
- **Changing the database later:** if I change `supabase/schema.sql`, I'll tell you to paste it into the SQL Editor again. It is safe to run repeatedly and keeps your data and token.
- **Moving to a new web address** (for example moving from Netlify to Cloudflare, or renaming the project) means entering the three Settings values again and re-adding the home-screen icon, because phones store settings per address.

## Moving over from Netlify
If the app is already running on Netlify:
1. Do Part B (Cloudflare deploy) and Part E2–E3 (the same four variables, now in Cloudflare).
2. On the phone, open the new `…workers.dev` address, enter the three Settings values again (Part C) and add the new home-screen icon. Delete the old icon. Your entries are safe: they live in Supabase, not on the phone. Any entries on the old address that never synced should be synced there first (Settings → Sync now).
3. Check AI estimates (E4) on the new address.
4. When everything works, delete the Netlify site (Netlify → your site → Project configuration → Delete project) so two copies are not running.
