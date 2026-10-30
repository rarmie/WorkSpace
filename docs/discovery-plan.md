# Plan: Discovery Postings Pipeline and Dashboard

*Drafted 27 Oct 2026, revised 28 Oct. Separate from the weekly schedule and the Job Tracker
Roadmap.*

## Goal

Learn data engineering by building a real pipeline, and show its output in the app. A daily Python
job collects open postings from public job boards, cleans them, and publishes one table. The
dashboard shows the newest postings. From there the user can **save** a posting into their tracker
as a normal job, **dismiss** it, or **apply** on the company's own site.

The app's own data (a few dozen jobs) is too small to need a pipeline. Outside postings arrive by
the thousand and change every day, which brings the real problems: duplicates, re-runs, changing
sources, closed postings, and limited storage.

**How we work:** same guided mode as the rest of the project. The user writes the pipeline code and
the function bodies. Claude explains each step first, writes the frontend shape, reviews by running
the code, and does git.

## What the sources give (checked 27 Oct, Ashby 28 Oct)

No key, no sign-up, no AI needed for the core fields.

| | Greenhouse | Lever | Ashby |
|---|---|---|---|
| URL | `boards-api.greenhouse.io/v1/boards/<board>/jobs?content=true` | `api.lever.co/v0/postings/<company>?mode=json` | `api.ashbyhq.com/posting-api/job-board/<org>` |
| Returns | `{ "jobs": [...] }` (Airbnb: 191) | a plain list (Spotify: 89, Palantir: 307) | `{ "jobs": [...], "apiVersion" }` (Supabase: 64) |
| Id | `id` (number) | `id` (string) | `id` (UUID string) |
| Title / link | `title`, `absolute_url` | `text`, `hostedUrl` (and `applyUrl`) | `title`, `jobUrl` (and `applyUrl`) |
| Company | `company_name` | not included: use the slug | not included: use the slug |
| Location | `location.name` | `categories.location`, `workplaceType` | `location`, `secondaryLocations`, `isRemote`, `workplaceType` |
| Dates | `first_published`, `updated_at` | `createdAt` only, **no updated time** | `publishedAt` only, **no updated time** |
| Description | `content`: one block of HTML | `descriptionPlain` plus `lists`: sections with a heading and bullets | `descriptionHtml` and `descriptionPlain` |
| Salary | not seen in samples | `salaryRange` key absent in samples | `compensation` object, empty in samples |
| Other | | | `isListed`: skip `false` rows |

What this means for the design:

- The three sources have different shapes, so staging has to map all of them into one.
- Lever and Ashby have no "updated" time. Change detection must compare a **content hash**, not a date.
- Lever's section headings vary by company ("Who You Are", "What We Require"). The requirements
  parser needs a list of heading patterns, and will miss some.
- Greenhouse's `content` may be HTML-escaped (`&lt;p&gt;`). Check before parsing.
- Salary is not reliably available. Leave it out of the first version.
- Ashby's `isRemote` and `workplaceType` were `null` on every Supabase posting, even ones whose
  `location` says "Remote, Global". Remote and region must come from the location text, by rules,
  for all three sources.
- Location text is messy everywhere: "Remote, APAC", "Remote - US", "Home based - Worldwide",
  "Makati City". "Remote" often means remote within one country.
- All three give a real posted date (`first_published`, `createdAt`, `publishedAt`). Keep it: the pipeline's
  own "first seen" date is the same for every posting on the first run, so it can't order a feed.

## Architecture

```
Greenhouse / Lever / Ashby APIs
        │  (1) extract
        ▼
pipeline/data/raw/<date>/<source>-<company>.json   ← untouched copies
        │  (2) load
        ▼
raw.posting_version      ← one row per posting per content change
        │  (3) stage
        ▼
staging.posting          ← one row per posting, all sources in one shape
        │  (4) requirements   (5) publish
        ▼
public.discovered_posting  ← the only table the app reads
        │
        ▼
Next.js: dashboard section, /discover, Save / Dismiss
```

**Where the code lives:** a new `pipeline/` folder of plain Python. It is not part of FastAPI, which
stays stateless as `docs/concept.md` requires. It can share `backend/venv` at first.

**Who owns what:**

