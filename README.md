# Calorie Tracker

A small personal calorie and macro logger for one person, used on a phone.

Most meals arrive as a single line of text that another AI (Gemini, ChatGPT or Claude) writes after you send it a food photo. You paste that line into Plate Log. The app parses it with plain code, stores it in your own Supabase database, and shows today's numbers, the last 7 days and the month against your targets. It is tuned to a nutritionist's plan: a pre-made "Kenko" dinner box most days, plus fixed plan options for the other meals.

**The text parser is plain code with no AI** (`js/parser.js`). The one exception is the optional **AI estimates**: you take a photo, or type or speak a description, and Google Gemini estimates the meal. This reverses the original "no AI or API keys anywhere" rule, at the owner's request. The Gemini key is kept only in Cloudflare's environment variables, never in this repository or on the phone. See "AI estimates" below.

## How it works

- **Frontend:** a static site in plain HTML, CSS and JavaScript (ES modules). No framework, no build step, no runtime dependencies.
- **Hosting:** a Cloudflare Worker with static assets, which redeploys automatically whenever `main` changes. The build command (copy the site into `dist/`) is set in the Cloudflare dashboard (SETUP.md, Part B); `wrangler.jsonc` tells Cloudflare to serve `dist/` and run `worker.js`; security headers are in `_headers`.
- **Database:** Supabase (Postgres). `supabase/schema.sql` creates everything; you paste it into Supabase once.
- **Auth:** a shared secret token. The tables are completely locked; the only way in is a handful of `plate_*` database functions, and each one checks your token first. So the public Supabase key on its own can read and write nothing. The project URL, public key and token are typed into the app's Settings screen and live only in the phone's localStorage. They are never committed.
- **Never lose an entry:** every write goes to a local pending queue first, then to the database. The screens render instantly from a local cache of the last 120 days and refresh from the database. The chip in the header shows "Saved", "2 waiting to sync" or "Can't reach database, will retry". Writes are upserts by a client-generated id, so a retried request never makes a duplicate row.
- **Demo mode:** with no project URL set, the app shows a labelled sample week and keeps anything you add on the phone only. Nothing in Demo mode is ever sent to the database.

## The screens

Tabs: **Diary · Trends · (+) Add · My Items · Settings**. The round **+** in the middle opens Add food.

- **Diary:** one day at a time. **‹ ›** arrows or a sideways swipe move between days; tapping the date opens a calendar (the last 120 days are kept on the phone). For the day shown:
  - a **calorie ring** (kcal left, or over) with eaten and target, and **four macro tiles** (protein, carbs, fat, fibre) against their targets. Tap the ring or any tile to see **every item of that day ranked by that nutrient, with its share** of the day's total.
  - a **Day review** that says, in plain words, which targets were missed and **which items caused it**: what pushed fat over the limit, which calories brought little protein, the biggest calories on an over day, off-plan items. Today (still in progress) says "to go" rather than "short".
  - the **meals** (Breakfast, Lunch, Snack, Dinner, plus Workout when used), each with its own **+** that opens Add food for that meal and day. Tap an item to see its share of each daily total and target, edit or delete it, or log it again today.
- **Add food:** tabs for **Describe** (type or speak; AI estimate), **Photo** (AI estimate), **Saved** (My Items, one tap), **Manual** (the numbers form, right there) and **Paste** (a line from another AI). It adds to the day the Diary was showing, which the pill under the title shows and can change. After saving it returns to that day in the Diary.
- **My Items:** everything you save, with search. Star up to 5 to pin them to Quick add; your most used items fill any free spots.
- **Trends:** the last 7 days (scorecard, a daily trend chart, day by day; tap a day to open it in the Diary) or a month (week by week, the same daily chart for each day of the month, off-plan list). The chart has a picker for **Calories, Protein, Carbs, Fat or Fibre**; the choice is remembered and shared by both views.
- **Settings:** the database connection (collapses once connected), daily targets, CSV export.

Setup steps are in [SETUP.md](SETUP.md).

## The log line

One meal per line. This is the format the outside AI gives you, and you can type it by hand too:

```
Lunch | Dal, rice, bhindi, curd | 720 kcal | 28g P | 95g C | 22g F | 9g Fib
```

