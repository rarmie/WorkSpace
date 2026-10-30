'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter, useSearchParams } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import FormField from '@/components/FormField'
import { ApplicationStatus } from '@/lib/generated/prisma/enums'
import { PIPELINE_ORDER, STATUS_DOT, STATUS_LABEL } from '@/lib/job-status'
import { messageFromResponse } from '@/lib/api-error'

const STATUS_OPTIONS: ApplicationStatus[] = [...PIPELINE_ORDER, 'REJECTED']

// Mirrors the PATCH schema in app/api/jobs/[id]/route.ts. The two are separate definitions,
// so a change to one needs the other.
const editSchema = z.object({
  company: z.string().trim().min(1, 'Company is required'),
  role: z.string().trim().min(1, 'Role is required'),
  status: z.enum(['WISHLIST', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED']),
  link: z.union([z.url('Enter a full URL, starting with https://'), z.literal('')]),
  salary: z.string(),
  notes: z.string(),
  appliedAt: z.string(),
  requirements: z.string(),
})

type EditFormData = z.infer<typeof editSchema>

export type EditableJob = {
  id: string
  company: string
  role: string
  status: ApplicationStatus
  link: string | null
  salary: string | null
  notes: string | null
  requirements: string[]
  appliedAt: string | null // ISO string, or null if not applied yet; Dates are converted on the server
}

export default function EditJobDialog({ job }: { job: EditableJob }) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil /> Edit
        </Button>
      </DialogTrigger>
      {/* A stray click on the backdrop would throw away unsaved edits, so only Cancel, the X
          and Escape close it. */}
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Edit {job.company}</DialogTitle>
          <DialogDescription>Update the details of this application.</DialogDescription>
        </DialogHeader>
        {/* DialogContent unmounts when closed, so each open re-seeds the form from fresh props. */}
        <EditJobForm job={job} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function EditJobForm({ job, onClose }: { job: EditableJob; onClose: () => void }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      company: job.company,
      role: job.role,
      status: job.status,
      link: job.link ?? '',
      salary: job.salary ?? '',
      notes: job.notes ?? '',
      appliedAt: job.appliedAt?.slice(0, 10) ?? '', // yyyy-MM-dd for the date input
      requirements: job.requirements.join('\n'),
    },
  })

  const onSubmit = async (data: EditFormData) => {
    setLoading(true)
    setError(null)

    const payload = {
      ...data,
      appliedAt: data.appliedAt || null, // an empty date input means "not applied yet"
      requirements: data.requirements
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    }

    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const message = await messageFromResponse(res)
      if (message) {
        setError(message)
        return
      }

      // Without ?job the page shows its default (top) job. A status edit can move this job
      // out of that spot, so pin it in the URL first or the pane would switch jobs.
      if (searchParams.has('job')) {
        router.refresh()
      } else {
        const params = new URLSearchParams(searchParams.toString())
        params.set('job', job.id)
        router.replace(`/jobs?${params.toString()}`, { scroll: false })
      }
      onClose()
    } catch (err) {
      console.error('Job update failed.', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <p className="text-sm font-medium text-destructive text-center bg-destructive/10 py-2 rounded">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        <FormField id="edit-company" label="Company" required error={errors.company?.message}>
          <Input
            id="edit-company"
            placeholder="e.g. Stripe"
            aria-invalid={!!errors.company}
            aria-describedby={errors.company ? 'edit-company-error' : undefined}
            {...register('company')}
          />
        </FormField>
        <FormField id="edit-role" label="Role" required error={errors.role?.message}>
          <Input
            id="edit-role"
            placeholder="e.g. Backend Engineer"
            aria-invalid={!!errors.role}
            aria-describedby={errors.role ? 'edit-role-error' : undefined}
            {...register('role')}
          />
        </FormField>

        <FormField id="edit-status" label="Status">
          <Select
            defaultValue={job.status}
            onValueChange={(val) => setValue('status', val as EditFormData['status'])}
          >
            <SelectTrigger id="edit-status" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[s]}`} />
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="edit-applied" label="Applied" optional error={errors.appliedAt?.message}>
          <Input
            id="edit-applied"
            type="date"
            aria-invalid={!!errors.appliedAt}
            aria-describedby={errors.appliedAt ? 'edit-applied-error' : undefined}
            {...register('appliedAt')}
          />
        </FormField>

        <FormField id="edit-salary" label="Salary" optional>
          <Input id="edit-salary" placeholder="e.g. $120k – $150k" {...register('salary')} />
        </FormField>
        <FormField id="edit-link" label="Job link" optional error={errors.link?.message}>
          <Input
            id="edit-link"
            placeholder="https://..."
            aria-invalid={!!errors.link}
            aria-describedby={errors.link ? 'edit-link-error' : undefined}
            {...register('link')}
          />
        </FormField>

        <FormField id="edit-notes" label="Notes" optional className="sm:col-span-2">
          <Textarea
            id="edit-notes"
            className="h-20 max-h-20"
            placeholder="Referral, recruiter name, anything to remember"
            {...register('notes')}
          />
        </FormField>

        <FormField id="edit-requirements" label="Requirements" optional hint="One per line." className="sm:col-span-2">
          <Textarea
            id="edit-requirements"
            className="h-28 max-h-28"
            placeholder={'Go or Java\nPostgreSQL'}
            {...register('requirements')}
          />
        </FormField>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">Cancel</Button>
        </DialogClose>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save changes'}
        </Button>
      </DialogFooter>
    </form>
  )
}