- The pipeline owns the `raw` and `staging` schemas: it creates and writes them.
- **Prisma owns the published table's definition**, `discovered_posting`, through a normal
  migration. The pipeline only inserts and updates its rows. Reason: Prisma's `migrate dev` manages
  the `public` schema, and a table it didn't create there would show up as drift. One owner per
  table definition avoids that fight.
- Next.js only reads `discovered_posting`. It writes only per-user tables.

**Shared rows vs user rows.** Postings belong to nobody, so `discovered_posting` has no `userId`.
That's deliberate. Anything a user *does* to a posting is per-user and filtered by
`session.user.id`, as everywhere else.

## Phases

Each phase ends in something runnable. Phases 1–6 are the data engineering work. Phases 7a–7c are the app.

### Phase 0: Setup and decisions

1. **Board scout.** Boards are picked by measurement, not by name. Famous companies mostly hire
   where the owner can't: on 28 Oct, 3 of 42 boards checked had any engineering role open to
   someone in the Philippines.
   - `pipeline/candidates.toml` lists boards to try (source + slug). Candidates come from
     searches such as `site:job-boards.greenhouse.io "Remote in the Philippines"`, or from
     companies the owner would apply to.
   - `pipeline/scout.py` fetches each candidate once and prints, per board: total postings,
     *reachable* ones (in the owner's country, or remote for `GLOBAL` or the owner's regions),
     how many of those are engineering titles, and how many aren't senior.
   - A board with at least 3 reachable engineering roles goes into `pipeline/companies.toml`,
     the list the daily run uses. The rest stay in the candidate list, so a re-scout catches a
     company that starts hiring in the region.
   - Re-run it about once a month. Companies change systems and hiring regions.
   - The first version uses rough keyword matches. Once Phase 3's location and level rules
     exist, the scout should import them, so the scout and the feed agree on what "reachable"
     means.

   First scout, 28 Oct (rough keyword match):

   | Board | Source | Reachable eng | Not senior |
   |---|---|---|---|
   | Canonical | Greenhouse | 85 | 48 |
   | Supabase | Ashby | 35 | 30 |
   | CTE PH (`cteph`) | Greenhouse | 7 | 5 |
   | Xendit | Greenhouse | 2 | 0 |

   Zero reachable: Ninja Van, Okta, Coinbase, Airbnb, GitLab ("remote" means one named country),
   Toptal, Linear, Zapier, PostHog, Grafana, Twilio, OpenAI, Stripe, Mozilla, Wikimedia,
   1Password, Kraken, Crypto.com, ClickUp, n8n, Tailscale, Sentry, Ashby, Binance, Consensys.
   Not found under the slugs tried: GCash/Mynt, PayMongo, Sprout, Thinking Machines, Grab, Kumu,
   Canva, Doist, Hotjar, Remote.com, Deel, DuckDuckGo.
2. Database: **decided**, the same Supabase database, with separate `raw` and `staging` schemas.
3. Confirm that `prisma migrate dev` ignores tables in non-`public` schemas. Create an empty `raw`
   schema, run `migrate dev`, and check it reports no drift.
4. Add `psycopg` (Postgres driver) to a `pipeline/requirements.txt`. `httpx` and `beautifulsoup4`
   are already in the backend.

*Teaches:* measure a source before trusting it.
*Done when:* the scout has run, `companies.toml` holds the boards that passed, and a script can
connect to the database.

### Phase 1: Extract

1. `pipeline/extract.py` fetches each company's postings and saves the response untouched to
   `pipeline/data/raw/<date>/<source>-<company>.json`. Gitignore `pipeline/data/`.
