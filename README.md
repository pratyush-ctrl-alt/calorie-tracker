# Plate Log

A small personal calorie and macro logger for one person, used on a phone.

Most meals arrive as a single line of text that another AI (Gemini, ChatGPT or Claude) writes after you send it a food photo. You paste that line into Plate Log. The app parses it with plain code, stores it in your own Supabase database, and shows today's numbers, the last 7 days and the month against your targets. It is tuned to a nutritionist's plan: a pre-made "Kenko" dinner box most days, plus fixed plan options for the other meals.

**There is no AI or LLM in the app and no AI API key anywhere.** Parsing is a pure function in `js/parser.js`.

## How it works

- **Frontend:** a static site in plain HTML, CSS and JavaScript (ES modules). No framework, no build step, no runtime dependencies.
- **Hosting:** Netlify, which redeploys automatically whenever `main` changes (`netlify.toml`).
- **Database:** Supabase (Postgres). `supabase/schema.sql` creates everything; you paste it into Supabase once.
- **Auth:** a shared secret token. The tables are completely locked; the only way in is a handful of `plate_*` database functions, and each one checks your token first. So the public Supabase key on its own can read and write nothing. The project URL, public key and token are typed into the app's Settings screen and live only in the phone's localStorage. They are never committed.
- **Never lose an entry:** every write goes to a local pending queue first, then to the database. The screens render instantly from a local cache of the last 120 days and refresh from the database. The chip in the header shows "Saved", "2 waiting to sync" or "Can't reach database, will retry". Writes are upserts by a client-generated id, so a retried request never makes a duplicate row.
- **Demo mode:** with no project URL set, the app shows a labelled sample week and keeps anything you add on the phone only. Nothing in Demo mode is ever sent to the database.

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
- **Netlify instead of GitHub Pages.** `netlify.toml` tells Netlify what to publish. The old GitHub Pages workflow is gone; `.github/workflows/test.yml` only runs the tests.
- **Work goes straight to `main`** (at your request). A pull request is optional for a one-person project.
- **Wording:** the sync chip now says "Can't reach database, will retry" and "Database problem, see Settings" (it said "Sheet" before).
- **Free plan pause rule.** Supabase pauses free projects after about a week with no activity. Entries wait safely on the phone while paused (they sync after you restore the project). Opening the app at least weekly avoids the pause.
- **Backups.** Use Settings, Download CSV now and then; do not rely on the free plan for backups.
- **Old setup dropped.** If a phone still holds an old Apps Script URL, the app ignores it and starts in Demo mode.

### Behaviour

- **Today's remaining numbers.** Calories follow the spec ("Left today: X kcal" / "Over by X kcal"). For protein, once the target is passed I show "protein target met" rather than "Over by X g", since exceeding protein is not a problem. When calories are over but protein is not yet reached it reads "Over by 120 kcal · 52 g protein left".
- **Carbs on Today** is a grams-only row with no bar, since there is no carbs target.
- **Week and Month use complete days only.** Today is shown separately as "in progress" on Week. For Month I applied the same rule (my choice; the brief only states it for Week): today is not counted in the week-by-week table or averages, but today's off-plan entries do appear in the Off-plan list. "Days logged" is shown as X/Y where Y is the number of finished days in that period.
- **Month weeks** run Monday to Sunday, clipped to the month, and are labelled by date range. The Total row's averages are over all logged days, not an average of the weekly averages.
- **Calorie band edges.** "Within ±10%" is exact: 1,833.3 to 2,240.7 kcal, so a day of 1,833 kcal is just outside and 2,240 is just inside. The brief rounds this to 1,833 to 2,241.
- **Treats** counts entries whose group is Treat or Ice cream, one per entry regardless of quantity. Entries logged by typing a plan option's name or from the Plan menu carry the group; hand-typed lines do not.
- **Quantity chips** scale all values (unknown stays unknown) and add a suffix such as "×1.5" to the name.
- **Parser details.** A line with no `|` that matches nothing gets "needs kcal and protein"; nutrients but no dish name gets "needs a dish name"; a nutrient given twice keeps the first with a note; shortcuts also work with an explicit slot (`Snack | coffee`); saved items beat plan-menu names and `kenko` always means the Kenko meal; values round to 1 decimal place.
- **Kenko.** Logged as "Kenko meal" with source `kenko`, on_plan TRUE; the optional note goes into the `note` column. On Sundays the card starts collapsed. If one is already logged today the card shows "logged" with Undo (a soft delete).
- **Time and dates.** New entries get the phone's current time even when backfilling. No future dates: the pickers stop at today.
- **Sync rules.** Queued writes are merged per entry id before sending (latest edit wins); if a batch is rejected, entries are retried one by one so a single bad entry cannot block the rest; the database ignores an incoming update that is older than what it holds. Retries run on app open, focus, coming back online, after each entry, and every 30 s while something is waiting. A wrong token, key or URL keeps the queue and shows "Database problem, see Settings" with the reason there.
- **Demo mode** keeps its own storage, separate from live data and the queue, with a "Reset sample data" button.
- **CSV export** asks the database for the chosen range when online, and falls back to the 120-day phone cache (it says which). Deleted entries are left out.
- **Not covered by my tests:** the real Supabase service and a real iPhone. The database logic is tested on real PostgreSQL, and the app is tested in a phone-sized Chromium against that database through a stand-in for Supabase's web interface.
