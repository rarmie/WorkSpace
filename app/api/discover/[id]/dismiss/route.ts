import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { isForeignKeyViolation } from '@/lib/prisma-errors'

// POST /api/discover/[id]/dismiss    hides a posting from this user's feed
// DELETE /api/discover/[id]/dismiss  the Undo: shows it again
// ([id] is the DiscoveredPosting id.) Neither takes a body.
//
// Outside proxy.ts's matcher, like /api/profile, so an expired session gets a JSON 401.

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)

  if (!session?.user.id) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const { id } = await params

  try {
    // upsert, not create: a double-click, or two tabs, must not fail on the unique pair.
    await prisma.dismissedPosting.upsert({
      where: { userId_postingId: { userId: session.user.id, postingId: id } },
      create: { userId: session.user.id, postingId: id },
      update: {},
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    // The foreign key to DiscoveredPosting failed: there is no posting with this id.
    if (isForeignKeyViolation(err)) {
      return NextResponse.json({ error: 'Posting not found.' }, { status: 404 })
    }

    throw err
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)

  if (!session?.user.id) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const { id } = await params

  // deleteMany, not delete: with nothing to remove it simply deletes 0 rows, so Undo is a no-op
  // instead of an error. userId in the where keeps one user from un-dismissing another's.
  await prisma.dismissedPosting.deleteMany({
    where: { userId: session.user.id, postingId: id },
  })

  return NextResponse.json({ ok: true })
}
