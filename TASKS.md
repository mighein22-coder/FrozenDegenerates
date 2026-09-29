# Tasks

Working task list for IcePick. `CLAUDE.md` asks every session to read this
before starting and to mark items done as they land.

Status docs: this file plus `ASSESSMENT.md` (findings and their severity).
Operational detail lives in `docs/OPERATIONS.md`.

---

## In progress

- [ ] **Preseason scoring dry run (Saturday 2026-09-26).** Runs the full cycle
      against the production database a week before it counts, using the 14
      preseason games on 9/26. No code change needed — the schedule fetch and
      the scoring pass don't filter by game type.
      - Before noon ET Saturday: log in (the first login seeds
        `week-2026-09-26` and its games) and submit a sheet; a second account
        also tests that picks are hidden until the deadline.
      - Noon ET: picks lock and become visible in the League Matrix.
      - From ~5:30 PM ET: `scheduled-sync` should score finals with nobody
        signed in (Netlify → Logs → Functions → `scheduled-sync`). Run the
        mismatch query below; it should return zero rows.
      - By Sunday 4:00 AM ET: the week flips COMPLETED on its own.

      Expected oddities, not bugs: points count toward the Season table but no
      segment table (9/26 is before `SEASON_START`); team records show last
      season's finals (`standings/now` still points at April); MTL and OTT play
      each other twice (split squads), as two separate games.

      ```sql
      select p.id, g.away_team_id || ' @ ' || g.home_team_id as game,
             g.away_score, g.home_score, p.selected_team_id, p.confidence,
             p.result, p.points_earned
      from picks p join games g on g.id = p.game_id
      where p.week_id = 'week-2026-09-26' and g.status = 'FINAL'
        and (p.result = 'PENDING'
             or p.points_earned <> case
                  when (g.home_score > g.away_score and p.selected_team_id = g.home_team_id)
                    or (g.away_score > g.home_score and p.selected_team_id = g.away_team_id)
                  then p.confidence else 0 end);
      ```

- [ ] **Remove the dry-run data (Monday 2026-09-28, after 6:00 AM ET).** Not
      before 6:00 AM: until then `getTargetSaturdayDate()` still targets 9/26,
      and the next login would recreate the week and re-fetch its games. This
      leaves `week-2026-10-03` alone if someone has already seeded it. The same
      timing applies to a full reset.

      ```sql
      delete from picks where week_id = 'week-2026-09-26';
      delete from games where week_id = 'week-2026-09-26';
      delete from weeks where id    = 'week-2026-09-26';
      ```

- [ ] **Watch the first live Saturday (2026-10-10).** The scheduled sync has
      never run against a real played week — the season had not started when it
      landed. Check Netlify → Logs → Functions → `scheduled-sync` that evening:
      idle runs should say `No weeks need syncing`, and runs after the first
      final should report games updated and picks resolved. Confirm the week
      flips COMPLETED on its own after 4:00 AM ET Sunday.

