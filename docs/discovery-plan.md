# Plan: Discovery Postings Pipeline and Dashboard

*Drafted 27 Oct 2026. Separate from the weekly schedule and the Job Tracker Roadmap.*

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

## What the sources give (checked 27 Oct)

No key, no sign-up, no AI needed for the core fields.

| | Greenhouse | Lever |
|---|---|---|
| URL | `boards-api.greenhouse.io/v1/boards/<board>/jobs?content=true` | `api.lever.co/v0/postings/<company>?mode=json` |
| Returns | `{ "jobs": [...] }` (Airbnb: 191) | a plain list (Spotify: 89, Palantir: 307) |
| Id | `id` (number) | `id` (string) |
| Title / link | `title`, `absolute_url` | `text`, `hostedUrl` (and `applyUrl`) |
| Company | `company_name` | not included: use the slug |
| Location | `location.name` | `categories.location`, `workplaceType` |
| Dates | `first_published`, `updated_at` | `createdAt` only, **no updated time** |
| Description | `content`: one block of HTML | `descriptionPlain` plus `lists`: sections with a heading and bullets |
| Salary | not seen in samples | `salaryRange` key absent in samples |

What this means for the design:

- The two sources have different shapes, so staging has to map both into one.
- Lever has no "updated" time. Change detection must compare a **content hash**, not a date.
- Lever's section headings vary by company ("Who You Are", "What We Require"). The requirements
  parser needs a list of heading patterns, and will miss some.
- Greenhouse's `content` may be HTML-escaped (`&lt;p&gt;`). Check before parsing.
- Salary is not reliably available. Leave it out of the first version.

## Architecture

