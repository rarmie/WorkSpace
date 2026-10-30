import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Prisma } from '@/lib/generated/prisma/client'
import { PIPELINE_ORDER, companyInitial } from '@/lib/job-status'
import JobStatusControl from '@/components/JobStatusControl'
import EditJobDialog from '@/components/EditJobDialog'
import DeleteJobButton from '@/components/DeleteJobButton'
import JobMatchPanel from '@/components/JobMatchPanel'

export type JobWithRelations = Prisma.JobApplicationGetPayload<{
  include: { contacts: true; documents: true }
}>

// appliedAt is a calendar date (the edit form sends yyyy-MM-dd, stored as UTC midnight),
// so format it in UTC or it can show the previous day.
function formatDate(date: Date | null): string {
  if (!date) return 'Not applied yet'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{children}</div>
  )
}

function Fact({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border bg-card p-3 min-w-0 ${className}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-medium text-foreground truncate">{children}</div>
    </div>
  )
}

export default function JobDetail({
  job,
  backHref,
  resume,
}: {
  job: JobWithRelations
  backHref: string
  resume: { hasResume: boolean; updatedAt: Date | null }
}) {
  const pipelineIdx = PIPELINE_ORDER.indexOf(job.status)

  return (
    <div className="p-6">
      {/* On a phone the list is hidden while a job is open, so offer a way back to it. */}
      <Link
        href={backHref}
        className="md:hidden inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-4" />
        Back to jobs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-base font-bold text-foreground">
            {companyInitial(job.company)}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-foreground">{job.company}</h2>
            <p className="truncate text-sm text-muted-foreground">{job.role}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          {/* Keyed on status too, so an edit made in the dialog re-seeds the control's local state. */}
          <JobStatusControl key={`${job.id}-${job.status}`} jobId={job.id} status={job.status} />
          <EditJobDialog
            key={job.id}
            job={{
              id: job.id,
              company: job.company,
              role: job.role,
              status: job.status,
              link: job.link,
              salary: job.salary,
              notes: job.notes,
              requirements: job.requirements,
              appliedAt: job.appliedAt?.toISOString() ?? null,
            }}
          />
          <DeleteJobButton
            key={`delete-${job.id}`}
            jobId={job.id}
            company={job.company}
            role={job.role}
            contactCount={job.contacts.length}
            documentCount={job.documents.length}
          />
        </div>
      </div>

      {job.status !== 'REJECTED' && (
        <div className="flex items-center gap-1.5 my-6" aria-label={`Step ${pipelineIdx + 1} of ${PIPELINE_ORDER.length}`}>
          {PIPELINE_ORDER.map((step, i) => (
            <div key={step} className={`flex-1 h-1 rounded-full ${i <= pipelineIdx ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>
      )}

      {/* Full width under the pipeline bar (or the header, for a rejected job, which has no bar). */}
      <div className={`mb-6 ${job.status === 'REJECTED' ? 'mt-6' : ''}`}>
        <JobMatchPanel
          key={job.id}
          jobId={job.id}
          requirementCount={job.requirements.length}
          hasResume={resume.hasResume}
          resumeUpdatedAt={resume.updatedAt}
          matchScore={job.matchScore}
          matchSummary={job.matchSummary}
          matchVerdicts={job.matchVerdicts}
          matchedAt={job.matchedAt}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6 min-w-0">
          <div className="grid grid-cols-2 gap-3">
            <Fact label="Salary">{job.salary ?? 'N/A'}</Fact>
            <Fact label="Applied">{formatDate(job.appliedAt)}</Fact>
            <Fact label="Link" className="col-span-2">
              {job.link ? (
                <a href={job.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {job.link}
                </a>
              ) : (
                'N/A'
              )}
            </Fact>
          </div>

          <div>
            <SectionLabel>Notes</SectionLabel>
            <div className="rounded-lg border bg-card p-3 text-sm text-foreground/90 whitespace-pre-wrap wrap-anywhere">
              {job.notes ?? 'No notes yet.'}
            </div>
          </div>
        </div>

        <div className="space-y-6 min-w-0">
          <div>
            <SectionLabel>Requirements</SectionLabel>
            {job.requirements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No requirements saved.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {job.requirements.map((req, i) => (
                  <span key={`${i}-${req}`} className="rounded-md bg-muted px-2 py-1 text-xs text-foreground">
                    {req}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionLabel>Contacts</SectionLabel>
            {job.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts yet</p>
            ) : (
              <div className="flex flex-col gap-2">
                {job.contacts.map((c) => (
                  <div key={c.id} className="rounded-lg border bg-card p-3 text-sm">
                    {c.name}{c.email ? ` — ${c.email}` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionLabel>Documents</SectionLabel>
            {job.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents yet</p>
            ) : (
              <div className="flex flex-col gap-2">
                {job.documents.map((d) => (
                  <div key={d.id} className="rounded-lg border bg-card p-3 text-sm">
                    <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {d.label}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
