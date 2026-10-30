'use client'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import FormField from '@/components/FormField'
import { Seniority, WorkArrangement } from '@/lib/generated/prisma/enums'
import {
  ATTRIBUTE_LIMITS,
  COUNTRIES,
  REMOTE_REGIONS,
  SENIORITY_LABEL,
  WORK_ARRANGEMENT_LABEL,
  joinList,
  splitList,
} from '@/lib/profile-attributes'
import { messageFromResponse } from '@/lib/api-error'

// Mirrors profileSchema in app/api/profile/route.ts. The two are separate definitions, so a
// change to one needs the other. Roles and skills are typed as comma-separated text and split
// into arrays on submit; country and seniority use '' for "no preference" (the server takes null).
const attributesSchema = z.object({
  targetRoles: z
    .string()
    .refine((v) => splitList(v).length <= ATTRIBUTE_LIMITS.roles, `Add at most ${ATTRIBUTE_LIMITS.roles} roles`)
    .refine(
      (v) => splitList(v).every((role) => role.length <= ATTRIBUTE_LIMITS.roleLength),
      `Each role must be at most ${ATTRIBUTE_LIMITS.roleLength} characters`
    ),
  country: z.string(),
  workArrangements: z.array(z.string()),
  remoteRegions: z.array(z.string()),
  seniority: z.string(),
  skills: z
    .string()
    .refine((v) => splitList(v).length <= ATTRIBUTE_LIMITS.skills, `Add at most ${ATTRIBUTE_LIMITS.skills} skills`)
    .refine(
      (v) => splitList(v).every((skill) => skill.length <= ATTRIBUTE_LIMITS.skillLength),
      `Each skill must be at most ${ATTRIBUTE_LIMITS.skillLength} characters`
    ),
})

type AttributesFormData = z.infer<typeof attributesSchema>

export type SavedAttributes = {
  targetRoles: string[]
  country: string | null
  workArrangements: WorkArrangement[]
  remoteRegions: string[]
  seniority: Seniority | null
  skills: string[]
}

// Radix's Select can't use '' as an item value, so "no preference" is this stand-in.
const NONE = 'none'