2. Fetch one company at a time, at least 1 s apart (Lever's `Crawl-delay: 1`), with a timeout on
   each request and the project's User-Agent (see Terms of use).
3. One company failing (404, timeout) must not stop the others. Log it and continue. Log 403 and
   429 separately: they mean the run is being blocked or throttled, not that the board is empty.

*Teaches:* keep the original. Every later step can be re-run from these files without fetching
again.
*Done when:* one run produces a folder of JSON files and a log line per company.

### Phase 2: Load raw

1. Table `raw.posting_version`: source, company, source id, a `content_hash`, the full JSON
   (`jsonb`), and `fetched_at`.
2. Hash the fields that matter (title, location, description). Insert a row only when that hash is
   new for that posting. A unique key on (source, source id, content_hash) enforces it.
3. Run the same day twice and check the row count doesn't change.

*Teaches:* idempotency (a re-run changes nothing) and change detection (store changes, not
copies). This is also what keeps the database under Supabase's free 500 MB.
*Done when:* two runs in a row add zero rows the second time.

### Phase 3: Stage

1. Table `staging.posting`: one row per posting, the latest version, in one shape for all
   sources. Columns: `source`, `source_id`, `company`, `title`, `level`, `location`, `is_remote`, `regions`,
   `url`, `description` (plain text), `posted_at`, `first_seen_at`, `last_seen_at`, `closed_at`.
   - `posted_at` comes from the source (Greenhouse `first_published`, Lever `createdAt`, Ashby
     `publishedAt`). It's what the app sorts and labels by.
   - `is_remote` and `regions` are parsed from the location text by rules (step 5), and `level`
     from the title (step 6).
   - `first_seen_at`, `last_seen_at` and `closed_at` are the pipeline's own record. They're for
     change tracking, not display.
2. Write one mapping function per source. Strip HTML from Greenhouse's `content`. Use Ashby's
   `descriptionPlain`, and skip rows with `isListed: false`.
3. **Closed postings:** a posting missing from today's fetch of a company that fetched
   successfully gets `closed_at`. If it reappears, clear it. Never delete rows.
4. A company whose fetch *failed* today must not close all its postings. That's the classic bug
   here.
5. **Location rules:** `is_remote` when the text says remote, home based, or anywhere.
   `regions` is a list of codes: a country (`PH`, `US`, ...), a region (`APAC`, `EMEA`, `AMER`),
   or `GLOBAL` for "worldwide", "global" or "anywhere". Bare "Remote" gets no region: it's
   unknown, not global. Include `secondaryLocations` for Ashby. Measure it like Phase 4: the
   share of postings that got at least one region.
6. **Level rules:** `level` from title words: "intern" → `INTERN`; "junior", "associate",
   "graduate", "entry" → `JUNIOR`; "senior", "sr", "staff", "principal", "lead" → `SENIOR`;
   anything else stays `null` (unknown, not mid). Measure the share that got a level.

*Teaches:* mapping messy sources to one model, soft deletes (mark closed instead of deleting), and
normalizing free text into codes the app can filter on.
*Done when:* removing a posting from a saved raw file and re-running marks it closed.

### Phase 4: Requirements, by rules

1. Lever: take the bullets from `lists` sections whose heading matches a pattern list
   ("requirement", "qualification", "who you are", "what we require", "you have", ...).
2. Greenhouse and Ashby: find a matching heading in the HTML (`content`, `descriptionHtml`) and
   take the `<li>` items under it. One HTML parser can serve both.
3. Measure coverage: the share of open postings that came out with at least one requirement, per
   source. Write the number down.

*Teaches:* rules first, measured. The coverage number decides whether the AI step in Phase 8 is
worth its cost.
*Done when:* coverage is printed at the end of every run.

### Phase 5: Publish

1. Add `DiscoveredPosting` to `prisma/schema.prisma` and migrate (the user writes the model). It
   holds the columns the app shows: source, sourceId, company, role, `level`, location, `isRemote`,
   `regions` (`String[]`), url, requirements (`String[]`), `postedAt`, `firstSeenAt`, `closedAt`,
   plus a unique key on (source, sourceId).
   `postedAt` is nullable, in case a source leaves it out. The app falls back to `firstSeenAt`.
2. The pipeline upserts from `staging.posting` into it.
3. Data checks that fail the run if broken: no empty title, company or url; no duplicate
   (source, sourceId); the open count didn't drop by more than half since yesterday (a sign a
   source changed shape, not that half the jobs closed).

*Teaches:* the published table is a contract with the app. Renaming a column breaks the dashboard.
*Done when:* the table is filled and a deliberately broken row fails the run.

### Phase 6: Schedule

1. `pipeline/run.py` runs phases 1–5 in order and stops at the first failure.
2. A GitHub Actions workflow runs it daily on a cron, with the database URL as a repo secret. The
   repo is public, so the secret matters: never print the URL in a log line.
