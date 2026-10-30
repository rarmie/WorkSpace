'use client'
import Link from 'next/link'
import { Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { companyInitial } from '@/lib/job-status'
import { regionLabel } from '@/lib/profile-attributes'
import type { PostingView } from '@/lib/discover'

function Fact({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-2.5">
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  )
}

// One posting in full, in a dialog. Mockup: docs/mockups/2026-10-31-posting-modal.html.
// It is driven by PostingItem, which owns the state (saved, dismissed, busy) and the open flag, so
// the card behind and the dialog never disagree. The title and the buttons stay put, and only the
// facts and requirements scroll, when the window is too short for them.
export default function PostingModal({
  posting,
  open,
  onOpenChange,
  savedJobId,
  dismissed,
  disabled,
  error,
  onSave,
  onDismiss,
  onUndo,
}: {
  posting: PostingView
  open: boolean
  onOpenChange: (open: boolean) => void
  savedJobId: string | null
  dismissed: boolean
  disabled: boolean
  error: string | null
  onSave: () => void
  onDismiss: () => void
  onUndo: () => void
}): React.JSX.Element {
  const regions = posting.regions.length > 0 ? posting.regions.map(regionLabel).join(', ') : 'Not stated'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The default grid and padding are replaced with a column that is never taller than the
          window: the header and buttons keep their height, and the body (min-h-0 + overflow) is
          the only part that shrinks and scrolls. */}
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-170">
        <div className="flex items-start gap-3 px-5 pt-5 pr-12 pb-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-base font-bold text-secondary-foreground">
            {companyInitial(posting.company)}
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-lg leading-tight font-bold tracking-tight">{posting.role}</DialogTitle>
            <DialogDescription asChild>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                <b className="font-semibold text-foreground">{posting.company}</b>
                <span>{posting.location}</span>
                {posting.regions.map((code) => (
                  <span key={code} className="rounded-full bg-primary/10 px-2 text-[11px] font-semibold leading-5 text-primary">
                    {regionLabel(code)}
                  </span>
                ))}
              </div>
            </DialogDescription>
          </div>
        </div>

        {dismissed && !savedJobId && (
          <div className="mx-5 mb-3 flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold">
            <span>Dismissed. Hidden from your feed.</span>
            <span className="flex-1" />
            <Button variant="outline" size="sm" onClick={onUndo} disabled={disabled}>Undo</Button>
          </div>
        )}

        <div className="px-5 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {savedJobId ? (
              <>
                <span className="inline-flex items-center gap-1.5 pr-1 text-sm font-semibold text-primary">
                  <Check className="size-4" /> Saved to Wishlist
                </span>
                <Button asChild variant="outline">
                  <Link href={`/jobs?job=${savedJobId}`}>View in Jobs</Link>
                </Button>
              </>
            ) : (
              <>
                <Button onClick={onSave} disabled={disabled}>Save to Wishlist</Button>
                {dismissed ? (
                  <Button variant="outline" onClick={onUndo} disabled={disabled}>Undo dismiss</Button>
                ) : (
                  <Button variant="outline" onClick={onDismiss} disabled={disabled}>Dismiss</Button>
                )}
              </>
            )}
            <Button asChild variant="outline">
              <a href={posting.url} target="_blank" rel="noopener noreferrer">
                Apply on company site <ExternalLink />
              </a>
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <div className="grid gap-2 sm:grid-cols-3">
            <Fact label="Location">{posting.location}</Fact>
            <Fact label="Region">{regions}</Fact>
            <Fact label="Posted">{posting.postedOn ?? 'Not stated'}</Fact>
            <Fact label="First seen">{posting.firstSeenOn}</Fact>
            <Fact label="Seniority">{posting.level}</Fact>
            <Fact label="Source">{posting.source}</Fact>
          </div>

          <section aria-label="Requirements" className="mt-3 rounded-xl border border-border bg-card p-3.5">
            <h3 className="mb-2 text-sm font-bold">
              Requirements <span className="font-normal text-muted-foreground">· {posting.requirements.length}</span>
            </h3>
            {posting.requirements.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {posting.requirements.map((requirement, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span aria-hidden="true" className="text-muted-foreground">•</span>
                    <span className="min-w-0">{requirement}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No requirements were found in this posting. Open the company listing to read it.
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
