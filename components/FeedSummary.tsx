import Link from 'next/link'
import {
  COUNTRIES,
  SENIORITY_LABEL,
  WORK_ARRANGEMENT_LABEL,
  regionLabel,
} from '@/lib/profile-attributes'
import type { FeedAttributes } from '@/lib/discover'

const countryName = new Map<string, string>(COUNTRIES.map((c) => [c.code, c.label]))

// The preferences that are filtering the feed, as chips, with a way to change them. Server
// component: it only displays the saved attributes. Editing happens on /profile.
export default function FeedSummary({ attributes }: { attributes: FeedAttributes }): React.JSX.Element {
  const chips: string[] = [
    ...attributes.targetRoles,
    ...(attributes.seniority ? [SENIORITY_LABEL[attributes.seniority]] : []),
    ...(attributes.country ? [countryName.get(attributes.country) ?? attributes.country] : []),
    ...attributes.workArrangements.map((w) => WORK_ARRANGEMENT_LABEL[w]),
    ...attributes.remoteRegions.map((r) => `Remote: ${regionLabel(r)}`),
  ]

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-border bg-card px-3 py-2.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Matching</span>
      {chips.map((chip) => (
        <span key={chip} className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
          {chip}
        </span>
      ))}
      <span className="flex-1" />
      <Link href="/profile" className="text-sm text-primary hover:underline">
        Edit preferences →
      </Link>
    </div>
  )
}
