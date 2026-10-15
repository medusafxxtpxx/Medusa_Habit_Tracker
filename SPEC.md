# Habit Tracker (working title) — SPEC

This file is the single source of truth. At the start of every session: read this file first, then read any source file before editing it. If a decision changes, update this file in the same session (see "Decisions log" and "Status" at the bottom).

---

## 1. What this is

A small, personal, single-user habit tracker with some spice (goth-pinup look, dark only). It replaces the old Medusa RPG app, which grew too big and full of one-off cards.

Core idea: **every habit and check-in is the same thing**, configured by the same edit form. Nothing is custom per habit. Adding a new habit or graph never needs new code.

Only two screens matter: the **habits page** (daily use) and the **stats page** (occasional graph checks).

## 2. Scope

**In v1:** habits page, one unified edit form, completion rules, streaks, add-as-you-go entries, goal history, stats graphs (configurable, reorderable), palette picker.

**Out (do not build, do not reintroduce, unless the user asks):** Cruella / AI character, stretch tab, day tracker / fault log, exercises, body measurements, photos / gallery / compare, calendar view, correlation insights, share cards, capture/PNG export, goals/RPG tab, drink types or water bottle visual, sleep bed/wake times or quality, checklists, rating labels, combo graphs, XP/rewards, light mode, Apple Health/Google Fit.

## 3. Stack and environment

- Vite + React 18 + Supabase (supabase-js) + Netlify + GitHub. No auth (single user, anon key).
- Recommended: a **new Supabase project** and a new repo/Netlify site so the old app stays live until switch-over.
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (also set in Netlify).
- Dev: `npm run dev` (localhost:5173), `npm run build`, `npm run preview`.
- Charts are hand-rolled SVG (see section 9). No chart library.

