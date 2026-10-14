import Link from 'next/link'
import { FileText, ListChecks, Target } from 'lucide-react'
import MatchRunner from '@/components/MatchRunner'
import CheckMatchButton from '@/components/CheckMatchButton'
import { MatchVerdict, Verdict, VERDICT_BADGE, VERDICT_DOT, VERDICT_LABEL, parseVerdicts } from '@/lib/match'

// The resume match panel in the job detail pane (docs/mockups/2026-10-14-job-match-panel.html).
// A server component: it picks one of five states from data it already has, so "no resume" and
// "no requirements" show straight away, without a request that would only fail. The two states
// that come from a click (checking, error) live in MatchRunner.

export type MatchPanelState = 'no-resume' | 'no-requirements' | 'never' | 'result' | 'stale'

type PanelInput = {
  hasResume: boolean
  requirementCount: number
  score: number | null
  verdicts: MatchVerdict[] | null
  matchedAt: Date | null
  resumeUpdatedAt: Date | null
}

// Decides which state the panel shows. Every case in the mockup must be reachable, and each
// input combination must land in exactly one state.
export function panelState(input: PanelInput): MatchPanelState {
  if (input.hasResume === false){
    return 'no-resume'
  } else if (input.requirementCount === 0){
    return "no-requirements"
  } else if (input.matchedAt === null || input.score === null || input.verdicts === null){
    return "never"
  } else if (input.resumeUpdatedAt !== null && input.resumeUpdatedAt > input.matchedAt){
    return "stale"
  } 

  return "result"
}

// Server code runs in UTC; without a fixed zone a check made before 8am in Manila would show the
// previous day. Same reason as the Profile page's formatDate.
function formatCheckedDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

function countVerdicts(verdicts: MatchVerdict[]): Record<Verdict, number> {
  const counts: Record<Verdict, number> = { met: 0, partial: 0, missing: 0 }
  for (const v of verdicts) counts[v.verdict]++
  return counts
}

function PanelIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex size-21 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      {children}
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div className="shrink-0 text-center">
      <div
        className="flex size-21 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(var(--primary) 0 ${score}%, var(--muted) ${score}% 100%)` }}
      >
        <div className="flex size-17 items-center justify-center rounded-full bg-card text-2xl font-bold text-foreground">
          {score}
        </div>
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">Resume match</div>
    </div>
  )
}

function MatchResult({
  score,
  summary,
  verdicts,
  matchedAt,
  faded,
}: {
  score: number
  summary: string
  verdicts: MatchVerdict[]
  matchedAt: Date
  faded: boolean
}) {
  const counts = countVerdicts(verdicts)

  return (
    <div className={faded ? 'opacity-45' : ''}>
      <div className="flex flex-wrap items-center gap-5">
        <ScoreRing score={score} />
        <div className="min-w-50 flex-1">
          <p className="mb-2 text-sm text-foreground">{summary}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {(['met', 'partial', 'missing'] as const).map((v) => (
              <span key={v} className="inline-flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${VERDICT_DOT[v]}`} />
                {counts[v]} {VERDICT_LABEL[v].toLowerCase()}
              </span>
            ))}
            <span>· Checked {formatCheckedDate(matchedAt)}</span>
          </div>
        </div>
        {!faded && <CheckMatchButton label="Re-check" variant="outline" />}
      </div>

      {/* columns, not a grid: the list flows down the first column, then the second, so reading
          order matches the job's requirement order. */}
      <div className="mt-4 gap-6 border-t pt-3 sm:columns-2">
        {verdicts.map((v, i) => (
          <div key={`${i}-${v.requirement}`} className="flex break-inside-avoid gap-2.5 border-b py-2.5 last:border-b-0">
            <span
              className={`h-fit min-w-16 shrink-0 rounded-md px-2 py-0.5 text-center text-[11px] font-semibold ${VERDICT_BADGE[v.verdict]}`}
            >
              {VERDICT_LABEL[v.verdict]}
            </span>
            <div className="min-w-0 text-sm text-foreground">
              {v.requirement}
              <div className="text-xs text-muted-foreground">{v.reason}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function JobMatchPanel({
  jobId,
  requirementCount,
  hasResume,
  resumeUpdatedAt,
  matchScore,
  matchSummary,
  matchVerdicts,
  matchedAt,
}: {
  jobId: string
  requirementCount: number
  hasResume: boolean
  resumeUpdatedAt: Date | null
  matchScore: number | null
  matchSummary: string | null
  matchVerdicts: unknown
  matchedAt: Date | null
}) {
  const verdicts = parseVerdicts(matchVerdicts)
  const state = panelState({ hasResume, requirementCount, score: matchScore, verdicts, matchedAt, resumeUpdatedAt })

  let body: React.ReactNode

  if (state === 'no-resume') {
    body = (
      <div className="flex flex-wrap items-center gap-5">
        <PanelIcon><FileText className="size-8" aria-hidden /></PanelIcon>
        <div className="min-w-50 flex-1">
          <p className="font-semibold text-foreground">Add your resume first</p>
          <p className="text-sm text-muted-foreground">
            Matching compares this job&apos;s requirements with the resume saved on your Profile.
          </p>
        </div>
        <Link
          href="/profile"
          className="rounded-lg border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          Go to Profile →
        </Link>
      </div>
    )
  } else if (state === 'no-requirements') {
    body = (
      <div className="flex flex-wrap items-center gap-5">
        <PanelIcon><ListChecks className="size-8" aria-hidden /></PanelIcon>
        <div className="min-w-50 flex-1">
          <p className="font-semibold text-foreground">No requirements to match</p>
          <p className="text-sm text-muted-foreground">
            Add the job&apos;s requirements with Edit, or paste the posting into autofill, then check the match.
          </p>
        </div>
        <CheckMatchButton label="Check match" disabled />
      </div>
    )
  } else if (state === 'never') {
    body = (
      <div className="flex flex-wrap items-center gap-5">
        <PanelIcon><Target className="size-8" aria-hidden /></PanelIcon>
        <div className="min-w-50 flex-1">
          <p className="font-semibold text-foreground">How well does your resume fit?</p>
          <p className="text-sm text-muted-foreground">
            Gemini checks each of this job&apos;s {requirementCount} requirements against your resume. Takes about
            10–30 seconds.
          </p>
        </div>
        <CheckMatchButton label="Check match" />
      </div>
    )
  } else {
    // 'result' and 'stale' both need a complete saved result. panelState only returns them when
    // score, verdicts and matchedAt are all present; this guard makes that visible to TypeScript.
    if (matchScore === null || verdicts === null || matchedAt === null) return null
    const stale = state === 'stale'

    body = (
      <>
        {stale && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
            <span>Your resume changed after this check. The score may be out of date.</span>
            <CheckMatchButton label="Re-check" />
          </div>
        )}
        <MatchResult
          score={matchScore}
          summary={matchSummary ?? ''}
          verdicts={verdicts}
          matchedAt={matchedAt}
          faded={stale}
        />
      </>
    )
  }

  return (
    <section aria-label="Resume match" className="rounded-xl border bg-card p-4">
      <MatchRunner jobId={jobId} requirementCount={requirementCount}>
        {body}
      </MatchRunner>
    </section>
  )
}
