'use client'
import { createContext, useContext, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { messageFromResponse } from '@/lib/api-error'

// The client half of the match panel. JobMatchPanel (a server component) decides which state to
// show and renders it as `children`; this wrapper adds the two states that only exist after a
// click: "checking" (replaces the children) and an error banner (sits above them, so a failed
// re-check keeps the last good result in view).
//
// The buttons inside the server markup are CheckMatchButtons. They are client components too,
// and reach run() through this context rather than through props, because server markup can't
// pass a function down to them.

type MatchRunnerValue = { run: () => Promise<void>; isChecking: boolean }

const MatchRunnerContext = createContext<MatchRunnerValue | null>(null)

export function useMatchRunner(): MatchRunnerValue {
  const value = useContext(MatchRunnerContext)
  if (!value) throw new Error('CheckMatchButton must be inside a MatchRunner.')
  return value
}

export default function MatchRunner({
  jobId,
  requirementCount,
  children,
}: {
  jobId: string
  requirementCount: number
  children: React.ReactNode
}) {
  const router = useRouter()
  const [isChecking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // POSTs to /api/jobs/[jobId]/match. On success, router.refresh() re-renders JobMatchPanel on
  // the server with the newly saved result. On failure, the message goes in `error`.
  const run = async (): Promise<void> => {
    setChecking(true)
    setError(null)

    try{
      const res = await fetch(`/api/jobs/${jobId}/match`, {method: "POST"})

      const message = await messageFromResponse(res)

      if (message){
        setError(message)
        return
      }

      startTransition(() => router.refresh()) 
    } catch(err) {
      console.error("Match failed.", err)
      setError("Something went wrong. Please try again.")
    } finally {
      setChecking(false)
    } 
  }

  return (
    <MatchRunnerContext.Provider value={{ run, isChecking: isChecking || isPending }}>
      {isChecking || isPending ? (
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex size-21 shrink-0 items-center justify-center">
            <Loader2 className="size-14 animate-spin text-primary" aria-hidden />
          </div>
          <div className="min-w-50 flex-1">
            <p className="font-semibold text-foreground">Checking {requirementCount} requirements…</p>
            <p className="text-sm text-muted-foreground">
              This usually takes 10–30 seconds. You can keep using the page.
            </p>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-400/15 dark:text-red-300"
            >
              {error}
            </div>
          )}
          {children}
        </>
      )}
    </MatchRunnerContext.Provider>
  )
}
