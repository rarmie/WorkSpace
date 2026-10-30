import { Seniority, WorkArrangement } from '@/lib/generated/prisma/enums'

// The profile attributes that filter the discovery feed (docs/discovery-plan.md, Phase 7b).
// No imports besides the generated enums, so client forms and API routes can share it.

// The codes pipeline/rules.py writes into DiscoveredPosting.regions. Keep in step with
// _REGION_PATTERNS there and with backend/schemas.py (COUNTRY_CODES, REGION_CODES).
export const COUNTRIES = [
  { code: 'PH', label: 'Philippines' },
  { code: 'US', label: 'United States' },
  { code: 'UK', label: 'United Kingdom' },
  { code: 'CA', label: 'Canada' },
  { code: 'CN', label: 'China' },
  { code: 'TW', label: 'Taiwan' },
  { code: 'JP', label: 'Japan' },
] as const

// Broad areas first, then the countries: a remote role can be open to either.
export const REMOTE_REGIONS = [
  { code: 'GLOBAL', label: 'Worldwide' },
  { code: 'APAC', label: 'Asia-Pacific' },
  { code: 'EMEA', label: 'Europe, Middle East, Africa' },
  { code: 'AMER', label: 'The Americas' },
  ...COUNTRIES,
] as const

export const COUNTRY_CODES = COUNTRIES.map((c) => c.code)
export const REGION_CODES = REMOTE_REGIONS.map((r) => r.code)

export const WORK_ARRANGEMENT_LABEL: Record<WorkArrangement, string> = {
  REMOTE: 'Remote',
  HYBRID: 'Hybrid',
  ONSITE: 'On-site',
}

export const SENIORITY_LABEL: Record<Seniority, string> = {
  INTERN: 'Intern',
  JUNIOR: 'Junior',
  MID: 'Mid-level',
  SENIOR: 'Senior',
}

// Mirrors FastAPI's caps in backend/profile_attributes.py.
export const ATTRIBUTE_LIMITS = {
  roles: 10,
  roleLength: 100,
  skills: 50,
  skillLength: 60,
} as const

// The short tag on a posting card: GLOBAL reads as "Worldwide", any other code shows as itself.
// Lives here, not in lib/discover.ts, because that file reads the database and must stay out of
// client components.
export function regionLabel(code: string): string {
  return code === 'GLOBAL' ? 'Worldwide' : code
}

// "a, b ,, A" -> ["a", "b"]. Trims, drops blanks, and drops repeats ignoring case.
export function splitList(text: string): string[] {
  const seen = new Set<string>()
  const items: string[] = []

  for (const part of text.split(',')) {
    const item = part.trim()
    const key = item.toLowerCase()

    if (item === '' || seen.has(key)) continue

    seen.add(key)
    items.push(item)
  }

  return items
}

export function joinList(items: string[]): string {
  return items.join(', ')
}