- The slot (`Breakfast`, `Lunch`, `Snack`, `Dinner`, `Workout`; short forms `bf`, `snk`, `pre`, `post`) is optional. Without it the app guesses from the time and flags it.
- Fields after the name can be in any order, with the label before or after the number (`Protein 32g`, `32g P`). `g`, `~` and `approx` are optional or ignored. A range such as `500-560` becomes its midpoint.
- kcal and protein are required. Carbs, fat and fibre are optional; a missing one is stored blank, meaning unknown, not zero.
- Markdown noise (backticks, code fences, `**`, bullets, quotes) is stripped. Several lines make several entries, and one bad line does not block the others.
- A line that is only a saved item's name or alias (for example `coffee`), or a plan-menu option's name, logs that item. `kenko` alone logs the Kenko meal.
- Nothing is saved until you tap Save on the preview, where every field can be corrected first.

## AI estimates: describe a meal or add a photo (optional)

**+ → Describe**. Type, or tap **Speak**, what you ate, with amounts where you know them: "50-50 black coffee and milk, very little sugar", "exactly 10 g salted roasted peanuts". Tap **Estimate**. Gemini uses exact quantities as given and assumes a standard Indian serving where none is given (saying so in the note). Each separate food or drink becomes its own card. Edit the description and tap Estimate again to redo it; the new estimate replaces the old lines.

- **Speak** uses the browser's own speech-to-text (Chrome on Android; Safari on iPhone, though often not inside a home-screen app). It sends the audio to Google or Apple to turn it into words; only the text reaches this app. Where the button does not appear, the microphone key on the phone's keyboard does the same job.

**+ → Photo**. The photo is shrunk on the phone (about 1280 px JPEG, location data removed), sent to the Cloudflare Worker, which asks Gemini for a nutrition estimate. The estimate fills the paste box and the normal preview cards, so **nothing is saved until you tap Save**, and you can edit any number first. "Estimate again" accepts an optional note ("I only ate half").

- **Where the key lives:** only in Cloudflare environment variables (`GEMINI_API_KEY`). The app and the repository never contain it.
- **Who may use it:** the function checks your app token against your Supabase database before it calls Gemini, so strangers cannot spend your Gemini quota.
- **Setup:** SETUP.md, Part E. In the app, Settings → AI estimates → Check shows whether it is ready and lists the model IDs your key can use.
- **Model:** default `gemini-3.1-flash-lite`. Set `GEMINI_MODEL` in Cloudflare to change it, or give a comma-separated list tried in order. **Automatic backup:** if every listed model fails (busy, out of quota, unknown, timeout or an unusable answer), the server asks Google which flash/lite models your key can use and tries up to 2 of them, stable before preview, lite first. The app says when a backup model answered.
- **Privacy:** photos and descriptions are sent to Google to be analysed and are not stored by this app. As I understand Google's terms, content sent through the free tier of the Gemini API may be used to improve Google's products, while paid usage is not. Check Google's current terms if that matters to you.
- **Accuracy:** it is an estimate from one picture. Portion size and oil are guesses. Treat it as a fast first draft.

## The Gemini prompt

Also available in the app: Add, Format help, "Copy Gemini prompt".

```
You are my food logger. I'm a vegetarian in Bangalore eating Indian home, office-canteen and restaurant food. For every photo or description I send, estimate the nutrition of the whole meal shown (all items together, the portion actually on the plate). Assume typical Indian cooking oil unless I say otherwise.

Reply with ONLY this line, nothing before or after it:
<Meal> | <short dish name> | <kcal> kcal | <protein>g P | <carbs>g C | <fat>g F | <fibre>g Fib

Rules:
- <Meal> is one of: Breakfast, Lunch, Snack, Dinner, Workout. Use what I tell you; otherwise guess from the food.
- Whole numbers only. No ranges, no "~".
- Dish name under 40 characters and never containing "|".
- Several separate meals in one message: one line per meal.
- If the portion is unclear, assume a standard Indian serving and still reply with the line.
Example: Lunch | Dal, rice, bhindi, curd | 720 kcal | 28g P | 95g C | 22g F | 9g Fib
```

## Development

```bash
node --test                 # parser, day logic and database tests, no dependencies
python3 -m http.server      # then open http://localhost:8000
node tools/make-icons.mjs   # regenerate the PNG icons
```

`tests/supabase.test.mjs` starts a throwaway local PostgreSQL, loads `supabase/schema.sql` into it and calls the functions as the public `anon` role. It skips itself if PostgreSQL is not installed.

## Decisions

Where the brief was ambiguous I picked the simplest option. Say if you want any of these changed.

### Backend and hosting (changed from the first version)