- [x] **Pick submission was broken, and is fixed** (ASSESSMENT #28).
      `save_picks` passed `e->>'gameId'` — text — into a uuid column, so every
      call raised and no member could submit a sheet. Broken from `0005` on
      2026-08-23 until `0010` on 2026-09-22; nobody hit it because the season
      had not started. Verified by submitting a sheet from the Picks view.
      Found by the harness on its first run, not by reading.

- [x] **Policy test harness** — `supabase/test/`: the Supabase fixture (roles,
      `auth.users`, `auth.uid()`, `auth.jwt()`), `run.sh`, and `01_security.sql`
      with 60 assertions covering every hole `0001`–`0009` closes, the `0004`
      deadline regression, and the case that would be worst to get wrong —
      scoring still working on a locked week. Runs green. Needs a Postgres
      server and `psql`, **not Docker**; an earlier note here said Docker and
      was simply wrong.

      Its first run found two defects nobody had read their way to: `save_picks`
      could not insert (ASSESSMENT #28), and re-applying `0002` alone reopened
      self-serve membership — now guarded so a clean replay still opens the
      hole, as history did, while a re-apply is a no-op.

- [x] **`0000` baseline migration.** Started 2026-09-13; `0000_baseline.sql`
      landed 2026-09-14, assembled from a 392-row capture of production and
      committed alongside it as `supabase/baseline/capture-2026-09-14.csv`.
      **Verified by replay 2026-09-21**: `0000`–`0010` apply in order to an
      empty database and 60 assertions pass, on PostgreSQL 17.4. The baseline
      is proven, not just reviewed.

      It has already paid for itself once: the capture is what found that `0004`
      had gone missing from production (ASSESSMENT.md #27), a month after being
      recorded as applied and verified.

## Done

### Standings order (issue #39, 2026-09-27)

Mirrors DegenNFL #22, #23 and #27 (its PR #26).

- [x] **One member order on all three screens.** Points desc → wins desc →
      **losses ascending** → name, in one unexported `compareStandings` in
      `lib/standings.ts`. The Standings table, the Dashboard's top five and the
      League Matrix all render rows in the order `computeStandings` returns
      and none of them sorts for itself. Shared ranks now need points, wins
      *and* losses to match, since a rank shared by two rows the sort just
      separated would be the table contradicting itself.

      Losses only ever separate two members who made a different number of
      picks: a missed week, or a short sheet. When everyone plays five, wins
      descending already implies losses ascending.

      The Dashboard needed no ordering code. It already read the same scope
      the Standings screen opens on. `App.tsx` now takes both from one
      `currentSegment` value, so they cannot drift apart, and
      `dashboard.test.ts` covers the Dashboard shortlist matching the
      Standings table.

- [x] **Order-by pills on the League Matrix**, beside Print matrix: `Week n`
      (default) / `Segment n` / `Full Season`, kept in the URL as
      `?order=`. The rule stays `computeStandings`; only its scope changes.
      Both narrow scopes follow the week selector, so Segment means the
      segment that week falls in. On a week outside every segment (the 9/26
      dry run) the Segment pill is disabled and falls back to the season.
      Logic is in `lib/matrixOrder.ts`, with tests.

      `StandingsScope.segment` became `within: {segment} | {week} | null`.
      Before, `weekId` only chose the weekly *column* and filtered nothing,
      so nothing could scope the order to one week.

      The grid gained a **Pts column** (scope points over W-L, also on the
      mobile cards) so the order explains itself. On paper the pills are
      hidden and the subtitle says the order in words, because two printed
      grids of the same week would otherwise look alike.

      Before any game in a week is final, everyone is 0-0 on Week and rows
      fall back to name order. Other members' picks are unreadable until the
      deadline anyway, and pending picks score nothing.

      Checked against mock data in all three scopes, including a preseason
      week, the mobile cards, light mode and the print layout. Not yet seen
      against real results.

### Printing (issue #40, 2026-09-27)

- [x] **Print buttons on the League Matrix and the Picks sheet.** Both call
      `window.print()`, which opens the normal Windows print dialog (real
      printers and Microsoft Print to PDF). Mirrors DegenNFL #24.
      - Paper always uses the light palette: `printInLightTheme()` in
        `lib/theme.ts` switches `data-theme` on `beforeprint` and restores it on
        `afterprint`. The dark theme would otherwise print near-white text on a
        white sheet.
      - The pick sheet prints as a record: the whole slate, a tick and a pale
        fill on each picked side, confidence as text, "No pick" on games left
        alone, the member's name and print time, and a banner when the sheet
        has unsubmitted changes. A 14-game slate fits one portrait page.
      - The matrix prints the grid on a landscape page (named `@page matrix`
        in `index.html`), with no scroller, no sticky column and no mobile
        card list.
      - Checked with headless Edge print-to-PDF against mock data. Still
        worth one Ctrl+P on each screen with real data before 10/3.

### Cleanup (ASSESSMENT #11–#20 and drift)

- [x] Unify the `Week` shape — `getCurrentWeek()` returned a raw snake_case row
      while `getAllWeeks()` returned camelCase, both typed as `Week`. Renamed the
      DB types to `*Row` and mapped at the service boundary. Cleared 12
      pre-existing typecheck errors that `vite build` never surfaced.
- [x] #16 Standings tiebreaker — points, then wins, then name, with competition
      ranks so tied players share a rank. (Fewest losses was added before the
      name by issue #39.)
- [x] #15 Validate `dateStr` / `weekId` before interpolating into NHL API URLs.
- [x] #12 Batch the N+1 loaders in Team Stats and My History (`.in()` queries).
- [x] #13 Skip `sync-week` for COMPLETED weeks, and stop `getRecentIncompleteWeeks`
      returning them.
- [x] #11 Mobile card layout for the results matrix.
- [x] #14 Dashboard CTA reflects incomplete / submitted / locked.
- [x] Remove the dead `/index.css` link (404 on every page load).
- [x] #17–#19 Dead code: `sync-scores`, `geminiService`, `fetchRealNhlSchedule`,
      `_ul`, `deno.lock`, six unreferenced service methods, `CURRENT_WEEK_ID`,
      PicksView's unused `weeks` prop, and the `recharts` / `react-hot-toast` /
      `@google/genai` dependencies.
- [x] Rename `gemini-schedule` → `nhl-schedule` (it never used Gemini), keeping a
      re-export alias for one release. The alias was deleted 2026-09-13, once
      seven releases had shipped behind it and nothing in the app referenced it.
- [x] #20 Share the ET helpers with the Netlify functions instead of hand-rolling
      DST in `sync-week`. **This fixed a real bug**: the duplicate built the
      Sunday date by string concatenation, so a month-end Saturday produced an
      invalid date and the week could never close on the time condition.
      2026-10-31 is a Saturday this season.
- [x] Add vitest, with timezone and standings specs (18 tests) and a `typecheck`
      script.

### Features

- [x] Hide other players' picks until the week locks
      (`supabase/migrations/0003_pick_visibility.sql`).
- [x] Enforce the pick deadline in the database
      (`supabase/migrations/0004_enforce_deadline.sql`).
- [x] Season segments — three auto-computed thirds with their own standings,
      selectable alongside the cumulative season table. No schema change.
- [x] URL routing. Views are driven by the URL, so every screen is linkable
      and the back button works. `/auth/callback` is now a real route.
- [x] Allowlist `/auth/callback` in Supabase → Authentication → URL
      Configuration. Done 2026-08-22, and password reset verified end to end
      against the live site. No app change could substitute for this.
- [x] Fix the broken password reset. `LoginView` sent users to
      `/auth/callback`, which nothing handled, so reset links dead-ended with
      no way to choose a new password. `AuthCallbackView` now reads the
      load-time auth snapshot, which has to be taken before supabase-js erases
      the URL fragment.
- [x] Profile / account settings — name, avatar, password. Landed on `main`
      separately while this work was in review, not part of this branch.
- [x] **Light mode** (issue #33). Settings → Appearance offers Dark (default),
      Light and System. Saved per browser in localStorage, not per account, so
      it applies on the login screen and needed no migration. Every Tailwind
      color the app uses now reads a CSS variable set in `index.html`; light
      mode swaps the variables, so no view carries light-specific classes.
      Each shade keeps its dark-mode role (slate-900 = card, slate-400 =
      secondary text, ice-600 = filled button). `text-white` is primary text
      and flips to navy; text on a filled accent button is `text-onaccent`,
      which never flips — use that for any new filled button.
- [x] **Dashboard redesign** (issue #32), modelled on the DegenNFL dashboard.
      Your saved picks for the week, most confident first, each with the game's
      state and what it earned, beside a deadline panel (countdown, then games
      final once locked). Below that is the top 5 of the *current segment*, the
      same scope the Standings screen opens on, with your own row appended if
      you're outside it. The old stat cards are gone. Returning to the
      dashboard refetches picks and games, so scheduled-sync results show up
      without a reload. Pure helpers in `src/lib/dashboard.ts`, 9 tests.
- [x] **Submit Picks only when there is something to submit** (issue #34).
      The button is enabled only for a valid sheet (5 picks, confidences 1–5)
      that differs from the one last saved; undoing an edit disables it again.
      `App.tsx` keeps a `savedPicks` baseline, set on load and after each save,
      and `hasUnsavedPickChanges` in `src/lib/picks.ts` compares by game, team
      and confidence, ignoring order. A clean saved sheet reads "Picks Saved".
      Also disabled while saving, which closes a double-submit window.

---

## Next up

### Needs a decision or an action from the pool admin

- [x] #10 Verify RLS on `weeks` and `games`. ✅ Decided: those writes stay
      client-side but locked down, rather than moving server-side. Seeding a week
      and its schedule is a normal member action, so `0007` and `0008` keep
      member INSERT while narrowing it to the columns the app actually supplies,
      revoke client UPDATE except the admin-gated week `status`, and add trigger
      guards. Moving seeding into a function remains possible later; it is no
      longer a security question.

### Known issues not yet scheduled

- [x] **`savePicks` can lose picks.** ✅ Fixed by
      `supabase/migrations/0005_save_picks_rpc.sql` — `savePicks` now makes one
      `save_picks` RPC call that deletes and inserts in a single transaction, so
      the boundary case `0004` opened can no longer lose a sheet. `0005` applied
      2026-08-23; the partial-sheet audit query in `supabase/README.md` returned
      zero rows, so nothing was lost while the bug was live.
- [x] `VITE_SYNC_WEEK_SECRET` is inlined into the public JS bundle, so the shared
      secret guarding `sync-week` is readable by anyone. ✅ Replaced with a
      Supabase access token the function verifies via `auth.getUser()`. Gated on
      *any* authenticated member rather than an admin role check as first
      planned — scoring runs whenever any member opens the app, so admin-only
      would freeze it. Both env vars deleted from Netlify 2026-08-23.
- [x] **Members can write their own scores** (ASSESSMENT #15). ✅ `points_earned`
      and `result` — the columns the standings are summed from — were writable
      by any member via UPDATE *or* INSERT, and `sync-week` only ever re-scores
      `PENDING` picks, so a forged score stuck for the season. Fixed by
      `supabase/migrations/0006_lock_pick_score_columns.sql`: client UPDATE on
      `picks` revoked outright, INSERT narrowed to the five pick columns, plus a
      trigger guard. `0006` applied 2026-08-23; the two damage-check queries were
      run first and came back clean, so no forged score ever made the standings.
- [x] **Anyone can rewrite game scores** (ASSESSMENT #16). ✅ `games` carried
      `UPDATE using (true)` and `INSERT with check (true)` for role `public` —
      the anon key, so even a logged-out visitor could set `home_score` /
      `away_score` / `status` and move the standings. Fixed by
      `supabase/migrations/0007_lock_game_score_writes.sql`: public policies
      dropped, client UPDATE/DELETE revoked, INSERT narrowed to the six schedule
      columns, plus a trigger guard. `0007` applied 2026-08-23, with the two
      damage-check queries run beforehand.
- [x] **The deadline stopped being enforced in the database** (ASSESSMENT #27).
      ✅ The 2026-09-14 baseline capture found none of `0004`'s three write
      policies in production — `picks` still carried the permissive originals
      `0004` drops by name, so a member could rewrite a sheet over REST after
      the games were final and let `sync-week` score it. The app was never the
      exposure: `save_picks` refuses a late sheet on its own. The August
      verification missed it by counting policies rather than reading them, and
      the count is four in both states. Re-applied 2026-09-21; the damage check
      returned zero rows, so it was never exploited.

- [x] ✅ **`weeks` was writable by any member, which reopened the deadline**
      (ASSESSMENT #18, second half). `picks_revealed()` reads
      `weeks.saturday_date`, and `weeks` carried `UPDATE USING (true)` for
      authenticated plus `INSERT` for `public`. A member could move their own
      deadline with one statement, then re-submit a sheet after the games finished
      and let `sync-week` score it against known results — defeating `0003`–`0006`
      without breaking any of them. Fixed by
      `supabase/migrations/0008_lock_week_deadline_writes.sql`, which derives
      `saturday_date` from the week `id` instead of trusting the client. `0008`
      applied 2026-08-23; the damage-check queries were run first and came back
      clean, so no deadline was ever moved.

### Known issues not yet scheduled (continued)

- [x] **`GameRow` and `PickRow` declared an `updated_at` that does not exist.**
      ✅ Removed 2026-09-22. `src/lib/supabase.ts` typed both with
      `updated_at: string`; the live `games` and `picks` tables have no such
      column — only `profiles` does, and that one is real. Nothing read either
      phantom, so this was a lying type rather than a live bug, but any code
      trusting it would have got `undefined` at runtime with the compiler's
      approval. Both sites now carry a note saying why the field is absent, so
      it does not get helpfully added back. Found by the 2026-09-14 capture.

- [ ] **Four foreign keys are nullable.** `games.week_id`, `picks.user_id`,
      `picks.week_id` and `picks.game_id` all permit NULL. A NULL `user_id`
      makes `auth.uid() = user_id` evaluate to NULL rather than false. Found by
      the 2026-09-14 capture; fixing it is a schema change and wants its own
      migration.

- [ ] **`0007` leaves one policy it should drop.** `"Allow authenticated users
      to update games"` (`using (true) with check (true)`) is still live. It is
      inert only because `0007` revoked the UPDATE grant — re-grant UPDATE on
      `games` for any reason and every member can rewrite scores again, with no
      policy change to notice in review. Found by the 2026-09-14 capture.

- [x] **No `0000` baseline migration.** `profiles`, `weeks`, `games` and `picks`
      were created by hand in the dashboard and no migration creates them, so
      the migrations cannot be replayed onto an empty database. That is what
      blocks porting the NFL app's `supabase/test/run.sh`, which applies every
      migration in order to a throwaway Postgres and then asserts the policies —
      the check that would have caught each of 0006–0009 before production.
      Capturing production's real DDL into an `0000` baseline is the prerequisite.
      Until then `supabase/README.md` carries the same regression check as two
      queries to run in the dashboard.
      **In progress — see the top of this file and `supabase/baseline/`.**

### Planned features

- [x] **Automated score sync on a schedule.** ✅ Landed 2026-09-22.
      `netlify/functions/scheduled-sync.ts` runs every 15 minutes
      (`netlify.toml`), so standings move with nobody signed in.

      The scoring pass moved out of `sync-week`'s handler into
      `_shared/syncWeek.ts`; `sync-week` is now auth + parse + call, and the
      cron calls the same function **in process**. That is the whole security
      design: a cron run has no session and no `profiles` row, so scheduling the
      HTTP endpoint would have meant a second shared secret — ASSESSMENT #3/#26
      all over again. No request, nothing to forge.

      Running flat every 15 minutes rather than pinning a Saturday-night window
      is deliberate: Netlify cron is UTC, the window is Eastern, and a padded
      UTC window is an edge that goes wrong twice a season. `getWeeksToSync`
      returns nothing outside Saturday noon → Sunday 4:00 AM ET, so an
      idle run is one SELECT.

      The on-login / results-view sync is **kept**, as the fallback for a
      disabled schedule, deploy previews and local dev. Weeks are still created
      lazily by the first member to log in — the scheduler scores weeks, it does
      not seed them.

      Verified by running the bundled function against a stub PostgREST and a
      stub NHL API: a stale week went FINAL, three picks resolved, the week
      closed, an already-settled pick was left alone, and a second run was a
      no-op. 18 unit tests cover `getWeeksToSync` across both DST sides.
      Not yet observed against a real played week — the season opens
      2026-10-10 (the 10/3 opening Saturday is outside the segments; no picks).
- [x] Self-serve signup gated by invites. `0009_invites_and_membership.sql`
      plus a signup mode on `LoginView`, `RedeemInviteView`, and an Invites
      section in the Admin Panel. **This was a security fix too**: the pool was
      safe only because email signups were switched off in the Supabase project,
      and 0002's `profiles` INSERT policy meant anyone who got an account could
      make themselves a member. A profile row is now created by `redeem_invite()`
      and nothing else. Also closed `profiles` SELECT, which was `using (true)`
      with no `to` clause — so the anon key in the public bundle could read every
      member's email and role.
- [ ] Email notifications — Friday pick reminder and a post-week results mail.
      (Phase 1D below covers the Friday reminder as a push notification.)

### Mobile app

Two phases. **Phase 1 is an installable PWA; after it ships we pause and get
member feedback before deciding on Phase 2** (Capacitor store apps). The
desktop/laptop layout must not change: every mobile change sits below the `md`
breakpoint.

**Phase 1 — PWA**

*1A. Foundation*
- [x] ✅ Tailwind moved from the CDN `<script>` to build time. Used
      **Tailwind v3 + PostCSS** rather than the planned v4 plugin: the CDN
      served v3, and v4 changes several defaults (border color, ring width,
      shadow scale), which would have shifted the desktop look. Theme config is
      now `src/tailwind.config.js`; the `--c-*` variables, scrollbar and print
      rules are `src/index.css`. The pre-paint theme script stays inline in
      `index.html`.
- [x] ✅ Inter and Teko self-hosted via `@fontsource` (imported in `index.css`).
- [x] ✅ No visual change. Checked the old CDN build against the new one:
      computed styles for all 1,048 class-like tokens in the source match (the
      only difference is a dropped `-webkit-text-decoration-color` vendor
      prefix in `transition-colors`), and the login page's layout, colors and
      fonts are identical at 1366px in both dark and light. All 101
      hover/focus/print/md/lg variant classes are in the bundle, as are the
      `@page matrix` and `print-picked` rules. Signed-in screens still get
      the eyeball check in 1E.

*1B. Installable app*
- [x] ✅ `vite-plugin-pwa` with a manifest (name "IcePick - NHL League",
      `display: standalone`, slate-900 theme color, `start_url: /`).
- [x] ✅ Icons: 192, 512, maskable 512, 180 `apple-touch-icon` and a favicon in
      `src/public/`. A placeholder hockey puck on the app's navy; redraw with
      `python src/scripts/make-icons.py` (or swap the PNGs) if you want a
      different mark.
- [x] ✅ iOS meta tags (`apple-mobile-web-app-capable`, title, status bar).
      **Deferred to 1C:** `viewport-fit=cover` and `black-translucent`. Both run
      the page under the notch and home bar, so they only go in together with
      the safe-area padding on the fixed bottom nav. Until then the status bar
      is plain black and the layout is unchanged.
- [x] ✅ Service worker: precaches the app shell and Latin fonts (27 files,
      ~1.1 MB), serves the shell for deep links offline. Supabase and
      `/.netlify/functions/*` are **network-only, not network-first** — a cached
      standings or sheet could show a member something other than what was
      saved, and auth responses must never be stored. `sw.js` and the manifest
      are served `no-cache` (`netlify.toml`) so updates are noticed.
- [x] ✅ "A new version of IcePick is ready — Reload" prompt (`registerType:
      'prompt'`, so an update never lands mid-pick and discards an unsaved
      sheet). Rechecks hourly for phones that keep the app open for days.
- [x] ✅ Offline banner. Picks submission stays online-only. Limit: it keys off
      the browser's online flag, so a connected-but-no-internet network
      (captive portal) shows no banner.
- [x] ✅ One-time "Add to Home Screen" hint for iOS Safari (iPhone and iPad),
      dismissable, hidden once installed. Logic and tests in `lib/pwa.ts`.
- [x] ✅ Verified in real Chrome (headless): service worker activates, no
      installability errors, manifest parses, a deep link loads offline from
      the cache, the update prompt appears on a new deploy and waits until
      Reload, no page errors. Not yet tried on a real phone (1E).

*1C. Mobile-first UI*

Reviewed every screen at 320, 360, 375 and 412px in dark and light, mid-week
(picks open) and Saturday evening (games live), against a fake backend (a
Puppeteer harness serving made-up members, games and picks; nothing touches
the real database). Standings, the Matrix (a card per member) and History
already had good phone layouts and were left alone. Every change below is
scoped to phones (below `md`, or `sm`), and a before/after box-by-box
comparison at 1366px shows every laptop screen identical, dark and light.

- [x] ✅ Bottom nav: nine tabs did not fit (labels ran together). Now four tabs
      (Dashboard, Picks, Matrix, Standings) plus a **More** menu holding
      Affinity, History, Settings, Admin and Sign Out. It closes on navigation,
      Escape or a tap outside, and lights up when you are on a page inside it.
      Which tabs are primary is a flag on the route (`primaryMobile`).
- [x] ✅ Safe areas: `viewport-fit=cover` plus `env(safe-area-inset-*)` padding on
      the nav, the page bottom and the update/offline notices, so nothing sits
      under the iPhone home bar or the landscape notch. Status bar stays opaque
      black (not `black-translucent`), so there is no top inset to manage and
      light mode never gets white text on white. *Only checkable on a real
      iPhone; Chrome reports zero insets.*
- [x] ✅ Picks: confidence buttons 28px → 44px tall on phones (the most-tapped
      control in the app). The header with the count and Submit was already
      sticky, and the cards already full width.
- [x] ✅ Dashboard: the Top 5 table was cut off at the right edge (a long name
      widened it), and on Saturday evening the whole page scrolled sideways
      (the grid had no column template on phones). Both fixed.
- [x] ✅ Admin: the Week Status table dropped its Week column on phones (it is
      "week-" + the Date column) so the Action button is no longer clipped.
- [x] ✅ Tap targets: every button, pill and select is now at least 40px tall on
      phones (Segment and Order-by pills, Print, Sync, Mint invite, week select,
      icon buttons get a larger hit area without moving).
- [ ] Left for real-device feedback rather than guessed at: a compact "my row
      first" view of the Matrix, and pull-to-refresh / a refresh control.
      The Matrix card list is long (one card per member) but works.
- [x] ✅ Session persistence: unchanged. supabase-js already persists and
      refreshes the session, and the installed app keeps it in its own storage.

*1D. Push reminders*
- [ ] Migration: `push_subscriptions` (user_id, endpoint, keys, created_at)
      with RLS limited to own rows.
- [ ] VAPID keys → Netlify env `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
      `VITE_VAPID_PUBLIC_KEY`.
- [ ] Settings toggle "Remind me to make picks" (off by default; on iOS only
      once installed).
- [ ] Scheduled function `pick-reminders` (`web-push`), Friday evening and
      Saturday morning ET, for members with no sheet for the open week.
      Optional "results are final" push from `scheduled-sync`.
- [ ] Prune subscriptions that return 404/410.

*1E. Ship and verify*
- [ ] Desktop regression check: every screen side by side with production on a
      laptop (Chrome, Edge, Safari; dark, light, print).
- [ ] `npm run build`, `npm test`, and a Lighthouse installability check on a
      deploy preview.
- [ ] Real devices: iPhone (Add to Home Screen, login, picks, reminder) and
      Android (install prompt, push).
- [ ] Update `docs/OPERATIONS.md` (VAPID keys, reminder schedule).
- [ ] Send members install instructions.

**⏸ Pause — member feedback.** Are people installing it, does push arrive
(especially on iOS), and what feels clunky? Go / no-go on Phase 2.

**Phase 2 — Capacitor store apps (only if approved)**
- [ ] Setup: `@capacitor/core` + `cli`, `cap init` (webDir `dist`), and
      add the android and ios platforms. iOS needs a Mac with Xcode or a cloud
      build service.
- [ ] Absolute API URLs (the app runs from `capacitor://localhost`), CORS on
      Netlify functions, Supabase redirect allow-list. No service worker inside
      the shell.
- [ ] Deep links (Universal Links / App Links served from Netlify) routed
      into `lib/authRedirect.ts` for confirm, recovery and invite links.
- [ ] Native push (`@capacitor/push-notifications`, FCM + APNs). Extend
      `push_subscriptions` with platform + token, and `pick-reminders` sends
      through FCM.
- [ ] Splash screen, status bar theming, icons (`@capacitor/assets`), and the
      session stored in `@capacitor/preferences`.
- [ ] Printing: hide it or route it through the share sheet (`PrintButton.tsx`).
- [ ] Store accounts (Apple $99/yr, Google $25), privacy policy, listings,
      screenshots, and a reviewer demo account.
- [ ] TestFlight + Play internal testing with members, then publish. Document
      the release steps in `docs/OPERATIONS.md`.
