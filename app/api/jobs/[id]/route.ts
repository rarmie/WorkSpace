import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isRecordNotFound } from '@/lib/prisma-errors'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import {authOptions} from '@/app/api/auth/[...nextauth]/route'

const emptyToNull = (v: string | null | undefined) => (v === ''? null:v)

const updateSchema = z.object({
  company: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  status: z.enum(['WISHLIST', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED']).optional(),
  link: z.union([z.url(), z.literal('')]).optional().transform(emptyToNull),
  salary: z.string().optional().transform(emptyToNull),
  notes: z.string().optional().transform(emptyToNull),
  // null clears the date. null must come first: z.coerce.date() turns null into 1970-01-01.
  appliedAt: z.union([z.null(), z.coerce.date()]).optional(),
  requirements: z.array(z.string()).optional()
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const {id} = await params

  if (!session?.user.id){
    return NextResponse.json(
      {error: 'Unauthorized'},
      {status: 401}
    )
  }

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const data = { ...parsed.data }

    // Moving a job off WISHLIST means it was just applied for. Stamp today's date if it has none,
    // unless the body sends a date. A null in the body doesn't count: an applied job needs a date.
    if (data.status && data.status !== 'WISHLIST' && !data.appliedAt) {
      const current = await prisma.jobApplication.findFirst({
        where: { id, userId: session.user.id },
        select: { status: true, appliedAt: true },
      })

      if (current?.status === 'WISHLIST' && current.appliedAt === null) {
        data.appliedAt = new Date()
      }
    }

    const job = await prisma.jobApplication.update({
    where: {
      id: id,
      userId: session.user.id
     },
    data,
    })

    return NextResponse.json(job)
  } catch (err) {
    if (isRecordNotFound(err)){
      return NextResponse.json({error: "Job not found"}, {status: 404})
    }

    throw err
  }
  

  
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const {id} = await params

  if (!session?.user.id){
    return NextResponse.json(
      {error: 'Unauthorized'},
      {status: 401}
    )
  }

  try {
    await prisma.jobApplication.delete({
      where: { 
        id: id,
        userId: session.user.id 
      },
    })

    return NextResponse.json({ message: 'Job deleted successfully' })
  } catch (err) {
    if (isRecordNotFound(err)){
      return NextResponse.json({error: "Job not found"}, {status: 404})
    }

    throw err
  }
}