```
Greenhouse / Lever APIs
        │  (1) extract
        ▼
pipeline/data/raw/<date>/<source>-<company>.json   ← untouched copies
        │  (2) load
        ▼
raw.posting_version      ← one row per posting per content change
        │  (3) stage
        ▼
staging.posting          ← one row per posting, both sources in one shape
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

Each phase ends in something runnable. Phases 1–6 are the data engineering work. Phase 7 is the app.

### Phase 0: Setup and decisions

1. Pick a starter list: about 10 Greenhouse boards and 10 Lever companies, in
   `pipeline/companies.toml` (or `.json`).
2. Decide where the pipeline's database lives (see Open questions).
3. Confirm that `prisma migrate dev` ignores tables in non-`public` schemas. Create an empty `raw`
   schema, run `migrate dev`, and check it reports no drift.
4. Add `psycopg` (Postgres driver) to a `pipeline/requirements.txt`. `httpx` and `beautifulsoup4`
   are already in the backend.

*Done when:* the company list exists and a script can connect to the database.

### Phase 1: Extract

1. `pipeline/extract.py` fetches each company's postings and saves the response untouched to
   `pipeline/data/raw/<date>/<source>-<company>.json`. Gitignore `pipeline/data/`.
2. Fetch one company at a time with a short pause, and a timeout on each request.
3. One company failing (404, timeout) must not stop the others. Log it and continue.

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

1. Table `staging.posting`: one row per posting, the latest version, in one shape for both
   sources. Columns: `source`, `source_id`, `company`, `title`, `location`, `url`, `description`
   (plain text), `first_seen_at`, `last_seen_at`, `closed_at`.
2. Write one mapping function per source. Strip HTML from Greenhouse's `content`.
3. **Closed postings:** a posting missing from today's fetch of a company that fetched
   successfully gets `closed_at`. If it reappears, clear it. Never delete rows.
4. A company whose fetch *failed* today must not close all its postings. That's the classic bug
   here.

*Teaches:* mapping messy sources to one model, and soft deletes (mark closed instead of deleting).
*Done when:* removing a posting from a saved raw file and re-running marks it closed.

### Phase 4: Requirements, by rules

1. Lever: take the bullets from `lists` sections whose heading matches a pattern list
   ("requirement", "qualification", "who you are", "what we require", "you have", ...).
2. Greenhouse: find a matching heading in the HTML and take the `<li>` items under it.
3. Measure coverage: the share of open postings that came out with at least one requirement, per
   source. Write the number down.

*Teaches:* rules first, measured. The coverage number decides whether the AI step in Phase 8 is
worth its cost.
*Done when:* coverage is printed at the end of every run.

### Phase 5: Publish

1. Add `DiscoveredPosting` to `prisma/schema.prisma` and migrate (the user writes the model). It
   holds the columns the app shows: source, company, role, location, url, requirements
   (`String[]`), `firstSeenAt`, `closedAt`, plus a unique key on (source, sourceId).
2. The pipeline upserts from `staging.posting` into it.
3. Data checks that fail the run if broken: no empty title, company or url; no duplicate
   (source, sourceId); the open count didn't drop by more than half since yesterday (a sign a
   source changed shape, not that half the jobs closed).

*Teaches:* the published table is a contract with the app. Renaming a column breaks the dashboard.
*Done when:* the table is filled and a deliberately broken row fails the run.

### Phase 6: Schedule

1. `pipeline/run.py` runs phases 1–5 in order and stops at the first failure.
2. A GitHub Actions workflow runs it daily on a cron, with the database URL as a repo secret.
3. A failed run shows as a failed Action, which emails the owner.
4. Raw files: the Action's disk is thrown away after each run. Either skip saving them in CI or
   upload them as a short-lived workflow artifact.

*Teaches:* orchestration: order, failure, secrets, and re-running a missed day.
*Done when:* a scheduled run succeeds without anyone starting it.

### Phase 7: The app

1. Schema (user writes): `JobApplication.postingId` (optional), with
   `@@unique([userId, postingId])` so a posting can't be saved twice; and a `DismissedPosting`
   table (userId, postingId).
2. API routes, session-checked and scoped to `session.user.id`:
   - `POST /api/discover/[id]/save` creates a WISHLIST job from the posting.
   - `POST /api/discover/[id]/dismiss` records a dismissal.
3. Dashboard: a "New postings" section with the 5 newest open postings this user hasn't saved or
   dismissed. Each shows company, role, location, how long ago it appeared, and Save / Dismiss /
   Apply.
4. A full `/discover` page with the same list, a search box and paging. **Add `/discover/:path*`
   and `/api/discover/:path*` to the matcher in `proxy.ts` by hand**, or the page isn't protected.
5. Apply opens `url` in a new tab. Saved jobs whose posting later closes show a "Posting closed"
   note on the job detail.
6. A mockup first (`docs/mockups/`), as with earlier UI work.

*Done when:* a posting from the pipeline can be saved and then appears in `/jobs` as WISHLIST.

### Phase 8: Later, optional

- **AI requirements** only for postings the rules missed, cached by content hash so re-runs don't
  call the model again.
- **Match ranking:** score open postings against the stored resume in batches inside the pipeline,
  then sort the feed by score.
- **Market skill trends:** top requirements across all postings per week, a second published
  table.
- **dbt** for the staging and publish SQL, once the hand-written version is working and its pain
  is familiar.

## Cost

Free, within limits: the APIs need no key, GitHub Actions is free on public repos (2,000 minutes a
month on private ones), and Supabase's free tier gives 500 MB. Change detection in Phase 2 is what
keeps the data small. The AI step in Phase 8 is the only part that may need a paid plan, depending
on NVIDIA's limits.

## Open questions

- **Which database?** The same Supabase database with separate schemas (simplest, shares the
  500 MB), a second free Supabase project, or a local Postgres while learning.
- **Which companies?** Ones whose roles the owner would actually apply to make the feed useful
  rather than a demo.
- **Filters:** should the pipeline drop postings by location or title keyword before publishing,
  or should the app filter? Publishing everything is simpler, filtering keeps storage down.
- **Terms of use:** read each source's terms before scheduling daily runs.
- **Public or private repo:** decides the GitHub Actions limits.
