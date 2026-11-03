# Setup (your manual steps)

You need three free accounts' worth of clicking, about 30 minutes in total: **Supabase** (the database), **Netlify** (the website) and your phone. You already have GitHub.
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

## Part B. Netlify (the website)

### Why Netlify
For a one-person phone app, Netlify and Cloudflare Pages are both free and both redeploy automatically when `main` changes. Netlify's screens are the friendliest for a first-timer and its free plan is far more than this app needs, so that is what this guide uses. Cloudflare Pages is the fallback (see the end). GitHub Pages is not used any more.

### B1. Deploy
1. Go to <https://www.netlify.com> and sign up with **GitHub**.
2. **Add new project** → **Import an existing project** → **Deploy with GitHub**. Allow Netlify to access your GitHub (you can limit it to just the `calorie-tracker` repository).
3. Choose the repository **pratyush-ctrl-alt/calorie-tracker**.
4. Settings: **Branch to deploy: `main`**. Netlify reads the build command and publish folder from `netlify.toml` automatically, so leave those as they are (build command `mkdir -p dist && cp -r index.html manifest.json css js icons dist/`, publish directory `dist`).
5. Click **Deploy**. After about a minute you get an address like `https://something-random.netlify.app`.
6. Optional: **Project configuration → Change project name** to something memorable such as `plate-log-pratyush` (the address becomes `https://plate-log-pratyush.netlify.app`).

From now on, every change on `main` is published by Netlify automatically.

---

## Part C. Connect your phone

1. Open your Netlify address on your phone's browser (Safari on iPhone, Chrome on Android).
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

## Part E. Good to know

- **Free projects pause** after about a week with no use. Nothing is lost: entries you add meanwhile wait on the phone and sync after you restore the project in the dashboard. Opening the app every few days avoids it.
- **Backups:** don't rely on the free plan for them. Every month or so, use **Settings → Download CSV** and keep the file.
- **Changing the app later:** I edit `main` on GitHub; Netlify redeploys; reopen the app (pull down to refresh, or close and reopen it) to get the new version.
- **Changing the database later:** if I change `supabase/schema.sql`, I'll tell you to paste it into the SQL Editor again. It is safe to run repeatedly and keeps your data and token.
- **Moving to a new web address** (for example renaming the Netlify project) means entering the three Settings values again and re-adding the home-screen icon, because phones store settings per address.

## Cloudflare Pages instead (if you ever prefer it)
Same idea: **Workers & Pages → Create → Pages → Connect to Git** → pick the repo, branch `main`, **Build command** `mkdir -p dist && cp -r index.html manifest.json css js icons dist/`, **Build output directory** `dist`. Everything else in this guide stays the same.