Carry over from the old app, copying verbatim unless noted: `dateUtils.js` (4am day boundary), `palettes.js`, `global.css` (trim to what's used), `supabaseClient.js`.

Notes on the carry-over: in `dateUtils.js` keep the logic untouched but rename `isQuestDueOnDate` / `isQuestDueToday` to `isHabitDueOnDate` / `isHabitDueToday` (they only read `schedule_type` and `schedule_days`, same as our `habits` table) and trim the old Cruella/quest comments. In `palettes.js` update the comment to say the palette is saved in `app_prefs.palette`. In `global.css` drop the tab-visibility, tab-order, and default-tab-picker styles; keep variables, reset, nav, settings sheet + palette swatches, card, input, buttons, progress bar, pill, loading/error states.

## 4. Working rules (for Claude)

- Always deliver complete final files via the file tool, never code blocks in chat, never patches/diffs. Label which file each one is.
- List SQL migrations first, in deploy order. Order: Supabase SQL, then local files, then test locally, then one push to GitHub. Wait for the user's local test confirmation before suggesting `git push`.
- Read the relevant existing files before writing code. Match existing component and CSS patterns. Do not guess class names or column names.
- Discuss and mock up anything non-trivial before building. Confirm scope first.
- Dark mode only. Never add a light mode.
- The user is a beginner developer. Keep explanations short and concrete, keep files readable, keep comments useful (why, not what).

## 5. Design system

Reuse the old palette system. CSS variables (default "rose"):

```
--bg #170d12   --bg-card #241620   --bg-input #1d1219   --bg-deep #120a0e
--border #3d2430   --accent #f78fb3   --accent-dim #c98aa3   --accent-muted #a87b8f
--text #f3d9e3   --text-sub #a87b8f   --text-label #c98aa3   --gold #c8a96a
--radius-card 16px  --radius-btn 12px  --radius-pill 6px  --radius-input 10px
--font-body Poppins   --font-heading Cinzel
```

- Tappable option chips (single-select rows): `border-radius: var(--radius-input)`.
- Header/action buttons and small badges: `border-radius: var(--radius-pill)`.
- Graph status colors (hardcoded): green `#639922`, amber `#e0a83f`, red `#e0567e`. Goal line gold `#c8a96a`, dashed.
- Max content width 480px, centered. Mobile first.
- Palettes (rose, sage, slate, amber) are chosen in a small settings sheet and saved in `app_prefs.palette`.

## 6. Data model (SQL is in `01_schema.sql`)

Single user, no `user_id`. Four tables plus one prefs row.

**habits** — one row per habit/check-in; every setting from the edit form lives here.

| column | meaning |
|---|---|
| name, emoji, section, order_index, active | basics. `section` is free text (e.g. "morning", "daily essentials"); no reserved sections |
| input_type | `checkbox`, `number`, `add_up`, `log_time` (section 7) |
| unit, unit_format | `unit` is display text (reps, ml, h, s). `unit_format`: `plain`, `h_m`, `m_s` |
| quick_picks | numeric[] of one-tap amounts for add_up (e.g. 3, 5, 10) |
| completion_rule | `manual` (default), `open`, `any_entry`, `hit_goal` (section 8) |
| coloring | `none` or `graded` |
| schedule_type, schedule_days | `daily` or `specific_days` with `['mon','wed',...]` |
| streak_start_date, streak_override_set_date | optional backdated streak (section 8) |
| show_period | extra line on the habit row: days done `none`, `week`, `month`, or `all` (section 9) |
| show_in_stats, stats_order | whether it has a graph, and pill order |
| graph_type | `bar` or `line` |
| graph_agg | what each day shows: `total`, `best`, `average`, `count`, `latest` |
| graph_goal_line | boolean, show dashed goal line |
| graph_flip | boolean, default false. Manual "lower numbers on top" switch: on puts 0 at the top so lower values sit higher. Never automatic |

**habit_goals** — goal history. One row per change: `habit_id, effective_from, direction (at_least | at_most | none), value`. A day uses the row with the greatest `effective_from <= day`. A goal set at habit creation gets `effective_from = '1970-01-01'` so it covers all days. Changing a goal inserts/upserts a row dated today; past days keep the goal that was active then.

**entries** — every logged value: `habit_id, log_date, entry_time, value`. Checkbox habits do not write entries. `log_time` writes one entry whose `entry_time` is the logged time (value 1).

**day_status** — `habit_id, log_date, completed`. The app recomputes this after every entry add/remove/edit and every checkbox toggle. Streaks read only this table. Open habits never get `completed = true`.

**app_prefs** — single row (id = 1): `palette`.

## 7. Input types

Values are stored in base units: hours as decimal hours (`h_m`), seconds (`m_s`), otherwise the plain number.

| input_type | behavior |
|---|---|
| checkbox | tap to toggle done. Writes `day_status` only. No unit, goal, graph aggregation; graph is a done-days grid. Completion rule is ignored (the tick is the completion) |
| number | one value per day. Saving **replaces** that day's entries with a single entry. For "enter the day's total" things: sleep hours, screen time |
| add_up | each add is its own timestamped entry; day total is the sum. Shows chips like `9:14 am · 3` with an x to remove one. Input plus add button, quick-pick chips, repeat-last chip. For pull-ups, dead hang, water |
| log_time | tap to log "now" (editable time). For meals: breakfast, lunch, dinner are three separate habits in a "meals" section. Phase 4 |

## 8. Behavior rules

**Completion rule** (per habit, same field everywhere). Nothing auto-completes unless the user picks an auto option for that habit:
- `manual` (**default for every habit**) — only the user's tick completes it. Logging numbers never completes it; the tick is a separate tap. A manual tick stays until the user unticks it, even if entries are later removed.
- `any_entry` — the first entry of the day completes it. (Meals use this: logging the time is the tap.)
- `hit_goal` — completes when the day's total meets the goal for that day (the sum of entries for add_up, the single value for number). This is always the sum, regardless of the graph's "each day shows" setting. Requires a goal; disable this option in the form if there is no goal. **Disable it when the goal direction is `at_most`** (an empty day would trivially pass); use `manual` or `any_entry` instead.
- `open` — no tick at all. Logging only. No streak, not counted in "x of y done". For mood-style logs.
- Only `any_entry` and `hit_goal` habits recompute `day_status` when entries change (removing an entry that drops the day below the goal un-completes it). `manual` habits only change `day_status` when ticked or unticked.
- The goal never completes anything by itself under `manual`; it still drives the progress bar, the graph goal line, and graded colors.

**Streaks**
- Count consecutive *due* days with `day_status.completed = true`, walking back from today.
- Today not yet completed does not break the streak. A due day without completion breaks it. Days a habit is not scheduled are skipped.
- Open habits show no streak.
- Optional backdate: `streak_start_date` shows days-since-that-date as the streak. It clears itself (both columns) the first time a due day is missed *after* `streak_override_set_date` (not after the backdated date itself). Port `daysSinceDate` and `isStreakOverrideBroken` from the old `dateUtils.js`.
- Fetch history with paging (`.range()`, ordered by `log_date` desc). Supabase returns at most 1000 rows per request and an unordered fetch silently drops recent days. Put this in one shared function; never copy it per screen.

**Day boundary:** the day rolls over at 4am, not midnight. Always use `getTodayDateString()` / `getEffectiveNow()` from `dateUtils.js`. Never write local date logic.

**Coloring** (when `coloring = graded` and the day has a goal):
- `at_least`: value >= goal green; >= 60% of goal amber; else red.
- `at_most`: value <= goal green; <= 150% of goal amber; else red.
- Days with no active goal use the plain accent color and are excluded from hit rate.
- "Lower is better" is expressed by the goal direction, not a separate coloring mode.

**Goal editing:** in the habit's edit form only (optionally also tap-to-edit on the graph's goal label, which writes the same `habit_goals` row). Never keep a second copy of the goal.

