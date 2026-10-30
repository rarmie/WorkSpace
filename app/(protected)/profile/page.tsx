import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import UserAvatar from '@/components/UserAvatar'
import ResumeForm from '@/components/ResumeForm'
import AttributesForm from '@/components/AttributesForm'

// Dates are formatted here, on the server, which runs in UTC. Without a fixed time zone a
// resume saved before 8am in Manila would show the previous day (the same bug that is still
// open on the jobs page).
function formatDate(date: Date, options: Intl.DateTimeFormatOptions): string {
    const withZone: Intl.DateTimeFormatOptions = {
        ...options,
        timeZone: "Asia/Manila"
    } 

    const formattedDate =  date.toLocaleDateString('en-GB', withZone)

    return formattedDate
}

export default async function ProfilePage() {
  const session = await getServerSession(authOptions)

  if (!session?.user.id) {
    redirect('/login')
  }

  // One query for the whole page. _count adds the number of applications without loading them,
  // and accounts tells Google sign-ins apart from email and password ones. The password hash is
  // never selected.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      createdAt: true,
      resume: true,
      resumeUpdatedAt: true,
      targetRoles: true,
      country: true,
      workArrangements: true,
      remoteRegions: true,
      seniority: true,
      skills: true,
      attributesUpdatedAt: true,
      accounts: { select: { provider: true } },
      _count: { select: { applications: true } },
    },
  })

  // A session cookie can outlive its user row (a deleted test account, for example).
  if (!user) {
    redirect('/login')
  }

  // A user who signed up with a password and later linked Google shows as Google here.
  const isGoogle = user.accounts.some((a) => a.provider === 'google')

  // Only meaningful once both have been saved: "changed since" has no answer for a user who never
  // saved preferences.
  const resumeChanged =
    user.resumeUpdatedAt !== null &&
    user.attributesUpdatedAt !== null &&
    user.resumeUpdatedAt > user.attributesUpdatedAt

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-6">
      <h1 className="sr-only">Profile</h1>

      {/* Mockup: docs/mockups/2026-10-13-profile-page.html (layout B). Stacks on a phone. */}
      <div className="grid gap-5 md:grid-cols-[260px_1fr]">
        <section aria-label="Account" className="self-start rounded-xl border border-border bg-card">
          <div className="flex flex-col items-center px-4 pt-6 pb-4 text-center">
            <UserAvatar name={user.name} email={user.email} image={user.image} size={68} className="mb-3 text-2xl" />
            <p className="text-[15px] font-semibold">{user.name ?? 'No name set'}</p>
            <p className="text-xs text-muted-foreground break-all">{user.email}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-xs">
              {isGoogle && (
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full bg-[conic-gradient(#ea4335_0_25%,#fbbc05_0_50%,#34a853_0_75%,#4285f4_0)]"
                />
              )}
              {isGoogle ? 'Google' : 'Email and password'}
            </span>
          </div>

          <dl className="border-t border-border px-4 py-1 text-[13px]">
            <div className="flex justify-between border-b border-border py-2">
              <dt className="text-muted-foreground">Member since</dt>
              <dd>{formatDate(user.createdAt, { month: 'short', year: 'numeric' })}</dd>
            </div>
            <div className="flex justify-between border-b border-border py-2">
              <dt className="text-muted-foreground">Applications</dt>
              <dd className="tabular-nums">{user._count.applications}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-muted-foreground">Resume updated</dt>
              <dd>{user.resumeUpdatedAt ? formatDate(user.resumeUpdatedAt, { day: 'numeric', month: 'short' }) : 'Never'}</dd>
            </div>
          </dl>
        </section>

        {/* Resume and preferences sit side by side on a wide screen, and stack below that. */}
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <section aria-label="Resume" className="flex flex-col rounded-xl border border-border bg-card">
            <ResumeForm
              initialResume={user.resume ?? ''}
              savedLabel={user.resumeUpdatedAt ? formatDate(user.resumeUpdatedAt, { day: 'numeric', month: 'short' }) : null}
            />
          </section>

          <section aria-label="Job preferences" className="self-start rounded-xl border border-border bg-card">
            <AttributesForm
              initial={{
                targetRoles: user.targetRoles,
                country: user.country,
                workArrangements: user.workArrangements,
                remoteRegions: user.remoteRegions,
                seniority: user.seniority,
                skills: user.skills,
              }}
              savedLabel={user.attributesUpdatedAt ? formatDate(user.attributesUpdatedAt, { day: 'numeric', month: 'short' }) : null}
              resumeChanged={resumeChanged}
              hasResume={!!user.resume}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
