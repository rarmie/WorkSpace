import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import type { Seniority, WorkArrangement } from '@/lib/generated/prisma/enums'
import { SENIORITY_LABEL } from '@/lib/profile-attributes'

// The discovery feed (docs/discovery-plan.md, Phase 7c), shared by the dashboard and /discover.
// Server only: it reads the database. Components get plain `PostingView` objects.

export const FEED_PAGE_SIZE = 20

// The preferences saved on /profile (Phase 7b). Empty or null means "no preference", and the
// rule that uses it is skipped.
export type FeedAttributes = {
  targetRoles: string[]
  country: string | null
  workArrangements: WorkArrangement[]
  remoteRegions: string[]
  seniority: Seniority | null
}

export type FeedOptions = {
  userId: string
  attributes: FeedAttributes
  page?: number // 1-based
  pageSize?: number
  search?: string
  // Let in remote postings with no stated region (hidden by default: they are most often US-only).
  showNoRegion?: boolean
  // Skip the preference rules and show every open posting the user hasn't saved or dismissed.
  allOpen?: boolean
}

// What a card or row needs. Dates are ISO strings so this can cross into a client component.
export type PostingView = {
  id: string
  company: string
  role: string
  location: string
  regions: string[]
  requirements: string[]
  url: string
  postedLabel: string // "Posted 3 days ago", or "Seen 5 days ago" when the source gave no date
  // The rest is for the details dialog (components/PostingModal.tsx), which opens from this object
  // alone, with no server round trip. Dates are formatted here, in Asia/Manila.
  postedOn: string | null // "26 Jan 2026", or null when the source gave no date
  firstSeenOn: string
  level: string // "Junior", or "Not stated" (most titles carry no seniority word)
  source: string // "Greenhouse · CTE PH"
}

export type FeedResult = {
  postings: PostingView[]
  total: number // matching the feed, across all pages
  openCount: number // open and not saved or dismissed, ignoring the preference rules
  hasPreferences: boolean
}

// A posting's level (pipeline/rules.py) only ever holds INTERN, JUNIOR or SENIOR. A title with no
// seniority word has level null, which is never hidden. MID has no posting level of its own: it
// is the step between JUNIOR and SENIOR.
const LADDER: Seniority[] = ['INTERN', 'JUNIOR', 'MID', 'SENIOR']

// Levels more than one step above the user's. A JUNIOR user sees up to MID, so SENIOR is hidden.
export function hiddenLevels(seniority: Seniority): string[] {
  const maxRank = LADDER.indexOf(seniority) + 1
  return LADDER.filter((_, rank) => rank > maxRank)
}

// The user's saved preferences, or null if the user row is gone (a session cookie can outlive it).
export async function getFeedAttributes(userId: string): Promise<FeedAttributes | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { targetRoles: true, country: true, workArrangements: true, remoteRegions: true, seniority: true },
  })
}

export function hasPreferences(a: FeedAttributes): boolean {
  return (
    a.targetRoles.length > 0 ||
    a.country !== null ||
    a.workArrangements.length > 0 ||
    a.remoteRegions.length > 0 ||
    a.seniority !== null
  )
}

// The location rule. A posting shows if any branch matches:
// - the user takes ONSITE or HYBRID, and the posting's regions contain their country;
// - the user takes REMOTE, the posting is remote, and its regions contain GLOBAL, their country,
//   or one of their remote regions;
// - (toggle) the user takes REMOTE, and the posting is remote with no stated region.
// A branch that needs something the user didn't set is left out. With no branches left, the rule
// is skipped instead of hiding everything.
function locationRule(
  a: FeedAttributes,
  showNoRegion: boolean
): Prisma.DiscoveredPostingWhereInput | null {
  const branches: Prisma.DiscoveredPostingWhereInput[] = []
  const takesRemote = a.workArrangements.includes('REMOTE')
  const takesOnsite = a.workArrangements.includes('ONSITE') || a.workArrangements.includes('HYBRID')

  if (takesOnsite && a.country) {
    branches.push({ regions: { has: a.country } })
  }

  if (takesRemote) {
    const open = new Set(['GLOBAL', ...a.remoteRegions])
    if (a.country) open.add(a.country)
    branches.push({ isRemote: true, regions: { hasSome: [...open] } })

    if (showNoRegion) {
      branches.push({ isRemote: true, regions: { isEmpty: true } })
    }
  }

  return branches.length > 0 ? { OR: branches } : null
}

