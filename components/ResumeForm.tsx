'use client'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { RESUME_LENGTH } from '@/lib/resume'
import { messageFromResponse } from '@/lib/api-error'

// Mirrors profileSchema in app/api/profile/route.ts. The two are separate definitions, so a
// change to one needs the other.
const resumeSchema = z.object({
  resume: z
    .string()
    .trim()
    .min(RESUME_LENGTH.min, `Resume must be at least ${RESUME_LENGTH.min} characters`)
    .max(RESUME_LENGTH.max, `Resume must be at most ${RESUME_LENGTH.max} characters`),
})

type ResumeFormData = z.infer<typeof resumeSchema>

export default function ResumeForm({
  initialResume,
  savedLabel,
}: {
  initialResume: string
  savedLabel: string | null // e.g. "12 Oct", formatted on the server; null if never saved
}): React.JSX.Element {
  const router = useRouter()
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, reset, control, formState: { errors, isDirty } } = useForm<ResumeFormData>({
    resolver: zodResolver(resumeSchema),
    defaultValues: { resume: initialResume },
  })

  const resume = useWatch({ control, name: 'resume' })

  const count = resume.trim().length

  const tooLong = count > RESUME_LENGTH.max

  const onSubmit = async (data: ResumeFormData): Promise<void> => {
    setLoading(true)
    setError(null)

    try{
      const res = await fetch(`/api/profile`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({resume: data.resume})
      })

      const message = await messageFromResponse(res)

      if (message){
        setError(message)
        return
      }

      router.refresh()
      reset({resume: data.resume})
    } catch(err){
      console.error("Resume update failed.", err)
      setError("Something went wrong. Please try again.")
    } finally{
      setLoading(false)
    }
  }

  const onDiscard = (): void => {
    reset()
    setError(null)
  }

  const status = isDirty ? 'Unsaved changes' : savedLabel ? `Saved ${savedLabel}` : 'Not saved yet'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col">
      <div className="flex items-start gap-4 px-4 pt-4">
        <div>
          <h2 className="text-sm font-semibold">Resume</h2>
          <p className="text-xs text-muted-foreground">Plain text. Used by &quot;Check match&quot; on each job.</p>
        </div>
        <span
          className={`ml-auto pt-0.5 text-xs tabular-nums ${tooLong ? 'text-destructive' : 'text-muted-foreground'}`}
          aria-live="polite"
        >
          <span className={tooLong ? '' : 'font-semibold text-foreground'}>{count.toLocaleString()}</span>
          {' / '}
          {RESUME_LENGTH.max.toLocaleString()}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-4 pt-3 pb-4">
        <label htmlFor="resume" className="sr-only">Resume</label>
        {/* Fixed height: the shadcn Textarea's field-sizing-content would otherwise grow with
            a 15,000-character resume and push the Save button off the screen. */}
        <Textarea
          id="resume"
          className="h-[60vh] max-h-[60vh] min-h-64 resize-none font-mono text-[13px] leading-relaxed md:text-[13px]"
          placeholder={'Paste your resume as plain text: experience, skills, education.\nAt least 500 characters.'}
          aria-invalid={!!errors.resume}
          aria-describedby={errors.resume ? 'resume-error' : undefined}
          {...register('resume')}
        />

        {errors.resume && (
          <p id="resume-error" className="mt-2 text-xs text-destructive">{errors.resume.message}</p>
        )}
        {error && (
          <p className="mt-2 rounded bg-destructive/10 py-2 text-center text-sm font-medium text-destructive">{error}</p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{status}</span>
          <span className="flex-1" />
          <Button type="button" variant="ghost" onClick={onDiscard} disabled={!isDirty || isLoading}>
            Discard
          </Button>
          <Button type="submit" disabled={!isDirty || isLoading}>
            {isLoading ? 'Saving...' : 'Save resume'}
          </Button>
        </div>
      </div>
    </form>
  )
}