- **Supabase instead of Google Sheets / Apps Script.** `supabase/schema.sql` replaces `apps-script/Code.gs`. The tables are `plate_log`, `plate_items`, `plate_settings` (and `plate_secret` for the token).
- **Token gate through database functions, not logins.** No sign-in screen and no command-line deployment: you paste one SQL file. The trade-off is that the token is one shared password; it is a long random string only you know, kept on your phone. The public key alone cannot read or write anything (this is tested).
- **No supabase-js library.** The app calls the database with plain `fetch`, so there are still no runtime dependencies.
- **The public key is in Settings, not in the repo.** It is designed to be public, but it stays out of the code anyway. Never paste the `service_role` / secret key anywhere in the app.
- **Cloudflare Worker with static assets (previously Netlify, before that GitHub Pages).** Cloudflare runs the photo function, which GitHub Pages cannot. Cloudflare now creates Workers rather than Pages projects from Git, so the app is set up as one: the static files are served straight from `dist/`, and only `/api/analyze-photo` reaches `worker.js`. The function's logic is in `server/analyze-photo.mjs`, kept free of Cloudflare specifics so the tests run it with plain Node. `.github/workflows/test.yml` only runs the tests.
- **Work goes straight to `main`** (at your request). A pull request is optional for a one-person project.
- **Wording:** the sync chip now says "Can't reach database, will retry" and "Database problem, see Settings" (it said "Sheet" before).
- **Free plan pause rule.** Supabase pauses free projects after about a week with no activity. Entries wait safely on the phone while paused (they sync after you restore the project). Opening the app at least weekly avoids the pause.
- **Backups.** Use Settings, Download CSV now and then; do not rely on the free plan for backups.
- **Old setup dropped.** If a phone still holds an old Apps Script URL, the app ignores it and starts in Demo mode.

### Design and navigation (version 2)

- **Look:** dark-first with a few iOS conventions: true black, grouped rounded lists, translucent bars, large titles that collapse into the bar, switches and segmented controls, blue buttons. Light and dark follow the phone. No emoji icons.
- **Not an Apple Health copy (on purpose).** Progress is shown as plain horizontal bars, not rings, and the colours are amber (calories), violet (protein) and sand (fibre). Fat and carbs stay neutral, and red is reserved for "over the limit", so nothing looks like Apple's Fitness or Workout apps.
- **Name and icon:** the app is called Calorie Tracker. The icon (three horizontal bars on black) is generated by `tools/make-icons.mjs`. Phones copy the name and icon when you add the app to the home screen, so re-add it after a change.
- **Plan menu removed** (you were not using it). Everything you eat that you repeat goes into My Items.
- **Quick add** shows your starred items first (at most 5; the database enforces the limit too), then fills free spots with your most used items over the last 120 days.
- **No Paste button.** The keyboard already offers Paste. A small Clear link appears once there is text.
- **Week and Month are now one tab, Trends**, with a Last 7 days / Month switch.
- **Database section in Settings** opens by itself only in Demo mode or when something is wrong; when connected it is a single row you can tap to open.
- **Favourites need a one-time database update** (re-run `supabase/schema.sql`; safe, keeps your data). Until then the app shows a clear notice, pins are refused with an explanation, and Quick add falls back to your most used items.

### AI estimates (photo and text)

- **One endpoint for both.** `/api/analyze-photo` takes either `image` (photo) or `text` (a description). The text prompt (`buildTextPrompt`) treats the user's quantities as facts and the description as quoted data, never as instructions. Descriptions are limited to 1000 characters.
- **Preview first, never auto-save.** AI estimates are sometimes wrong, so the result goes through the same editable preview cards as a pasted line. Saving is one tap.
- **Entries are stored as "From text"** (source `line`), so no database change was needed for photos or descriptions.
- **Token check through Supabase.** The function calls `plate_ping` with your token, using `SUPABASE_URL` and `SUPABASE_ANON_KEY` from Cloudflare. It never trusts a URL sent by the phone.
- **Time budget.** Cloudflare does not count time spent waiting for Gemini, but the phone gives up after 28 seconds, so each Gemini attempt is capped at 15 seconds and the whole call at about 20. If a model is slow or out of quota, the next model in `GEMINI_MODEL` is tried.
- **CPU limit.** Cloudflare's free plan allows about 10 ms of actual computing per request. A phone-shrunk photo (about 1280 px) is well inside that; a photo near the 4.5 MB upload cap could exceed it and fail.
- **A separate model from other apps.** Gemini limits are listed per model, so using a model your other apps do not use leaves their allowance alone. A separate Google project (separate key) would separate them completely.
- **Not tested against the real Gemini service**, because that needs your key. The function is tested against a fake Google and the real database logic. Use Settings, AI estimates, Check to confirm your setup.

### Trends colours (version 2.1)