3. A failed run shows as a failed Action, which emails the owner.
4. Raw files: **CI doesn't save them.** The Action's disk is thrown away after each run, and
   workflow artifacts on a public repo can be downloaded by anyone signed in to GitHub, which
   would republish every full posting (recruiter names and emails included). The database already
   keeps every content change in `raw.posting_version`, so nothing is lost. Raw files are a local
   development aid only, and `pipeline/data/` stays gitignored.

*Teaches:* orchestration: order, failure, secrets, and re-running a missed day.
*Done when:* a scheduled run succeeds without anyone starting it.

### Phase 7a: Make `appliedAt` optional (prerequisite, its own branch)

A WISHLIST job hasn't been applied for, but `appliedAt` is required and defaults to `now()`. Saving
a posting would stamp it with a false "applied" date. Fix that first. It doesn't depend on the
pipeline, so it can be done any time.

1. Schema: `appliedAt DateTime?`, no default. The migration keeps existing values.
2. Set it on the server, not in the forms:
   - `POST /api/jobs`: `now()` when the new job's status is past WISHLIST, otherwise `null`.
   - `PATCH /api/jobs/[id]`: when status moves from WISHLIST to anything later and `appliedAt` is
     still `null`, set it to `now()`. An `appliedAt` sent in the body still wins.
3. `EditJobDialog.tsx` (`appliedAt` schema at line 38, `.slice(0, 10)` at line 98): the field is no
   longer required, and an empty input sends `null`. The `.slice` breaks on `null`.
4. `JobDetail.tsx` (`toISOString()` at line 81, `formatDate` at line 122): handle `null`. Show
   "Not applied yet", or hide the fact.
5. Run `tsc` after the schema change. It finds every place that assumed a `Date`.

*Done when:* a new WISHLIST job has no applied date, and moving it to APPLIED gives it today's.

### Phase 7b: Profile attributes (no pipeline needed)

The feed is filtered by what the user wants. That's stored as plain fields on the user, typed on
`/profile`, so **the feed never needs a model**. An optional Autofill reads them from the resume,
in the same way the job form's Autofill fills a job. If the model is down, the user types them
instead and nothing else breaks. Like 7a, this can be built any time.

**Schema on `User`** (the user writes it):

| Field | Type | Example |
|---|---|---|
| `targetRoles` | `String[] @default([])` | "Full-Stack Developer", "Backend Engineer" |
| `country` | `String?`, a code from the Phase 3 list | `PH` |
| `workArrangements` | `WorkArrangement[] @default([])`, enum `REMOTE` / `HYBRID` / `ONSITE` | `[REMOTE, HYBRID]` |
| `remoteRegions` | `String[] @default([])`, codes from the Phase 3 list | `[APAC, GLOBAL]` |
| `seniority` | `Seniority?`, enum `INTERN` / `JUNIOR` / `MID` / `SENIOR` | `JUNIOR` |
| `skills` | `String[] @default([])` | "TypeScript", "Python", "PostgreSQL" |
| `attributesUpdatedAt` | `DateTime?` | set on every save |

Empty or `null` means "no preference", and that part of the filter is skipped. `skills` isn't used
by the filter yet. It's there for Phase 8 match ranking and skill trends.

**The form** is a new panel on `/profile`, next to the resume editor. It saves through
`PATCH /api/profile`, which already exists, is scoped to `session.user.id`, and sits outside the
matcher. Its Zod schema gets the new fields, on both sides. Country and regions are selects over
the fixed code list, not free text, so they always match what the pipeline writes.

**Autofill from resume** (optional):

1. A new FastAPI route, `POST /profile-attributes`, takes the resume text and returns the six
   fields, every one nullable. It's one gpt-oss call, stateless like `/extract` and `/match`, with
   the same timeout and error mapping. Country and regions are validated against the code list,
   and a code that isn't on the list is dropped.
2. `POST /api/profile/autofill` reads the resume from the database, calls FastAPI, and returns the
   result **without saving it**. 400 if there's no resume.
3. The button fills the form fields only. The user reviews them and presses Save, as with job
   Autofill. A failure shows a message, and the fields stay as they were.
4. If `resumeUpdatedAt` is later than `attributesUpdatedAt`, the panel says "Your resume changed
   since these were saved", next to the button. Nothing re-runs on its own.

