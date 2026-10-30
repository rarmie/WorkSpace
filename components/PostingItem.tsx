'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { companyInitial } from '@/lib/job-status'
import { usePostingActions } from '@/components/usePostingActions'
import PostingModal from '@/components/PostingModal'
import { regionLabel } from '@/lib/profile-attributes'
import type { PostingView } from '@/lib/discover'

// The whole card opens the details dialog, through one button (the title), not a button around the
// card (a button can't hold buttons). The title's ::after covers the card, and the real buttons sit
// above it with `relative z-10`, so they still take their own clicks. Keyboard focus shows as a
// ring on the card.
const OPEN_DETAILS =
  "text-left after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring group-hover:underline"

// One discovered posting, with Save / Dismiss / Apply. Mockup: docs/mockups/2026-10-30-discovery-ui.html.
// "row" is the compact one-line form for the dashboard; "card" is the two-column form on /discover.
// `import type` for PostingView: lib/discover.ts reads the database, so none of its code may reach
// the browser. Types are erased at build time, so this import is safe.
export default function PostingItem({
  posting,
  variant,
}: {
  posting: PostingView
  variant: 'row' | 'card'
}): React.JSX.Element | null {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [savedJobId, setSavedJobId] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false) // dismissed
  const [open, setOpen] = useState(false) // the details dialog

  // router.refresh() returns before the refreshed page is on screen. Doing it inside a transition
  // keeps `isPending` true until React commits it, so a dismissed card doesn't flash back.
  const refresh = (): void => startTransition(() => router.refresh())

  const { busy, error, save, dismiss, undo } = usePostingActions({
    postingId: posting.id,
    label: `${posting.company}, ${posting.role}`,
    // No refresh on save: the card stays and says "Saved", so the click has visible confirmation.
    // The posting leaves the feed the next time the page loads, because the feed hides saved ones.
    onSaved: setSavedJobId,
    // With the dialog open, don't refresh yet: the refreshed list no longer has this posting, which
    // would unmount the card and close the dialog the user is reading. Closing it refreshes.
    onDismissed: () => {
      setHidden(true)
      if (!open) refresh()
    },
    onUndone: () => {
      setHidden(false)
      if (!open) refresh()
    },
  })

  const onOpenChange = (next: boolean): void => {
    setOpen(next)
    if (!next && hidden) refresh()
  }

  // A dismissed card leaves the list, but stays mounted while its dialog is open (see above).
  if (hidden && !open) return null

  const disabled = busy || isPending

  const actions = savedJobId ? (
    <>
      <span className="inline-flex items-center gap-1.5 pr-1 text-[13px] font-semibold text-primary">
        <Check className="size-4" /> Saved to Wishlist
      </span>
      <Button asChild variant="outline" size="sm">
        <Link href={`/jobs?job=${savedJobId}`}>View in Jobs</Link>
      </Button>
    </>
  ) : (
    <>
      <Button size="sm" onClick={save} disabled={disabled}>Save</Button>
      <Button variant="outline" size="sm" onClick={dismiss} disabled={disabled}>Dismiss</Button>
      <Button asChild variant="outline" size="sm">
        <a href={posting.url} target="_blank" rel="noopener noreferrer">
          Apply <ExternalLink />
        </a>
      </Button>
    </>
  )

  // Remote postings carry the regions the pipeline found ("Worldwide", "APAC"); others show only
  // the location text.
  const place = (
    <>
      <span>{posting.location}</span>
      {posting.regions.map((code) => (
        <span key={code} className="rounded-full bg-primary/10 px-2 text-[11px] font-semibold leading-5 text-primary">
          {regionLabel(code)}
        </span>
      ))}
    </>
  )

  // `relative` anchors the title link's overlay (see DETAILS_LINK), and `group` lets the title
  // underline when the pointer is anywhere on the card.
  const surface = `${hidden ? 'hidden ' : ''}group relative rounded-xl border bg-card ${savedJobId ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-ring/40'}`

  const modal = (
    <PostingModal
      posting={posting}
      open={open}
      onOpenChange={onOpenChange}
      savedJobId={savedJobId}
      dismissed={hidden}
      disabled={disabled}
      error={error}
      onSave={save}
      onDismiss={dismiss}
      onUndo={undo}
    />
  )

  const avatar = (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-bold text-secondary-foreground">
      {companyInitial(posting.company)}
    </div>
  )

  if (variant === 'row') {
    return (
      <>
      <div className={surface}>
        {/* flex-wrap: on a phone the three buttons don't fit beside the title, so they drop to their
            own line under it (and stay on one line on a wider screen). */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
          {avatar}
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className={`block max-w-full truncate font-semibold leading-tight ${OPEN_DETAILS}`}
            >
              {posting.role}
            </button>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
              <b className="font-semibold text-foreground">{posting.company}</b>
              {place}
              <span>{posting.postedLabel}</span>
            </div>
          </div>
          <div className="relative z-10 ml-auto flex w-full shrink-0 items-center justify-end gap-1.5 sm:w-auto">{actions}</div>
        </div>
        {error && <p className="px-3 pb-2 text-xs text-destructive">{error}</p>}
      </div>
      {modal}
      </>
    )
  }

  const shownRequirements = posting.requirements.slice(0, 3)
  const extra = posting.requirements.length - shownRequirements.length

  return (
    <>
    <div className={`${surface} flex flex-col gap-2.5 p-3.5`}>
      <div className="flex items-center gap-3">
        {avatar}
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className={`font-semibold leading-tight ${OPEN_DETAILS}`}
          >
            {posting.role}
          </button>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            <b className="font-semibold text-foreground">{posting.company}</b>
            {place}
          </div>
        </div>
      </div>

      {shownRequirements.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {shownRequirements.map((r) => (
            // A requirement can be a whole sentence, so each chip is capped and truncated.
            <span key={r} className="max-w-full truncate rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
              {r}
            </span>
          ))}
          {extra > 0 && (
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">+{extra}</span>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
        <span className="text-[13px] text-muted-foreground">{posting.postedLabel}</span>
        <span className="flex-1" />
        <div className="relative z-10 flex flex-wrap items-center gap-2">{actions}</div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
    {modal}
    </>
  )
}