- **Green, yellow, red** colour the numbers in Day by day and the bars in the Daily trend chart. A legend sits above the table, and a one-line explanation of the thresholds under the chart (it follows your Settings).
- **My thresholds (not from the nutritionist's plan; easy to change):** calories green within the calorie band (±10%), yellow within twice the band, red beyond; protein green at the "protein hit" mark (120 g), yellow from 80% of the protein target, red below; fat green at or under the limit, yellow up to 15% over, red beyond; fibre green at the target, yellow from 80% of it, red below. Carbs have no target, so they are never coloured and their chart bars are plain grey.
- **Markers instead of chips:** the old status chips under each day are gone so the columns line up. An orange dot after the date means an off-plan entry that day, and `*` means some carbs, fat or fibre values were missing (counted as 0).
- **Month chart:** one bar per finished day; today and future days have no bar, consistent with the other Trends numbers.

### Diary and Add food (version 3)

- **Why the change:** the old Today screen only showed today, past days were only visible as totals in Trends, and manual entry sat at the bottom of a long Log screen. The Diary makes any day browsable item by item, and Add food puts every way of adding one tap apart.
- **Day review rules (mine, in `dayReview` in `js/calc.js`, tested):** a note per target, worst first. Calories over the band list the 3 biggest calorie items. Protein short lists "calories that brought little protein" (items of 150 kcal or more with under 2.5 g protein per 100 kcal), or, if there are none, where the protein did come from. Fat over the limit lists the 3 biggest fat sources. Off-plan items are listed by calories. Percentages are shares of the day's total for that nutrient.
- **Colours on a day in progress:** protein and fibre below target are not shown red on today, only on finished days; fat and calories over are shown at once.
- **Look:** mint accent on graphite (dark) or warm off-white (light) instead of the iOS blue; one colour per nutrient used consistently in the ring, tiles, review and breakdowns.
- **Carbs** have no target, so their tile has no bar and they get no review note.
- **Week and Month use complete days only.** Today is shown separately as "in progress" on Week. For Month I applied the same rule (my choice; the brief only states it for Week): today is not counted in the week-by-week table or averages, but today's off-plan entries do appear in the Off-plan list. "Days logged" is shown as X/Y where Y is the number of finished days in that period.
- **Month weeks** run Monday to Sunday, clipped to the month, and are labelled by date range. The Total row's averages are over all logged days, not an average of the weekly averages.
- **Calorie band edges.** "Within ±10%" is exact: 1,833.3 to 2,240.7 kcal, so a day of 1,833 kcal is just outside and 2,240 is just inside. The brief rounds this to 1,833 to 2,241.
- **Treats are gone.** They came from the plan menu, which was removed, so the scorecards no longer have a Treats column.
- **Quick log** (tap any item) has meal, quantity (×0.5, ×1, ×1.5, ×2) and an optional note. Quantity scales all values (unknown stays unknown) and adds a suffix such as "×1.5" to the name; usage counts treat "Banana ×2" as "Banana".
- **Parser details.** A line with no `|` that matches nothing gets "needs kcal and protein"; nutrients but no dish name gets "needs a dish name"; a nutrient given twice keeps the first with a note; shortcuts also work with an explicit slot (`Snack | coffee`); a saved item called Kenko (or with the shortcut word `kenko`) wins over the built-in Kenko values; values round to 1 decimal place.
- **Kenko is an ordinary item.** The first time a device connects, a "Kenko meal" item (shortcut word `kenko`, starred) is created in My Items from the Kenko values in Settings at that moment, so values you already edited carry over. Edit it in My Items like any other item. Older entries that were logged with the old Kenko button keep working.
- **Time and dates.** New entries get the phone's current time even when backfilling. No future dates: the pickers stop at today.
- **Sync rules.** Queued writes are merged per entry id before sending (latest edit wins); if a batch is rejected, entries are retried one by one so a single bad entry cannot block the rest; the database ignores an incoming update that is older than what it holds. Retries run on app open, focus, coming back online, after each entry, and every 30 s while something is waiting. A wrong token, key or URL keeps the queue and shows "Database problem, see Settings" with the reason there.
- **Demo mode** keeps its own storage, separate from live data and the queue, with a "Reset sample data" button.
- **CSV export** asks the database for the chosen range when online, and falls back to the 120-day phone cache (it says which). Deleted entries are left out.
- **Not covered by my tests:** the real Supabase service and a real iPhone. The database logic is tested on real PostgreSQL, and the app is tested in a phone-sized Chromium against that database through a stand-in for Supabase's web interface.