*Done when:* the attributes save and reload with the model switched off, and Autofill fills the
form when it's on.

### Phase 7c: The discovery UI

**Schema** (the user writes it):

- `JobApplication.postingId String?`, a relation to `DiscoveredPosting` with `onDelete: SetNull`,
  plus `@@unique([userId, postingId])`. Postgres treats NULLs as distinct, so hand-added jobs
  never clash.
- `DismissedPosting` (`userId`, `postingId`, `createdAt`) with `@@unique([userId, postingId])`.
- Back-relations on `DiscoveredPosting` (`jobs JobApplication[]`, `dismissals DismissedPosting[]`),
  so the feed can filter with `none`.

**The feed query** (dashboard and `/discover` share it, in `lib/discover.ts`). It reads the 7b
attributes, and each rule applies only when its attribute is set:

- `closedAt: null`
- `jobs: { none: { userId } }` and `dismissals: { none: { userId } }`
- **Roles:** `OR` of `role` contains each target role, `mode: 'insensitive'`. Title matching is
  rough ("Software Engineer" misses "SWE"), so roles are short and the user can add variants.
- **Location:** show a posting when either of these holds:
  - the user takes `ONSITE` or `HYBRID`, and the posting's `regions` contain their `country`;
  - the user takes `REMOTE`, the posting `isRemote`, and its `regions` contain `GLOBAL`, their
    `country`, or one of their `remoteRegions`.

  A remote posting with no region is hidden by default, since it's most often US-only. A "Show
  remote postings with no stated region" toggle lets it in.
- **Seniority:** hide postings whose `level` (Phase 3) is more than one step above the user's.
  For example, a JUNIOR user sees JUNIOR and MID, but not SENIOR. Postings with no level word
  in the title are always shown.
- Order by `postedAt` desc, then `firstSeenAt` desc (posted date first, first-seen as the fallback).

No attributes set: the feed is unfiltered, with a note linking to `/profile`.

**API routes**, session-checked and scoped to `session.user.id`. They stay **outside** the
`proxy.ts` matcher, like `/api/profile`, so an expired session gets a JSON 401 instead of the 307
redirect that `fetch` follows silently:

- `POST /api/discover/[id]/save`: 404 if the posting doesn't exist. Otherwise it creates a WISHLIST
  job with `company`, `role`, `link ← url`, `requirements`, `postingId`, and `appliedAt: null`.
  Prisma `P2002` (already saved) → 409. Saving a closed posting is allowed.
- `POST /api/discover/[id]/dismiss`: upsert, so a double-click is harmless.
- `DELETE /api/discover/[id]/dismiss`: the undo. It deletes the row and is a no-op if none exists.

Once `source` from `feat/status-history-next-actions` is on `main`, Save also sets
`source: COMPANY_SITE`.

**Pages:**

1. Dashboard: a "New postings" section with the first 5 from the feed query. Each shows company,
   role, location, posted date ("3 days ago"), and Save / Dismiss / Apply.
2. `/discover`: the same list with paging, a search box, the no-region toggle, and a link to edit
   the attributes on `/profile`. **Add `/discover/:path*` to the `proxy.ts` matcher by hand**, or
   the page isn't protected. The page still checks the session itself.
3. Save and Dismiss are client buttons. Wrap `router.refresh()` in `useTransition`, so the card
   doesn't flash back before the refreshed list is on screen (the 15 Oct fix).
4. Dismiss shows a "Dismissed · Undo" toast (shadcn `sonner`, added through the CLI). Undo calls
   the DELETE route, then refreshes.
5. Apply opens `url` in a new tab. A saved job whose posting later closes shows a "Posting closed"
   note on the job detail.
6. Format dates on the server in Asia/Manila, as the profile page does.
7. A mockup first, as with earlier UI work. **Done 30 Oct:** `docs/mockups/2026-10-30-discovery-ui.html`.
   Chosen: the dashboard's "New postings" shows compact **rows**, one per line; `/discover` shows
   **cards**, in two columns (company, role, location and region tags, the first three requirements
   as chips with a "+N" count, posted date, then Save / Dismiss / Apply). The mockup also shows
   the filter summary strip, the three empty-feed states, the saved card, and the "Posting closed"
   banner.
