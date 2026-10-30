import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import NewPostings from "@/components/NewPostings"

const STATS = [
  { status: "APPLIED", label: "Applied" },
  { status: "INTERVIEW", label: "Interviewing" },
  { status: "OFFER", label: "Offers" },
  { status: "REJECTED", label: "Rejected" },
] as const

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user.id) {
    redirect('/login')
  }

  const jobs = await prisma.jobApplication.findMany({
    where: { userId: session.user.id },
    select: { status: true },
  })

  return (
    <section className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {session.user.name}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {STATS.map(({ status, label }) => (
          <Card key={status}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-3xl font-bold text-foreground">
                {jobs.filter((job) => job.status === status).length}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <NewPostings userId={session.user.id} />
    </section>
  )
}
