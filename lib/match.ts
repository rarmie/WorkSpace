import { z } from 'zod'

// One verdict from FastAPI's /match (backend/schemas.py, RequirementVerdict). Shared by the
// proxy route, which checks FastAPI's reply before saving it, and JobMatchPanel, which checks
// the saved matchVerdicts column before rendering it. No server-only imports, so client code
// can use it too.
export const verdictSchema = z.object({
  requirement: z.string(),
  verdict: z.enum(['met', 'partial', 'missing']),
  reason: z.string(),
})

export type MatchVerdict = z.infer<typeof verdictSchema>
export type Verdict = MatchVerdict['verdict']

export const VERDICT_LABEL: Record<Verdict, string> = {
  met: 'Met',
  partial: 'Partial',
  missing: 'Missing',
}

// Same light/dark pairing as STATUS_BADGE in lib/job-status.ts.
export const VERDICT_BADGE: Record<Verdict, string> = {
  met: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
  missing: 'bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-300',
}

export const VERDICT_DOT: Record<Verdict, string> = {
  met: 'bg-emerald-600 dark:bg-emerald-400',
  partial: 'bg-amber-600 dark:bg-amber-300',
  missing: 'bg-red-600 dark:bg-red-400',
}

// matchVerdicts is a Json column, so Prisma types it as JsonValue: it could hold anything.
// Returns the verdict list if the value has the right shape, or null if it doesn't (never
// checked, or a row written by an older shape).
export function parseVerdicts(value: unknown): MatchVerdict[] | null {
  const parsedVerdicts = z.array(verdictSchema).safeParse(value)

  return parsedVerdicts.success ? parsedVerdicts.data : null
}