8. ~~Posting details page `/discover/[id]`~~ (built and tested 30 Oct, never committed, then dropped on 31 Oct:
   the details open in a dialog instead, see item 10. There is no separate details page.)
9. **Full-width `/discover`** (added 31 Oct). Mockup: `docs/mockups/2026-10-31-discover-wide.html`, layout A.
   The page has no width cap, and the cards flow into as many columns as fit (each at least 380 px,
   or the screen's width if that is smaller). Two other layouts were mocked up and not chosen: a
   filters sidebar, and a table of rows.
10. **Posting details as a modal** (added 31 Oct, replaces item 8). Mockup:
    `docs/mockups/2026-10-31-posting-modal.html`, a centered dialog 680 px wide over the dimmed list.
    Clicking anywhere on a card or row opens it. It shows the facts the pipeline stores (location,
    region, posted, first seen, seniority, source) and every requirement in full, with Save, Dismiss
    and Apply. The title and those buttons stay in view, and the facts and requirements scroll inside
    the dialog when the window is too short. Esc, the close button, or a click outside closes it.
    Save and Dismiss keep the user in the dialog, and Dismiss shows a strip with Undo. A side drawer
    was mocked up and not chosen.
    - **No URL.** The dialog opens from the data already on the card, so it appears at once. Opening
      it through `?posting=<id>` meant a server round trip, 2 to 4 seconds on this database. The cost
      is that a refresh closes it and a link can't point at one posting.
    - **No closed-posting strip.** The feed never lists closed postings. The "Posting closed" note
      remains on the saved job's own page in `/jobs`.
11. **Phone top bar** (added 31 Oct). The shared top bar needed 657 px, so it ran off a 385 px phone.
    Mockup: `docs/mockups/2026-10-31-phone-topbar.html`. Chosen: below the `lg` breakpoint (1024 px; the full bar needs 836 px, and a first try at 640 px overflowed up to that width)
    the three pages move to a tab bar fixed at the bottom of the screen, and the top bar keeps the
    logo and the buttons as icons. From 1024 px up the bar is unchanged. A two-row bar and a menu
    button were mocked up and not chosen.

*Done when:* a posting from the pipeline can be saved and then appears in `/jobs` as WISHLIST with
no applied date. A dismissed posting leaves the feed, and Undo brings it back.

**Can start before Phase 6.** Once the Phase 5 model exists, a few hand-inserted rows are enough
to build against.

**Expect a thin feed at first.** The first scout found about 85 reachable postings across 3 boards,
with only a few new ones a day. Plan the UI for that:

- The dashboard's "5 newest" will change slowly. Show each posted date, so a quiet feed reads as
  quiet, not broken.
- An empty feed explains why: no attributes set (link to `/profile`), or nothing matches them
  (show how many open postings were filtered out, with a link to `/discover`).
- If the feed is too thin to be useful, the fix is **more sources, not more famous boards**:
  Workable and SmartRecruiters also have public JSON APIs and are common with Asian employers
  (Phase 8). Each source is one more mapping function in Phase 3.

### Phase 8: Later, optional

**Status (31 Oct):** skill trends, dbt, and a heading-pattern fix are done (PRs #31 to #33). The AI
requirements step is deferred: widening `HEADING_PATTERNS` took coverage from 92.4% to 96.7%, leaving
13 postings (3%), 7 of them non-English. Match ranking and more sources are not started. The list
below is the original plan.

- **AI requirements** only for postings the rules missed, cached by content hash so re-runs don't
  call the model again.
- **Match ranking:** score open postings against the stored resume in batches inside the pipeline,
  then sort the feed by score.
- **Market skill trends:** top requirements across all postings per week, a second published
  table.
- **dbt** for the staging and publish SQL, once the hand-written version is working and its pain
  is familiar.
- **More sources:** Workable and SmartRecruiters, if the feed is too thin. Not checked yet: confirm
  their endpoints and fields the way the sources table above was checked, then scout boards on
  them.

## Terms of use (checked 28 Oct)

**Summary:** the vendors' terms don't restrict calling these public APIs, and their robots.txt
files allow it. The risks are in what the app shows and what gets published, and both are under
our control. These are public documents read on 28 Oct, not legal advice.

- **API docs:** Greenhouse: "Job Board data is publicly available, so authentication is not
  required for any GET endpoints." Lever: published postings "may be scraped by third parties."
  Ashby says nothing either way.
- **Vendor terms of service** are contracts with paying customers (Lever's ToS, Greenhouse's
  master subscription agreement, Ashby's customer terms). None has terms for visitors or API
  callers. Ashby's "competitive product" clause binds its customers, and this app isn't an ATS
  anyway.
- **robots.txt:**

  | Host | Rule | Effect |
  |---|---|---|
  | `boards-api.greenhouse.io` | blocks only `/embed/` | allowed |
  | `api.lever.co` | `Allow: /`, `Crawl-delay: 1` | allowed, at most one request a second |
  | `api.ashbyhq.com` | no file (401) | no rule |
  | `jobs.ashbyhq.com` | `Disallow: /api/` | not our host. Never use `jobs.ashbyhq.com/api`. |
  | `jobs.lever.co` | `ai-train=no`, `use=reference`, `ai-input` unstated | applies to Phase 8 |

- **Employer content:** each company owns its description text. Title, company, location and date
  are facts. Requirement bullets are a short excerpt shown next to a link to the source. Storing
  full descriptions for parsing is fine. Showing them in full is republishing.
- **Personal data:** some postings name a recruiter or give an email. The Philippine Data Privacy
  Act of 2012 covers that, and the app doesn't need it.

**Rules the pipeline and app follow:**

1. **Official JSON endpoints only**, on the three API hosts. Never scrape career-page HTML or
   `jobs.ashbyhq.com/api`.
2. **Gentle:** once a day, one board at a time, at least 1 s between requests, a timeout on each.
3. **Identifiable:** User-Agent `ShortlistBot/0.1 (+https://github.com/rarmie/shortlist-job-tracker)`.
4. **Show facts and excerpts, link out:** title, company, location, date and requirement bullets.
   No full descriptions on screen. Apply goes to the source.
5. **No personal data:** don't extract or display recruiter names or emails.
6. **No AI training on postings.** Phase 8's per-posting model calls are "ai-input", which the
   current signals don't restrict. Re-check the robots.txt files before building Phase 8.
7. **Raw data stays private:** no workflow artifacts in CI (Phase 6), and `pipeline/data/` stays
   gitignored.
8. **Remove on request:** delete the board from `companies.toml` and close its postings.

## Cost

Free, within limits: the APIs need no key, the repo is public so GitHub Actions has no minute
limit, and Supabase's free tier gives 500 MB. The pipeline shares that 500 MB with the app, and
change detection in Phase 2 is what keeps the data small. The AI step in Phase 8 is the only part
that may need a paid plan, depending on NVIDIA's limits.

## Decisions (28 Oct)

- **Database:** the same Supabase database, with `raw` and `staging` schemas.
- **Sources:** Greenhouse, Lever and **Ashby**. Ashby carries several worldwide-remote companies,
  and a third shape tests whether staging really unifies sources.
- **Filters:** the pipeline publishes everything, and each user filters in the app. A filter change
  needs no re-run, and one user's filter doesn't hide postings from another.
- **The filter comes from profile attributes**, not a model (Phase 7b): target roles, country,
  work arrangement, remote regions, seniority and skills, stored on `User`. The model in use has
  been unreliable, and the feed must work when it's down. Autofill from the resume is optional
  and only fills the form.
- **Boards are chosen by the Phase 0 scout**, by measured reachable roles, not by company name.
  The scout only answers "can the user reach this board?", never "would they want to work
  there?". Interest is handled per user, by the profile attributes and Dismiss.
  A thin feed is fixed with more sources (Workable, SmartRecruiters), not more famous boards.
- **Feed order:** the source's posted date, not the pipeline's first-seen date.
- **Terms of use: resolved** by the eight rules in the Terms of use section. CI keeps no raw
  files, because artifacts on a public repo are public.
- **Expired session on `/api/discover`:** JSON 401, outside the matcher.
- **`appliedAt` becomes optional** (Phase 7a), so saved postings aren't stamped "applied".
- **Dismiss has an undo toast**, but no page listing dismissed postings.

## Open questions

None. All earlier questions are resolved in Decisions.