function buildWhere(opts: FeedOptions, withRules: boolean): Prisma.DiscoveredPostingWhereInput {
  const { userId, attributes: a, search, showNoRegion = false } = opts

  const and: Prisma.DiscoveredPostingWhereInput[] = [
    // Not already saved, and not dismissed. The unique (userId, postingId) pairs make both cheap.
    { jobs: { none: { userId } } },
    { dismissals: { none: { userId } } },
  ]

  if (search) {
    and.push({
      OR: [
        { company: { contains: search, mode: 'insensitive' } },
        { role: { contains: search, mode: 'insensitive' } },
      ],
    })
  }

  if (withRules) {
    // Title matching is rough ("Software Engineer" misses "SWE"), so the user keeps roles short
    // and adds variants.
    if (a.targetRoles.length > 0) {
      and.push({ OR: a.targetRoles.map((role) => ({ role: { contains: role, mode: 'insensitive' as const } })) })
    }

    const location = locationRule(a, showNoRegion)
    if (location) and.push(location)

    if (a.seniority) {
      const hidden = hiddenLevels(a.seniority)
      // `notIn` alone would also drop level = null (SQL's NULL NOT IN is not true), so null is
      // let through on purpose.
      if (hidden.length > 0) and.push({ OR: [{ level: null }, { level: { notIn: hidden } }] })
    }
  }

  return { closedAt: null, AND: and }
}

// Whole days between two dates, never negative.
function daysAgo(date: Date, now: number): number {
  return Math.max(0, Math.floor((now - date.getTime()) / 86_400_000))
}

function relative(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}

// Dates are formatted on the server, which runs in UTC. Without a fixed time zone a posting
// published before 8am in Manila would show the previous day (as on the profile page).
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' })
}

// What the pipeline calls each board, as the user would write it.
const SOURCE_LABEL: Record<string, string> = { greenhouse: 'Greenhouse', ashby: 'Ashby', lever: 'Lever' }

export async function getFeed(opts: FeedOptions): Promise<FeedResult> {
  const { page = 1, pageSize = FEED_PAGE_SIZE, allOpen = false } = opts

  const where = buildWhere(opts, !allOpen)

  const [rows, total, openCount] = await Promise.all([
    prisma.discoveredPosting.findMany({
      where,
      // Posted date first, first-seen as the tie-break.
      orderBy: [{ postedAt: { sort: 'desc', nulls: 'last' } }, { firstSeenAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        company: true,
        role: true,
        location: true,
        regions: true,
        requirements: true,
        url: true,
        postedAt: true,
        firstSeenAt: true,
        level: true,
        source: true,
      },
    }),
    prisma.discoveredPosting.count({ where }),
    // Same search, no preference rules. Only used for "N postings were filtered out".
    allOpen ? Promise.resolve(0) : prisma.discoveredPosting.count({ where: buildWhere(opts, false) }),
  ])

  const now = Date.now()

  return {
    postings: rows.map((p) => ({
      id: p.id,
      company: p.company,
      role: p.role,
      location: p.location,
      regions: p.regions,
      requirements: p.requirements,
      url: p.url,
      postedLabel: p.postedAt
        ? `Posted ${relative(daysAgo(p.postedAt, now))}`
        : `Seen ${relative(daysAgo(p.firstSeenAt, now))}`,
      postedOn: p.postedAt ? formatDate(p.postedAt) : null,
      firstSeenOn: formatDate(p.firstSeenAt),
      level: p.level ? (SENIORITY_LABEL[p.level as Seniority] ?? p.level) : 'Not stated',
      source: `${SOURCE_LABEL[p.source] ?? p.source} · ${p.company}`,
    })),
    total,
    openCount: allOpen ? total : openCount,
    hasPreferences: hasPreferences(opts.attributes),
  }
}