**Never look habits up by name.** Always by id. Renaming a habit must not break anything.

## 9. Screens

### Habits page (default screen)
- Header "today's habits", "x of y done" (counts only active, due, non-open habits), edit button.
- Habits grouped by `section`, each group collapsible with "x of y done". Collapsed state is remembered in localStorage. A group auto-collapses when it becomes fully done.
- One `HabitRow` component renders every habit by `input_type`. No per-habit components.
- Row shows: emoji, name, streak badge (only for non-open habits), progress text (`total / goal unit`, e.g. `1,400 / 2,000 ml` or `10 / 20 reps`; the unit is optional text the user sets per habit, and blank means plain numbers) and a progress bar when there is a goal, and the tick. If `show_period` is set, one muted line shows the streak plus **days done** for that period (e.g. `streak 5 · 18 days this month`), for every habit type. The `show_period` line only ever shows days done, never period totals; totals of reps, ml, and hours live on the Stats page. Days done counts due days with `day_status.completed = true`.
- Edit mode: all habits including inactive, reorder with up/down within a group (renumber the whole group on every move so ties cannot occur), pencil to open the edit form, "add habit" at the top.

### Edit form (identical for every habit)
Fields in this order: name + emoji, group, how do you log it (input_type), unit + format, quick-picks (add_up only), goal (direction + value), how does it get completed (completion rule: I tick it / any entry / hits the goal / never), coloring, also show on the habit page (days done: none / this week / this month / all time), schedule (daily / specific days), backdate streak, show in stats (+ graph settings: chart type, each day shows, goal line, lower numbers on top), active, delete.
Fields that don't apply to the chosen input type are hidden, never replaced by different fields.

### Stats page
- Title, "edit pills" button, a row of pills (one per habit with `show_in_stats`, ordered by `stats_order`), "add graph" pill.
- Edit pills mode: left/right arrows to reorder, x to remove from stats (sets `show_in_stats = false`; data is kept). "Add graph" lists habits not on stats.
- One graph at a time. Range chips: 7 / 14 / 30 days. Tiles: hit rate (or logged days if no goal), best day, today. Headline average. Also shows days done this month, best streak ever, and for number/add_up habits the total for the month (this is where amounts like reps live).
- "Customize this graph" panel: chart type, each day shows, goal line on/off, lower numbers on top on/off. Goal and its direction are *not* editable here (edit form owns them).
- Checkbox habits show a grid of done days, done rate, and streak instead.
- Every graph shows its unit on the axis ticks, the goal label, the tiles, and the headline. `m_s` values over 60s display as m:ss.
- **Lower numbers on top (`graph_flip`, "up is always good"):** a manual per-graph switch, off by default for every habit and never turned on automatically. When on, 0 is at the top and the axis runs downward, for both bars (hang from the top) and lines, so a lower value sits higher and "going up" always means better. Real numbers stay on the axis labels. Goal line and colors are unchanged.
- The goal line follows goal history: it steps where the goal changed; each day is judged against its own goal.
- Chart is hand-rolled SVG: `viewBox` about 400x150, three y gridlines, dashed gold goal line with label, bars or line with dots, x labels thinned to about 8. Match the approved mockup behavior.

## 10. Planned file structure (src/)

```
main.jsx
App.jsx                  two tabs (habits, stats) + settings sheet
supabaseClient.js
dateUtils.js             copied from old app
palettes.js              copied from old app
global.css               trimmed from old app
habits/HabitsPage.jsx
habits/HabitRow.jsx      one component, switches on input_type
habits/HabitEditForm.jsx
stats/StatsPage.jsx
stats/HabitGraph.jsx
lib/completion.js        recompute day_status for a habit/day
lib/streaks.js           streak calc + shared paged history fetch
lib/goals.js             goalForDate(habitGoals, date)
lib/format.js            unit formatting (plain, h_m, m_s)
```

