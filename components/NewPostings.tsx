import Link from 'next/link'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import PostingItem from '@/components/PostingItem'
import { getFeed, getFeedAttributes } from '@/lib/discover'

const DASHBOARD_COUNT = 5

// The dashboard's "New postings" section: the first few from the discovery feed, as rows.
// Server component. Mockup: docs/mockups/2026-10-30-discovery-ui.html.
export default async function NewPostings({ userId }: { userId: string }): Promise<React.JSX.Element | null> {
  const attributes = await getFeedAttributes(userId)

  // A session cookie can outlive its user row. The page above already redirects on that.
  if (!attributes) return null

  const feed = await getFeed({ userId, attributes, pageSize: DASHBOARD_COUNT })

  return (
    <section aria-label="New postings" className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[15px] font-bold">New postings</h2>
        {feed.hasPreferences && <span className="text-sm text-muted-foreground">matching your preferences</span>}
        <span className="flex-1" />
        <Link href="/discover" className="text-sm text-primary hover:underline">
          See all in Discover →
        </Link>
      </div>

      {/* No preferences saved: the feed is unfiltered, and says so. */}
      {!feed.hasPreferences && feed.total > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">
          <Info className="size-4 shrink-0" />
          <span>
            Showing every open posting.{' '}
            <Link href="/profile" className="text-primary hover:underline">Set your job preferences</Link> to see
            only the ones that fit you.
          </span>
        </p>
      )}

      {feed.postings.length > 0 ? (
        <div className="space-y-2">
          {feed.postings.map((posting) => (
            <PostingItem key={posting.id} posting={posting} variant="row" />
          ))}
        </div>
      ) : feed.openCount > 0 ? (
        // There are open postings, but none match the saved preferences.
        <div className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center">
          <h3 className="font-bold">Nothing matches your preferences today</h3>
          <p className="mx-auto mt-1 mb-3 max-w-md text-sm text-muted-foreground">
            <b className="text-foreground">{feed.openCount}</b> open postings were filtered out. New ones are added
            daily. You can browse them all, or widen your preferences.
          </p>
          <div className="flex justify-center gap-2">
            <Button asChild size="sm"><Link href="/discover?filters=off">Browse all in Discover</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/profile">Edit preferences</Link></Button>
          </div>
        </div>
      ) : (
        // Nothing open that the user hasn't already saved or dismissed (or the pipeline has no data).
        <div className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center">
          <h3 className="font-bold">No new postings right now</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            The list updates once a day. Check back tomorrow.
          </p>
        </div>
      )}
    </section>
  )
}
