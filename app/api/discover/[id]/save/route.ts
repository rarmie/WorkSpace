import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { isUniqueViolation } from '@/lib/prisma-errors'

// POST /api/discover/[id]/save   ([id] is the DiscoveredPosting id)
// Copies a posting into the user's jobs as a WISHLIST job. No request body.
//
// Outside proxy.ts's matcher, like /api/profile, so an expired session gets this route's JSON 401
// instead of the 307 redirect that fetch follows silently.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)

  if (!session?.user.id) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const { id } = await params

  const posting = await prisma.discoveredPosting.findUnique({
    where: { id },
    select: { id: true, company: true, role: true, url: true, requirements: true },
  })

  if (!posting) {
    return NextResponse.json({ error: 'Posting not found.' }, { status: 404 })
  }

  try {
    const job = await prisma.jobApplication.create({
      data: {
        userId: session.user.id,
        company: posting.company,
        role: posting.role,
        status: 'WISHLIST',
        appliedAt: null, // not applied for yet (Phase 7a)
        link: posting.url,
        requirements: posting.requirements,
        postingId: posting.id,
        source: 'COMPANY_SITE',
      },
      select: { id: true },
    })

    return NextResponse.json(job, { status: 201 })
  } catch (err) {
    // @@unique([userId, postingId]): this user already saved this posting. A closed posting can
    // still be saved, so there is no check for that.
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: 'You already saved this posting.' }, { status: 409 })
    }

    throw err
  }
}