## 11. Build phases

1. **Foundation** — new Supabase project + `01_schema.sql`, repo, habits page, edit form, checkbox / number / add_up, basic done state.
   *Check:* create, edit, reorder, and delete a habit; log 3 then 7 on an add_up habit and see 10; remove the 3 and see 7.
2. **Rules** — completion rules, `day_status` recompute, streaks, goal history, backdated streaks.
   *Check:* open habit never completes; hit_goal completes at the goal and un-completes when an entry is removed; changing a goal does not change past days.
3. **Stats** — pills (reorder/add/remove), graphs, customize panel, lower-numbers-on-top switch, units, yes/no grid.
   *Check:* turn on "lower numbers on top" for screen time (at_most) and see 0 move to the top; units on every label; goal line steps after a goal change; mood graph shows the daily average.
4. **Polish** — `log_time` for meals, `m_s` / `h_m` formats, palette sheet, anything found after a few days of real use.

## 12. Initial habits the user expects to create (via the edit form, not seeded)

| Habit | input_type | unit | goal | completion | graph |
|---|---|---|---|---|---|
| yes/no habits | checkbox | | | | done grid |
| pull-ups | add_up | reps | at_least 20 | manual | bar, total |
| dead hang | add_up | m_s | at_least 60s | manual | bar, best |
| sleep | number | h (h_m) | at_least 8 | manual | line, latest, graded |
| water | add_up | ml | at_least 2000 | manual | bar, total |
| breakfast / lunch / dinner | log_time | | | any_entry | time of day |
| screen time | number | h (h_m) | at_most 3 | manual | line, latest, graded, lower numbers on top (switched on by the user) |
| mood | add_up | /5 | none | open | line, average. Quick-picks 1, 2, 3, 4, 5. Logged several times a day; created by the user |

The user may start with just a few and add the rest slowly.

## 13. Lessons carried over from the old app

- New Supabase tables need RLS enabled with a policy for the anon role, or inserts fail silently. `01_schema.sql` includes this. (Single-user, open policy: anyone with the site's anon key could read or write the data. That is the same as the old app; revisit if it ever holds anything sensitive.)
- `upsert(..., { onConflict })` only works if a matching unique constraint exists. The schema defines them.
- Supabase's default 1000-row cap silently truncates unordered/unpaged queries.
- Do not duplicate shared logic across screens (the day-boundary bug and the streak bug both came from local copies).
- Surface save errors to the user (a small message), never swallow them.

## 14. Decisions log

- Hard reset: full wipe, new app, old app stays live until switch-over.
- One unified habit model replaces habits, check-ins, and special cards.
- Water is plain total ml (no drink types). Sleep is plain hours (no times or quality).
- Streaks continue only on completed days; open habits have no streak.
- Un-completing: removing an entry below the goal un-completes.
- Goal history: past days use the goal active at the time.
- Lower-is-better graphs: a manual per-graph "lower numbers on top" switch (`graph_flip`, default off, never automatic) so up is always good; bars hang from the top.
- One graph at a time; no combo charts.
- Photos and body measurements are out of the new app.
- Nothing auto-completes by default: every habit uses a manual tick unless the user picks "any entry" or "hits the goal" for that habit; `open` habits have no tick.
- Habit rows show streak plus days done for a chosen period (`show_period`); amounts live on Stats.
- "Days without" habits (no sugar, no booze) are ticked daily like any checkbox habit. No log-slips type.
- Everything is uniform and manual: the user creates every habit herself (mood included) in the edit form; nothing is seeded or special-cased, and no setting changes automatically based on another.
- Habit row progress reads `1,400 / 2,000 ml` or `10 / 20 reps`; the unit is optional per-habit text.
- Mood is a normal add_up habit (open, quick-picks 1-5, graph average). The axis scales from the data; no special case for mood.

## 15. Status (update every session)

- [x] Scope, data model, screens, rules agreed; mockups of habits page, edit form, and stats page approved in chat.
- [x] Revised after review: manual tick is the default completion rule; `show_period` added; SQL updated to match.
- [x] Flip axis made manual (`graph_flip` boolean, default false); schema updated before first run. Mood, row progress text, and carry-over notes settled.
- [ ] Supabase project created; `01_schema.sql` run
- [ ] Phase 1: foundation
- [ ] Phase 2: rules
- [ ] Phase 3: stats
- [ ] Phase 4: polish
