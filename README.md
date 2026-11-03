# Plate Log

A small personal calorie and macro logger for one person, used on a phone.

Most meals arrive as a single line of text that another AI (Gemini, ChatGPT or Claude) writes after you send it a food photo. You paste that line into Plate Log. The app parses it with plain code, stores it in your own Google Sheet, and shows today's numbers, the last 7 days and the month against your targets. It is tuned to a nutritionist's plan: a pre-made "Kenko" dinner box most days, plus fixed plan options for the other meals.

**There is no AI or LLM in the app and no API key anywhere.** Parsing is a pure function in `js/parser.js`.

## How it works

- **Frontend:** a static site in plain HTML, CSS and JavaScript (ES modules). No framework, no build step, no runtime dependencies.
- **Hosting:** GitHub Pages, deployed by `.github/workflows/pages.yml` on every push to `main` (the workflow runs `node --test` first).
- **Database:** your Google Sheet, reached through a Google Apps Script web app (`apps-script/Code.gs`) that you paste in and deploy yourself.
- **Auth:** a shared secret token. The Apps Script checks it on every request. The Apps Script URL and the token are typed into the app's Settings screen and live only in the phone's localStorage. They are never committed.
- **Never lose an entry:** every write goes to a local pending queue first, then to the Sheet. The screens render instantly from a local cache of the last 120 days and refresh from the Sheet. The chip in the header shows "Saved", "2 waiting to sync" or "Can't reach Sheet, will retry". Writes are upserts by a client-generated id, so a retried request never makes a duplicate row.
- **Demo mode:** with no Apps Script URL set, the app shows a labelled sample week and keeps anything you add on the phone only. Nothing in Demo mode is ever sent to the Sheet.

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
node --test            # parser, day logic and Apps Script tests, no dependencies
python3 -m http.server # then open http://localhost:8000
node tools/make-icons.mjs   # regenerate the PNG icons
```

## Decisions

Where the brief was ambiguous I picked the simplest option. Say if you want any of these changed.

- **Where "deploy on push to main" meets this branch.** The workflow triggers on pushes to `main`, and this work was committed to the branch `claude/kind-euler-f0d442`. Nothing deploys until it is merged to `main` (or the workflow is run by hand via `workflow_dispatch`). I did not open a pull request or touch `main`.
- **Live URL.** `https://pratyush-ctrl-alt.github.io/calorie-tracker/`, derived from the repo name. All asset paths are relative, so it works under that sub-path.
- **Tests run before deploy.** The Pages workflow runs `node --test` and only deploys if it passes. A root `package.json` (no dependencies, `"type": "module"`) exists only so Node treats `js/*.js` as ES modules.
- **Today's remaining numbers.** Calories follow the spec ("Left today: X kcal" / "Over by X kcal"). For protein, once the target is passed I show "protein target met" rather than "Over by X g", since exceeding protein is not a problem. When calories are over but protein is not yet reached it reads "Over by 120 kcal · 52 g protein left".
- **Carbs on Today** is a grams-only row with no bar, since there is no carbs target.
- **Week and Month use complete days only.** Today is shown separately as "in progress" on Week. For Month I applied the same rule (my choice; the brief only states it for Week): today is not counted in the week-by-week table or averages, but today's off-plan entries do appear in the Off-plan list. "Days logged" is shown as X/Y where Y is the number of finished days in that period.
- **Month weeks** run Monday to Sunday, clipped to the month, and are labelled by date range (the 1st may be a short week). The Total row's averages are over all logged days, not an average of the weekly averages.
- **Calorie band edges.** "Within ±10%" is inclusive on exact arithmetic: 1,833.3 to 2,240.7 kcal, so a day of 1,833 kcal is just outside and 2,240 is just inside. The brief rounds this to 1,833 to 2,241.
- **Treats** counts entries whose group is Treat or Ice cream, one per entry regardless of quantity. Entries logged by typing a plan option's name or from the Plan menu carry the group; hand-typed lines do not.
- **Quantity chips** scale all values (unknown stays unknown) and add a suffix such as "×1.5" to the name.
- **Parser details.**
  - A line with no `|` that matches nothing gets the error "needs kcal and protein".
  - A line with nutrients but no dish name gets "needs a dish name".
  - If a nutrient appears twice the first one wins and a note is shown.
  - Shortcuts also work with an explicit slot (`Snack | coffee`). Saved items take priority over plan-menu names, and the word `kenko` always means the Kenko meal.
  - Values are rounded to 1 decimal place.
- **Kenko.** Logged as the name "Kenko meal" with source `kenko`, on_plan TRUE; the optional note goes into the `note` column. On Sundays the card starts collapsed. If one is already logged today the card shows "logged" with Undo (a soft delete).
- **Time column.** New entries get the phone's current time even when backfilling an earlier date.
- **Dates.** No future dates: the date pickers stop at today, and the 120-day cache fetches up to today.
- **Sync rules.**
  - Queued writes are merged per entry id before sending (latest edit wins). If a batch is rejected, entries are retried one by one so a single bad entry cannot block the rest.
  - The Sheet ignores an incoming update that is older than what it already holds.
  - Retries run on app open, focus, coming back online, after each entry, and every 30 s while something is waiting. Tapping the chip syncs now.
  - A bad token or a Sheet-side error keeps the queue and shows "Sheet problem, see Settings" with the reason there. This is a fourth chip state beyond the three you listed.
  - Refresh never overwrites an entry that still has unsynced local edits.
- **Demo mode** keeps its own storage (`plate.demo`), separate from live data and the queue, with a "Reset sample data" button. Switching to live later does not move or send any demo entries.
- **Sheet formats.** `Log` columns for date, time, text and timestamps are set to plain text so Google Sheets does not turn them into Date values. Blank macro cells mean unknown.
- **Settings not in the brief.** "Restore defaults" buttons on the Targets and Kenko cards, an "Add item" button in Manage saved items (the brief only lists edit/delete), and a "Sync now" button with last-sync time.
- **CSV export** asks the Sheet for the chosen range when online, and falls back to the 120-day phone cache (it says which). Deleted entries are left out. In Demo mode it exports the demo data.
- **Apps Script** has an extra `setup()` function you can Run once to authorise and create the tabs, and caps one upsert request at 200 entries.
- **Icons** are generated by `tools/make-icons.mjs` (a white plate on the app green); replace them freely.
- **Tests beyond the ten parser cases you listed:** day logic, README prompt matches the in-app prompt, and `Code.gs` run against a fake Sheets API (token check, idempotent upsert, list, items, settings).
- **Not covered:** I could not run `Code.gs` on real Google Apps Script or test on a real iPhone from this environment. The browser checks used Chromium at 390 px with a mocked Apps Script.