// A row of checkboxes that edits an array of codes.
function CheckboxGroup({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string
  options: readonly { code: string; label: string }[]
  value: string[]
  onChange: (next: string[]) => void
}): React.JSX.Element {
  const toggle = (code: string): void => {
    onChange(value.includes(code) ? value.filter((v) => v !== code) : [...value, code])
  }

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">
        {legend} <span className="text-xs font-normal text-muted-foreground">optional</span>
      </legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {options.map((o) => (
          <label key={o.code} className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={value.includes(o.code)}
              onChange={() => toggle(o.code)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function toFormData(saved: SavedAttributes): AttributesFormData {
  return {
    targetRoles: joinList(saved.targetRoles),
    country: saved.country ?? '',
    workArrangements: saved.workArrangements,
    remoteRegions: saved.remoteRegions,
    seniority: saved.seniority ?? '',
    skills: joinList(saved.skills),
  }
}

export default function AttributesForm({
  initial,
  savedLabel,
  resumeChanged,
  hasResume,
}: {
  initial: SavedAttributes
  savedLabel: string | null // e.g. "12 Oct", formatted on the server; null if never saved
  resumeChanged: boolean // the resume was saved after these attributes were
  hasResume: boolean
}): React.JSX.Element {
  const router = useRouter()
  const [isLoading, setLoading] = useState(false)
  const [isFilling, setFilling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<AttributesFormData>({
    resolver: zodResolver(attributesSchema),
    defaultValues: toFormData(initial),
  })

  const onSubmit = async (data: AttributesFormData): Promise<void> => {
    setLoading(true)
    setError(null)
    setNotice(null)

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetRoles: splitList(data.targetRoles),
          country: data.country || null,
          workArrangements: data.workArrangements,
          remoteRegions: data.remoteRegions,
          seniority: data.seniority || null,
          skills: splitList(data.skills),
        }),
      })

      const message = await messageFromResponse(res)

      if (message) {
        setError(message)
        return
      }

      router.refresh()
      reset(data)
    } catch (err) {
      console.error('Attributes update failed.', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const onDiscard = (): void => {
    reset()
    setError(null)
    setNotice(null)
  }

  // Fills the form only. Nothing is saved until the user presses Save. A field the resume didn't
  // answer (null or an empty list) is left as it was, not cleared.
  const onAutofill = async (): Promise<void> => {
    setFilling(true)
    setError(null)
    setNotice(null)

    try {
      const res = await fetch('/api/profile/autofill', { method: 'POST' })

      const message = await messageFromResponse(res)

      if (message) {
        setError(message)
        return
      }

      const result = (await res.json()) as {
        targetRoles: string[] | null
        country: string | null
        workArrangements: string[] | null
        remoteRegions: string[] | null
        seniority: string | null
        skills: string[] | null
      }

      const opts = { shouldDirty: true }
      let filled = 0

      if (result.targetRoles?.length) {
        setValue('targetRoles', joinList(result.targetRoles), opts)
        filled += 1
      }
      if (result.country) {
        setValue('country', result.country, opts)
        filled += 1
      }
      if (result.workArrangements?.length) {
        setValue('workArrangements', result.workArrangements, opts)
        filled += 1
      }
      if (result.remoteRegions?.length) {
        setValue('remoteRegions', result.remoteRegions, opts)
        filled += 1
      }
      if (result.seniority) {
        setValue('seniority', result.seniority, opts)
        filled += 1
      }
      if (result.skills?.length) {
        setValue('skills', joinList(result.skills), opts)
        filled += 1
      }

      setNotice(
        filled === 0
          ? 'Your resume did not say enough to fill anything.'
          : `Filled ${filled} ${filled === 1 ? 'field' : 'fields'} from your resume. Review them, then press Save.`
      )
    } catch (err) {
      console.error('Profile autofill failed.', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setFilling(false)
    }
  }

  const status = isDirty ? 'Unsaved changes' : savedLabel ? `Saved ${savedLabel}` : 'Not saved yet'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 pt-4">
        <div>
          <h2 className="text-sm font-semibold">Job preferences</h2>
          <p className="text-xs text-muted-foreground">
            Used to filter the postings feed. Leave a field empty for no preference.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={onAutofill}
          disabled={!hasResume || isFilling || isLoading}
        >
          {isFilling ? 'Reading resume...' : 'Autofill from resume'}
        </Button>
      </div>

      {(!hasResume || resumeChanged) && (
        <p className="px-4 pt-2 text-xs text-muted-foreground">
          {hasResume ? 'Your resume changed since these were saved.' : 'Save your resume to use Autofill.'}
        </p>
      )}

      <div className="grid gap-4 px-4 pt-4 pb-4 sm:grid-cols-2">
        <FormField
          id="attr-roles"
          label="Target roles"
          optional
          error={errors.targetRoles?.message}
          hint="Separate with commas. Short titles match best."
          className="sm:col-span-2"
        >
          <Input
            id="attr-roles"
            placeholder="e.g. Full-Stack Developer, Backend Engineer"
            aria-invalid={!!errors.targetRoles}
            aria-describedby={errors.targetRoles ? 'attr-roles-error' : undefined}
            {...register('targetRoles')}
          />
        </FormField>

        <FormField id="attr-seniority" label="Seniority" optional>
          <Controller
            control={control}
            name="seniority"
            render={({ field }) => (
              <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)}>
                <SelectTrigger id="attr-seniority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No preference</SelectItem>
                  {Object.values(Seniority).map((s) => (
                    <SelectItem key={s} value={s}>{SENIORITY_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <FormField id="attr-country" label="Country" optional>
          <Controller
            control={control}
            name="country"
            render={({ field }) => (
              <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? '' : v)}>
                <SelectTrigger id="attr-country" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No preference</SelectItem>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <div className="sm:col-span-2">
          <Controller
            control={control}
            name="workArrangements"
            render={({ field }) => (
              <CheckboxGroup
                legend="Work arrangements"
                options={Object.values(WorkArrangement).map((w) => ({ code: w, label: WORK_ARRANGEMENT_LABEL[w] }))}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </div>

        <div className="sm:col-span-2">
          <Controller
            control={control}
            name="remoteRegions"
            render={({ field }) => (
              <CheckboxGroup
                legend="Remote work open to"
                options={REMOTE_REGIONS}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </div>

        <FormField
          id="attr-skills"
          label="Skills"
          optional
          error={errors.skills?.message}
          hint="Separate with commas. Not used to filter yet."
          className="sm:col-span-2"
        >
          <Textarea
            id="attr-skills"
            className="h-20 min-h-20 resize-none"
            placeholder="e.g. TypeScript, Python, PostgreSQL"
            aria-invalid={!!errors.skills}
            aria-describedby={errors.skills ? 'attr-skills-error' : undefined}
            {...register('skills')}
          />
        </FormField>

        {notice && <p className="rounded bg-secondary py-2 text-center text-sm sm:col-span-2">{notice}</p>}
        {error && (
          <p className="rounded bg-destructive/10 py-2 text-center text-sm font-medium text-destructive sm:col-span-2">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 sm:col-span-2">
          <span className="text-xs text-muted-foreground">{status}</span>
          <span className="flex-1" />
          <Button type="button" variant="ghost" onClick={onDiscard} disabled={!isDirty || isLoading}>
            Discard
          </Button>
          <Button type="submit" disabled={!isDirty || isLoading}>
            {isLoading ? 'Saving...' : 'Save preferences'}
          </Button>
        </div>
      </div>
    </form>
  )
}
