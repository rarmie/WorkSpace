import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { Info } from 'lucide-react'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { Button } from '@/components/ui/button'
import SearchBar from '@/components/SearchBar'
import FeedSummary from '@/components/FeedSummary'
import PostingItem from '@/components/PostingItem'
import { FEED_PAGE_SIZE, getFeed, getFeedAttributes } from '@/lib/discover'

// A repeated key (?page=1&page=2) arrives as an array. Only a single plain value is meaningful.
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

// /discover with the given query, leaving out anything empty so URLs stay short.
function discoverHref(query: { search?: string; page?: number; noRegion?: boolean; allOpen?: boolean }): string {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  if (query.noRegion) params.set('noRegion', '1')
  if (query.allOpen) params.set('filters', 'off')
  if (query.page && query.page > 1) params.set('page', String(query.page))
  const qs = params.toString()
  return qs ? `/discover?${qs}` : '/discover'
}

// The postings feed. Mockup: docs/mockups/2026-10-30-discovery-ui.html. The page reads on the
// server; Save and Dismiss are client buttons (PostingItem) that call /api/discover.
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string | string[]
    page?: string | string[]
    noRegion?: string | string[]
    filters?: string | string[]
  }>
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user.id) {
    redirect('/login')
  }

  const raw = await searchParams
  const search = single(raw.search)?.trim() || undefined
  const showNoRegion = single(raw.noRegion) === '1'
  const allOpen = single(raw.filters) === 'off'
  // Anything that isn't a whole number of 1 or more is page 1.
  const requested = Number.parseInt(single(raw.page) ?? '1', 10)
  const page = Number.isInteger(requested) && requested >= 1 ? requested : 1

  const attributes = await getFeedAttributes(session.user.id)

  // A session cookie can outlive its user row (a deleted test account, for example).
  if (!attributes) {
    redirect('/login')
  }

  const feed = await getFeed({ userId: session.user.id, attributes, page, search, showNoRegion, allOpen })

  const pages = Math.max(1, Math.ceil(feed.total / FEED_PAGE_SIZE))

  // Dismissing the last item on the last page leaves that page empty. Go back to the real last one.
  if (page > pages) {
    redirect(discoverHref({ search, noRegion: showNoRegion, allOpen, page: pages }))
  }

  const takesRemote = attributes.workArrangements.includes('REMOTE')
  const filtering = feed.hasPreferences && !allOpen

  return (
    <div className="w-full px-6 pt-5 pb-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">Discover</h1>
        <SearchBar path="/discover" placeholder="Search company or role..." />
      </div>

      {filtering && <FeedSummary attributes={attributes} />}

      {!feed.hasPreferences && (
        <p className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">
          <Info className="size-4 shrink-0" />
          <span>
            Showing every open posting.{' '}
            <Link href="/profile" className="text-primary hover:underline">Set your job preferences</Link> to see
            only the ones that fit you.
          </span>
        </p>
      )}

      {feed.hasPreferences && allOpen && (
        <p className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">
          <Info className="size-4 shrink-0" />
          <span>
            Showing every open posting, ignoring your preferences.{' '}
            <Link href={discoverHref({ search })} className="text-primary hover:underline">
              Apply my preferences
            </Link>
          </span>
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 text-sm text-muted-foreground">
        <span>
          <b className="text-foreground">{feed.total.toLocaleString()}</b> {feed.total === 1 ? 'posting' : 'postings'}
          {feed.postings[0] && page === 1 && <> · newest {feed.postings[0].postedLabel.toLowerCase()}</>}
        </span>
        <span className="flex-1" />
        {/* A link, not client state: the choice lives in the URL, so it survives a refresh. */}
        {filtering && takesRemote && (
          <Link
            href={discoverHref({ search, noRegion: !showNoRegion })}
            className="inline-flex items-center gap-2 hover:text-foreground"
            aria-pressed={showNoRegion}
          >
            <span
              aria-hidden="true"
              className={`relative h-4 w-7 rounded-full transition-colors ${showNoRegion ? 'bg-primary' : 'bg-muted'}`}
            >
              <span
                className={`absolute top-0.5 size-3 rounded-full bg-foreground transition-all ${
                  showNoRegion ? 'left-3.5 bg-primary-foreground' : 'left-0.5'
                }`}
              />
            </span>
            Show remote postings with no stated region
          </Link>
        )}
      </div>

      {feed.postings.length > 0 ? (
        // As many columns as fit, each at least 380px. The min() matters: on a screen narrower than
        // 380px a plain minmax(380px, 1fr) would force a horizontal scrollbar. 1fr tracks (not an
        // implicit column) can also shrink, which lets long requirement chips truncate instead of
        // stretching the card.
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(380px,100%),1fr))] gap-3">
          {feed.postings.map((posting) => (
            <PostingItem key={posting.id} posting={posting} variant="card" />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center">
          {search ? (
            <>
              <h3 className="font-bold">No postings match “{search}”</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Try a shorter search.</p>
            </>
          ) : filtering && feed.openCount > 0 ? (
            <>
              <h3 className="font-bold">Nothing matches your preferences today</h3>
              <p className="mx-auto mt-1 mb-3 max-w-md text-sm text-muted-foreground">
                <b className="text-foreground">{feed.openCount}</b> open postings were filtered out. New ones are
                added daily.
              </p>
              <div className="flex justify-center gap-2">
                <Button asChild size="sm"><Link href={discoverHref({ allOpen: true })}>Show all open postings</Link></Button>
                <Button asChild variant="outline" size="sm"><Link href="/profile">Edit preferences</Link></Button>
              </div>
            </>
          ) : (
            <>
              <h3 className="font-bold">No new postings right now</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                The list updates once a day. Check back tomorrow.
              </p>
            </>
          )}
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={discoverHref({ search, noRegion: showNoRegion, allOpen, page: page - 1 })}>← Previous</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>← Previous</Button>
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={discoverHref({ search, noRegion: showNoRegion, allOpen, page: page + 1 })}>Next →</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>Next →</Button>
          )}
        </nav>
      )}
    </div>
  )
}
